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
  if (!listingCols.includes('photos_json')) db.exec('ALTER TABLE listings ADD COLUMN photos_json TEXT');

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

  runOnce(db, 'm1_crm_schema_v1', () => {
    runCrmMigrations(db);
  });

  runOnce(db, 'chat_sessions_schema_v1', () => {
    initChatSchema(db);
  });

  return db;
}

function initChatSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      ip TEXT,
      city TEXT,
      region TEXT,
      country TEXT,
      postal TEXT,
      device TEXT,
      user_agent TEXT,
      page_url TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      referrer TEXT,
      contact_id INTEGER REFERENCES contacts(id),
      lead_id TEXT,
      intent TEXT,
      lead_score INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      last_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_session ON chat_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      intent TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
  `);
}

function runCrmMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'lead',
      stage TEXT NOT NULL DEFAULT 'new',
      discreet INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      first_utm_json TEXT,
      interest TEXT, budget TEXT, timeline TEXT, areas_json TEXT,
      notes TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      score_band TEXT NOT NULL DEFAULT 'cold',
      score_reasons_json TEXT,
      score_updated_at TEXT,
      last_inbound_at TEXT,
      last_outbound_at TEXT,
      next_follow_up_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      merged_into INTEGER REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS contact_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok',
      UNIQUE (kind, value)
    );

    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      channel TEXT NOT NULL,
      granted INTEGER NOT NULL,
      text_version TEXT,
      source TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      kind TEXT NOT NULL,
      direction TEXT,
      subject TEXT,
      body TEXT,
      meta_json TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities (contact_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
      stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id),
      title TEXT NOT NULL,
      value_usd INTEGER,
      property_address TEXT,
      expected_close TEXT,
      closed_at TEXT,
      stage_changed_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER REFERENCES contacts(id),
      deal_id INTEGER REFERENCES deals(id),
      title TEXT NOT NULL,
      due_at TEXT,
      done_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (contact_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      channel TEXT NOT NULL,
      to_value TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      origin TEXT NOT NULL,
      action_item_id INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',
      provider_id TEXT,
      error TEXT,
      approved_at TEXT NOT NULL,
      sent_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS action_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_date TEXT NOT NULL,
      contact_id INTEGER NOT NULL REFERENCES contacts(id),
      rule TEXT NOT NULL,
      reason TEXT NOT NULL,
      channel TEXT NOT NULL,
      draft_subject TEXT,
      draft_body TEXT,
      draft_source TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      snoozed_until TEXT,
      skip_reason TEXT,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE (plan_date, contact_id, rule)
    );

    CREATE TABLE IF NOT EXISTS ai_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purpose TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      model TEXT NOT NULL,
      contact_id INTEGER,
      input_json TEXT NOT NULL,
      output_text TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cost_usd REAL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      keys_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      ip TEXT,
      city TEXT,
      region TEXT,
      country TEXT,
      postal TEXT,
      device TEXT,
      user_agent TEXT,
      page_url TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      referrer TEXT,
      contact_id INTEGER REFERENCES contacts(id),
      lead_id TEXT,
      intent TEXT,
      lead_score INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      last_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_session ON chat_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      intent TEXT,
      properties_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

  `);

  const leadCols = database.prepare('PRAGMA table_info(leads)').all().map((c) => c.name);
  if (!leadCols.includes('contact_id')) {
    database.exec('ALTER TABLE leads ADD COLUMN contact_id INTEGER REFERENCES contacts(id)');
  }

  const pipelineCount = database.prepare('SELECT COUNT(*) as count FROM pipelines').get().count;
  if (pipelineCount === 0) {
    const insPipeline = database.prepare('INSERT INTO pipelines (id, name) VALUES (?, ?)');
    insPipeline.run(1, 'Buyer');
    insPipeline.run(2, 'Seller');

    const insStage = database.prepare(`
      INSERT INTO pipeline_stages (pipeline_id, name, sort_order, is_won, is_lost)
      VALUES (?, ?, ?, ?, ?)
    `);

    const buyerStages = [
      { name: 'New', order: 1, won: 0, lost: 0 },
      { name: 'Contacted', order: 2, won: 0, lost: 0 },
      { name: 'Qualified', order: 3, won: 0, lost: 0 },
      { name: 'Showing', order: 4, won: 0, lost: 0 },
      { name: 'Offer', order: 5, won: 0, lost: 0 },
      { name: 'Under contract', order: 6, won: 0, lost: 0 },
      { name: 'Closed', order: 7, won: 1, lost: 0 },
      { name: 'Lost', order: 8, won: 0, lost: 1 }
    ];
    for (const s of buyerStages) {
      insStage.run(1, s.name, s.order, s.won, s.lost);
    }

    const sellerStages = [
      { name: 'New', order: 1, won: 0, lost: 0 },
      { name: 'Contacted', order: 2, won: 0, lost: 0 },
      { name: 'Qualified', order: 3, won: 0, lost: 0 },
      { name: 'Listing prep', order: 4, won: 0, lost: 0 },
      { name: 'Offer', order: 5, won: 0, lost: 0 },
      { name: 'Under contract', order: 6, won: 0, lost: 0 },
      { name: 'Closed', order: 7, won: 1, lost: 0 },
      { name: 'Lost', order: 8, won: 0, lost: 1 }
    ];
    for (const s of sellerStages) {
      insStage.run(2, s.name, s.order, s.won, s.lost);
    }
  }
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
      summary, description, highlights_json, role, external_url, active, sort_order, photos_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
}

