// Turns spreadsheets, PDFs and free-form pasted notes into structured lead rows.
// Pure rule-based parsing (no AI / external services): header keyword matching for tables,
// and token heuristics (phone, email, address & business keywords) for unstructured text.
import * as XLSX from 'xlsx';

export const LEAD_FIELDS = ['name', 'company', 'phone', 'email', 'address', 'business', 'special_note'];

const PHONE_RE = /(?:\+?\d[\d\s\-().]{5,}\d)/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const HEADER_RULES = [
  ['email', /e-?mail/],
  ['phone', /(phone|mobile|mob\b|contact ?(no|num)|number|cell|whats ?app|\btel\b|ph\.?\s*no)/],
  ['company', /(company|firm|organi[sz]ation|business name|shop name|store name|brand|agency)/],
  ['business', /(business|work|industry|category|profession|occupation|service|sector|domain|nature|type|product)/],
  ['address', /(address|location|city|area|addr|place|region|state|locality|pin ?code|zip|country)/],
  ['special_note', /(note|remark|comment|special|description|detail)/],
  ['name', /(name|contact|person|client|customer|lead|owner|prospect)/],
];
const LABEL_RULES = HEADER_RULES;
const ADDRESS_WORDS = /\b(road|rd|street|st|nagar|sector|sec|lane|colony|city|market|floor|building|bldg|near|opp|opposite|block|plot|marg|chowk|bazaa?r|village|dist|district|tehsil|pin|pincode|avenue|ave|apartment|apt|tower|phase|park|enclave|vihar|puram|ganj|pur|abad|delhi|mumbai|bangalore|bengaluru|pune|kolkata|chennai|hyderabad|noida|gurgaon|gurugram|jaipur|lucknow|patna|india|usa|uk|uae|dubai)\b|\b\d{6}\b/i;
const COMPANY_WORDS = /\b(pvt|private|ltd|limited|llp|inc|corp|corporation|enterprises?|industries|traders|trading|company|co\.|group|solutions|technologies|tech|systems|& sons|associates|ventures|international|exports|imports)\b/i;
const BUSINESS_WORDS = /\b(shop|store|owner|dealer|distributor|trader|restaurant|cafe|caf[eé]|hotel|clinic|doctor|hospital|salon|spa|gym|school|academy|institute|coaching|agency|consultant|consultancy|manufactur\w*|wholesale\w*|retail\w*|boutique|bakery|sweets?|pharmacy|chemist|medical|garage|motors|automobile|electronics|mobiles?|textiles?|garments?|jewell?er\w*|builders?|real ?estate|property|software|it services|developer|startup|freelancer|ca\b|lawyer|advocate|architect|interior|printing|travel|tours|logistics|transport|courier|catering|events?|photograph\w*|furniture|hardware|grocery|kirana|supermarket|dairy|farm\w*|e-?commerce|marketing|design\w*)\b/i;

