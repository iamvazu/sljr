'use strict';

const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); } catch (_) {}
const { runBackup } = require('../lib/backup');

try {
  const result = runBackup();
  console.log(`[backup] SUCCESS: ${result.filename} (${(result.size / 1024).toFixed(1)} KB), pruned ${result.pruned} old files.`);
} catch (err) {
  console.error('[backup] ERROR:', err);
  process.exit(1);
}
