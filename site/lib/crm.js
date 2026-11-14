'use strict';

/**
 * Steven Lenz Jr. CRM Engine (M1 Core)
 * Handles Contact identity resolution, deduplication, activity recording,
 * consent tracking, pipeline management, and backfill migration.
 */

const { getDb } = require('../db/database');
const { stripHtml, isValidEmail, normalizePhone } = require('../middleware/security');

/**
 * Splits a full name into first, last, and display names.
 * @param {string} fullName
 * @returns {{ firstName: string, lastName: string, displayName: string }}
 */
function splitName(fullName = '') {
  const clean = stripHtml(fullName).trim();
  if (!clean) return { firstName: '', lastName: '', displayName: 'Anonymous' };
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '', displayName: parts[0] };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName, displayName: clean };
}

/**
 * Process a lead into a Contact record.
 * Handles deduplication, identity resolution, activities, and consents.
 *
 * @param {object} lead
 * @param {object} [dbInstance]
 * @returns {{ contact_id: number, action: 'created'|'matched'|'duplicate_flagged' }}
 */
function leadToContact(lead, dbInstance) {
  const db = dbInstance || getDb();
  if (!lead) throw new Error('Lead object is required');

  const receivedAt = lead.received_at || new Date().toISOString();
  const rawEmail = stripHtml(lead.email || '').toLowerCase().trim();
  const rawPhone = normalizePhone(lead.phone || '');
  const { firstName, lastName, displayName } = splitName(lead.name);

  const isTestLead = rawEmail.endsWith('@example.com') || rawEmail.endsWith('@test.com') || rawEmail.includes('spammer');
  const initialStage = isTestLead ? 'spam' : (lead.status || 'new');
  const isDiscreet = lead.segment === 'sports_entertainment' || lead.discreet ? 1 : 0;

  // 1. Identity lookup
  let emailContactId = null;
  let phoneContactId = null;

  if (rawEmail) {
    const row = db.prepare("SELECT contact_id FROM contact_identities WHERE kind = 'email' AND value = ?").get(rawEmail);
    if (row) emailContactId = row.contact_id;
  }
  if (rawPhone) {
    const row = db.prepare("SELECT contact_id FROM contact_identities WHERE kind = 'phone' AND value = ?").get(rawPhone);
    if (row) phoneContactId = row.contact_id;
  }

  let contactId = null;
  let action = 'created';
  let duplicateConflict = false;

  if (emailContactId && phoneContactId && emailContactId !== phoneContactId) {
    // Conflict: email and phone belong to two different contacts.
    // Attach to email match, flag task for Steven to review. Never auto-merge.
    contactId = emailContactId;
    action = 'duplicate_flagged';
    duplicateConflict = true;
  } else if (emailContactId) {
    contactId = emailContactId;
    action = 'matched';
  } else if (phoneContactId) {
    contactId = phoneContactId;
    action = 'matched';
  }

  const utmJson = typeof lead.utm === 'string' ? lead.utm : JSON.stringify(lead.utm || {});
  const areasJson = Array.isArray(lead.areas) ? JSON.stringify(lead.areas) : (typeof lead.areas === 'string' ? lead.areas : '[]');

  if (!contactId) {
    // CREATE NEW CONTACT
    const insContact = db.prepare(`
      INSERT INTO contacts (
        first_name, last_name, display_name, type, stage, discreet,
        source, first_utm_json, interest, budget, timeline, areas_json,
        notes, score, score_band, last_inbound_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = insContact.run(
      firstName,
      lastName,
      displayName,
      'lead',
      initialStage,
      isDiscreet,
      lead.form_type || 'form',
      utmJson,
      stripHtml(lead.interest || '').slice(0, 60),
      stripHtml(lead.budget || '').slice(0, 40),
      stripHtml(lead.timeline || '').slice(0, 60),
      areasJson,
      stripHtml(lead.message || '').slice(0, 2000),
      0,
      'cold',
      receivedAt,
      receivedAt,
      receivedAt
    );
    contactId = Number(res.lastInsertRowid);
    action = 'created';
  } else {
    // UPDATE MATCHED CONTACT (fill only empty fields, update last_inbound_at)
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    if (existing) {
      const updatedNotes = existing.notes ? (lead.message ? `${existing.notes}\n\n[${receivedAt}] ${lead.message}` : existing.notes) : (lead.message || '');
      db.prepare(`
        UPDATE contacts SET
          last_inbound_at = ?,
          updated_at = ?,
          interest = COALESCE(NULLIF(interest, ''), ?),
          budget = COALESCE(NULLIF(budget, ''), ?),
          timeline = COALESCE(NULLIF(timeline, ''), ?),
          notes = ?
        WHERE id = ?
      `).run(
        receivedAt,
        receivedAt,
        stripHtml(lead.interest || '').slice(0, 60),
        stripHtml(lead.budget || '').slice(0, 40),
        stripHtml(lead.timeline || '').slice(0, 60),
        updatedNotes.slice(0, 4000),
        contactId
      );
    }
  }

  // 2. Identities
  if (rawEmail) {
    db.prepare(`
      INSERT OR IGNORE INTO contact_identities (contact_id, kind, value, is_primary, status)
      VALUES (?, 'email', ?, 1, 'ok')
    `).run(contactId, rawEmail);
  }
  if (rawPhone && !duplicateConflict) {
    db.prepare(`
      INSERT OR IGNORE INTO contact_identities (contact_id, kind, value, is_primary, status)
      VALUES (?, 'phone', ?, 0, 'ok')
    `).run(contactId, rawPhone);
  }

  // 3. Activity: Form submission
  const activityMeta = JSON.stringify({
    lead_id: lead.lead_id || '',
    form_type: lead.form_type || '',
    scene: lead.scene || '',
    source_page: lead.source_page || '',
    interest: lead.interest || '',
    budget: lead.budget || '',
    timeline: lead.timeline || '',
    areas: lead.areas || []
  });

  db.prepare(`
    INSERT INTO activities (contact_id, kind, direction, subject, body, meta_json, occurred_at, created_at)
    VALUES (?, 'form', 'in', ?, ?, ?, ?, ?)
  `).run(
    contactId,
    `Form Submission: ${lead.form_type || 'Inquiry'}`,
    stripHtml(lead.message || '').slice(0, 2000),
    activityMeta,
    receivedAt,
    new Date().toISOString()
  );

  // 4. Consents (never update/delete, append audit record)
  const consentTextVer = lead.consent_text_version || '2026-11-v1';
  const consentSource = lead.lead_id ? `lead:${lead.lead_id}` : 'form_submission';

  if (lead.email_consent !== undefined) {
    db.prepare(`
      INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
      VALUES (?, 'email_marketing', ?, ?, ?, ?)
    `).run(
      contactId,
      lead.email_consent ? 1 : 0,
      consentTextVer,
      consentSource,
      lead.consent_timestamp || receivedAt
    );
  }

  if (lead.sms_consent !== undefined || rawPhone) {
    db.prepare(`
      INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
      VALUES (?, 'sms_calls', ?, ?, ?, ?)
    `).run(
      contactId,
      lead.sms_consent ? 1 : 0,
      consentTextVer,
      consentSource,
      lead.consent_timestamp || receivedAt
    );
  }

  // 5. Handle duplicate conflict task
  if (duplicateConflict) {
    db.prepare(`
      INSERT INTO tasks (contact_id, title, due_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      contactId,
      `Possible duplicate: review (Contact #${emailContactId} and Contact #${phoneContactId})`,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  // 6. Link lead back to contact
  if (lead.lead_id) {
    db.prepare('UPDATE leads SET contact_id = ? WHERE lead_id = ?').run(contactId, lead.lead_id);
  }

  return { contact_id: contactId, action };
}

/**
 * Run idempotent backfill over all existing leads in chronological order.
 * @param {object} [dbInstance]
 * @returns {{
 *   total_leads: number,
 *   contacts_created: number,
 *   contacts_matched: number,
 *   duplicates_flagged: number,
 *   identities_created: number,
 *   activities_created: number,
 *   consents_created: number
 * }}
 */
function runBackfill(dbInstance) {
  const db = dbInstance || getDb();

  const leads = db.prepare(`
    SELECT * FROM leads ORDER BY received_at ASC, id ASC
  `).all();

  const stats = {
    total_leads: leads.length,
    contacts_created: 0,
    contacts_matched: 0,
    duplicates_flagged: 0,
    identities_created: 0,
    activities_created: 0,
    consents_created: 0
  };

  const initialCounts = {
    identities: db.prepare('SELECT COUNT(*) as c FROM contact_identities').get().c,
    activities: db.prepare('SELECT COUNT(*) as c FROM activities').get().c,
    consents: db.prepare('SELECT COUNT(*) as c FROM consents').get().c
  };

  for (const lead of leads) {
    let areas = [];
    try {
      areas = JSON.parse(lead.areas_json || '[]');
    } catch (_) {}

    let utm = {};
    try {
      utm = JSON.parse(lead.utm_json || '{}');
    } catch (_) {}

    const leadObj = {
      lead_id: lead.lead_id,
      received_at: lead.received_at,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      interest: lead.interest,
      budget: lead.budget,
      timeline: lead.timeline,
      areas,
      form_type: lead.form_type,
      scene: lead.scene,
      source_page: lead.source_page,
      message: lead.notes || lead.message || '',
      segment: lead.segment,
      email_consent: Boolean(lead.email_consent),
      sms_consent: Boolean(lead.sms_consent),
      consent_text_version: lead.consent_text_version,
      consent_timestamp: lead.consent_timestamp,
      utm
    };

    const res = leadToContact(leadObj, db);
    if (res.action === 'created') stats.contacts_created++;
    else if (res.action === 'matched') stats.contacts_matched++;
    else if (res.action === 'duplicate_flagged') stats.duplicates_flagged++;
  }

  const finalCounts = {
    identities: db.prepare('SELECT COUNT(*) as c FROM contact_identities').get().c,
    activities: db.prepare('SELECT COUNT(*) as c FROM activities').get().c,
    consents: db.prepare('SELECT COUNT(*) as c FROM consents').get().c
  };

  stats.identities_created = finalCounts.identities - initialCounts.identities;
  stats.activities_created = finalCounts.activities - initialCounts.activities;
  stats.consents_created = finalCounts.consents - initialCounts.consents;

  return stats;
}

module.exports = {
  splitName,
  leadToContact,
  runBackfill
};

