'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// The database lives OUTSIDE the web root (project-root/data/) so no static
// file server can ever hand it to a visitor. Override with DB_PATH.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'steven_lenz.db');
const LISTINGS_JSON = path.join(__dirname, '..', 'content', 'listings.json');

let db;

function parsePriceNum(priceStr) {
  return Number(String(priceStr || '').replace(/[^0-9]/g, '')) || 0;
}

function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      price TEXT NOT NULL,
      price_num INTEGER NOT NULL DEFAULT 0,
      address TEXT NOT NULL,
      full_address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT NOT NULL,
      county TEXT,
      beds INTEGER NOT NULL DEFAULT 0,
      baths REAL NOT NULL DEFAULT 0,
      sqft TEXT,
      year_built TEXT,
      lot_size TEXT,
      property_type TEXT,
      mls_id TEXT,
      photo TEXT,
      summary TEXT,
      description TEXT,
      highlights_json TEXT,
      role TEXT,
      external_url TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT UNIQUE NOT NULL,
      received_at TEXT NOT NULL,
      source_page TEXT,
      scene TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      interest TEXT,
      budget TEXT,
      timeline TEXT,
      areas_json TEXT,
      segment TEXT,
      message TEXT,
      email_consent INTEGER NOT NULL DEFAULT 0,
      sms_consent INTEGER NOT NULL DEFAULT 0,
      consent_text_version TEXT,
      consent_timestamp TEXT,
      ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS valuations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      valuation_id TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      submarket TEXT NOT NULL,
      property_type TEXT,
      beds TEXT,
      baths TEXT,
      sqft INTEGER,
      timeline TEXT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      consent INTEGER NOT NULL DEFAULT 0,
      est_low INTEGER NOT NULL,
      est_mid INTEGER NOT NULL,
      est_high INTEGER NOT NULL,
      concierge_uplift INTEGER NOT NULL,
      ppsf INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      consent INTEGER NOT NULL DEFAULT 0,
      source_page TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox (status, next_attempt_at);
  `);

  // Additive migrations for the leads table (safe to run on every boot).
  const leadCols = db.prepare('PRAGMA table_info(leads)').all().map((c) => c.name);
  const addCol = (name, ddl) => { if (!leadCols.includes(name)) db.exec(`ALTER TABLE leads ADD COLUMN ${ddl}`); };
  addCol('form_type', "form_type TEXT NOT NULL DEFAULT 'contact'");
  addCol('utm_json', "utm_json TEXT");
  addCol('referrer', "referrer TEXT");
  addCol('status', "status TEXT NOT NULL DEFAULT 'new'");
  addCol('notes', "notes TEXT");

  seedListingsIfEmpty(db);
  return db;
}

function seedListingsIfEmpty(database) {
  const row = database.prepare('SELECT COUNT(*) AS cnt FROM listings').get();
  if (row && row.cnt > 0) return;
  if (!fs.existsSync(LISTINGS_JSON)) return;

  const items = JSON.parse(fs.readFileSync(LISTINGS_JSON, 'utf8'));
  const insert = database.prepare(`
    INSERT OR REPLACE INTO listings (
      id, status, price, price_num, address, full_address, city, state, zip, county,
      beds, baths, sqft, year_built, lot_size, property_type, mls_id, photo,
      summary, description, highlights_json, role, external_url, active, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  items.forEach((item, idx) => {
    insert.run(
      item.id,
      item.status || 'For Sale',
      item.price || '$0',
      parsePriceNum(item.price),
      item.address || '',
      item.full_address || '',
      item.city || '',
      item.state || 'CA',
      item.zip || '',
      item.county || '',
      Number(item.beds) || 0,
      Number(item.baths) || 0,
      String(item.sqft || ''),
      String(item.year_built || ''),
      String(item.lot_size || ''),
      item.property_type || '',
      item.mls_id || '',
      item.photo || '',
      item.summary || '',
      item.description || '',
      JSON.stringify(item.highlights || []),
      item.role || '',
      item.external_url || '',
      item.active ? 1 : 0,
      idx
    );
  });
}

function formatListingRow(row) {
  if (!row) return null;
  let highlights = [];
  try { highlights = JSON.parse(row.highlights_json || '[]'); } catch (_) {}
  return {
    id: row.id,
    status: row.status,
    price: row.price,
    price_num: row.price_num,
    address: row.address,
    full_address: row.full_address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    county: row.county,
    beds: String(row.beds),
    baths: String(row.baths),
    sqft: row.sqft,
    year_built: row.year_built || undefined,
    lot_size: row.lot_size || undefined,
    property_type: row.property_type,
    mls_id: row.mls_id,
    photo: row.photo,
    summary: row.summary,
    description: row.description,
    highlights,
    role: row.role,
    external_url: row.external_url,
    active: Boolean(row.active)
  };
}

function getAllListings() {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM listings ORDER BY active DESC, sort_order ASC').all();
  return rows.map(formatListingRow);
}

