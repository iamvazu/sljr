'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDb } = require('../site/db/database');
const { createBackup } = require('../site/lib/backup');
const { submitLead, LeadError } = require('../site/api/lead');
const db = require('../site/db/database');

test('CRM Step 1: Backup Engine & PRAGMA integrity_check', async (t) => {
  await t.test('createBackup produces a valid backup with integrity_check ok', () => {
    const res = createBackup();
    assert.equal(res.ok, true);
    assert.ok(res.size > 0, 'Backup file should have non-zero size');
    assert.ok(fs.existsSync(res.path), 'Backup file should exist on disk');

    // Clean up test backup file
    try { fs.unlinkSync(res.path); } catch (_) {}
  });
});

test('CRM Step 2: Schema Migrations & Seeds', async (t) => {
  const database = getDb();

  await t.test('All 14 M1/M2 tables exist', () => {
    const requiredTables = [
      'contacts',
      'contact_identities',
      'consents',
      'activities',
      'pipelines',
      'pipeline_stages',
      'deals',
      'tasks',
      'tags',
      'contact_tags',
      'messages',
      'action_items',
      'ai_runs',
      'push_subscriptions'
    ];

    const existingTables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    for (const table of requiredTables) {
      assert.ok(existingTables.includes(table), `Table ${table} must exist`);
    }
  });

  await t.test('Pipelines and stages are correctly seeded', () => {
    const pipelines = database.prepare('SELECT * FROM pipelines ORDER BY id ASC').all();
    assert.equal(pipelines.length, 2);
    assert.equal(pipelines[0].name, 'Buyer');
    assert.equal(pipelines[1].name, 'Seller');

    const stages = database.prepare('SELECT * FROM pipeline_stages ORDER BY pipeline_id ASC, sort_order ASC').all();
    assert.equal(stages.length, 16);

    const buyerStages = stages.filter(s => s.pipeline_id === 1);
    assert.equal(buyerStages.length, 8);
    assert.deepEqual(buyerStages.map(s => s.name), [
      'New', 'Contacted', 'Qualified', 'Showing', 'Offer', 'Under contract', 'Closed', 'Lost'
    ]);
    assert.equal(buyerStages.find(s => s.name === 'Closed').is_won, 1);
    assert.equal(buyerStages.find(s => s.name === 'Lost').is_lost, 1);

    const sellerStages = stages.filter(s => s.pipeline_id === 2);
    assert.equal(sellerStages.length, 8);
    assert.deepEqual(sellerStages.map(s => s.name), [
      'New', 'Contacted', 'Qualified', 'Listing prep', 'Offer', 'Under contract', 'Closed', 'Lost'
    ]);
    assert.equal(sellerStages.find(s => s.name === 'Closed').is_won, 1);
    assert.equal(sellerStages.find(s => s.name === 'Lost').is_lost, 1);
  });

  await t.test('Leads table has contact_id column', () => {
    const leadCols = database.prepare('PRAGMA table_info(leads)').all().map(c => c.name);
    assert.ok(leadCols.includes('contact_id'), 'leads table must contain contact_id column');
  });
});

