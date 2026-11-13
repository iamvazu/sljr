'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// The database lives OUTSIDE the web root (project-root/data/) so no static
// file server can ever hand it to a visitor. Override with DB_PATH.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'steven_lenz.db');
const LISTINGS_JSON = path.join(__dirname, '..', 'content', 'listings.json');
const TESTIMONIALS_JSON = path.join(__dirname, '..', 'content', 'testimonials.json');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

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

  addCol('follow_up_at', "follow_up_at TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote TEXT NOT NULL,
      name TEXT NOT NULL,
      context TEXT,
      source TEXT,
      permission_on_file INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      ip_hash TEXT
    );
  `);

  const listingCols = db.prepare('PRAGMA table_info(listings)').all().map((c) => c.name);
  if (!listingCols.includes('published')) db.exec('ALTER TABLE listings ADD COLUMN published INTEGER NOT NULL DEFAULT 1');

  seedListingsIfEmpty(db);
  runOnce(db, 'cleanup_2026_11_13_listings', () => {
    // Listings that could not be matched to a real MLS record, plus one duplicate.
    // Hidden, not deleted: re-publish from the admin panel once verified.
    const held = readJson(path.join(DATA_DIR, 'unpublished-listings.json'));
    const ins = insertListingStmt(db);
    held.forEach((item, i) => {
      const exists = db.prepare('SELECT 1 FROM listings WHERE id = ?').get(item.id);
      if (!exists) ins.run(...listingParams(item, 900 + i));
      db.prepare('UPDATE listings SET published = 0 WHERE id = ?').run(item.id);
    });
  });
  runOnce(db, 'seed_testimonials', () => {
    const ins = db.prepare('INSERT INTO testimonials (quote, name, context, source, permission_on_file, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    readJson(TESTIMONIALS_JSON).forEach((t, i) => ins.run(t.quote, t.name, t.context || '', t.source || '', t.permission_on_file ? 1 : 0, t.permission_on_file ? 1 : 0, i));
    readJson(path.join(DATA_DIR, 'testimonials-pending.json')).forEach((t, i) => ins.run(t.quote, t.name, t.context || '', t.source || '', 0, 0, 100 + i));
  });
  return db;
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return []; }
}

function runOnce(database, key, fn) {
  if (database.prepare('SELECT 1 FROM meta WHERE key = ?').get(key)) return;
  fn();
  database.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(key, new Date().toISOString());
}

function insertListingStmt(database) {
  return database.prepare(`
    INSERT OR REPLACE INTO listings (
      id, status, price, price_num, address, full_address, city, state, zip, county,
      beds, baths, sqft, year_built, lot_size, property_type, mls_id, photo,
      summary, description, highlights_json, role, external_url, active, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function listingParams(item, idx) {
  return [
    item.id, item.status || 'For Sale', item.price || '$0', parsePriceNum(item.price),
    item.address || '', item.full_address || '', item.city || '', item.state || 'CA', item.zip || '', item.county || '',
    Number(item.beds) || 0, Number(item.baths) || 0, String(item.sqft || ''), String(item.year_built || ''),
    String(item.lot_size || ''), item.property_type || '', item.mls_id || '', item.photo || '',
    item.summary || '', item.description || '', JSON.stringify(item.highlights || []),
    item.role || '', item.external_url || '', item.active ? 1 : 0, idx
  ];
}

function seedListingsIfEmpty(database) {
  const row = database.prepare('SELECT COUNT(*) AS cnt FROM listings').get();
  if (row && row.cnt > 0) return;
  const insert = insertListingStmt(database);
  readJson(LISTINGS_JSON).forEach((item, idx) => insert.run(...listingParams(item, idx)));
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
    active: Boolean(row.active),
    published: row.published === undefined ? true : Boolean(row.published)
  };
}

function getAllListings() {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM listings WHERE published = 1 ORDER BY active DESC, sort_order ASC').all();
  return rows.map(formatListingRow);
}

function getListingById(id) {
  const database = getDb();
  const row = database.prepare('SELECT * FROM listings WHERE id = ? AND published = 1').get(String(id || ''));
  return formatListingRow(row);
}