export const normPhone = v => String(v ?? '').replace(/[^+\d]/g, '').replace(/(?!^)\+/g, '');
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const isPhone = t => { const d = normPhone(t).replace('+', ''); return d.length >= 7 && d.length <= 15 && /^[\d\s\-().+]+$/.test(t.trim()); };
const looksLikeName = t => /^[A-Za-z][A-Za-z.'\s-]{1,48}$/.test(t) && t.split(/\s+/).length <= 4 && !COMPANY_WORDS.test(t) && !BUSINESS_WORDS.test(t) && !ADDRESS_WORDS.test(t);
const blank = () => ({ name: '', company: '', phone: '', email: '', address: '', business: '', special_note: '' });
const append = (row, field, value) => { value = clean(value); if (!value) return; row[field] = row[field] ? `${row[field]}, ${value}` : value; };

function fieldForLabel(label) {
  const l = label.toLowerCase().trim();
  return LABEL_RULES.find(([, re]) => re.test(l))?.[0];
}

/** "Amit Verma restaurant owner" -> ["Amit Verma", "restaurant owner"] when a capitalised name leads into lowercase words. */
function splitNameLead(t) {
  const m = t.match(/^((?:(?:Mr|Mrs|Ms|Dr|Er|Adv|Prof)\.?\s+)?[A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+){0,2})\s+([a-z].*)$/);
  return m && !BUSINESS_WORDS.test(m[1]) && !ADDRESS_WORDS.test(m[1]) && !COMPANY_WORDS.test(m[1]) && (BUSINESS_WORDS.test(m[2]) || ADDRESS_WORDS.test(m[2])) ? [m[1], m[2]] : [t];
}

/** Classify free tokens (no labels) into lead fields. */
function classifyTokens(row, tokens) {
  const rest = [];
  for (let raw of tokens) {
    const t = clean(raw);
    if (!t) continue;
    const emails = t.match(EMAIL_RE);
    if (emails) { if (!row.email) row.email = emails[0]; const leftover = clean(t.replace(EMAIL_RE, '')); if (leftover) rest.push(leftover); continue; }
    if (isPhone(t)) { if (!row.phone) row.phone = normPhone(t); else append(row, 'special_note', `Alt. phone ${t}`); continue; }
    const phones = t.match(PHONE_RE)?.filter(isPhone);
    if (phones?.length) {
      if (!row.phone) row.phone = normPhone(phones[0]); else append(row, 'special_note', `Alt. phone ${phones[0]}`);
      // Text before and after the number are usually different things (e.g. "Name 98xxxx business").
      for (const part of t.split(phones[0])) { const p = clean(part.replace(/^[\s:,-]+|[\s:,-]+$/g, '')); if (p) rest.push(...splitNameLead(p)); }
      continue;
    }
    rest.push(...splitNameLead(t));
  }
  const leftovers = [];
  for (const t of rest) {
    if (!row.name && looksLikeName(t)) row.name = t;
    else if (COMPANY_WORDS.test(t) && !row.company) row.company = t;
    else if (ADDRESS_WORDS.test(t) || /^\d+[\w/-]*\s/.test(t)) append(row, 'address', t);
    else if (BUSINESS_WORDS.test(t) && !row.business) row.business = t;
    else leftovers.push(t);
  }
  for (const t of leftovers) {
    if (!row.name && t.split(/\s+/).length <= 4) row.name = t;
    else if (!row.business) row.business = t;
    else append(row, 'special_note', t);
  }
}

function finish(row) {
  for (const k of LEAD_FIELDS) row[k] = clean(row[k]);
  if (!row.name) row.name = row.company || (row.phone ? `Lead ${row.phone.slice(-4)}` : '');
  const issues = [];
  if (!row.phone) issues.push('No phone number found');
  else if (normPhone(row.phone).replace('+', '').length < 7) issues.push('Phone number looks too short');
  if (!row.name) issues.push('No name found');
  return { ...row, issues };
}

const SPLIT_TOKENS = /\s*(?:[,|;\t]|\s{3,}|\s[-–—]\s)\s*/;

/** Parse one record made of one or more lines (labelled "Key: value" lines are honoured). */
function parseRecord(lines) {
  const row = blank();
  const free = [];
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z .'/#-]{1,30}?)\s*[:=]\s*(.+)$/);
    const field = m && fieldForLabel(m[1]);
    if (field) {
      const value = m[2];
      if (field === 'phone') { const p = value.match(PHONE_RE)?.find(isPhone); if (p) { if (!row.phone) row.phone = normPhone(p); else append(row, 'special_note', `Alt. phone ${p}`); } }
      else if (field === 'email') { const e = value.match(EMAIL_RE); if (e) row.email = e[0]; }
      else if (field === 'name' || field === 'company') { if (!row[field]) row[field] = clean(value); else append(row, 'special_note', value); }
      else append(row, field, value);
    } else free.push(...line.split(SPLIT_TOKENS));
  }
  classifyTokens(row, free);
  return finish(row);
}

const hasContact = line => !!(line.match(PHONE_RE)?.some(isPhone) || /[\w.+-]+@[\w-]+\.[\w-]+/.test(line));

/** Free-form text: blank-line separated blocks, or one lead per line containing a phone. */
export function parseText(text) {
  const out = [];
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s+/, '').trim()).filter(Boolean);
    if (!lines.length) continue;
    // Table-like text with a header row (e.g. copied from a sheet or extracted from a PDF table)
    const cells = lines.map(l => l.split(/\t|\s*\|\s*|\s{3,}|,\s*/).map(clean));
    if (lines.length > 1 && headerMap(cells[0]).matched >= 2 && cells.slice(1).every(c => c.length > 1)) { out.push(...parseSheetRows(cells)); continue; }
    // Group lines into records: a new record starts when a line has a contact and the current one already has one.
    let current = [], currentHasContact = false;
    for (const line of lines) {
      const contact = hasContact(line);
      if (contact && currentHasContact) { out.push(parseRecord(current)); current = []; currentHasContact = false; }
      current.push(line);
      if (contact) currentHasContact = true;
    }
    if (current.length) out.push(parseRecord(current));
  }
  return out.filter(r => r.phone || r.email || r.name);
}