test('CRM Regression: Public Forms & Existing Flow Integrity (AC #1)', async (t) => {
  const database = getDb();

  await t.test('Honeypot form submission returns spam true and writes nothing', () => {
    const initialCount = database.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    const res = submitLead({
      name: 'Bot Spammer',
      email: 'bot@spam.com',
      company_website: 'http://spam-link.ru'
    });
    assert.equal(res.ok, true);
    assert.equal(res.spam, true);
    assert.equal(res.lead_id, '');

    const finalCount = database.prepare('SELECT COUNT(*) as count FROM leads').get().count;
    assert.equal(finalCount, initialCount, 'No row should be added for honeypot');
  });

  await t.test('Valid lead submission persists to database and queues outbox', () => {
    const testEmail = `test_buyer_${Date.now()}@example.com`;
    const res = submitLead({
      name: 'Regression Test Buyer',
      email: testEmail,
      phone: '925-555-0199',
      interest: 'buying',
      budget: '$2M - $3M',
      timeline: '1-3 months',
      areas: ['Pleasanton', 'Danville'],
      email_consent: true,
      sms_consent: true
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });

    assert.equal(res.ok, true);
    assert.ok(res.lead_id.startsWith('lead_'));

    const leadRow = database.prepare('SELECT * FROM leads WHERE lead_id = ?').get(res.lead_id);
    assert.ok(leadRow, 'Lead row must exist in database');
    assert.equal(leadRow.name, 'Regression Test Buyer');
    assert.equal(leadRow.email, testEmail);
    assert.equal(leadRow.phone, '+19255550199');
    assert.equal(leadRow.status, 'new');

    // Clean up test lead row
    database.prepare('DELETE FROM leads WHERE lead_id = ?').run(res.lead_id);
  });

  await t.test('Invalid lead submission throws LeadError with clean messages', () => {
    assert.throws(() => submitLead({}), { message: 'Please enter your name.' });
    assert.throws(() => submitLead({ name: 'John' }), { message: 'Please enter a valid email address.' });
    assert.throws(() => submitLead({ name: 'John', email: 'not-an-email' }), { message: 'Please enter a valid email address.' });
    assert.throws(() => submitLead({ name: 'John', email: 'john@gmail.com', phone: '123' }), { message: 'Please enter a valid 10-digit phone number.' });
    assert.throws(() => submitLead({ name: 'John', email: 'john@gmail.com', sms_consent: true }), { message: 'A phone number is required to agree to calls and texts.' });
  });

  await t.test('Valuation insert works reliably', () => {
    const valId = `val_test_${Date.now()}`;
    db.insertValuation({
      valuation_id: valId,
      address: '123 Main St, Pleasanton, CA',
      submarket: 'Pleasanton',
      property_type: 'Single Family',
      beds: '4',
      baths: '3',
      sqft: 2800,
      timeline: '1-3 months',
      name: 'Valuation Test User',
      email: 'valuser@example.com',
      phone: '+19255550188',
      consent: true,
      est_low: 2100000,
      est_mid: 2300000,
      est_high: 2500000,
      concierge_uplift: 150000,
      ppsf: 821
    });

    const valRow = database.prepare('SELECT * FROM valuations WHERE valuation_id = ?').get(valId);
    assert.ok(valRow);
    assert.equal(valRow.est_mid, 2300000);

    // Clean up
    database.prepare('DELETE FROM valuations WHERE valuation_id = ?').run(valId);
  });

  await t.test('Newsletter upsert works idempotently', () => {
    const email = `news_${Date.now()}@example.com`;
    db.upsertNewsletter({ email, consent: true, source_page: '/test' });
    db.upsertNewsletter({ email, consent: true, source_page: '/test2' });

    const rows = database.prepare('SELECT * FROM newsletter_subscribers WHERE email = ?').all(email);
    assert.equal(rows.length, 1);

    // Clean up
    database.prepare('DELETE FROM newsletter_subscribers WHERE email = ?').run(email);
  });
});

test('CRM Lead to Contact Engine & Deduplication (M1 Core)', async (t) => {
  const database = getDb();
  const { leadToContact } = require('../site/lib/crm');

  await t.test('Creates contact, identity, activity, and consents for new lead', () => {
    const uniqueEmail = `crm_test_${Date.now()}@realestate.com`;
    const lead = {
      lead_id: `lead_crm_${Date.now()}`,
      received_at: new Date().toISOString(),
      name: 'Victoria Beckham',
      email: uniqueEmail,
      phone: '925-555-8899',
      form_type: 'contact',
      interest: 'buying',
      budget: '$4M - $6M',
      timeline: 'Immediately',
      areas: ['Alamo', 'Danville'],
      segment: 'sports_entertainment',
      message: 'Looking for a private gated estate.',
      email_consent: true,
      sms_consent: true
    };

    const res = leadToContact(lead, database);
    assert.equal(res.action, 'created');
    assert.ok(res.contact_id > 0);

    const contact = database.prepare('SELECT * FROM contacts WHERE id = ?').get(res.contact_id);
    assert.equal(contact.first_name, 'Victoria');
    assert.equal(contact.last_name, 'Beckham');
    assert.equal(contact.discreet, 1, 'sports_entertainment lead must have discreet = 1');
    assert.equal(contact.stage, 'new');

    const identities = database.prepare('SELECT * FROM contact_identities WHERE contact_id = ?').all(res.contact_id);
    assert.equal(identities.length, 2);
    assert.ok(identities.some(i => i.kind === 'email' && i.value === uniqueEmail && i.is_primary === 1));
    assert.ok(identities.some(i => i.kind === 'phone' && i.value === '+19255558899'));

    const activities = database.prepare('SELECT * FROM activities WHERE contact_id = ?').all(res.contact_id);
    assert.equal(activities.length, 1);
    assert.equal(activities[0].kind, 'form');

    const consents = database.prepare('SELECT * FROM consents WHERE contact_id = ?').all(res.contact_id);
    assert.equal(consents.length, 2);

    // Clean up
    database.prepare('DELETE FROM consents WHERE contact_id = ?').run(res.contact_id);
    database.prepare('DELETE FROM activities WHERE contact_id = ?').run(res.contact_id);
    database.prepare('DELETE FROM contact_identities WHERE contact_id = ?').run(res.contact_id);
    database.prepare('DELETE FROM contacts WHERE id = ?').run(res.contact_id);
  });

  await t.test('Deduplicates by email and updates missing fields', () => {
    const email = `dedup_${Date.now()}@domain.com`;
    const lead1 = {
      lead_id: `lead_d1_${Date.now()}`,
      received_at: new Date().toISOString(),
      name: 'Marcus Aurelius',
      email,
      phone: '925-555-1111',
      form_type: 'contact',
      interest: 'buying',
      message: 'First inquiry'
    };
    const res1 = leadToContact(lead1, database);
    assert.equal(res1.action, 'created');

    const lead2 = {
      lead_id: `lead_d2_${Date.now()}`,
      received_at: new Date().toISOString(),
      name: 'Marcus Aurelius',
      email,
      phone: '925-555-1111',
      form_type: 'valuation',
      budget: '$3M - $5M',
      timeline: '3-6 months',
      message: 'Second inquiry with budget and timeline'
    };
    const res2 = leadToContact(lead2, database);
    assert.equal(res2.action, 'matched');
    assert.equal(res2.contact_id, res1.contact_id, 'Should resolve to same contact');

    const updated = database.prepare('SELECT * FROM contacts WHERE id = ?').get(res1.contact_id);
    assert.equal(updated.budget, '$3M - $5M');
    assert.equal(updated.timeline, '3-6 months');

    // Clean up
    database.prepare('DELETE FROM consents WHERE contact_id = ?').run(res1.contact_id);
    database.prepare('DELETE FROM activities WHERE contact_id = ?').run(res1.contact_id);
    database.prepare('DELETE FROM contact_identities WHERE contact_id = ?').run(res1.contact_id);
    database.prepare('DELETE FROM contacts WHERE id = ?').run(res1.contact_id);
  });

  await t.test('Flags duplicate conflict when email matches Contact A and phone matches Contact B', () => {
    const emailA = `user_a_${Date.now()}@domain.com`;
    const emailB = `user_b_${Date.now()}@domain.com`;
    const phoneB = '+19255557766';

    const resA = leadToContact({
      lead_id: `lead_a_${Date.now()}`,
      name: 'User A',
      email: emailA
    }, database);

    const resB = leadToContact({
      lead_id: `lead_b_${Date.now()}`,
      name: 'User B',
      email: emailB,
      phone: phoneB
    }, database);

    assert.notEqual(resA.contact_id, resB.contact_id);

    // Conflict lead: email of A, phone of B
    const conflictRes = leadToContact({
      lead_id: `lead_conf_${Date.now()}`,
      name: 'Conflicting Contact',
      email: emailA,
      phone: phoneB
    }, database);

    assert.equal(conflictRes.action, 'duplicate_flagged');
    assert.equal(conflictRes.contact_id, resA.contact_id, 'Must attach to email contact');

    const tasks = database.prepare('SELECT * FROM tasks WHERE contact_id = ?').all(resA.contact_id);
    assert.ok(tasks.some(t => t.title.includes('Possible duplicate: review')));

    // Clean up
    database.prepare('DELETE FROM tasks WHERE contact_id = ?').run(resA.contact_id);
    [resA.contact_id, resB.contact_id].forEach(id => {
      database.prepare('DELETE FROM consents WHERE contact_id = ?').run(id);
      database.prepare('DELETE FROM activities WHERE contact_id = ?').run(id);
      database.prepare('DELETE FROM contact_identities WHERE contact_id = ?').run(id);
      database.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    });
  });
});