function searchListings({ q = '', city = '', minPrice = 0, maxPrice = 999999999, beds = 0, baths = 0, status = '' } = {}) {
  const database = getDb();
  const clauses = ['published = 1'];
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

// ---------- Public testimonials ----------
function getPublishedTestimonials() {
  return getDb().prepare(
    'SELECT quote, name, context, source FROM testimonials WHERE published = 1 AND permission_on_file = 1 ORDER BY sort_order ASC, id ASC'
  ).all().map((t) => Object.assign(t, { permission_on_file: true }));
}

// ---------- Admin: sessions & audit ----------
function createSession(tokenHash, ttlMs, ipHash) {
  const now = Date.now();
  getDb().prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(new Date(now).toISOString());
  getDb().prepare('INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip_hash) VALUES (?, ?, ?, ?)')
    .run(tokenHash, new Date(now).toISOString(), new Date(now + ttlMs).toISOString(), ipHash || '');
}
function getSession(tokenHash) {
  return getDb().prepare('SELECT * FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, new Date().toISOString());
}
function deleteSession(tokenHash) {
  getDb().prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
}
function audit(action, detail, ipHash) {
  getDb().prepare('INSERT INTO audit_log (at, action, detail, ip_hash) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), action, String(detail || '').slice(0, 500), ipHash || '');
}
function getAudit(limit = 100) {
  return getDb().prepare('SELECT at, action, detail FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
}

// ---------- Admin: leads ----------
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed', 'lost', 'spam'];

function parseLead(row) {
  if (!row) return null;
  const out = Object.assign({}, row);
  try { out.areas = JSON.parse(row.areas_json || '[]'); } catch (_) { out.areas = []; }
  try { out.utm = JSON.parse(row.utm_json || '{}'); } catch (_) { out.utm = {}; }
  delete out.areas_json; delete out.utm_json; delete out.ip_hash;
  out.email_consent = Boolean(row.email_consent);
  out.sms_consent = Boolean(row.sms_consent);
  return out;
}

function adminListLeads({ status = '', type = '', q = '', limit = 50, offset = 0 } = {}) {
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (type) { clauses.push('form_type = ?'); params.push(type); }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    clauses.push('(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ? OR LOWER(message) LIKE ?)');
    params.push(like, like, like, like);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const database = getDb();
  const total = database.prepare(`SELECT COUNT(*) AS n FROM leads ${where}`).get(...params).n;
  const rows = database.prepare(`SELECT * FROM leads ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, leads: rows.map(parseLead) };
}

function adminGetLead(leadId) {
  const database = getDb();
  const lead = parseLead(database.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId));
  if (!lead) return null;
  lead.deliveries = database.prepare(
    'SELECT id, channel, status, attempts, last_error, created_at, sent_at, next_attempt_at FROM outbox WHERE lead_id = ? ORDER BY id ASC'
  ).all(leadId);
  return lead;
}

function adminUpdateLead(leadId, { status, notes, follow_up_at }) {
  const sets = [];
  const params = [];
  if (status !== undefined && LEAD_STATUSES.includes(status)) { sets.push('status = ?'); params.push(status); }
  if (notes !== undefined) { sets.push('notes = ?'); params.push(String(notes).slice(0, 5000)); }
  if (follow_up_at !== undefined) { sets.push('follow_up_at = ?'); params.push(follow_up_at ? String(follow_up_at).slice(0, 30) : null); }
  if (!sets.length) return false;
  return getDb().prepare(`UPDATE leads SET ${sets.join(', ')} WHERE lead_id = ?`).run(...params, leadId).changes > 0;
}

function adminDeleteLead(leadId) {
  const database = getDb();
  database.prepare('DELETE FROM outbox WHERE lead_id = ?').run(leadId);
  return database.prepare('DELETE FROM leads WHERE lead_id = ?').run(leadId).changes > 0;
}

function retryOutbox(id) {
  return getDb().prepare(
    "UPDATE outbox SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL WHERE id = ? AND status != 'sent'"
  ).run(new Date().toISOString(), id).changes > 0;
}

function adminStats() {
  const database = getDb();
  const since = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const count = (sql, ...p) => database.prepare(sql).get(...p).n;
  const group = (col, days) => database.prepare(
    `SELECT COALESCE(NULLIF(${col}, ''), '(none)') AS k, COUNT(*) AS n FROM leads WHERE received_at >= ? AND status != 'spam' GROUP BY k ORDER BY n DESC LIMIT 12`
  ).all(since(days));
  return {
    total: count('SELECT COUNT(*) AS n FROM leads'),
    last7: count("SELECT COUNT(*) AS n FROM leads WHERE received_at >= ? AND status != 'spam'", since(7)),
    last30: count("SELECT COUNT(*) AS n FROM leads WHERE received_at >= ? AND status != 'spam'", since(30)),
    uncontacted: count("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"),
    follow_ups_due: count("SELECT COUNT(*) AS n FROM leads WHERE follow_up_at IS NOT NULL AND follow_up_at <= ? AND status NOT IN ('closed','lost','spam')", new Date().toISOString().slice(0, 10) + 'T23:59'),
    subscribers: count('SELECT COUNT(*) AS n FROM newsletter_subscribers WHERE consent = 1'),
    by_status: database.prepare('SELECT status AS k, COUNT(*) AS n FROM leads GROUP BY status').all(),
    by_type: group('form_type', 90),
    by_page: group('source_page', 90),
    by_source: group("json_extract(utm_json, '$.source')", 90),
    by_day: database.prepare(
      "SELECT substr(received_at, 1, 10) AS k, COUNT(*) AS n FROM leads WHERE received_at >= ? AND status != 'spam' GROUP BY k ORDER BY k ASC"
    ).all(since(30)),
    deliveries: outboxSummary()
  };
}

function adminSubscribers() {
  return getDb().prepare('SELECT email, consent, source_page, created_at FROM newsletter_subscribers ORDER BY id DESC').all();
}

// ---------- Admin: listings ----------
const LISTING_FIELDS = ['status', 'price', 'address', 'full_address', 'city', 'state', 'zip', 'county', 'beds', 'baths',
  'sqft', 'year_built', 'lot_size', 'property_type', 'mls_id', 'photo', 'summary', 'description', 'role', 'external_url'];

function adminListListings() {
  return getDb().prepare('SELECT * FROM listings ORDER BY published DESC, active DESC, sort_order ASC').all().map(formatListingRow)
    .map((l, i, arr) => l);
}

function adminSaveListing(id, data, isNew) {
  const database = getDb();
  const existing = database.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (isNew && existing) return 'exists';
  if (!isNew && !existing) return 'missing';
  if (isNew) {
    insertListingStmt(database).run(...listingParams(Object.assign({ id }, data), 500));
    database.prepare('UPDATE listings SET published = ? WHERE id = ?').run(data.published ? 1 : 0, id);
    return 'ok';
  }
  const sets = [];
  const params = [];
  LISTING_FIELDS.forEach((f) => {
    if (data[f] === undefined) return;
    sets.push(`${f} = ?`);
    params.push(f === 'beds' || f === 'baths' ? Number(data[f]) || 0 : String(data[f]).slice(0, 4000));
  });
  if (data.price !== undefined) { sets.push('price_num = ?'); params.push(parsePriceNum(data.price)); }
  if (data.highlights !== undefined) { sets.push('highlights_json = ?'); params.push(JSON.stringify((data.highlights || []).slice(0, 20))); }
  if (data.active !== undefined) { sets.push('active = ?'); params.push(data.active ? 1 : 0); }
  if (data.published !== undefined) { sets.push('published = ?'); params.push(data.published ? 1 : 0); }
  if (data.sort_order !== undefined) { sets.push('sort_order = ?'); params.push(Number(data.sort_order) || 0); }
  if (sets.length) database.prepare(`UPDATE listings SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  return 'ok';
}

// ---------- Admin: testimonials ----------
function adminListTestimonials() {
  return getDb().prepare('SELECT * FROM testimonials ORDER BY sort_order ASC, id ASC').all()
    .map((t) => Object.assign(t, { permission_on_file: Boolean(t.permission_on_file), published: Boolean(t.published) }));
}
function adminSaveTestimonial(id, d) {
  const database = getDb();
  const vals = [String(d.quote || '').slice(0, 2000), String(d.name || '').slice(0, 120), String(d.context || '').slice(0, 160),
    String(d.source || '').slice(0, 200), d.permission_on_file ? 1 : 0, d.published && d.permission_on_file ? 1 : 0, Number(d.sort_order) || 0];
  if (!vals[0] || !vals[1]) return false;
  if (id) return database.prepare('UPDATE testimonials SET quote=?, name=?, context=?, source=?, permission_on_file=?, published=?, sort_order=? WHERE id=?').run(...vals, id).changes > 0;
  database.prepare('INSERT INTO testimonials (quote, name, context, source, permission_on_file, published, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)').run(...vals);
  return true;
}
function adminDeleteTestimonial(id) {
  return getDb().prepare('DELETE FROM testimonials WHERE id = ?').run(id).changes > 0;
}

module.exports = {
  getDb,
  getPublishedTestimonials,
  createSession, getSession, deleteSession, audit, getAudit,
  LEAD_STATUSES, adminListLeads, adminGetLead, adminUpdateLead, adminDeleteLead, retryOutbox,
  adminStats, adminSubscribers,
  adminListListings, adminSaveListing,
  adminListTestimonials, adminSaveTestimonial, adminDeleteTestimonial,
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

