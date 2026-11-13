/**
 * server/db.js
 * SQLite Database Connection & Schema Management for AI Steve
 * Uses native node:sqlite DatabaseSync (Node.js 22+)
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'steve.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zip TEXT,
      price INTEGER NOT NULL,
      beds INTEGER NOT NULL,
      baths REAL NOT NULL,
      sqft INTEGER NOT NULL,
      status TEXT DEFAULT 'Active',
      image_url TEXT NOT NULL,
      description TEXT,
      agent TEXT DEFAULT 'Steven Lenz Jr.',
      featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);
    CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
  `);

  // Seed properties if table is empty
  const countRow = db.prepare('SELECT COUNT(*) as count FROM properties').get();
  if (countRow.count === 0) {
    const insertProp = db.prepare(`
      INSERT INTO properties (id, title, address, city, state, zip, price, beds, baths, sqft, status, image_url, description, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const seedData = [
      [
        'prop-segale',
        'Mountain Serenity Retreat',
        '91 Segale Dr',
        'Camp Connell',
        'CA',
        '95223',
        450000,
        2,
        1,
        1563,
        'Active',
        'assets/img/listings/danville-genoa-1.jpg',
        'Secluded mountain retreat nestled among towering pines. Expansive wrap-around cedar deck, vaulted post-and-beam ceilings, and wood-burning stove.',
        1
      ],
      [
        'prop-york',
        'Contemporary Hillside Haven',
        '1232 York St',
        'Richmond',
        'CA',
        '94801',
        825000,
        3,
        3,
        1400,
        'Active',
        'assets/img/listings/1240-york-st-1.jpg',
        'Modern tri-level residence featuring sleek architectural lines, sun-drenched open living, designer kitchen with quartz waterfall island, and attached garage.',
        1
      ],
      [
        'prop-ruby-hill',
        'Fairway Tuscan Villa',
        '1100 Ruby Hill Blvd',
        'Pleasanton',
        'CA',
        '94566',
        3450000,
        5,
        5.5,
        5200,
        'Active',
        'assets/img/pocket-pleasanton-ruby-hill.jpg',
        'Prestigious gated Ruby Hill estate bordering the Jack Nicklaus signature fairway. Resort-style infinity pool, wine cellar, and outdoor loggia.',
        1
      ],
      [
        'prop-danville-blackhawk',
        'Country Club Executive Estate',
        '3217 Diablo Rd',
        'Danville',
        'CA',
        '94526',
        2895000,
        4,
        4.5,
        4120,
        'Active',
        'assets/img/pocket-danville-blackhawk.jpg',
        'Stately Danville manor with private gated motor court, soaring ceilings, chef kitchen, and panoramic Mount Diablo foothill views.',
        1
      ],
      [
        'prop-alamo-oaks',
        'Oak-Studded Custom Residence',
        '420 Alamo Oaks Rd',
        'Alamo',
        'CA',
        '94507',
        4195000,
        5,
        6,
        6100,
        'Active',
        'assets/img/neighborhood-alamo.jpg',
        'Unincorporated Alamo estate sprawling over 1.2 flat acres. Heritage oak canopy, detached guest casita, and equestrian zoning.',
        1
      ],
      [
        'prop-vintage-hills',
        'Vintage Hills Classic',
        '2840 Paseo Granada',
        'Pleasanton',
        'CA',
        '94566',
        1850000,
        4,
        2.5,
        2450,
        'Active',
        'assets/img/pocket-pleasanton-vintage-hills.jpg',
        'Single-story California ranch on a tranquil cul-de-sac. Direct walking path access to Vintage Hills Elementary and private lush yard.',
        0
      ],
      [
        'prop-camino-ramon',
        'Gale Ranch Modern Craft',
        '2244 Camino Ramon',
        'San Ramon',
        'CA',
        '94583',
        1495000,
        4,
        3,
        2650,
        'Active',
        'assets/img/listings/for-sale-1240-york.jpg',
        'Light-filled executive home in San Ramon. Upgraded hardwood flooring, open-concept kitchen, and close proximity to City Center Bishop Ranch.',
        0
      ]
    ];

    for (const prop of seedData) {
      insertProp.run(...prop);
    }
    console.log(`[DB] Pre-seeded ${seedData.length} properties.`);
  }
}

initDb();

module.exports = {
  db,
  getProperties: (filter = {}) => {
    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];

    if (filter.city) {
      sql += ' AND LOWER(city) LIKE ?';
      params.push(`%${filter.city.toLowerCase()}%`);
    }
    if (filter.maxPrice) {
      sql += ' AND price <= ?';
      params.push(Number(filter.maxPrice));
    }
    if (filter.minBeds) {
      sql += ' AND beds >= ?';
      params.push(Number(filter.minBeds));
    }
    if (filter.featured !== undefined) {
      sql += ' AND featured = ?';
      params.push(filter.featured ? 1 : 0);
    }

    sql += ' ORDER BY featured DESC, price ASC';
    return db.prepare(sql).all(...params);
  },

  getPropertyById: (id) => {
    return db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
  },

  getPropertyByAddress: (address) => {
    return db.prepare('SELECT * FROM properties WHERE LOWER(address) LIKE ?').get(`%${address.toLowerCase()}%`);
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