test('CRM Contacts API & Queries (Step 3)', async (t) => {
  const database = getDb();
  const { adminListContacts, adminGetContact, adminUpdateContact } = require('../site/db/database');

  await t.test('adminListContacts returns paginated contacts with primary identities', () => {
    const res = adminListContacts({ limit: 10, offset: 0 });
    assert.ok(typeof res.total === 'number');
    assert.ok(Array.isArray(res.contacts));
    assert.ok(res.contacts.length > 0);

    const first = res.contacts[0];
    assert.ok('id' in first);
    assert.ok('display_name' in first);
    assert.ok('stage' in first);
    assert.ok('score' in first);
    assert.ok('primary_email' in first);
  });

  await t.test('adminListContacts filters by stage and searches by text', () => {
    const spamRes = adminListContacts({ stage: 'spam' });
    assert.ok(spamRes.contacts.every(c => c.stage === 'spam'));

    const searchRes = adminListContacts({ q: 'Jane' });
    assert.ok(searchRes.contacts.length >= 1);
    assert.ok(searchRes.contacts.some(c => c.display_name.includes('Jane')));
  });

  await t.test('adminGetContact returns full record with activities and consents', () => {
    const list = adminListContacts({ limit: 1 });
    assert.ok(list.contacts.length > 0);
    const contactId = list.contacts[0].id;

    const full = adminGetContact(contactId);
    assert.ok(full);
    assert.equal(full.id, contactId);
    assert.ok(Array.isArray(full.identities));
    assert.ok(Array.isArray(full.activities));
    assert.ok(Array.isArray(full.consents));
    assert.ok(Array.isArray(full.deals));
    assert.ok(Array.isArray(full.tasks));
  });

  await t.test('adminUpdateContact safely modifies stage and notes', () => {
    const list = adminListContacts({ limit: 1 });
    const contactId = list.contacts[0].id;

    const ok = adminUpdateContact(contactId, { stage: 'qualified', notes: 'VIP client inquiry' });
    assert.equal(ok, true);

    const updated = adminGetContact(contactId);
    assert.equal(updated.stage, 'qualified');
    assert.equal(updated.notes, 'VIP client inquiry');
  });
});