function headerMap(header) {
  const map = {}; let matched = 0;
  // A header cell is a short label: no digits, no email, at most 4 words.
  const cells = header.map(c => String(c || '').trim());
  if (cells.some(c => /\d/.test(c) || c.includes('@'))) return { map, matched: 0 };
  cells.forEach((cell, i) => {
    const field = cell && cell.length <= 30 && cell.split(/\s+/).length <= 4 ? fieldForLabel(cell) : undefined;
    if (field) { (map[field] ||= []).push(i); matched++; }
  });
  return { map, matched };
}

/** Rows from a spreadsheet: detect a header row by keywords, otherwise treat each row as free text. */
export function parseSheetRows(rows) {
  rows = rows.map(r => (r || []).map(v => clean(v))).filter(r => r.some(Boolean));
  if (!rows.length) return [];
  let headerIndex = -1, best = { map: {}, matched: 0 };
  for (let i = 0; i < Math.min(5, rows.length); i++) { const h = headerMap(rows[i]); if (h.matched >= 2 && h.matched > best.matched) { best = h; headerIndex = i; } }
  if (headerIndex < 0) return rows.map(r => parseRecord([r.filter(Boolean).join(' | ')]));
  const out = [];
  for (const r of rows.slice(headerIndex + 1)) {
    const row = blank(); const used = new Set();
    for (const [field, cols] of Object.entries(best.map)) {
      for (const c of cols) {
        used.add(c); const v = r[c]; if (!v) continue;
        if (field === 'phone') { const p = String(v).match(PHONE_RE)?.find(isPhone) || v; if (!row.phone) row.phone = normPhone(p); else append(row, 'special_note', `Alt. phone ${v}`); }
        else if (field === 'email') row.email ||= (String(v).match(EMAIL_RE)?.[0] || '');
        else if (field === 'name' && row.name) append(row, 'special_note', v);
        else append(row, field, v);
      }
    }
    const extra = r.filter((v, i) => v && !used.has(i));
    if (extra.length) classifyTokens(row, extra);
    if (Object.values(row).some(Boolean)) out.push(finish(row));
  }
  return out;
}

async function pdfLines(buffer) {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const lines = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 50); p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    const rows = new Map();
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3;
      (rows.get(y) || rows.set(y, []).get(y)).push({ x: it.transform[4], w: it.width || 0, s: it.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      const parts = rows.get(y).sort((a, b) => a.x - b.x);
      let line = '', end = null;
      for (const part of parts) { line += end === null ? part.s : (part.x - end > 12 ? ' | ' : ' ') + part.s; end = part.x + part.w; }
      lines.push(line.trim());
    }
    lines.push('');
  }
  return lines;
}

/** Entry point: parse an uploaded file (csv/xlsx/xls/ods/pdf/txt) and/or pasted text. */
export async function parseLeadSources({ file, text }) {
  const leads = [];
  const sources = [];
  if (file) {
    const name = file.originalname.toLowerCase();
    if (/\.(csv|xlsx|xls|ods)$/.test(name)) {
      const book = XLSX.read(file.buffer, { type: 'buffer', sheetRows: 2002 });
      for (const sheetName of book.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, defval: '', raw: false });
        leads.push(...parseSheetRows(rows));
      }
      sources.push('spreadsheet');
    } else if (name.endsWith('.pdf')) {
      if (file.buffer.toString('ascii', 0, 5) !== '%PDF-') { const e = new Error('This file is not a valid PDF'); e.status = 400; throw e; }
      const lines = await pdfLines(file.buffer);
      const tableRows = lines.map(l => l.split(/\s*\|\s*/));
      const headerRow = tableRows.findIndex(r => headerMap(r).matched >= 2);
      leads.push(...(headerRow >= 0 ? parseSheetRows(tableRows.slice(headerRow).filter(r => r.join('').trim())) : parseText(lines.join('\n'))));
      sources.push('pdf');
    } else if (name.endsWith('.txt')) { leads.push(...parseText(file.buffer.toString('utf8'))); sources.push('text file'); }
    else { const e = new Error('Upload a CSV, Excel (.xlsx/.xls), ODS, PDF or TXT file'); e.status = 400; throw e; }
  }
  if (text?.trim()) { leads.push(...parseText(text)); sources.push('notes'); }
  return { leads: leads.slice(0, 1000), truncated: leads.length > 1000, sources };
}
