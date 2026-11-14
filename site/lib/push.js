'use strict';

const webpush = require('web-push');

let initialized = false;
let currentVapidKeys = null;

/**
 * Ensure VAPID keys are configured.
 * Checks process.env first, then SQLite meta table, then generates and persists a new pair.
 */
function initVapid(dbInstance) {
  if (initialized && currentVapidKeys) return currentVapidKeys;

  const db = dbInstance || require('../db/database').getDb();
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:steven.lenzjr@compass.com';

  if (!publicKey || !privateKey) {
    try {
      const pubRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('vapid_public_key');
      const privRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('vapid_private_key');
      if (pubRow && privRow && pubRow.value && privRow.value) {
        publicKey = pubRow.value;
        privateKey = privRow.value;
      }
    } catch (_) {}
  }

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    try {
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('vapid_public_key', publicKey);
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('vapid_private_key', privateKey);
    } catch (_) {}
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  currentVapidKeys = { publicKey, privateKey, subject };
  initialized = true;
  return currentVapidKeys;
}

function getVapidPublicKey(dbInstance) {
  const keys = initVapid(dbInstance);
  return keys.publicKey;
}

/**
 * Format a push notification payload from a lead object per PRD:
 * Title: "New lead: {firstName}, {formType}"
 * Body: "{interest} · {budget} · {timeline}"
 */
function formatLeadNotification(lead) {
  lead = lead || {};
  const rawName = String(lead.name || 'Prospect').trim();
  const firstName = rawName.split(/\s+/)[0] || 'Prospect';
  const formType = String(lead.form_type || 'Inquiry');
  
  const title = `New lead: ${firstName}, ${formType}`;
  const details = [lead.interest, lead.budget, lead.timeline].filter(Boolean).join(' · ');
  const body = details || 'New contact inquiry received.';

  return {
    title,
    body,
    icon: '/assets/brand/favicon.png',
    badge: '/assets/brand/favicon.png',
    tag: `lead-${lead.lead_id || Date.now()}`,
    data: {
      url: '/admin/#contacts',
      lead_id: lead.lead_id || null
    }
  };
}

/**
 * Broadcast a push notification payload to all registered subscriptions in push_subscriptions table.
 * Removes expired or invalid (404/410) subscriptions.
 */
async function sendPushToAll(payload, dbInstance) {
  initVapid(dbInstance);
  const dbModule = require('../db/database');
  const subs = dbModule.getPushSubscriptions();

  if (!subs || !subs.length) {
    return { ok: true, sent: 0, failed: 0, total: 0 };
  }

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    let keys = {};
    try {
      keys = JSON.parse(sub.keys_json || '{}');
    } catch (_) {}

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys
    };

    try {
      await webpush.sendNotification(pushSubscription, payloadStr);
      sent++;
    } catch (err) {
      failed++;
      // If endpoint is no longer valid, delete it permanently
      if (err.statusCode === 404 || err.statusCode === 410) {
        try {
          dbModule.removePushSubscription(sub.endpoint);
        } catch (_) {}
      } else {
        console.warn(`[web-push] Send failed to ${sub.endpoint}:`, err.message);
      }
    }
  }

  return { ok: true, sent, failed, total: subs.length };
}

/**
 * Send a web push notification when a new lead is created.
 */
async function sendLeadNotification(lead, dbInstance) {
  const dbModule = require('../db/database');
  const notifEnabled = dbModule.getSetting('crm_notifications_enabled', '1');
  if (notifEnabled === '0' || notifEnabled === 0 || notifEnabled === false) {
    return { ok: true, skipped: true, reason: 'notifications_disabled' };
  }

  const payload = formatLeadNotification(lead);
  return sendPushToAll(payload, dbInstance);
}

/**
 * Send a test push notification.
 */
async function sendTestNotification(dbInstance) {
  const payload = {
    title: 'Steven Lenz Jr. CRM',
    body: 'Test push notification: System operational.',
    icon: '/assets/brand/favicon.png',
    badge: '/assets/brand/favicon.png',
    tag: `test-${Date.now()}`,
    data: {
      url: '/admin/#settings'
    }
  };
  return sendPushToAll(payload, dbInstance);
}

module.exports = {
  initVapid,
  getVapidPublicKey,
  formatLeadNotification,
  sendPushToAll,
  sendLeadNotification,
  sendTestNotification
};
