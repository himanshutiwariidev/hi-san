import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "hisan-bot.db");

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 10000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TEXT NOT NULL,
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  filter_settings TEXT NOT NULL,
  last_heartbeat TEXT,
  extension_version TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_businesses (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS keyword_rules (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  match TEXT NOT NULL CHECK (match IN ('contains', 'exact')),
  countries TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (business_id, keyword, match)
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT,
  quantity TEXT,
  quantity_value REAL,
  country_code TEXT,
  country_name TEXT,
  city TEXT,
  buyer_name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  phone_verified INTEGER NOT NULL DEFAULT 0,
  has_whatsapp INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'retrieved', 'filtered', 'not_retrieved')),
  filter_reason TEXT,
  matched_keyword TEXT,
  source_url TEXT,
  posted_text TEXT,
  raw TEXT,
  received_at TEXT NOT NULL,
  decided_at TEXT,
  retrieved_at TEXT,
  UNIQUE (business_id, external_id)
);
CREATE INDEX IF NOT EXISTS leads_business_received ON leads (business_id, received_at DESC);

CREATE TABLE IF NOT EXISTS lead_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  secret TEXT,
  headers TEXT NOT NULL DEFAULT '{}',
  events TEXT NOT NULL DEFAULT '["retrieved"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_status INTEGER,
  last_delivery_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extension_installations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_id TEXT,
  last_heartbeat TEXT NOT NULL,
  version TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_presence (
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  last_seen TEXT NOT NULL,
  PRIMARY KEY (business_id, device_id)
);
`;

function migrateColumns(db) {
  function addColumnIfMissing(table, column, definition) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!columns.some((c) => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    } catch {
      // ignore
    }
  }

  addColumnIfMissing("keyword_rules", "type", "TEXT NOT NULL DEFAULT 'positive'");
  addColumnIfMissing("keyword_rules", "match_type", "TEXT NOT NULL DEFAULT 'contains'");
  addColumnIfMissing("keyword_rules", "unit", "TEXT");
  addColumnIfMissing("keyword_rules", "minimum_quantity", "REAL");
  addColumnIfMissing("keyword_rules", "max_leads_per_day", "INTEGER");
  addColumnIfMissing("keyword_rules", "states", "TEXT NOT NULL DEFAULT '[]'");

  addColumnIfMissing("leads", "state", "TEXT");
  addColumnIfMissing("leads", "address", "TEXT");
  addColumnIfMissing("leads", "unit", "TEXT");
  addColumnIfMissing("leads", "gst_verified", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("leads", "buyer_member_months", "INTEGER");
  addColumnIfMissing("leads", "is_retail", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("leads", "purchase_id", "TEXT");
  addColumnIfMissing("leads", "credit_balance", "TEXT");
  addColumnIfMissing("leads", "client_event_id", "TEXT");
  addColumnIfMissing("leads", "decision", "TEXT");
  addColumnIfMissing("leads", "has_email", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("leads", "has_phone", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("leads", "reason_detail", "TEXT");
  addColumnIfMissing("leads", "matched_rule_ids", "TEXT");

  addColumnIfMissing("businesses", "entitlement", "TEXT NOT NULL DEFAULT '{}'");
}

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 10000;");
  db.exec(SCHEMA);
  migrateColumns(db);
  return db;
}

// Reuse one connection across hot reloads and requests.
export const db = globalThis.__hisanDb ?? (globalThis.__hisanDb = open());

export const now = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

export function transaction(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