test('CRM Tasks & Pipeline Deals (Step 4)', async (t) => {
  const database = getDb();
  const {
    adminCreateTask,
    adminUpdateTask,
    adminDeleteTask,
    adminListPipelines,
    adminCreateDeal,
    adminGetDeal,
    adminUpdateDeal,
    adminGetContact,
    adminListContacts
  } = require('../site/db/database');

  const contacts = adminListContacts({ limit: 1 });
  assert.ok(contacts.contacts.length > 0);
  const contactId = contacts.contacts[0].id;

  await t.test('Pipeline listing returns Buyer and Seller with 8 stages each', () => {
    const pipelines = adminListPipelines();
    assert.equal(pipelines.length, 2);
    assert.equal(pipelines[0].name, 'Buyer');
    assert.equal(pipelines[0].stages.length, 8);
    assert.equal(pipelines[1].name, 'Seller');
    assert.equal(pipelines[1].stages.length, 8);
  });

  await t.test('Task management & automatic contacts.next_follow_up_at update', () => {
    const due1 = '2026-11-20T10:00:00.000Z';
    const due2 = '2026-11-18T10:00:00.000Z'; // Earlier date

    const task1 = adminCreateTask({ contact_id: contactId, title: 'Call client regarding pre-approval', due_at: due1 });
    assert.ok(task1.id > 0);

    let contact = adminGetContact(contactId);
    assert.equal(contact.next_follow_up_at, due1);

    const task2 = adminCreateTask({ contact_id: contactId, title: 'Schedule VIP tour', due_at: due2 });
    assert.ok(task2.id > 0);

    contact = adminGetContact(contactId);
    assert.equal(contact.next_follow_up_at, due2, 'next_follow_up_at must be the earliest open due date');

    // Complete task2
    const updatedTask2 = adminUpdateTask(task2.id, { done: true });
    assert.ok(updatedTask2.done_at);

    // After completing the earlier task, next_follow_up_at should advance to due1
    contact = adminGetContact(contactId);
    assert.equal(contact.next_follow_up_at, due1);

    // Verify task_done activity was recorded
    const activities = database.prepare("SELECT * FROM activities WHERE contact_id = ? AND kind = 'task_done'").all(contactId);
    assert.ok(activities.length > 0);
    assert.ok(activities.some(a => a.subject.includes('Schedule VIP tour')));

    // Clean up tasks
    adminDeleteTask(task1.id);
    adminDeleteTask(task2.id);
  });

  await t.test('Deal creation and stage movement with stage_change activity and won past_client transition', () => {
    // 1. Create Buyer Deal
    const buyerDeal = adminCreateDeal({
      contact_id: contactId,
      pipeline_id: 1,
      title: 'Alamo Gated Estate Purchase',
      value_usd: 3500000,
      property_address: '1240 Miranda Creek Way, Alamo, CA'
    });
    assert.ok(buyerDeal.id > 0);
    assert.equal(buyerDeal.pipeline_name, 'Buyer');
    assert.equal(buyerDeal.stage_name, 'New');

    // 2. Move Deal to Showing (stage_id: 4)
    const showingDeal = adminUpdateDeal(buyerDeal.id, { stage_id: 4 });
    assert.equal(showingDeal.stage_name, 'Showing');

    // Verify stage_change activity
    const stageActs = database.prepare("SELECT * FROM activities WHERE contact_id = ? AND kind = 'stage_change' ORDER BY id DESC").all(contactId);
    assert.ok(stageActs.length > 0);
    assert.ok(stageActs[0].subject.includes('Showing'));

    // 3. Move Deal to Closed (stage_id: 7, is_won = 1)
    const wonDeal = adminUpdateDeal(buyerDeal.id, { stage_id: 7 });
    assert.equal(wonDeal.stage_name, 'Closed');
    assert.equal(wonDeal.is_won, 1);
    assert.ok(wonDeal.closed_at, 'closed_at must be set when deal is won');

    // Verify contact type transitioned to past_client
    const contact = adminGetContact(contactId);
    assert.equal(contact.type, 'past_client');

    // Clean up test deal
    database.prepare('DELETE FROM deals WHERE id = ?').run(buyerDeal.id);
  });
});