function listingParams(item, idx) {
  const photosList = Array.isArray(item.photos) && item.photos.length ? item.photos : [item.photo].filter(Boolean);
  return [
    item.id, item.status || 'For Sale', item.price || '$0', parsePriceNum(item.price),
    item.address || '', item.full_address || '', item.city || '', item.state || 'CA', item.zip || '', item.county || '',
    Number(item.beds) || 0, Number(item.baths) || 0, String(item.sqft || ''), String(item.year_built || ''),
    String(item.lot_size || ''), item.property_type || '', item.mls_id || '', item.photo || '',
    item.summary || '', item.description || '', JSON.stringify(item.highlights || []),
    item.role || '', item.external_url || '', item.active ? 1 : 0, idx, JSON.stringify(photosList)
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
  let photos = [];
  try { photos = JSON.parse(row.photos_json || '[]'); } catch (_) {}
  if (!photos.length && row.photo) photos = [row.photo];
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
    photos,
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
  database.exec('BEGIN IMMEDIATE');
  try {
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

    try {
      const { leadToContact } = require('../lib/crm');
      leadToContact(lead, database);
    } catch (crmErr) {
      console.error('Warning: CRM leadToContact failed:', crmErr);
    }

    database.exec('COMMIT');

    // Trigger instant Web Push notification to registered CRM clients
    try {
      const { sendLeadNotification } = require('../lib/push');
      sendLeadNotification(lead).catch((pErr) => {
        console.warn('[push] lead notification failed:', pErr.message);
      });
    } catch (_) {}
  } catch (err) {
    try { database.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }
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

// ---------- Admin: Contacts (CRM M1) ----------
const CONTACT_STAGES = [
  'new', 'contacted', 'qualified', 'showing', 'listing_prep', 'offer',
  'under_contract', 'closed', 'lost', 'spam', 'archive', 'past_client'
];
const CONTACT_TYPES = ['lead', 'client', 'past_client', 'sphere', 'agent', 'vendor'];
const SCORE_BANDS = ['hot', 'warm', 'cool', 'cold'];

function parseContact(row) {
  if (!row) return null;
  const out = Object.assign({}, row);
  try { out.areas = JSON.parse(row.areas_json || '[]'); } catch (_) { out.areas = []; }
  try { out.first_utm = JSON.parse(row.first_utm_json || '{}'); } catch (_) { out.first_utm = {}; }
  try { out.score_reasons = JSON.parse(row.score_reasons_json || '[]'); } catch (_) { out.score_reasons = []; }
  delete out.areas_json;
  delete out.first_utm_json;
  delete out.score_reasons_json;
  out.discreet = Boolean(row.discreet);
  return out;
}

function adminListContacts({ stage = '', type = '', score_band = '', q = '', limit = 50, offset = 0 } = {}) {
  const database = getDb();
  const clauses = ['c.merged_into IS NULL'];
  const params = [];

  if (stage) { clauses.push('c.stage = ?'); params.push(stage); }
  if (type) { clauses.push('c.type = ?'); params.push(type); }
  if (score_band) { clauses.push('c.score_band = ?'); params.push(score_band); }
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    clauses.push(`(
      LOWER(c.display_name) LIKE ? OR
      LOWER(c.first_name) LIKE ? OR
      LOWER(c.last_name) LIKE ? OR
      LOWER(c.notes) LIKE ? OR
      EXISTS (
        SELECT 1 FROM contact_identities ci
        WHERE ci.contact_id = c.id AND LOWER(ci.value) LIKE ?
      )
    )`);
    params.push(like, like, like, like, like);
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const total = database.prepare(`SELECT COUNT(*) AS n FROM contacts c ${where}`).get(...params).n;

  const rows = database.prepare(`
    SELECT c.*,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_email,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'phone' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_phone,
      (SELECT COUNT(*) FROM tasks WHERE contact_id = c.id AND done_at IS NULL) as open_tasks_count,
      (SELECT COUNT(*) FROM deals WHERE contact_id = c.id) as deals_count
    FROM contacts c
    ${where}
    ORDER BY c.last_inbound_at DESC, c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { total, contacts: rows.map(parseContact), limit, offset };
}

function adminGetContact(contactId, dbInstance) {
  const database = dbInstance || getDb();
  const raw = database.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!raw) return null;
  const contact = parseContact(raw);

  contact.identities = database.prepare(
    'SELECT * FROM contact_identities WHERE contact_id = ? ORDER BY is_primary DESC, kind ASC, id ASC'
  ).all(contactId);

  contact.activities = database.prepare(
    'SELECT * FROM activities WHERE contact_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 100'
  ).all(contactId).map(a => {
    try { a.meta = JSON.parse(a.meta_json || '{}'); } catch (_) { a.meta = {}; }
    delete a.meta_json;
    return a;
  });

  contact.consents = database.prepare(
    'SELECT * FROM consents WHERE contact_id = ? ORDER BY recorded_at DESC, id DESC'
  ).all(contactId);

  contact.deals = database.prepare(`
    SELECT d.*, p.name as pipeline_name, s.name as stage_name, s.is_won, s.is_lost
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE d.contact_id = ?
    ORDER BY d.created_at DESC
  `).all(contactId);

  contact.tasks = database.prepare(
    'SELECT * FROM tasks WHERE contact_id = ? ORDER BY done_at ASC, due_at ASC, id DESC'
  ).all(contactId);

  contact.tags = database.prepare(`
    SELECT t.id, t.name
    FROM tags t
    JOIN contact_tags ct ON ct.tag_id = t.id
    WHERE ct.contact_id = ?
    ORDER BY t.name ASC
  `).all(contactId);

  return contact;
}

function rescoreContact(contactId, dbInstance) {
  const database = dbInstance || getDb();
  const contact = adminGetContact(contactId, database);
  if (!contact) return null;

  const { scoreContact } = require('../lib/scoring');
  const scored = scoreContact(contact, contact.activities, contact.consents, new Date());

  const now = new Date().toISOString();
  database.prepare(`
    UPDATE contacts
    SET score = ?, score_band = ?, score_reasons_json = ?, score_updated_at = ?
    WHERE id = ?
  `).run(scored.score, scored.band, JSON.stringify(scored.reasons), now, contactId);

  return {
    id: contactId,
    score: scored.score,
    score_band: scored.band,
    score_reasons: scored.reasons,
    score_updated_at: now,
    breakdown: scored.breakdown
  };
}

function rescoreAllContacts(dbInstance) {
  const database = dbInstance || getDb();
  const rows = database.prepare('SELECT id FROM contacts WHERE merged_into IS NULL').all();
  let count = 0;
  for (const row of rows) {
    rescoreContact(row.id, database);
    count++;
  }
  return { ok: true, rescored: count };
}

function adminUpdateContact(contactId, updates = {}) {
  const database = getDb();
  const sets = [];
  const params = [];

  if (updates.stage !== undefined && CONTACT_STAGES.includes(updates.stage)) {
    sets.push('stage = ?');
    params.push(updates.stage);
  }
  if (updates.type !== undefined && CONTACT_TYPES.includes(updates.type)) {
    sets.push('type = ?');
    params.push(updates.type);
  }
  if (updates.discreet !== undefined) {
    sets.push('discreet = ?');
    params.push(updates.discreet ? 1 : 0);
  }
  if (updates.notes !== undefined) {
    sets.push('notes = ?');
    params.push(String(updates.notes).slice(0, 5000));
  }
  if (updates.interest !== undefined) {
    sets.push('interest = ?');
    params.push(String(updates.interest).slice(0, 60));
  }
  if (updates.budget !== undefined) {
    sets.push('budget = ?');
    params.push(String(updates.budget).slice(0, 40));
  }
  if (updates.timeline !== undefined) {
    sets.push('timeline = ?');
    params.push(String(updates.timeline).slice(0, 60));
  }

  if (!sets.length) return false;
  sets.push("updated_at = ?");
  params.push(new Date().toISOString());

  const changed = database.prepare(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`).run(...params, contactId).changes > 0;
  if (changed) {
    try { rescoreContact(contactId, database); } catch (_) {}
  }
  return changed;
}

function adminMergeContacts(survivorId, otherId, dbInstance) {
  const database = dbInstance || getDb();
  const sId = Number(survivorId);
  const oId = Number(otherId);

  if (!sId || !oId || sId === oId) {
    throw new Error('Invalid contact IDs for merge (must be distinct)');
  }

  const survivor = adminGetContact(sId, database);
  const other = adminGetContact(oId, database);
  if (!survivor) throw new Error(`Survivor contact #${sId} not found`);
  if (!other) throw new Error(`Other contact #${oId} not found`);
  if (survivor.merged_into) throw new Error(`Survivor #${sId} is already merged into #${survivor.merged_into}`);
  if (other.merged_into) throw new Error(`Other #${oId} is already merged into #${other.merged_into}`);

  const now = new Date().toISOString();

  database.exec('BEGIN IMMEDIATE');
  try {
    // 1. Re-point activities
    database.prepare('UPDATE activities SET contact_id = ? WHERE contact_id = ?').run(sId, oId);

    // 2. Re-point deals
    database.prepare('UPDATE deals SET contact_id = ?, updated_at = ? WHERE contact_id = ?').run(sId, now, oId);

    // 3. Re-point tasks
    database.prepare('UPDATE tasks SET contact_id = ? WHERE contact_id = ?').run(sId, oId);

    // 4. Re-point messages
    database.prepare('UPDATE messages SET contact_id = ? WHERE contact_id = ?').run(sId, oId);

    // 5. Re-point leads
    database.prepare('UPDATE leads SET contact_id = ? WHERE contact_id = ?').run(sId, oId);

    // 6. Action items: avoid UNIQUE(plan_date, contact_id, rule) collisions
    const otherItems = database.prepare('SELECT * FROM action_items WHERE contact_id = ?').all(oId);
    for (const item of otherItems) {
      const exists = database.prepare('SELECT 1 FROM action_items WHERE plan_date = ? AND contact_id = ? AND rule = ?').get(item.plan_date, sId, item.rule);
      if (exists) {
        database.prepare('DELETE FROM action_items WHERE id = ?').run(item.id);
      } else {
        database.prepare('UPDATE action_items SET contact_id = ? WHERE id = ?').run(sId, item.id);
      }
    }

    // 7. Contact identities: migrate non-duplicates, remove duplicates to satisfy UNIQUE(kind, value)
    const otherIdentities = database.prepare('SELECT * FROM contact_identities WHERE contact_id = ?').all(oId);
    for (const idn of otherIdentities) {
      const exists = database.prepare('SELECT 1 FROM contact_identities WHERE kind = ? AND value = ? AND contact_id = ?').get(idn.kind, idn.value, sId);
      if (exists) {
        database.prepare('DELETE FROM contact_identities WHERE id = ?').run(idn.id);
      } else {
        database.prepare('UPDATE contact_identities SET contact_id = ?, is_primary = 0 WHERE id = ?').run(sId, idn.id);
      }
    }

    // 8. Consents: re-point all consent records; latest consent determines current state per PRD line 504
    database.prepare('UPDATE consents SET contact_id = ? WHERE contact_id = ?').run(sId, oId);

    // 9. Contact Tags: migrate non-duplicates
    const otherTags = database.prepare('SELECT * FROM contact_tags WHERE contact_id = ?').all(oId);
    for (const tag of otherTags) {
      const exists = database.prepare('SELECT 1 FROM contact_tags WHERE contact_id = ? AND tag_id = ?').get(sId, tag.tag_id);
      if (exists) {
        database.prepare('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?').run(oId, tag.tag_id);
      } else {
        database.prepare('UPDATE contact_tags SET contact_id = ? WHERE contact_id = ? AND tag_id = ?').run(sId, oId, tag.tag_id);
      }
    }

    // 10. Merge notes & missing preference fields
    let combinedNotes = survivor.notes || '';
    if (other.notes) {
      combinedNotes = combinedNotes ? `${combinedNotes}\n\n[Merged from #${oId}]: ${other.notes}` : other.notes;
    }

    const updates = [];
    const params = [];
    if (combinedNotes !== (survivor.notes || '')) {
      updates.push('notes = ?');
      params.push(combinedNotes);
    }
    if (!survivor.interest && other.interest) {
      updates.push('interest = ?');
      params.push(other.interest);
    }
    if (!survivor.budget && other.budget) {
      updates.push('budget = ?');
      params.push(other.budget);
    }
    if (!survivor.timeline && other.timeline) {
      updates.push('timeline = ?');
      params.push(other.timeline);
    }

    updates.push('updated_at = ?');
    params.push(now);
    params.push(sId);

    database.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // 11. Mark other contact as merged_into
    database.prepare(`
      UPDATE contacts
      SET merged_into = ?, updated_at = ?
      WHERE id = ?
    `).run(sId, now, oId);

    // 12. Record merge activity on survivor
    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, body, occurred_at, created_at)
      VALUES (?, 'system', NULL, 'Merged contact record', ?, ?, ?)
    `).run(sId, `Merged contact #${oId} (${other.display_name}) into this record.`, now, now);

    // 13. Update next_follow_up_at
    updateContactNextFollowUp(database, sId);

    database.exec('COMMIT');
  } catch (err) {
    try { database.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  // 14. Rescore survivor with updated activities and preferences
  rescoreContact(sId, database);

  return { ok: true, survivor_id: sId, merged_id: oId };
}

function adminExportContact(contactId, dbInstance) {
  const database = dbInstance || getDb();
  const c = database.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!c) return null;

  const identities = database.prepare('SELECT * FROM contact_identities WHERE contact_id = ?').all(contactId);
  const consents = database.prepare('SELECT * FROM consents WHERE contact_id = ? ORDER BY recorded_at ASC').all(contactId);
  const activities = database.prepare('SELECT * FROM activities WHERE contact_id = ? ORDER BY occurred_at ASC').all(contactId);
  const messages = database.prepare('SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at ASC').all(contactId);
  const deals = database.prepare('SELECT * FROM deals WHERE contact_id = ?').all(contactId);
  const tasks = database.prepare('SELECT * FROM tasks WHERE contact_id = ?').all(contactId);
  const actionItems = database.prepare('SELECT * FROM action_items WHERE contact_id = ?').all(contactId);
  const linkedLeads = database.prepare('SELECT * FROM leads WHERE contact_id = ?').all(contactId);
  const tags = database.prepare(`
    SELECT t.* FROM tags t
    JOIN contact_tags ct ON ct.tag_id = t.id
    WHERE ct.contact_id = ?
  `).all(contactId);

  return {
    exported_at: new Date().toISOString(),
    contact: parseContact(c),
    identities,
    consents,
    activities,
    messages,
    deals,
    tasks,
    tags,
    action_items: actionItems,
    linked_leads: linkedLeads
  };
}

function adminDeleteContact(contactId, dbInstance) {
  const database = dbInstance || getDb();
  const c = database.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!c) {
    throw new Error(`Contact #${contactId} not found`);
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare('DELETE FROM contact_identities WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM consents WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM activities WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM messages WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM tasks WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM deals WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM action_items WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM ai_runs WHERE contact_id = ?').run(contactId);
    // Delete linked leads per PRD line 317: "including identities, consents, activities, messages and linked leads"
    database.prepare('DELETE FROM leads WHERE contact_id = ?').run(contactId);
    database.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);
    database.exec('COMMIT');
  } catch (err) {
    try { database.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  return { ok: true, deleted_id: Number(contactId) };
}

// ---------- Tasks & Deals (CRM M1) ----------
function updateContactNextFollowUp(database, contactId) {
  if (!contactId) return;
  const row = database.prepare(`
    SELECT MIN(due_at) as earliest
    FROM tasks
    WHERE contact_id = ? AND done_at IS NULL AND due_at IS NOT NULL AND due_at != ''
  `).get(contactId);

  const earliest = row ? row.earliest : null;
  database.prepare(`
    UPDATE contacts SET next_follow_up_at = ?, updated_at = ?
    WHERE id = ?
  `).run(earliest || null, new Date().toISOString(), contactId);
}

function adminCreateTask({ contact_id, deal_id, title, due_at }) {
  if (!title) return null;
  const database = getDb();
  const now = new Date().toISOString();
  const res = database.prepare(`
    INSERT INTO tasks (contact_id, deal_id, title, due_at, done_at, created_at)
    VALUES (?, ?, ?, ?, NULL, ?)
  `).run(contact_id || null, deal_id || null, String(title).slice(0, 255), due_at || null, now);

  const taskId = Number(res.lastInsertRowid);
  if (contact_id) {
    updateContactNextFollowUp(database, contact_id);
  }
  return database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

function adminUpdateTask(taskId, { done, title, due_at }) {
  const database = getDb();
  const existing = database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const sets = [];
  const params = [];

  if (done !== undefined) {
    if (done) {
      sets.push('done_at = ?');
      params.push(now);
      if (existing.contact_id) {
        database.prepare(`
          INSERT INTO activities (contact_id, kind, direction, subject, body, meta_json, occurred_at, created_at)
          VALUES (?, 'task_done', NULL, ?, ?, ?, ?, ?)
        `).run(
          existing.contact_id,
          `Task completed: ${existing.title}`,
          `Task "${existing.title}" was marked completed.`,
          JSON.stringify({ task_id: taskId, deal_id: existing.deal_id }),
          now,
          now
        );
      }
    } else {
      sets.push('done_at = NULL');
    }
  }

  if (title !== undefined) {
    sets.push('title = ?');
    params.push(String(title).slice(0, 255));
  }
  if (due_at !== undefined) {
    sets.push('due_at = ?');
    params.push(due_at ? String(due_at).slice(0, 40) : null);
  }

  if (sets.length) {
    database.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params, taskId);
  }

  if (existing.contact_id) {
    updateContactNextFollowUp(database, existing.contact_id);
  }

  return database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

function adminDeleteTask(taskId) {
  const database = getDb();
  const existing = database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!existing) return false;

  database.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  if (existing.contact_id) {
    updateContactNextFollowUp(database, existing.contact_id);
  }
  return true;
}

function adminListTasks({ status = 'all', contact_id, deal_id, limit = 100, offset = 0 } = {}) {
  const database = getDb();
  const clauses = [];
  const params = [];
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.slice(0, 10);

  if (status === 'open') {
    clauses.push('t.done_at IS NULL');
  } else if (status === 'completed') {
    clauses.push('t.done_at IS NOT NULL');
  } else if (status === 'overdue') {
    clauses.push('t.done_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < ?');
    params.push(nowIso);
  } else if (status === 'today') {
    clauses.push('t.done_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) = ?');
    params.push(todayStr);
  }

  if (contact_id) {
    clauses.push('t.contact_id = ?');
    params.push(Number(contact_id));
  }
  if (deal_id) {
    clauses.push('t.deal_id = ?');
    params.push(Number(deal_id));
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const rows = database.prepare(`
    SELECT t.*, c.display_name as contact_name, d.title as deal_title,
           CASE WHEN t.done_at IS NULL AND t.due_at IS NOT NULL AND t.due_at < ? THEN 1 ELSE 0 END as is_overdue,
           CASE WHEN t.done_at IS NULL AND t.due_at IS NOT NULL AND substr(t.due_at, 1, 10) = ? THEN 1 ELSE 0 END as is_today
    FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    LEFT JOIN deals d ON d.id = t.deal_id
    ${where}
    ORDER BY t.done_at ASC, t.due_at ASC, t.id DESC
    LIMIT ? OFFSET ?
  `).all(nowIso, todayStr, ...params, limit, offset);

  let counts = { total: 0, open_count: 0, completed_count: 0, overdue_count: 0, today_count: 0 };
  try {
    const cRow = database.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN done_at IS NULL THEN 1 ELSE 0 END), 0) as open_count,
        COALESCE(SUM(CASE WHEN done_at IS NOT NULL THEN 1 ELSE 0 END), 0) as completed_count,
        COALESCE(SUM(CASE WHEN done_at IS NULL AND due_at IS NOT NULL AND due_at < ? THEN 1 ELSE 0 END), 0) as overdue_count,
        COALESCE(SUM(CASE WHEN done_at IS NULL AND due_at IS NOT NULL AND substr(due_at, 1, 10) = ? THEN 1 ELSE 0 END), 0) as today_count
      FROM tasks
    `).get(nowIso, todayStr);
    if (cRow) counts = cRow;
  } catch (_) {}

  return { tasks: rows, counts };
}

function adminCreateContact({ first_name, last_name, display_name, email, phone, stage, type, interest, budget, timeline, notes, discreet }) {
  const database = getDb();
  const fName = String(first_name || '').trim();
  const lName = String(last_name || '').trim();
  let dName = String(display_name || '').trim();
  if (!dName) {
    dName = [fName, lName].filter(Boolean).join(' ') || 'New Contact';
  }
  const now = new Date().toISOString();
  const initialStage = stage && CONTACT_STAGES.includes(stage) ? stage : 'new';
  const initialType = type && CONTACT_TYPES.includes(type) ? type : 'lead';

  database.exec('BEGIN IMMEDIATE');
  let contactId;
  try {
    const res = database.prepare(`
      INSERT INTO contacts (
        first_name, last_name, display_name, type, stage, discreet,
        source, first_utm_json, interest, budget, timeline, areas_json,
        notes, score, score_band, last_inbound_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'cold', ?, ?, ?)
    `).run(
      fName,
      lName,
      dName,
      initialType,
      initialStage,
      discreet ? 1 : 0,
      'back_office',
      '{}',
      interest ? String(interest).slice(0, 60) : null,
      budget ? String(budget).slice(0, 40) : null,
      timeline ? String(timeline).slice(0, 60) : null,
      '[]',
      notes ? String(notes).slice(0, 5000) : null,
      now,
      now,
      now
    );
    contactId = Number(res.lastInsertRowid);

    if (email) {
      const cleanEmail = String(email).trim().toLowerCase();
      database.prepare(`
        INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
        VALUES (?, 'email', ?, 1, 'ok')
      `).run(contactId, cleanEmail);
      database.prepare(`
        INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
        VALUES (?, 'email', 1, 'v1', 'back_office_created', ?)
      `).run(contactId, now);
    }

    if (phone) {
      const cleanPhone = String(phone).trim();
      database.prepare(`
        INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
        VALUES (?, 'phone', ?, 1, 'ok')
      `).run(contactId, cleanPhone);
    }

    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, body, occurred_at, created_at)
      VALUES (?, 'note', NULL, 'Contact created manually in Back Office', ?, ?, ?)
    `).run(contactId, `Created manually: ${dName}. Notes: ${notes || 'None'}`, now, now);

    database.exec('COMMIT');
  } catch (err) {
    try { database.exec('ROLLBACK'); } catch (_) {}
    throw err;
  }

  try {
    rescoreContact(contactId, database);
  } catch (_) {}

  return adminGetContact(contactId, database);
}

function adminSeedSampleData(force = false) {
  const database = getDb();
  const existingCount = database.prepare('SELECT COUNT(*) as n FROM contacts WHERE merged_into IS NULL').get().n;
  if (existingCount > 0 && !force) {
    return { ok: true, seeded: false, message: 'Contacts already exist.' };
  }

  const sampleContacts = [
    {
      first_name: 'Marcus',
      last_name: 'Vance',
      display_name: 'Dr. Marcus & Elena Vance',
      email: 'marcus.vance@ucsfmed.org',
      phone: '(415) 890-4421',
      stage: 'showing',
      type: 'client',
      interest: 'Relocating from San Francisco to Pleasanton',
      budget: '$3,500,000',
      timeline: 'Immediate (30-60 days)',
      notes: 'UCSF Chief of Surgery relocating family from Pacific Heights to Pleasanton Ruby Hill. Needs custom estate with home office and 4-car garage. Top priority: Pleasanton Unified schools.',
      pipeline_id: 1,
      stage_id: 4, // Property Tours
      deal_title: 'Dr. Marcus & Elena Vance - Ruby Hill Luxury Acquisition',
      deal_value: 3450000,
      deal_address: 'Ruby Hill Golf Club Enclave, Pleasanton',
      tasks: [
        { title: 'Send off-market Ruby Hill comp analysis and private gate access codes', due_offset_days: 0 },
        { title: 'Confirm Saturday 11am private showing with listing agent', due_offset_days: 1 }
      ]
    },
    {
      first_name: 'Jonathan',
      last_name: 'Chen',
      display_name: 'Jonathan & Sarah Chen',
      email: 'jonathan.chen@techleader.io',
      phone: '(408) 512-9844',
      stage: 'offer',
      type: 'client',
      interest: 'Moving from Silicon Valley to Danville',
      budget: '$4,200,000',
      timeline: '30 days',
      notes: 'VP of AI at Mountain View tech company. Moving from Sunnyvale to Westside Danville. Wants minimum 0.75-acre lot, single story modern or updated traditional.',
      pipeline_id: 1,
      stage_id: 5, // Offers Out
      deal_title: 'Chen Family - Westside Danville Custom Estate',
      deal_value: 4100000,
      deal_address: '342 El Pintado Rd, Danville',
      tasks: [
        { title: 'Follow up with listing agent on counter-offer terms and appraisal contingency', due_offset_days: 0 }
      ]
    },
    {
      first_name: 'Priya',
      last_name: 'Patel',
      display_name: 'Priya & Amit Patel',
      email: 'priya.patel@biotechvc.com',
      phone: '(510) 673-1980',
      stage: 'under_contract',
      type: 'client',
      interest: 'Relocating from Fremont to San Ramon',
      budget: '$2,200,000',
      timeline: 'In Escrow',
      notes: 'Biotech director in Mission Bay and Tesla engineer moving from Warm Springs Fremont to Gale Ranch San Ramon. Top priority: Dougherty Valley High academic rank.',
      pipeline_id: 1,
      stage_id: 6, // In Escrow
      deal_title: 'Patel Family - Gale Ranch Modern View Estate',
      deal_value: 2150000,
      deal_address: '7104 Monarch Terrace, San Ramon',
      tasks: [
        { title: 'Schedule physical home inspection & sewer lateral review with inspectors', due_offset_days: 2 }
      ]
    },
    {
      first_name: 'Robert',
      last_name: 'Sterling',
      display_name: 'Robert & Catherine Sterling',
      email: 'robert.sterling@sterlingcapital.net',
      phone: '(925) 388-7712',
      stage: 'listing_prep',
      type: 'client',
      interest: 'Selling Greenbrook Danville Estate',
      budget: '$2,850,000',
      timeline: 'Pre-Market Prep',
      notes: 'Retiring executives downsizing to Carmel. Selling their beautifully maintained 4-bed, 3-bath estate in Greenbrook Danville. Utilizing Compass Concierge for fronted cosmetic updates.',
      pipeline_id: 2,
      stage_id: 12, // Pre-Market Staging
      deal_title: 'Sterling Estate - Greenbrook Luxury Listing Presentation',
      deal_value: 2850000,
      deal_address: '112 Greenbrook Dr, Danville',
      tasks: [
        { title: 'Walk-through with Compass Concierge staging contractor for lighting & paint quotes', due_offset_days: 0 }
      ]
    },
    {
      first_name: 'David',
      last_name: 'Miller',
      display_name: 'David & Laura Miller',
      email: 'david.miller@alamoinvest.com',
      phone: '(925) 441-2099',
      stage: 'qualified',
      type: 'lead',
      interest: 'Alamo Westside Acreage Estate Valuation',
      budget: '$5,250,000',
      timeline: 'Spring listing',
      notes: 'Inquired via Home Valuation for their 2.1-acre gated estate near Round Hill. Interested in Compass Private Exclusives off-market launch before public MLS.',
      pipeline_id: 2,
      stage_id: 11, // Listing Presentation
      deal_title: 'Miller Westside Alamo Compound Listing',
      deal_value: 5250000,
      deal_address: 'Round Hill Rd, Alamo',
      tasks: [
        { title: 'Deliver custom luxury CMA booklet with Round Hill recent comps', due_offset_days: 1 }
      ]
    },
    {
      first_name: 'Alexander',
      last_name: 'Thorne',
      display_name: 'Alexander Thorne',
      email: 'alex.thorne@stanfordendow.org',
      phone: '(650) 799-3120',
      stage: 'new',
      type: 'lead',
      interest: 'Palo Alto to Alamo private compound relocation',
      budget: '$6,500,000+',
      timeline: 'Immediate cash buyer',
      notes: 'Managing partner seeking secluded multi-acre Alamo gated compound with tennis court and pool. Private, discreet representation requested.',
      pipeline_id: 1,
      stage_id: 2, // Initial Contact / Qualification
      deal_title: 'Thorne - Alamo Gated Compound Acquisition',
      deal_value: 6500000,
      deal_address: 'Alamo Ridges & Private Enclaves',
      tasks: [
        { title: 'Initial discovery call on multi-acre equestrian zoning in Alamo', due_offset_days: 0 }
      ]
    }
  ];

  let added = 0;
  for (const s of sampleContacts) {
    const contact = adminCreateContact({
      first_name: s.first_name,
      last_name: s.last_name,
      display_name: s.display_name,
      email: s.email,
      phone: s.phone,
      stage: s.stage,
      type: s.type,
      interest: s.interest,
      budget: s.budget,
      timeline: s.timeline,
      notes: s.notes,
      discreet: false
    });

    if (contact && contact.id) {
      added++;
      const deal = adminCreateDeal({
        contact_id: contact.id,
        pipeline_id: s.pipeline_id,
        stage_id: s.stage_id,
        title: s.deal_title,
        value_usd: s.deal_value,
        property_address: s.deal_address,
        expected_close: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
      });

      for (const t of s.tasks) {
        const dueDate = new Date(Date.now() + t.due_offset_days * 86400000).toISOString().slice(0, 10);
        adminCreateTask({
          contact_id: contact.id,
          deal_id: deal ? deal.id : null,
          title: t.title,
          due_at: dueDate
        });
      }

      const now = new Date().toISOString();
      database.prepare(`
        INSERT INTO activities (contact_id, kind, direction, subject, body, occurred_at, created_at)
        VALUES (?, 'inbound_form', 'inbound', 'Inquired via Relocation Corridor Guide', ?, ?, ?)
      `).run(contact.id, `Inbound inquiry for ${s.interest}. Budget: ${s.budget}. Notes: ${s.notes}`, now, now);

      rescoreContact(contact.id, database);
    }
  }

  try {
    const actionPlan = require('../lib/actionPlan');
    actionPlan.generateDailyActionPlan(database);
  } catch (_) {}

  return { ok: true, seeded: true, added };
}

function adminListPipelines() {
  const database = getDb();
  const pipelines = database.prepare('SELECT * FROM pipelines ORDER BY id ASC').all();
  const stages = database.prepare('SELECT * FROM pipeline_stages ORDER BY pipeline_id ASC, sort_order ASC').all();
  let deals = [];
  try {
    deals = database.prepare(`
      SELECT d.*, c.display_name as contact_name, c.score as contact_score, c.score_band as contact_score_band,
             (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as contact_email,
             (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'phone' ORDER BY is_primary DESC, id ASC LIMIT 1) as contact_phone
      FROM deals d
      JOIN contacts c ON c.id = d.contact_id
      ORDER BY d.updated_at DESC, d.id DESC
    `).all();
  } catch (_) {
    deals = [];
  }

  return pipelines.map((p) => {
    const pStages = stages.filter((s) => s.pipeline_id === p.id).map((s) => {
      const stageDeals = deals.filter((d) => d.stage_id === s.id);
      const totalVolume = stageDeals.reduce((sum, d) => sum + (Number(d.value_usd) || 0), 0);
      return Object.assign({}, s, {
        deals: stageDeals,
        total_volume: totalVolume,
        deal_count: stageDeals.length
      });
    });
    const totalVolume = pStages.reduce((sum, s) => sum + s.total_volume, 0);
    const totalDeals = pStages.reduce((sum, s) => sum + s.deal_count, 0);
    return {
      id: p.id,
      name: p.name,
      total_volume: totalVolume,
      total_deals: totalDeals,
      stages: pStages
    };
  });
}

function adminCreateDeal({ contact_id, pipeline_id, stage_id, title, value_usd, property_address, expected_close }) {
  const database = getDb();
  const contact = database.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id);
  if (!contact) throw new Error('Contact not found');

  const pipeId = Number(pipeline_id) || 1;
  let stId = Number(stage_id);
  if (!stId) {
    const firstStage = database.prepare('SELECT id FROM pipeline_stages WHERE pipeline_id = ? ORDER BY sort_order ASC LIMIT 1').get(pipeId);
    stId = firstStage ? firstStage.id : (pipeId === 1 ? 1 : 9);
  }

  const pName = pipeId === 1 ? 'Buyer' : 'Seller';
  const dealTitle = title ? String(title).slice(0, 160) : `${contact.display_name} - ${pName} Deal`;
  const now = new Date().toISOString();

  const res = database.prepare(`
    INSERT INTO deals (
      contact_id, pipeline_id, stage_id, title, value_usd,
      property_address, expected_close, closed_at, stage_changed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    contact_id,
    pipeId,
    stId,
    dealTitle,
    value_usd ? Number(value_usd) : null,
    property_address ? String(property_address).slice(0, 200) : null,
    expected_close ? String(expected_close).slice(0, 40) : null,
    now,
    now,
    now
  );

  const dealId = Number(res.lastInsertRowid);
  const stageRow = database.prepare('SELECT name FROM pipeline_stages WHERE id = ?').get(stId);

  database.prepare(`
    INSERT INTO activities (contact_id, kind, direction, subject, body, meta_json, occurred_at, created_at)
    VALUES (?, 'stage_change', NULL, ?, ?, ?, ?, ?)
  `).run(
    contact_id,
    `Started ${pName} deal: ${dealTitle}`,
    `Deal entered stage "${stageRow ? stageRow.name : 'New'}".`,
    JSON.stringify({ deal_id: dealId, pipeline_id: pipeId, stage_id: stId }),
    now,
    now
  );

  return adminGetDeal(dealId);
}

function adminGetDeal(dealId) {
  const database = getDb();
  return database.prepare(`
    SELECT d.*, p.name as pipeline_name, s.name as stage_name, s.is_won, s.is_lost
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE d.id = ?
  `).get(dealId);
}

function adminUpdateDeal(dealId, updates = {}) {
  const database = getDb();
  const deal = database.prepare(`
    SELECT d.*, s.name as current_stage_name
    FROM deals d
    JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE d.id = ?
  `).get(dealId);
  if (!deal) return null;

  const now = new Date().toISOString();
  const sets = [];
  const params = [];

  let stageChanged = false;
  let newStageRow = null;

  if (updates.stage_id !== undefined && Number(updates.stage_id) !== deal.stage_id) {
    const stId = Number(updates.stage_id);
    newStageRow = database.prepare('SELECT * FROM pipeline_stages WHERE id = ? AND pipeline_id = ?').get(stId, deal.pipeline_id);
    if (newStageRow) {
      sets.push('stage_id = ?', 'stage_changed_at = ?');
      params.push(stId, now);
      stageChanged = true;

      if (newStageRow.is_won) {
        sets.push('closed_at = ?');
        params.push(now);
        database.prepare("UPDATE contacts SET type = 'past_client', updated_at = ? WHERE id = ?").run(now, deal.contact_id);
      } else {
        sets.push('closed_at = NULL');
      }
    }
  }

  if (updates.title !== undefined) {
    sets.push('title = ?');
    params.push(String(updates.title).slice(0, 160));
  }
  if (updates.value_usd !== undefined) {
    sets.push('value_usd = ?');
    params.push(updates.value_usd ? Number(updates.value_usd) : null);
  }
  if (updates.property_address !== undefined) {
    sets.push('property_address = ?');
    params.push(updates.property_address ? String(updates.property_address).slice(0, 200) : null);
  }
  if (updates.expected_close !== undefined) {
    sets.push('expected_close = ?');
    params.push(updates.expected_close ? String(updates.expected_close).slice(0, 40) : null);
  }

  if (sets.length) {
    sets.push('updated_at = ?');
    params.push(now);
    database.prepare(`UPDATE deals SET ${sets.join(', ')} WHERE id = ?`).run(...params, dealId);
  }

  if (stageChanged && newStageRow) {
    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, body, meta_json, occurred_at, created_at)
      VALUES (?, 'stage_change', NULL, ?, ?, ?, ?, ?)
    `).run(
      deal.contact_id,
      `Deal moved to ${newStageRow.name}`,
      `Deal "${updates.title || deal.title}" changed from "${deal.current_stage_name}" to "${newStageRow.name}".`,
      JSON.stringify({
        deal_id: dealId,
        old_stage_id: deal.stage_id,
        new_stage_id: newStageRow.id,
        old_stage_name: deal.current_stage_name,
        new_stage_name: newStageRow.name
      }),
      now,
      now
    );
  }

  return adminGetDeal(dealId);
}

