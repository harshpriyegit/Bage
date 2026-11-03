import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
export const dataDir = path.resolve(process.env.DATA_DIR || 'data');
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(dataDir, 'command-center.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, phone TEXT DEFAULT '', password TEXT NOT NULL, private_password TEXT, role TEXT NOT NULL CHECK(role IN ('Super Admin','Employee')), status TEXT NOT NULL DEFAULT 'Active');
CREATE TABLE IF NOT EXISTS memberships(user_id INTEGER REFERENCES users(id), workspace TEXT CHECK(workspace IN ('velura','algorics')), PRIMARY KEY(user_id,workspace));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL, private_until INTEGER DEFAULT 0, csrf TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, workspace TEXT NOT NULL DEFAULT 'velura' CHECK(workspace='velura'), title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'Frontend Development', priority TEXT NOT NULL, status TEXT NOT NULL, assigned_date TEXT, deadline TEXT NOT NULL, project TEXT DEFAULT '', assigned_by TEXT DEFAULT '', tags TEXT DEFAULT '', notes TEXT DEFAULT '', reminder TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS resources(id INTEGER PRIMARY KEY, workspace TEXT NOT NULL DEFAULT 'velura' CHECK(workspace='velura'), task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL, url TEXT DEFAULT '', file_path TEXT, original_name TEXT, description TEXT DEFAULT '', source TEXT DEFAULT 'Other', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS task_events(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id), kind TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS subtasks(id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, title TEXT NOT NULL, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS leads(id INTEGER PRIMARY KEY, workspace TEXT NOT NULL DEFAULT 'algorics' CHECK(workspace='algorics'), name TEXT NOT NULL, company TEXT DEFAULT '', phone TEXT NOT NULL, email TEXT DEFAULT '', employee_id INTEGER REFERENCES users(id), assigned_at TEXT, status TEXT DEFAULT 'Not Called', follow_up TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(workspace,phone));
CREATE TABLE IF NOT EXISTS calls(id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id), employee_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL, notes TEXT DEFAULT '', interest TEXT DEFAULT '', requirements TEXT DEFAULT '', deal_value REAL DEFAULT 0, next_action TEXT DEFAULT '', follow_up TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, note_date TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'yellow', pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS note_user_date ON notes(user_id,note_date);
CREATE INDEX IF NOT EXISTS task_deadline ON tasks(workspace,deadline);
CREATE INDEX IF NOT EXISTS lead_employee ON leads(workspace,employee_id);
CREATE INDEX IF NOT EXISTS call_created ON calls(created_at,employee_id);
`);
if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'preferences')) db.exec("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'");
if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'background')) db.exec('ALTER TABLE users ADD COLUMN background TEXT');
if (!db.prepare('PRAGMA table_info(leads)').all().some(c => c.name === 'assigned_at')) db.exec('ALTER TABLE leads ADD COLUMN assigned_at TEXT');
for (const col of ['address', 'business', 'special_note', 'note_by']) if (!db.prepare('PRAGMA table_info(leads)').all().some(c => c.name === col)) db.exec(`ALTER TABLE leads ADD COLUMN ${col} TEXT DEFAULT ''`);
// Call proof: screenshots uploaded by the cold caller; every call can point at the screenshot that proves it.
db.exec("CREATE TABLE IF NOT EXISTS call_proofs(id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES users(id), file_path TEXT NOT NULL, original_name TEXT DEFAULT '', mime TEXT DEFAULT 'image/png', ocr_text TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS proof_employee ON call_proofs(employee_id)");
for (const [col, type] of [['duration_seconds', 'INTEGER'], ['proof_id', 'INTEGER REFERENCES call_proofs(id)'], ['dialed_number', "TEXT DEFAULT ''"], ['source', "TEXT DEFAULT 'manual'"]]) if (!db.prepare('PRAGMA table_info(calls)').all().some(c => c.name === col)) db.exec(`ALTER TABLE calls ADD COLUMN ${col} ${type}`);
// Quick notes are kept separately per workspace (Valura vs Algoryx). Existing notes belong to Valura.
if (!db.prepare('PRAGMA table_info(notes)').all().some(c => c.name === 'workspace')) db.exec("ALTER TABLE notes ADD COLUMN workspace TEXT NOT NULL DEFAULT 'velura'");
db.exec('CREATE INDEX IF NOT EXISTS note_user_ws_date ON notes(user_id,workspace,note_date)');
if (!db.prepare('PRAGMA table_info(leads)').all().some(c => c.name === 'note_updated_at')) db.exec('ALTER TABLE leads ADD COLUMN note_updated_at TEXT');
export function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
export function verifyPassword(password, hash) { if (!hash) return false; const [salt, key] = hash.split(':'); const actual = scryptSync(password, salt, 64); const expected = Buffer.from(key, 'hex'); return expected.length === actual.length && timingSafeEqual(actual, expected); }
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const get = (sql, ...args) => db.prepare(sql).get(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