test('CRM Outbound Email & Unsubscribe Flow (Step 5 & AC #7)', async (t) => {
  const database = getDb();
  const { sendOutboundEmail, unsubscribeContact, getUnsubscribeToken } = require('../site/lib/crm');
  const { adminCreateDeal, adminListContacts, adminGetContact } = require('../site/db/database');

  // Create a dedicated fresh test contact in stage 'new'
  const res = database.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, stage, type, created_at, updated_at)
    VALUES ('Email', 'Recipient', 'Email Recipient', 'new', 'lead', ?, ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  const testContactId = Number(res.lastInsertRowid);
  const testEmail = `recipient_${Date.now()}@example.com`;

  await t.test('Sends outbound email, enqueues outbox, writes email_out activity, sets last_outbound_at, advances stage', () => {
    const emailRes = sendOutboundEmail({
      contact_id: testContactId,
      to_value: testEmail,
      subject: 'Exclusive Pocket Listings in Pleasanton',
      body: 'Hi, I wanted to follow up with an off-market estate near Ruby Hill.',
      origin: 'manual'
    }, database);

    assert.equal(emailRes.ok, true);
    assert.ok(emailRes.message_id > 0);
    assert.equal(emailRes.stage, 'contacted', 'First outbound email must advance stage new -> contacted');
    assert.ok(emailRes.unsub_url.includes('/api/unsubscribe?c=' + testContactId));

    // Verify messages table
    const msg = database.prepare('SELECT * FROM messages WHERE id = ?').get(emailRes.message_id);
    assert.ok(msg);
    assert.equal(msg.contact_id, testContactId);
    assert.equal(msg.to_value, testEmail);
    assert.equal(msg.status, 'queued');
    assert.ok(msg.body.includes('Compass | CA DRE# 01989811'));
    assert.ok(msg.body.includes('Unsubscribe from future emails'));

    // Verify outbox
    const outboxRow = database.prepare("SELECT * FROM outbox WHERE lead_id = ? AND channel = 'contact_email'").get(`contact_${testContactId}`);
    assert.ok(outboxRow, 'Email job must exist in outbox');

    // Verify email_out activity
    const acts = database.prepare("SELECT * FROM activities WHERE contact_id = ? AND kind = 'email_out'").all(testContactId);
    assert.equal(acts.length, 1);
    assert.ok(acts[0].subject.includes('Exclusive Pocket Listings in Pleasanton'));

    // Verify contact updated
    const contact = adminGetContact(testContactId);
    assert.equal(contact.stage, 'contacted');
    assert.ok(contact.last_outbound_at);
  });

  await t.test('Unsubscribe link flips consent row to 0 and blocks future marketing emails', () => {
    const token = getUnsubscribeToken(testContactId);
    const unsubRes = unsubscribeContact(testContactId, token, database);
    assert.equal(unsubRes.ok, true);

    // Verify consents table has granted = 0
    const consent = database.prepare("SELECT * FROM consents WHERE contact_id = ? AND channel = 'email_marketing' ORDER BY id DESC LIMIT 1").get(testContactId);
    assert.ok(consent);
    assert.equal(consent.granted, 0);

    // Attempting to send marketing email to unsubscribed contact should throw an error
    assert.throws(() => {
      sendOutboundEmail({
        contact_id: testContactId,
        to_value: testEmail,
        subject: 'Another follow-up',
        body: 'Check this new home.'
      }, database);
    }, { message: 'This contact has unsubscribed from email marketing communications.' });
  });

  // Clean up test contact
  database.prepare('DELETE FROM messages WHERE contact_id = ?').run(testContactId);
  database.prepare('DELETE FROM outbox WHERE lead_id = ?').run(`contact_${testContactId}`);
  database.prepare('DELETE FROM activities WHERE contact_id = ?').run(testContactId);
  database.prepare('DELETE FROM consents WHERE contact_id = ?').run(testContactId);
  database.prepare('DELETE FROM contacts WHERE id = ?').run(testContactId);
});

test('CRM Admin & Session Foundation', async (t) => {
  await t.test('Admin sessions lifecycle and audit logging', () => {
    const tokenHash = 'test_token_hash_' + Date.now();
    const ttlMs = 1000 * 60 * 60; // 1 hour
    db.createSession(tokenHash, ttlMs, 'test_ip_hash');

    const session = db.getSession(tokenHash);
    assert.ok(session);
    assert.equal(session.token_hash, tokenHash);
    assert.equal(session.ip_hash, 'test_ip_hash');

    db.audit('test_action', 'CRM unit test audit record', 'test_ip_hash');
    const auditLogs = db.getAudit(5);
    assert.ok(auditLogs.length > 0);
    assert.equal(auditLogs[0].action, 'test_action');

    db.deleteSession(tokenHash);
    assert.equal(db.getSession(tokenHash), undefined);
  });
});