// ---------- Push Subscriptions & Settings ----------

function getPushSubscriptions() {
  return getDb().prepare('SELECT * FROM push_subscriptions ORDER BY id ASC').all();
}

function addPushSubscription(endpoint, keys) {
  const database = getDb();
  const keysJson = typeof keys === 'string' ? keys : JSON.stringify(keys || {});
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO push_subscriptions (endpoint, keys_json, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json
  `).run(endpoint, keysJson, now);
  return true;
}

function removePushSubscription(endpoint) {
  const database = getDb();
  const res = database.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
  return res.changes > 0;
}

function getSetting(key, defaultValue = '') {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
  return true;
}

function getSettings() {
  return {
    sender_name: getSetting('crm_sender_name', 'Steven Lenz Jr.'),
    sender_signature: getSetting('crm_sender_signature', 'Steven Lenz Jr. | Compass Real Estate\nCA DRE# 01989811\nMobile: (925) 555-0100 | steven.lenzjr@compass.com'),
    working_hours: getSetting('crm_working_hours', '08:00 - 19:00'),
    notifications_enabled: getSetting('crm_notifications_enabled', '1') !== '0'
  };
}

function updateSettings(updates) {
  updates = updates || {};
  if (updates.sender_name !== undefined) setSetting('crm_sender_name', String(updates.sender_name).slice(0, 100));
  if (updates.sender_signature !== undefined) setSetting('crm_sender_signature', String(updates.sender_signature).slice(0, 1000));
  if (updates.working_hours !== undefined) setSetting('crm_working_hours', String(updates.working_hours).slice(0, 50));
  if (updates.notifications_enabled !== undefined) setSetting('crm_notifications_enabled', updates.notifications_enabled ? '1' : '0');
  return getSettings();
}

function getUsageStats() {
  const database = getDb();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const aiCap = Number(process.env.AI_MONTHLY_BUDGET_USD) || 25.00;
  const emailCap = Number(process.env.EMAIL_MONTHLY_BUDGET_USD) || 20.00;

  // AI spend from ai_runs
  let aiSpent = 0.00;
  try {
    const aiRow = database.prepare(
      'SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_runs WHERE created_at >= ?'
    ).get(startOfMonth);
    if (aiRow && aiRow.total) aiSpent = Number(aiRow.total);
  } catch (_) {}

  // Email spend: $0.001 per email recorded in messages or outbox
  let emailCount = 0;
  try {
    const emailRow = database.prepare(
      "SELECT COUNT(*) AS cnt FROM messages WHERE occurred_at >= ? AND channel = 'email'"
    ).get(startOfMonth);
    if (emailRow && emailRow.cnt) emailCount = Number(emailRow.cnt);
  } catch (_) {}

  const emailSpent = Number((emailCount * 0.001).toFixed(4));

  // Learning signals (PRD line 440): unedited, edited, skipped, redrafted
  let signalUnedited = 0;
  let signalEdited = 0;
  let signalSkipped = 0;
  let signalRedrafted = 0;
  try {
    const ym = now.toISOString().slice(0, 7);
    const unRow = database.prepare("SELECT COUNT(*) as cnt FROM action_items WHERE status = 'sent' AND edited = 0 AND strftime('%Y-%m', created_at) = ?").get(ym);
    if (unRow) signalUnedited = Number(unRow.cnt);

    const edRow = database.prepare("SELECT COUNT(*) as cnt FROM action_items WHERE status = 'sent' AND edited = 1 AND strftime('%Y-%m', created_at) = ?").get(ym);
    if (edRow) signalEdited = Number(edRow.cnt);

    const skRow = database.prepare("SELECT COUNT(*) as cnt FROM action_items WHERE status = 'skipped' AND strftime('%Y-%m', created_at) = ?").get(ym);
    if (skRow) signalSkipped = Number(skRow.cnt);

    const rdRow = database.prepare("SELECT COUNT(*) as cnt FROM ai_runs WHERE purpose = 'redraft' AND strftime('%Y-%m', created_at) = ?").get(ym);
    if (rdRow) signalRedrafted = Number(rdRow.cnt);
  } catch (_) {}

  return {
    month: now.toISOString().slice(0, 7),
    ai_spend_usd: Number(aiSpent.toFixed(2)),
    ai_budget_cap_usd: aiCap,
    ai_pct: Math.min(100, Math.round((aiSpent / aiCap) * 100)),
    email_spend_usd: Number(emailSpent.toFixed(2)),
    email_budget_cap_usd: emailCap,
    email_pct: Math.min(100, Math.round((emailSpent / emailCap) * 100)),
    email_count_mtd: emailCount,
    signals: {
      unedited: signalUnedited,
      edited: signalEdited,
      skipped: signalSkipped,
      redrafted: signalRedrafted
    }
  };
}

function getLastBackupInfo() {
  try {
    const row = getDb().prepare(
      "SELECT * FROM audit_log WHERE action LIKE 'backup%' ORDER BY id DESC LIMIT 1"
    ).get();
    if (row) {
      return {
        timestamp: row.at,
        details: row.detail
      };
    }
  } catch (_) {}
  return null;
}

// ---------- Chat Sessions & Messages (AI Assistant) ----------
function upsertChatSession(data) {
  const database = getDb();
  const sessionId = data.session_id || data.sessionId;
  if (!sessionId) return null;

  const now = new Date().toISOString();
  const existing = database.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get(sessionId);

  if (existing) {
    database.prepare(`
      UPDATE chat_sessions
      SET ip = COALESCE(?, ip),
          city = COALESCE(?, city),
          region = COALESCE(?, region),
          country = COALESCE(?, country),
          postal = COALESCE(?, postal),
          device = COALESCE(?, device),
          user_agent = COALESCE(?, user_agent),
          page_url = COALESCE(?, page_url),
          utm_source = COALESCE(?, utm_source),
          utm_medium = COALESCE(?, utm_medium),
          utm_campaign = COALESCE(?, utm_campaign),
          referrer = COALESCE(?, referrer),
          contact_id = COALESCE(?, contact_id),
          lead_id = COALESCE(?, lead_id),
          intent = COALESCE(?, intent),
          lead_score = COALESCE(?, lead_score),
          message_count = message_count + 1,
          last_message = COALESCE(?, last_message),
          updated_at = ?
      WHERE session_id = ?
    `).run(
      data.ip || null,
      data.city || null,
      data.region || null,
      data.country || null,
      data.postal || null,
      data.device || null,
      data.user_agent || null,
      data.page_url || null,
      data.utm_source || null,
      data.utm_medium || null,
      data.utm_campaign || null,
      data.referrer || null,
      data.contact_id || null,
      data.lead_id || null,
      data.intent || null,
      data.lead_score || null,
      data.last_message || null,
      now,
      sessionId
    );
  } else {
    database.prepare(`
      INSERT INTO chat_sessions (
        session_id, ip, city, region, country, postal, device, user_agent,
        page_url, utm_source, utm_medium, utm_campaign, referrer,
        contact_id, lead_id, intent, lead_score, message_count, last_message,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      sessionId,
      data.ip || null,
      data.city || null,
      data.region || null,
      data.country || null,
      data.postal || null,
      data.device || null,
      data.user_agent || null,
      data.page_url || null,
      data.utm_source || null,
      data.utm_medium || null,
      data.utm_campaign || null,
      data.referrer || null,
      data.contact_id || null,
      data.lead_id || null,
      data.intent || null,
      data.lead_score || 0,
      data.last_message || null,
      now,
      now
    );
  }
  return database.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get(sessionId);
}

