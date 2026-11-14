'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');
const RETENTION_DAYS = 14;

/**
 * Perform a clean, atomic online backup of the SQLite database using VACUUM INTO.
 * Verifies file integrity and rotates files older than 14 days.
 *
 * @param {object} [dbInstance] - Optional DatabaseSync instance (defaults to site/db/database)
 * @returns {{ ok: boolean, filename: string, path: string, size: number, pruned: number }}
 */
function runBackup(dbInstance) {
  const db = dbInstance || require('../db/database').getDb();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-');
  const filename = `steven_lenz_${dateStr}.db`;
  const targetPath = path.join(BACKUP_DIR, filename);

  // Normalize path with forward slashes for SQLite command string
  const sqliteSafePath = targetPath.replace(/\\/g, '/');

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  // Execute atomic online backup
  db.exec(`VACUUM INTO '${sqliteSafePath}'`);

  // Verify backup integrity
  let verified = false;
  let size = 0;
  try {
    const backupDb = new DatabaseSync(targetPath);
    const integrity = backupDb.prepare('PRAGMA integrity_check').all();
    verified = Boolean(integrity && integrity[0] && integrity[0].integrity_check === 'ok');
    backupDb.close();
    size = fs.statSync(targetPath).size;
  } catch (err) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    throw new Error(`Backup integrity check failed: ${err.message}`);
  }

  if (!verified) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
    throw new Error('Backup failed integrity verification.');
  }

  // Prune backups older than 14 days
  let pruned = 0;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (file.endsWith('.db') && file !== filename) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          pruned++;
        }
      }
    }
  } catch (_) {}

  // Record to audit_log if database helper is available
  try {
    const dbModule = require('../db/database');
    if (typeof dbModule.audit === 'function') {
      dbModule.audit('backup', `Created ${filename} (${(size / 1024).toFixed(1)} KB, pruned ${pruned})`);
    }
  } catch (_) {}

  return {
    ok: true,
    filename,
    path: targetPath,
    size,
    pruned
  };
}

let backupTimer = null;

/**
 * Schedule nightly backup at 03:00 local time
 */
function scheduleNightlyBackup() {
  if (backupTimer) return;
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(3, 0, 0, 0);
  const msUntilNext = next.getTime() - now.getTime();

  backupTimer = setTimeout(() => {
    try {
      runBackup();
    } catch (e) {
      console.error('Nightly backup failed:', e);
    }
    backupTimer = null;
    scheduleNightlyBackup();
  }, msUntilNext);

  if (typeof backupTimer.unref === 'function') {
    backupTimer.unref();
  }
}

module.exports = {
  runBackup,
  createBackup: runBackup,
  scheduleNightlyBackup,
  BACKUP_DIR,
  RETENTION_DAYS
};
