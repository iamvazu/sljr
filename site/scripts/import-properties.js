'use strict';

const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); } catch (_) {}

const db = require('../db/database');
const database = db.getDb();

// 1. Read properties from site/content/listings.json or scratch_scraped_properties.json
const listingsJsonPath = path.join(__dirname, '..', 'content', 'listings.json');
const scrapedPath = path.join(__dirname, '..', '..', 'scratch_scraped_properties.json');

let properties = [];
if (fs.existsSync(scrapedPath)) {
  properties = JSON.parse(fs.readFileSync(scrapedPath, 'utf8'));
  console.log(`Loaded ${properties.length} scraped properties from scratch file.`);
  fs.writeFileSync(listingsJsonPath, JSON.stringify(properties, null, 2), 'utf8');
  console.log(`Saved updated properties to ${listingsJsonPath}.`);
} else if (fs.existsSync(listingsJsonPath)) {
  properties = JSON.parse(fs.readFileSync(listingsJsonPath, 'utf8'));
  console.log(`Loaded ${properties.length} properties from ${listingsJsonPath}.`);
} else {
  console.error('No listings file found.');
  process.exit(1);
}

// 3. Make sure photos_json column exists in database
const cols = database.prepare('PRAGMA table_info(listings)').all().map(c => c.name);
if (!cols.includes('photos_json')) {
  database.exec('ALTER TABLE listings ADD COLUMN photos_json TEXT');
  console.log('Added photos_json column to listings table.');
}

// 4. Upsert all properties into SQLite database
const insStmt = database.prepare(`
  INSERT OR REPLACE INTO listings (
    id, status, price, price_num, address, full_address, city, state, zip, county,
    beds, baths, sqft, year_built, lot_size, property_type, mls_id, photo,
    summary, description, highlights_json, role, external_url, active, sort_order, published, photos_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

database.exec('BEGIN IMMEDIATE');
try {
  properties.forEach((p, idx) => {
    const photosList = Array.isArray(p.photos) && p.photos.length ? p.photos : [p.photo].filter(Boolean);
    insStmt.run(
      p.id,
      p.status,
      p.price,
      p.price_num || 0,
      p.address,
      p.full_address,
      p.city,
      p.state || 'CA',
      p.zip || '',
      p.county || '',
      Number(p.beds) || 0,
      Number(p.baths) || 0,
      String(p.sqft || ''),
      String(p.year_built || ''),
      String(p.lot_size || ''),
      p.property_type || 'Single Family',
      p.mls_id || `${p.id}_lid`,
      p.photo,
      p.summary || '',
      p.description || '',
      JSON.stringify(p.highlights || []),
      p.role || 'Represented Client · Compass',
      p.external_url || '',
      p.active ? 1 : 0,
      idx,
      1, // published
      JSON.stringify(photosList)
    );
  });
  database.exec('COMMIT');
  console.log(`Successfully upserted all ${properties.length} properties into SQLite!`);
} catch (err) {
  try { database.exec('ROLLBACK'); } catch (_) {}
  console.error('Database transaction failed:', err);
  process.exit(1);
}

// 5. Verification
const count = database.prepare('SELECT count(*) as cnt FROM listings WHERE published = 1').get();
const active = database.prepare('SELECT count(*) as cnt FROM listings WHERE active = 1 AND published = 1').get();
const totalPhotos = database.prepare("SELECT photos_json FROM listings WHERE published = 1").all()
  .reduce((acc, row) => acc + (JSON.parse(row.photos_json || '[]').length), 0);

console.log(`\n--- Verification ---`);
console.log(`Total Published in DB: ${count.cnt}`);
console.log(`Active (For Sale) in DB: ${active.cnt}`);
console.log(`Total Photos Stored in DB: ${totalPhotos}`);
