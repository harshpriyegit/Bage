// Reads call screenshots (call log, in-call screen, call details) and turns them into call entries:
// { number, lead, duration_seconds, status, time_text }. Rule-based: OCR text + regex heuristics.
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);

const PHONE_RE = /\+?\d[\d\s\-().]{5,}\d/g;
const NO_ANSWER_RE = /\b(missed|no answer|not answered|unanswered|busy|declined|rejected|cancell?ed|not reachable|unreachable|switched off|not picked|call failed|didn'?t connect|no response|not connected|voicemail|call not connected|user busy|not available)\b/i;
const CONNECTED_RE = /\b(outgoing|dialled|dialed|incoming|answered|connected|received|call ended|ongoing|on call|calling)\b/i;
const DURATION_LABEL_RE = /\b(duration|talk ?time|call ?time|lasted|call length|time)\b/i;
const CLOCK_RE = /\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.?|p\.m\.?)/i;
const DATE_RE = /\b(today|yesterday|\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*|(?:mon|tue|wed|thu|fri|sat|sun)\w*)\b/i;

export const phoneKey = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length > 10 ? d.slice(-10) : d; };
const isPhone = t => { const d = t.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15; };

/** OCR often confuses O/o→0, l/I/|→1, S→5, B→8 inside numbers. Fix only number-like tokens. */
function fixDigits(line) {
  return line.replace(/[+\dOoIl|SB][\dOoIl|SB\s\-()]{6,}[\dOoIl|SB]/g, tok => {
    const digits = (tok.match(/\d/g) || []).length;
    return digits >= 5 && digits / tok.replace(/\s/g, '').length >= 0.6 ? tok.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8') : tok;
  });
}

/** Seconds from "05:23", "1:02:33", "Duration 12:10", "5m 23s", "5 min 23 sec", "2 mins", "45 secs", "3 minutes". */
export function parseDuration(text) {
  const s = String(text || '');
  let total = 0, found = false;
  const unit = (re, mult) => { const m = s.match(re); if (m) { total += Number(m[1]) * mult; found = true; } };
  unit(/(\d+)\s*(?:h|hr|hrs|hour|hours)\b/i, 3600);
  unit(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/i, 60);
  unit(/(\d+)\s*(?:s|sec|secs|second|seconds)\b/i, 1);
  if (found) return total;
  const noClock = s.replace(new RegExp(CLOCK_RE.source, 'gi'), ' ');
  const hms = noClock.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const ms = noClock.match(/\b(\d{1,3}):([0-5]\d)\b/);
  // "05:23"/"5:23" look like a call timer; "14:32" without a label is more likely a 24h clock time.
  if (ms && (DURATION_LABEL_RE.test(s) || /^0|^\d$/.test(ms[1]))) return Number(ms[1]) * 60 + Number(ms[2]);
  return null;
}

export function statusFrom(text, duration) {
  if (NO_ANSWER_RE.test(text)) return 'No Answer';
  if (duration === 0) return 'No Answer';
  if (duration > 0 || CONNECTED_RE.test(text)) return 'Called Today';
  return null;
}

function timeFrom(text) {
  const parts = [text.match(DATE_RE)?.[0], text.match(CLOCK_RE)?.[0]].filter(Boolean);
  return parts.join(' ');
}

/**
 * Turn OCR text into call entries. Each phone number (or a known lead name) starts an entry;
 * the duration / outcome / time are read from that line and the next lines until the next entry.
 * @param {string} text OCR output
 * @param {{id:number,name:string,phone:string}[]} leads leads the uploader may log calls for
 */
export function parseCallLogText(text, leads = []) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => fixDigits(l.trim())).filter(Boolean);
  const byPhone = new Map(leads.map(l => [phoneKey(l.phone), l]));
  const named = leads.filter(l => (l.name || '').trim().length >= 4).map(l => ({ lead: l, re: new RegExp(`\\b${l.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}\\b`, 'i') }));
  // Anchors = lines with a phone number. If the screenshot shows only names (saved contacts), use lead names.
  let anchors = [];
  lines.forEach((line, i) => { for (const p of (line.match(PHONE_RE) || []).filter(isPhone)) anchors.push({ i, number: p.replace(/[^\d+]/g, '') }); });
  if (!anchors.length) lines.forEach((line, i) => { const hit = named.find(n => n.re.test(line)); if (hit) anchors.push({ i, number: '', lead: hit.lead }); });
  const entries = [];
  const build = (a, context) => {
    const duration = parseDuration(context);
    const matched = a.lead || (a.number ? byPhone.get(phoneKey(a.number)) : undefined) || named.find(n => n.re.test(context))?.lead;
    entries.push({ number: a.number, lead_id: matched?.id ?? null, lead_name: matched?.name ?? '', duration_seconds: duration, status: statusFrom(context, duration), time_text: timeFrom(context), raw: context.split('\n').join(' · ') });
  };
  if (!anchors.length) { if (lines.length) build({ number: '' }, lines.join('\n')); return entries; }
  // Each entry owns: the line just above its number (usually the contact name / time) + lines below until the next entry's block.
  const rowStarts = [...new Set(anchors.map(a => a.i))];
  const startOf = r => { const i = rowStarts[r]; const prev = r > 0 ? rowStarts[r - 1] : -1; return i - 1 > prev ? i - 1 : i; };
  anchors.forEach(a => {
    const r = rowStarts.indexOf(a.i);
    const start = startOf(r);
    const end = Math.min(r + 1 < rowStarts.length ? startOf(r + 1) : lines.length, a.i + 5);
    const shared = anchors.filter(b => b.i === a.i).length > 1; // several numbers on one line (table-like log)
    build(a, shared ? lines[a.i] : lines.slice(start, Math.max(end, a.i + 1)).join('\n'));
  });
  return entries;
}

let workerPromise = null;
/** Lazily create one shared offline OCR worker (English data ships with @tesseract.js-data/eng). */
export function getOcrWorker(cacheDir) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      mkdirSync(cacheDir, { recursive: true });
      const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng')), '4.0.0_best_int');
      return createWorker('eng', 1, { langPath, gzip: true, cachePath: cacheDir, logger: () => {} });
    })().catch(e => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

export async function ocrImage(buffer, cacheDir) {
  const worker = await getOcrWorker(cacheDir);
  const { data } = await worker.recognize(buffer);
  return data.text || '';
}

export async function closeOcr() { if (workerPromise) { const w = await workerPromise.catch(() => null); workerPromise = null; await w?.terminate(); } }