test('Step 6: PWA, Web Push & Mobile Hardening', async (t) => {
  const fs = require('fs');
  const path = require('path');
  const push = require('../site/lib/push');

  await t.test('PWA Web Manifest & Service Worker validation', () => {
    const manifestPath = path.join(__dirname, '..', 'site', 'admin', 'manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.start_url, '/admin/');
    assert.equal(manifest.scope, '/admin/');
    assert.equal(manifest.display, 'standalone');

    const swPath = path.join(__dirname, '..', 'site', 'admin', 'sw.js');
    assert.ok(fs.existsSync(swPath), 'sw.js must exist');
    const swContent = fs.readFileSync(swPath, 'utf8');
    // Acceptance criteria: API responses are never cached
    assert.ok(swContent.includes('/api/'), 'SW must handle /api/');
    assert.ok(swContent.includes('push'), 'SW must handle push event');
    assert.ok(swContent.includes('notificationclick'), 'SW must handle notificationclick event');
  });

  await t.test('Push Subscriptions database operations', () => {
    const endpoint = 'https://updates.push.services.mozilla.com/wpush/v2/test_sub_' + Date.now();
    const keys = { p256dh: 'test_p256dh_key', auth: 'test_auth_secret' };

    // 1. Add subscription
    db.addPushSubscription(endpoint, keys);
    let subs = db.getPushSubscriptions();
    const found = subs.find(s => s.endpoint === endpoint);
    assert.ok(found, 'Subscription should be saved');
    assert.ok(found.keys_json.includes('test_p256dh_key'));

    // 2. Duplicate subscription updates keys (ON CONFLICT DO UPDATE)
    const updatedKeys = { p256dh: 'updated_key', auth: 'updated_auth' };
    db.addPushSubscription(endpoint, updatedKeys);
    subs = db.getPushSubscriptions();
    const updated = subs.find(s => s.endpoint === endpoint);
    assert.ok(updated.keys_json.includes('updated_key'));

    // 3. Remove subscription
    const removed = db.removePushSubscription(endpoint);
    assert.equal(removed, true);
    subs = db.getPushSubscriptions();
    assert.equal(subs.find(s => s.endpoint === endpoint), undefined);
  });

  await t.test('Lead push notification formatting (Acceptance Test)', () => {
    const testLead = {
      lead_id: 'lead_test_123',
      name: 'Eleanor Vance',
      form_type: 'Buyer Consultation',
      interest: 'Purchase Luxury Estate',
      budget: '$3.5M - $5M',
      timeline: '1-3 months'
    };

    const notif = push.formatLeadNotification(testLead);
    assert.equal(notif.title, 'New lead: Eleanor, Buyer Consultation');
    assert.equal(notif.body, 'Purchase Luxury Estate · $3.5M - $5M · 1-3 months');
    assert.equal(notif.data.url, '/admin/#contacts');
  });

  await t.test('CRM Settings & Meta persistence', () => {
    const initial = db.getSettings();
    assert.ok(initial.sender_name);
    assert.ok(initial.sender_signature);

    const updated = db.updateSettings({
      sender_name: 'Steven Lenz Jr. (Compass)',
      working_hours: '07:30 - 19:30',
      notifications_enabled: false
    });
    assert.equal(updated.sender_name, 'Steven Lenz Jr. (Compass)');
    assert.equal(updated.working_hours, '07:30 - 19:30');
    assert.equal(updated.notifications_enabled, false);

    // Revert back to defaults
    db.updateSettings({
      sender_name: 'Steven Lenz Jr.',
      working_hours: '08:00 - 19:00',
      notifications_enabled: true
    });
  });

  await t.test('CRM Usage & Budget caps calculation', () => {
    const usage = db.getUsageStats();
    assert.ok(usage.month);
    assert.equal(usage.ai_budget_cap_usd, 25.00);
    assert.equal(usage.email_budget_cap_usd, 20.00);
    assert.equal(typeof usage.ai_spend_usd, 'number');
    assert.equal(typeof usage.email_spend_usd, 'number');
  });

  await t.test('Mobile Hardening (Acceptance Test 18)', () => {
    const cssPath = path.join(__dirname, '..', 'site', 'admin', 'admin.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Tap targets at least 44px
    assert.ok(cssContent.includes('min-height: 44px') || cssContent.includes('min-height:44px'), 'CSS must specify 44px min tap targets');
    // Inputs at least 16px to prevent iOS auto-zoom
    assert.ok(cssContent.includes('font-size: 16px') || cssContent.includes('font-size:16px'), 'Form inputs must specify 16px font-size');
  });
});

test('Step 7: M2 Scoring Engine (Acceptance Tests 10 & 11)', async (t) => {
  const { scoreContact, SCORING_CONFIG } = require('../site/lib/scoring');
  const fixedNow = new Date('2026-11-14T12:00:00.000Z');

  // Acceptance Test 10: 12 Fixed Fixtures
  await t.test('Fixture 1: Hot Buyer (Immediate timeline, $3.5M, Pleasanton enclave)', () => {
    const contact = {
      timeline: '0-3 months',
      interest: 'buy and sell',
      budget: '$3.5M',
      areas: ['Pleasanton'],
      phone: '+19255550199',
      stage: 'new',
      type: 'lead',
      created_at: '2026-11-13T12:00:00.000Z'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'valuation' }), occurred_at: '2026-11-13T12:00:00.000Z' }
    ];
    const consents = [{ channel: 'sms_calls', granted: 1 }];
    const res = scoreContact(contact, activities, consents, fixedNow);

    assert.equal(res.band, 'hot');
    assert.ok(res.score >= 70, `Score should be >= 70, got ${res.score}`);
    assert.ok(res.reasons.some(r => r.includes('Wants to move within 3 months')));
  });

  await t.test('Fixture 2: Hot Engaged Client (High engagement, showing logged)', () => {
    const contact = {
      timeline: '3-6 months',
      budget: '$2.2M',
      areas: ['Danville'],
      phone: '+19255550188',
      stage: 'showing',
      type: 'client'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'contact' }), occurred_at: '2026-11-10T12:00:00.000Z' },
      { kind: 'showing', occurred_at: '2026-11-13T10:00:00.000Z' },
      { kind: 'email_in', direction: 'in', occurred_at: '2026-11-13T18:00:00.000Z' },
      { kind: 'sms_in', direction: 'in', occurred_at: '2026-11-14T08:00:00.000Z' }
    ];
    const consents = [{ channel: 'sms_calls', granted: 1 }];
    const res = scoreContact(contact, activities, consents, fixedNow);

    assert.equal(res.band, 'hot');
    assert.ok(res.score >= 70);
    assert.ok(res.reasons.some(r => r.includes('showing') || r.includes('Active within past 2 days')));
  });

  await t.test('Fixture 3: Warm Seller (Valuation form, 3-6mo, Danville)', () => {
    const contact = {
      timeline: '3-6 months',
      areas: ['Danville'],
      phone: '+19255550177',
      stage: 'contacted',
      type: 'lead'
    };
    const activities = [
      { kind: 'valuation', occurred_at: '2026-11-09T12:00:00.000Z' } // 5 days ago
    ];
    const consents = [];
    const res = scoreContact(contact, activities, consents, fixedNow);

    assert.equal(res.band, 'warm');
    assert.ok(res.score >= 40 && res.score < 70, `Score should be 40-69, got ${res.score}`);
    assert.ok(res.reasons.some(r => r.includes('valuation') || r.includes('3 to 6 months')));
  });

  await t.test('Fixture 4: Cool Prospect (Exploring, modest budget, 12 days ago)', () => {
    const contact = {
      timeline: 'exploring',
      budget: '$850,000',
      stage: 'contacted',
      type: 'lead'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'contact' }), occurred_at: '2026-11-02T12:00:00.000Z' } // 12 days ago
    ];
    const consents = [];
    const res = scoreContact(contact, activities, consents, fixedNow);

    assert.equal(res.band, 'cool');
    assert.ok(res.score >= 15 && res.score < 40, `Score should be 15-39, got ${res.score}`);
  });

  await t.test('Fixture 5: Cold Subscriber (Newsletter only, no phone, 45 days ago)', () => {
    const contact = {
      timeline: '',
      stage: 'new',
      type: 'lead'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'newsletter' }), occurred_at: '2026-09-30T12:00:00.000Z' }
    ];
    const consents = [];
    const res = scoreContact(contact, activities, consents, fixedNow);

    assert.equal(res.band, 'cold');
    assert.ok(res.score < 15, `Score should be < 15, got ${res.score}`);
  });

  await t.test('Fixture 6: Override - Stage spam forces score 0', () => {
    const contact = {
      timeline: '0-3 months',
      budget: '$4M',
      areas: ['Pleasanton'],
      phone: '+19255550111',
      stage: 'spam',
      type: 'lead'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'valuation' }), occurred_at: '2026-11-14T10:00:00.000Z' }
    ];
    const res = scoreContact(contact, activities, [], fixedNow);

    assert.equal(res.score, 0);
    assert.equal(res.band, 'cold');
    assert.ok(res.reasons.some(r => r.includes('spam')));
  });

  await t.test('Fixture 7: Override - Stage lost forces score 0', () => {
    const contact = {
      timeline: '0-3 months',
      budget: '$2M',
      areas: ['Danville'],
      stage: 'lost',
      type: 'lead'
    };
    const activities = [
      { kind: 'form', occurred_at: '2026-11-14T10:00:00.000Z' }
    ];
    const res = scoreContact(contact, activities, [], fixedNow);

    assert.equal(res.score, 0);
    assert.equal(res.band, 'cold');
    assert.ok(res.reasons.some(r => r.includes('lost')));
  });

  await t.test('Fixture 8: Override - Type past_client capped at 30', () => {
    const contact = {
      timeline: '0-3 months',
      budget: '$5M',
      areas: ['Alamo'],
      phone: '+19255550222',
      stage: 'contacted',
      type: 'past_client'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'valuation' }), occurred_at: '2026-11-14T10:00:00.000Z' }
    ];
    const res = scoreContact(contact, activities, [], fixedNow);

    assert.equal(res.score, 30);
    assert.equal(res.band, 'cool');
    assert.ok(res.reasons.some(r => r.includes('Past client / transaction closed')));
  });

  await t.test('Fixture 9: Override - Stage closed capped at 30', () => {
    const contact = {
      timeline: '0-3 months',
      budget: '$3M',
      areas: ['Walnut Creek'],
      stage: 'closed',
      type: 'client'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'valuation' }), occurred_at: '2026-11-14T10:00:00.000Z' }
    ];
    const res = scoreContact(contact, activities, [], fixedNow);

    assert.equal(res.score, 30);
    assert.equal(res.band, 'cool');
  });

  await t.test('Fixture 10: Override - Bounced email penalty (-15)', () => {
    const contact = {
      timeline: '0-3 months',
      budget: '$2M',
      areas: ['Lafayette'],
      stage: 'contacted',
      type: 'lead',
      identities: [{ type: 'email', value: 'bounced@client.com', status: 'bounced' }]
    };
    const activities = [
      { kind: 'form', occurred_at: '2026-11-10T12:00:00.000Z' }
    ];
    const resNormal = scoreContact(Object.assign({}, contact, { identities: [] }), activities, [], fixedNow);
    const resBounced = scoreContact(contact, activities, [], fixedNow);

    assert.equal(resBounced.score, Math.max(0, resNormal.score - 15));
    assert.ok(resBounced.reasons.some(r => r.includes('Primary email bounced')));
  });

  await t.test('Fixture 11: Override - Withdrawn marketing consent penalty (-10)', () => {
    const contact = {
      timeline: '3-6 months',
      budget: '$1.8M',
      areas: ['Dublin'],
      stage: 'contacted',
      type: 'lead'
    };
    const activities = [{ kind: 'form', occurred_at: '2026-11-10T12:00:00.000Z' }];
    const consentsWithdrawn = [{ channel: 'email_marketing', granted: 0 }];

    const resGranted = scoreContact(contact, activities, [{ channel: 'email_marketing', granted: 1 }], fixedNow);
    const resWithdrawn = scoreContact(contact, activities, consentsWithdrawn, fixedNow);

    assert.equal(resWithdrawn.score, Math.max(0, resGranted.score - 10));
    assert.ok(resWithdrawn.reasons.some(r => r.includes('Email marketing consent withdrawn')));
  });

  await t.test('Fixture 12: Multiple distinct forms and submissions within 30 days', () => {
    const contact = {
      timeline: '3-6 months',
      areas: ['Livermore'],
      stage: 'new',
      type: 'lead'
    };
    const activities = [
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'valuation' }), occurred_at: '2026-11-01T12:00:00.000Z' },
      { kind: 'form', meta_json: JSON.stringify({ form_type: 'concierge' }), occurred_at: '2026-11-10T12:00:00.000Z' }
    ];
    const res = scoreContact(contact, activities, [], fixedNow);

    assert.ok(res.all_reasons.some(r => r.includes('distinct inquiry forms submitted')));
    assert.ok(res.all_reasons.some(r => r.includes('forms within 30 days')));
  });

  // Acceptance Test 11: Decay Test
  await t.test('Decay Test: Score decays monotonically as clock advances past boundaries', () => {
    const contact = {
      timeline: '3-6 months',
      budget: '$2.5M',
      areas: ['San Ramon'],
      phone: '+19255550333',
      stage: 'contacted',
      type: 'lead'
    };
    const baseDate = new Date('2026-11-01T12:00:00.000Z');
    const activities = [
      { kind: 'form', occurred_at: baseDate.toISOString() }
    ];
    const consents = [];

    // T0 + 1 day: within 2 days -> +15 recency pts
    const score1d = scoreContact(contact, activities, consents, new Date(baseDate.getTime() + 1 * 86400000)).score;

    // T0 + 5 days: within 7 days -> +10 recency pts (drops by 5)
    const score5d = scoreContact(contact, activities, consents, new Date(baseDate.getTime() + 5 * 86400000)).score;

    // T0 + 10 days: within 14 days -> +6 recency pts (drops by 4)
    const score10d = scoreContact(contact, activities, consents, new Date(baseDate.getTime() + 10 * 86400000)).score;

    // T0 + 20 days: within 30 days -> +3 recency pts (drops by 3)
    const score20d = scoreContact(contact, activities, consents, new Date(baseDate.getTime() + 20 * 86400000)).score;

    // T0 + 40 days: older than 30 days -> 0 recency pts (drops by 3)
    const score40d = scoreContact(contact, activities, consents, new Date(baseDate.getTime() + 40 * 86400000)).score;

    assert.equal(score1d - score5d, 5, 'Should decay by 5 points between 2d and 7d');
    assert.equal(score5d - score10d, 4, 'Should decay by 4 points between 7d and 14d');
    assert.equal(score10d - score20d, 3, 'Should decay by 3 points between 14d and 30d');
    assert.equal(score20d - score40d, 3, 'Should decay by 3 points past 30 days');
    assert.ok(score1d > score5d && score5d > score10d && score10d > score20d && score20d > score40d, 'Decay must be strictly monotonic');
  });

  await t.test('Database rescoreContact and rescoreAllContacts operations', () => {
    // 1. Rescore all contacts in DB
    const resBulk = db.rescoreAllContacts();
    assert.ok(resBulk.ok);
    assert.ok(resBulk.rescored >= 3);

    // 2. Verify individual contact rescore updates database row
    const contacts = db.adminListContacts().contacts;
    assert.ok(contacts.length > 0);
    const targetId = contacts[0].id;

    const scored = db.rescoreContact(targetId);
    assert.ok(scored);
    assert.equal(scored.id, targetId);
    assert.ok(typeof scored.score === 'number');
    assert.ok(['hot', 'warm', 'cool', 'cold'].includes(scored.score_band));

    // Verify row in DB reflects updated score
    const updated = db.adminGetContact(targetId);
    assert.equal(updated.score, scored.score);
    assert.equal(updated.score_band, scored.score_band);
    assert.ok(updated.score_updated_at);
  });
});


