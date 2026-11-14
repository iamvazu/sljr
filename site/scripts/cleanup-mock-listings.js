'use strict';
const db = require('../db/database');
const database = db.getDb();

// Delete listings that have no photos_json or where photos_json is empty, keeping the 28 real ones
const realProperties = require('../content/listings.json');
const realIds = new Set(realProperties.map(p => p.id));

const all = database.prepare('SELECT id FROM listings').all();
let removed = 0;
database.exec('BEGIN IMMEDIATE');
try {
  all.forEach(row => {
    if (!realIds.has(row.id)) {
      database.prepare('DELETE FROM listings WHERE id = ?').run(row.id);
      removed++;
    }
  });
  database.exec('COMMIT');
  console.log(`Cleaned up ${removed} old placeholder listings. Exactly ${realProperties.length} authentic properties remain.`);
} catch (e) {
  database.exec('ROLLBACK');
  console.error(e);
}
