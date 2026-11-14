/**
 * server/db.js
 * Database Connection & Schema Management for AI Assistant
 * Bridges directly to site/db/database.js as the single source of truth for listings.
 * Stores conversations and feedback locally in SQLite.
 */
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const siteDb = require('../site/db/database');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'steve.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables for conversations, feedback, and leads
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      reply_method TEXT DEFAULT 'email',
      property_address TEXT,
      message TEXT,
      session_id TEXT,
      ip TEXT,
      user_agent TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      intent TEXT,
      properties_returned TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      message_id TEXT,
      rating TEXT NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
  `);

  // Drop deprecated mockup properties table if it exists
  db.exec('DROP TABLE IF EXISTS properties;');
}

initDb();

function formatProperty(l) {
  if (!l) return null;
  const priceNum = l.price_num || Number(String(l.price || '').replace(/[^0-9]/g, '')) || 0;
  return {
    id: l.id,
    title: l.address,
    address: l.full_address || `${l.address}, ${l.city}, ${l.state || 'CA'} ${l.zip || ''}`.trim(),
    city: l.city,
    state: l.state || 'CA',
    zip: l.zip,
    price: priceNum,
    beds: Number(l.beds) || 0,
    baths: Number(l.baths) || 0,
    sqft: Number(String(l.sqft || '0').replace(/[^0-9]/g, '')) || 0,
    status: l.active ? 'Active' : 'Closed',
    image_url: l.photo || 'assets/img/danville-genoa.jpg',
    description: l.description || l.summary || '',
    agent: 'Steven Lenz Jr. · Compass',
    featured: l.active ? 1 : 0
  };
}

module.exports = {
  db,

  getProperties: (filter = {}) => {
    let all = siteDb.getAllListings();
    if (filter.status === 'active') {
      all = all.filter((l) => l.active);
    } else if (filter.status === 'closed' || filter.status === 'sold') {
      all = all.filter((l) => !l.active);
    }
    if (filter.city) {
      const c = filter.city.toLowerCase();
      all = all.filter((l) => (l.city || '').toLowerCase().includes(c));
    }
    if (filter.maxPrice) {
      all = all.filter((l) => (l.price_num || 0) <= Number(filter.maxPrice));
    }
    if (filter.minBeds) {
      all = all.filter((l) => (Number(l.beds) || 0) >= Number(filter.minBeds));
    }
    if (filter.featured !== undefined) {
      all = all.filter((l) => (l.active ? 1 : 0) === (filter.featured ? 1 : 0));
    }
    return all.map(formatProperty);
  },

  getPropertyById: (id) => {
    const l = siteDb.getListingById(id);
    return formatProperty(l);
  },

  getPropertyByAddress: (address) => {
    const term = (address || '').toLowerCase();
    const all = siteDb.getAllListings();
    const found = all.find((l) =>
      (l.address || '').toLowerCase().includes(term) ||
      (l.full_address || '').toLowerCase().includes(term)
    );
    return formatProperty(found);
  },

  insertLead: (lead) => {
    const stmt = db.prepare(`
      INSERT INTO leads (name, email, phone, reply_method, property_address, message, session_id, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      lead.name,
      lead.email,
      lead.phone || null,
      lead.reply_method || 'email',
      lead.property_address || null,
      lead.message || null,
      lead.session_id || null,
      lead.ip || null,
      lead.user_agent || null
    );
    return { id: info.lastInsertRowid, ...lead };
  },

  getLeads: () => {
    return db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  },

  recordConversation: (session_id, role, content, intent = null, properties_returned = null) => {
    const stmt = db.prepare(`
      INSERT INTO conversations (session_id, role, content, intent, properties_returned)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(session_id, role, content, intent, properties_returned ? JSON.stringify(properties_returned) : null);
  },

  recordFeedback: (session_id, message_id, rating, comment = null) => {
    const stmt = db.prepare(`
      INSERT INTO feedback (session_id, message_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(session_id, message_id, rating, comment);
    return { id: info.lastInsertRowid };
  }
};