function insertChatMessage({ sessionId, role, content, intent = null, properties = null }) {
  const database = getDb();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO chat_messages (session_id, role, content, intent, properties_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    role,
    String(content || ''),
    intent || null,
    properties ? JSON.stringify(properties) : null,
    now
  );
}

function getChatMessages(sessionId) {
  const database = getDb();
  return database.prepare(`
    SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC
  `).all(sessionId).map((m) => ({
    ...m,
    properties: m.properties_json ? JSON.parse(m.properties_json) : null
  }));
}

function getChatSessions({ limit = 50, offset = 0, search = '' } = {}) {
  const database = getDb();
  const clauses = [];
  const params = [];

  if (search) {
    const like = `%${search.toLowerCase()}%`;
    clauses.push('(LOWER(s.session_id) LIKE ? OR LOWER(s.city) LIKE ? OR LOWER(s.last_message) LIKE ? OR LOWER(c.display_name) LIKE ?)');
    params.push(like, like, like, like);
  }

  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sql = `
    SELECT s.*,
      c.display_name as contact_name,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as contact_email,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'phone' ORDER BY is_primary DESC, id ASC LIMIT 1) as contact_phone
    FROM chat_sessions s
    LEFT JOIN contacts c ON s.contact_id = c.id
    ${where}
    ORDER BY s.updated_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);
  const rows = database.prepare(sql).all(...params);

  const countSql = `
    SELECT COUNT(*) as total
    FROM chat_sessions s
    LEFT JOIN contacts c ON s.contact_id = c.id
    ${where}
  `;
  const countParams = params.slice(0, -2);
  const total = database.prepare(countSql).get(...countParams).total;

  return { sessions: rows, total, limit, offset };
}

function getChatSession(sessionId) {
  const database = getDb();
  const session = database.prepare(`
    SELECT s.*,
      c.display_name as contact_name,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as contact_email,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'phone' ORDER BY is_primary DESC, id ASC LIMIT 1) as contact_phone
    FROM chat_sessions s
    LEFT JOIN contacts c ON s.contact_id = c.id
    WHERE s.session_id = ?
  `).get(sessionId);

  if (!session) return null;
  const messages = getChatMessages(sessionId);
  return { ...session, messages };
}

function linkChatSessionContact(sessionId, contactId) {
  const database = getDb();
  database.prepare(`
    UPDATE chat_sessions SET contact_id = ? WHERE session_id = ?
  `).run(contactId, sessionId);
}

module.exports = {
  getDb,
  getPublishedTestimonials,
  createSession, getSession, deleteSession, audit, getAudit,
  LEAD_STATUSES, adminListLeads, adminGetLead, adminUpdateLead, adminDeleteLead, retryOutbox,
  CONTACT_STAGES, CONTACT_TYPES, SCORE_BANDS, adminListContacts, adminGetContact, adminUpdateContact,
  adminMergeContacts, adminExportContact, adminDeleteContact,
  rescoreContact, rescoreAllContacts,
  adminCreateTask, adminUpdateTask, adminDeleteTask, updateContactNextFollowUp,
  adminListTasks, adminCreateContact, adminSeedSampleData,
  adminListPipelines, adminCreateDeal, adminGetDeal, adminUpdateDeal,
  getPushSubscriptions, addPushSubscription, removePushSubscription,
  getSetting, setSetting, getSettings, updateSettings,
  getUsageStats, getLastBackupInfo,
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
  upsertNewsletter,
  runCrmMigrations,
  upsertChatSession,
  insertChatMessage,
  getChatMessages,
  getChatSessions,
  getChatSession,
  linkChatSessionContact
};