function getListingById(id) {
  const database = getDb();
  const row = database.prepare('SELECT * FROM listings WHERE id = ?').get(String(id || ''));
  return formatListingRow(row);
}

function searchListings({ q = '', city = '', minPrice = 0, maxPrice = 999999999, beds = 0, baths = 0, status = '' } = {}) {
  const database = getDb();
  const clauses = [];
  const params = [];

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    clauses.push('(LOWER(city) LIKE ? OR LOWER(address) LIKE ? OR LOWER(full_address) LIKE ? OR LOWER(county) LIKE ? OR LOWER(zip) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(property_type) LIKE ?)');
    params.push(like, like, like, like, like, like, like);
  }
  if (city) {
    clauses.push('LOWER(city) = ?');
    params.push(city.toLowerCase());
  }
  if (minPrice > 0) {
    clauses.push('price_num >= ?');
    params.push(minPrice);
  }
  if (maxPrice > 0 && maxPrice < 999999999) {
    clauses.push('price_num <= ?');
    params.push(maxPrice);
  }
  if (beds > 0) {
    clauses.push('beds >= ?');
    params.push(beds);
  }
  if (baths > 0) {
    clauses.push('baths >= ?');
    params.push(baths);
  }
  if (status === 'active') {
    clauses.push('active = 1');
  } else if (status === 'sold') {
    clauses.push('active = 0');
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sql = `SELECT * FROM listings ${where} ORDER BY active DESC, sort_order ASC`;
  const rows = database.prepare(sql).all(...params);
  return rows.map(formatListingRow);
}

function insertLead(lead) {
  const database = getDb();
  database.prepare(`
    INSERT INTO leads (
      lead_id, received_at, source_page, scene, name, email, phone,
      interest, budget, timeline, areas_json, segment, message,
      email_consent, sms_consent, consent_text_version, consent_timestamp, ip_hash,
      form_type, utm_json, referrer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lead.lead_id,
    lead.received_at,
    lead.source_page,
    lead.scene,
    lead.name,
    lead.email,
    lead.phone,
    lead.interest,
    lead.budget,
    lead.timeline,
    JSON.stringify(lead.areas || []),
    lead.segment,
    lead.message,
    lead.email_consent ? 1 : 0,
    lead.sms_consent ? 1 : 0,
    lead.consent_text_version,
    lead.consent_timestamp,
    lead.ip_hash || '',
    lead.form_type || 'contact',
    JSON.stringify(lead.utm || {}),
    lead.referrer || ''
  );
}

// ---------- Outbox (durable notification queue) ----------
function enqueueOutbox(leadId, channel, payload) {
  getDb().prepare(
    'INSERT INTO outbox (lead_id, channel, payload_json, next_attempt_at) VALUES (?, ?, ?, ?)'
  ).run(leadId, channel, JSON.stringify(payload), new Date().toISOString());
}

function dueOutbox(limit = 10) {
  return getDb().prepare(
    "SELECT * FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY id ASC LIMIT ?"
  ).all(new Date().toISOString(), limit);
}

function markOutboxSent(id) {
  getDb().prepare(
    "UPDATE outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = NULL WHERE id = ?"
  ).run(new Date().toISOString(), id);
}

function markOutboxFailed(id, attempts, error, maxAttempts) {
  const dead = attempts >= maxAttempts;
  const delayMs = Math.min(30000 * Math.pow(2, attempts - 1), 3600000);
  getDb().prepare(
    'UPDATE outbox SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ?'
  ).run(dead ? 'dead' : 'pending', attempts, String(error || '').slice(0, 500), new Date(Date.now() + delayMs).toISOString(), id);
  return dead;
}

function outboxSummary() {
  const rows = getDb().prepare('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status').all();
  const out = { pending: 0, sent: 0, dead: 0 };
  rows.forEach((r) => { out[r.status] = r.n; });
  return out;
}

function insertValuation(v) {
  const database = getDb();
  database.prepare(`
    INSERT INTO valuations (
      valuation_id, address, submarket, property_type, beds, baths, sqft, timeline,
      name, email, phone, consent, est_low, est_mid, est_high, concierge_uplift, ppsf
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    v.valuation_id,
    v.address,
    v.submarket,
    v.property_type,
    String(v.beds),
    String(v.baths),
    Number(v.sqft) || 2000,
    v.timeline,
    v.name,
    v.email,
    v.phone || '',
    v.consent ? 1 : 0,
    v.est_low,
    v.est_mid,
    v.est_high,
    v.concierge_uplift,
    v.ppsf
  );
}

function upsertNewsletter({ email, consent, source_page }) {
  const database = getDb();
  database.prepare(`
    INSERT INTO newsletter_subscribers (email, consent, source_page)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET consent = excluded.consent, source_page = excluded.source_page
  `).run(email, consent ? 1 : 0, source_page || '/');
}

module.exports = {
  getDb,
  getAllListings,
  getListingById,
  searchListings,
  insertLead,
  enqueueOutbox,
  dueOutbox,
  markOutboxSent,
  markOutboxFailed,
  outboxSummary,
  insertValuation,
  upsertNewsletter
};

