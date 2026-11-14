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

test('Step 8: M2 Daily Action Plan without AI (Acceptance Tests 12 & 13)', async (t) => {
  const actionPlan = require('../site/lib/actionPlan');
  const database = db.getDb();
  const testNow = new Date('2026-11-14T14:00:00.000Z'); // 6:00 AM Pacific
  const planDate = actionPlan.getPlanDate(testNow);

  // Clear any residual action items from prior test runs for isolated test harness
  database.prepare("DELETE FROM action_items").run();

  let testSeq = Date.now();
  // Helper to insert test contacts cleanly
  function createTestContact(data) {
    const s = testSeq++;
    const now = testNow.toISOString();
    const res = database.prepare(`
      INSERT INTO contacts (
        first_name, last_name, display_name, type, stage, discreet,
        score, score_band, last_inbound_at, last_outbound_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.first_name || 'Test',
      data.last_name || 'User',
      data.display_name || 'Test User',
      data.type || 'lead',
      data.stage || 'new',
      data.discreet ? 1 : 0,
      data.score || 0,
      data.score_band || 'cold',
      data.last_inbound_at || null,
      data.last_outbound_at || null,
      data.created_at || now,
      now
    );
    const contactId = Number(res.lastInsertRowid);
    if (data.email) {
      const email = data.email.replace('@', `_${s}@`);
      database.prepare(`
        INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
        VALUES (?, 'email', ?, 1, 'ok')
      `).run(contactId, email);
    }
    if (data.phone) {
      const phone = '+1925' + String(s).slice(-7);
      database.prepare(`
        INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
        VALUES (?, 'phone', ?, 1, 'ok')
      `).run(contactId, phone);
    }
    if (data.consents) {
      for (const cn of data.consents) {
        database.prepare(`
          INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
          VALUES (?, ?, ?, '2026-11-v1', 'test', ?)
        `).run(contactId, cn.channel, cn.granted ? 1 : 0, now);
      }
    }
    return contactId;
  }

  // Acceptance Test 12: Plan Selection, Rules & Exclusions
  await t.test('Plan Selection: Rules qualification and exclusions (AC #12)', () => {
    // 1. Priority 1: new_lead (Stage new, no outbound)
    const idNew = createTestContact({
      display_name: 'Lead One',
      stage: 'new',
      phone: '+19255550111',
      score: 50,
      score_band: 'warm'
    });

    // 2. Priority 2: awaiting_reply (inbound activity > 4 working hours ago)
    const idReply = createTestContact({
      display_name: 'Reply Prospect',
      stage: 'contacted',
      score: 65,
      score_band: 'warm',
      email: 'reply@test.com'
    });
    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, occurred_at, created_at)
      VALUES (?, 'email_in', 'in', 'Inquiry note', ?, ?)
    `).run(idReply, new Date(testNow.getTime() - 16 * 3600000).toISOString(), new Date(testNow.getTime() - 16 * 3600000).toISOString());

    // 3. Priority 3: follow_up_due (Task due today)
    const idTask = createTestContact({
      display_name: 'Task Prospect',
      stage: 'contacted',
      score: 40,
      score_band: 'warm',
      email: 'task@test.com'
    });
    database.prepare(`
      INSERT INTO tasks (contact_id, title, due_at, created_at)
      VALUES (?, 'Review disclosures', ?, ?)
    `).run(idTask, planDate + 'T10:00:00.000Z', testNow.toISOString());

    // 4. Priority 4: hot_no_touch (Hot band, no outbound in 3 days)
    const idHot = createTestContact({
      display_name: 'Hot Lead',
      stage: 'qualified',
      score: 85,
      score_band: 'hot',
      phone: '+19255550222',
      last_outbound_at: new Date(testNow.getTime() - 4 * 86400000).toISOString()
    });

    // 5. Priority 5: warm_no_touch (Warm band, no outbound in 7 days)
    const idWarm = createTestContact({
      display_name: 'Warm Contact',
      stage: 'contacted',
      score: 55,
      score_band: 'warm',
      email: 'warm@test.com',
      last_outbound_at: new Date(testNow.getTime() - 8 * 86400000).toISOString()
    });

    // 6. Priority 6: deal_stalled (Deal open, no activity in 14 days)
    const idDeal = createTestContact({
      display_name: 'Stalled Deal Client',
      stage: 'showing',
      score: 75,
      score_band: 'hot',
      phone: '+19255550333',
      last_outbound_at: new Date(testNow.getTime() - 1 * 86400000).toISOString()
    });
    const twentyDaysAgo = new Date(testNow.getTime() - 20 * 86400000).toISOString();
    database.prepare(`
      INSERT INTO deals (contact_id, pipeline_id, stage_id, title, stage_changed_at, created_at, updated_at)
      VALUES (?, 1, 3, 'Purchase in Ruby Hill', ?, ?, ?)
    `).run(idDeal, twentyDaysAgo, twentyDaysAgo, twentyDaysAgo);

    // 7. Priority 7: past_client_touch (type past_client, no outbound in 90 days)
    const idPast = createTestContact({
      display_name: 'Past Client VIP',
      type: 'past_client',
      stage: 'closed',
      score: 30,
      score_band: 'cool',
      email: 'past@test.com',
      last_outbound_at: new Date(testNow.getTime() - 100 * 86400000).toISOString()
    });

    // EXCLUSIONS:
    // Excluded 1: Spam contact
    const idSpam = createTestContact({ display_name: 'Spam Person', stage: 'spam', email: 'spam@test.com' });
    // Excluded 2: Lost contact
    const idLost = createTestContact({ display_name: 'Lost Person', stage: 'lost', email: 'lost@test.com' });
    // Excluded 3: Discreet contact
    const idDiscreet = createTestContact({ display_name: 'Celebrity Athlete', stage: 'new', discreet: 1, email: 'vip@test.com' });
    // Excluded 4: Snoozed until tomorrow
    const idSnoozed = createTestContact({ display_name: 'Snoozed Contact', stage: 'new', email: 'snooze@test.com' });
    database.prepare(`
      INSERT INTO action_items (plan_date, contact_id, rule, reason, channel, status, snoozed_until, created_at)
      VALUES (?, ?, 'new_lead', 'Testing', 'email', 'snoozed', ?, ?)
    `).run(planDate, idSnoozed, '2026-11-20', testNow.toISOString());

    // Run candidate selection
    const candidates = actionPlan.selectActionPlanCandidates(database, testNow);
    const candidateIds = candidates.map(c => c.contact_id);

    // Assert inclusions
    assert.ok(candidateIds.includes(idNew), 'new_lead should qualify');
    assert.ok(candidateIds.includes(idReply), 'awaiting_reply should qualify');
    assert.ok(candidateIds.includes(idTask), 'follow_up_due should qualify');
    assert.ok(candidateIds.includes(idHot), 'hot_no_touch should qualify');
    assert.ok(candidateIds.includes(idWarm), 'warm_no_touch should qualify');
    assert.ok(candidateIds.includes(idDeal), 'deal_stalled should qualify');
    assert.ok(candidateIds.includes(idPast), 'past_client_touch should qualify');

    // Assert exclusions
    assert.ok(!candidateIds.includes(idSpam), 'spam must be excluded');
    assert.ok(!candidateIds.includes(idLost), 'lost must be excluded');
    assert.ok(!candidateIds.includes(idDiscreet), 'discreet must be excluded');
    assert.ok(!candidateIds.includes(idSnoozed), 'snoozed must be excluded');

    // Verify rules match exactly
    assert.equal(candidates.find(c => c.contact_id === idNew).rule, 'new_lead');
    assert.equal(candidates.find(c => c.contact_id === idReply).rule, 'awaiting_reply');
    assert.equal(candidates.find(c => c.contact_id === idTask).rule, 'follow_up_due');
    assert.equal(candidates.find(c => c.contact_id === idHot).rule, 'hot_no_touch');
    assert.equal(candidates.find(c => c.contact_id === idWarm).rule, 'warm_no_touch');
    assert.equal(candidates.find(c => c.contact_id === idDeal).rule, 'deal_stalled');
    assert.equal(candidates.find(c => c.contact_id === idPast).rule, 'past_client_touch');
  });

  await t.test('Idempotency & Max 10 Cap (AC #12)', async () => {
    // Generate plan for testNow
    const plan1 = await actionPlan.generateDailyActionPlan(database, testNow);
    assert.ok(plan1.ok);
    assert.ok(plan1.total <= 10, 'Plan items must not exceed 10');

    // Run again immediately on the same day
    const plan2 = await actionPlan.generateDailyActionPlan(database, testNow);
    assert.equal(plan2.added, 0, 'Second run on the same day must not add duplicate contacts');
    assert.equal(plan2.total, plan1.total);
  });

  // Acceptance Test 13: Approval & Consent Re-check
  await t.test('Approval & Sending workflow (AC #13)', () => {
    // 1. Create a contact with granted marketing consent
    const testCid = createTestContact({
      display_name: 'Approval Prospect',
      stage: 'new',
      email: 'approval@test.com',
      consents: [{ channel: 'email_marketing', granted: 1 }]
    });

    // 2. Insert an open action item
    const resItem = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel,
        draft_subject, draft_body, draft_source, status, created_at
      ) VALUES (?, ?, 'new_lead', 'New inquiry', 'email', 'Hello from Steven', 'Checking in on your plans.', 'template', 'open', ?)
    `).run(planDate, testCid, testNow.toISOString());
    const actionItemId = Number(resItem.lastInsertRowid);

    // Rule: No messages row exists until Approve
    const msgBefore = database.prepare('SELECT 1 FROM messages WHERE contact_id = ?').get(testCid);
    assert.equal(msgBefore, undefined, 'No messages row must exist before approval');

    // 3. Test Approve & Send
    const approveRes = actionPlan.approveActionItem(actionItemId, database, 'http://localhost:4173');
    assert.ok(approveRes.ok);
    assert.equal(approveRes.status, 'sent');
    assert.ok(approveRes.message_id);

    // Verify messages row now exists with approved_at set
    const msgAfter = database.prepare('SELECT * FROM messages WHERE id = ?').get(approveRes.message_id);
    assert.ok(msgAfter);
    assert.ok(msgAfter.approved_at);
    assert.equal(msgAfter.contact_id, testCid);
    assert.equal(msgAfter.subject, 'Hello from Steven');

    // Verify action item is marked sent
    const itemAfter = database.prepare('SELECT * FROM action_items WHERE id = ?').get(actionItemId);
    assert.equal(itemAfter.status, 'sent');
    assert.ok(itemAfter.resolved_at);

    // 4. Test Consent Re-check Failure:
    // If marketing consent is withdrawn, approving must fail and create no message
    const testCidNoConsent = createTestContact({
      display_name: 'No Consent Prospect',
      stage: 'new',
      email: 'noconsent@test.com',
      consents: [{ channel: 'email_marketing', granted: 0 }] // Withdrawn!
    });

    const resItemBlocked = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel,
        draft_subject, draft_body, draft_source, status, created_at
      ) VALUES (?, ?, 'new_lead', 'New inquiry', 'email', 'Subject', 'Body', 'template', 'open', ?)
    `).run(planDate, testCidNoConsent, testNow.toISOString());
    const blockedItemId = Number(resItemBlocked.lastInsertRowid);

    assert.throws(() => {
      actionPlan.approveActionItem(blockedItemId, database);
    }, /Consent check failed|No active email/);

    const msgBlocked = database.prepare('SELECT 1 FROM messages WHERE contact_id = ?').get(testCidNoConsent);
    assert.equal(msgBlocked, undefined, 'Blocked send must create no messages row');
  });

  await t.test('Action Item Call/Text Done, Snooze, Skip, and Edit', () => {
    const testCid = createTestContact({
      display_name: 'Actions Client',
      stage: 'showing',
      phone: '+19255550999'
    });

    // 1. Done workflow for Call item
    const resCall = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel,
        draft_subject, draft_body, draft_source, status, created_at
      ) VALUES (?, ?, 'deal_stalled', 'Stalled deal', 'call', 'Points', 'Spoke with buyer', 'template', 'open', ?)
    `).run(planDate, testCid, testNow.toISOString());
    const callItemId = Number(resCall.lastInsertRowid);

    const doneRes = actionPlan.markActionItemDone(callItemId, database);
    assert.equal(doneRes.status, 'done');
    const act = database.prepare('SELECT * FROM activities WHERE contact_id = ? ORDER BY id DESC LIMIT 1').get(testCid);
    assert.equal(act.kind, 'call');

    // 2. Snooze workflow
    const resSnooze = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel, status, created_at
      ) VALUES (?, ?, 'hot_no_touch', 'Hot lead', 'call', 'open', ?)
    `).run(planDate, testCid, testNow.toISOString());
    const snoozeItemId = Number(resSnooze.lastInsertRowid);

    const snoozeRes = actionPlan.snoozeActionItem(snoozeItemId, 2, database);
    assert.equal(snoozeRes.status, 'snoozed');
    assert.ok(snoozeRes.snoozed_until);

    // 3. Skip workflow
    const resSkip = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel, status, created_at
      ) VALUES (?, ?, 'warm_no_touch', 'Warm contact', 'email', 'open', ?)
    `).run(planDate, testCid, testNow.toISOString());
    const skipItemId = Number(resSkip.lastInsertRowid);

    const skipRes = actionPlan.skipActionItem(skipItemId, 'Buyer traveling out of country', database);
    assert.equal(skipRes.status, 'skipped');
    const skippedRow = database.prepare('SELECT * FROM action_items WHERE id = ?').get(skipItemId);
    assert.equal(skippedRow.skip_reason, 'Buyer traveling out of country');

    // 4. Edit Draft workflow (sets edited = 1)
    const resEdit = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel,
        draft_subject, draft_body, draft_source, status, created_at
      ) VALUES (?, ?, 'new_lead', 'Inquiry', 'email', 'Initial Subject', 'Initial Body', 'template', 'open', ?)
    `).run(planDate, testCid, testNow.toISOString());
    const editItemId = Number(resEdit.lastInsertRowid);

    const editRes = actionPlan.editActionItemDraft(editItemId, { subject: 'Customized Subject', body: 'Personalized Body' }, database);
    assert.ok(editRes.ok);
    const editedRow = database.prepare('SELECT * FROM action_items WHERE id = ?').get(editItemId);
    assert.equal(editedRow.edited, 1);
    assert.equal(editedRow.draft_subject, 'Customized Subject');
    assert.equal(editedRow.draft_body, 'Personalized Body');
  });
});

test('Step 9: Gemini AI Integration (Acceptance Tests 14, 15 & 16)', async (t) => {
  const ai = require('../site/lib/ai');
  const actionPlan = require('../site/lib/actionPlan');
  const database = db.getDb();
  const testNow = new Date('2026-11-14T14:00:00.000Z');

  // Clear any residual ai_runs for clean test isolation
  database.prepare('DELETE FROM ai_runs').run();

  // Acceptance Test 14: AI data limits & sanitization
  await t.test('AI data limits & sanitization (AC #14)', async () => {
    const contact = {
      id: 991,
      first_name: 'David',
      last_name: 'Rockefeller',
      display_name: 'David Rockefeller',
      discreet: 0,
      preferences: JSON.stringify({
        interest: 'buyer',
        price_range: '$3.5M-$5M',
        timeline: '1-3 months',
        areas: 'Ruby Hill, Pleasanton'
      })
    };

    const activities = [
      {
        id: 1,
        kind: 'email_in',
        direction: 'in',
        subject: 'Inquiry note about golf course homes',
        occurred_at: '2026-11-10T12:00:00.000Z'
      },
      {
        id: 2,
        kind: 'note',
        direction: null,
        subject: 'Confidential client wealth notes — NEVER SEND THIS',
        occurred_at: '2026-11-11T12:00:00.000Z'
      }
    ];

    const payload = ai.buildSanitizedPayload(
      contact,
      'new_lead',
      'email',
      { reason: 'New lead from portal', last_message: 'Looking for a home on the golf course.' },
      activities
    );

    assert.ok(payload);
    assert.equal(payload.first_name, 'David');
    assert.equal(payload.last_name, undefined);

    const payloadStr = JSON.stringify(payload);
    assert.ok(!payloadStr.includes('Rockefeller'), 'Payload must not contain last name');
    assert.ok(!payloadStr.includes('david@'), 'Payload must not contain email');
    assert.ok(!payloadStr.includes('555'), 'Payload must not contain phone');
    assert.ok(!payloadStr.includes('Confidential client wealth notes'), 'Payload must not contain internal note body');

    assert.equal(payload.preferences.price_range, '$3.5M-$5M');
    assert.equal(payload.preferences.areas, 'Ruby Hill, Pleasanton');

    // Discreet Contact: Must never send anything to model
    const discreetContact = {
      id: 992,
      first_name: 'Celebrity',
      last_name: 'Athlete',
      display_name: 'Celebrity Athlete',
      discreet: 1
    };

    const discreetPayload = ai.buildSanitizedPayload(discreetContact, 'new_lead', 'email');
    assert.equal(discreetPayload, null, 'Discreet contact payload must be null');

    let modelCalled = false;
    const mockClient = {
      models: {
        generateContent: async () => {
          modelCalled = true;
          return { text: '{}' };
        }
      }
    };

    const draft = await ai.draftMessage({
      contact: discreetContact,
      rule: 'new_lead',
      channel: 'email',
      clientOverride: mockClient
    });

    assert.equal(modelCalled, false, 'Model must never be called for discreet contacts');
    assert.equal(draft.source, 'template', 'Discreet contacts must use deterministic template');
    assert.ok(draft.body.includes('Best regards'));
  });

  // Acceptance Test 15: AI output checks (invented price, blocked phrase, valid draft)
  await t.test('AI output validation, anti-hallucination & phrase blocklist (AC #15)', async () => {
    database.prepare('DELETE FROM ai_runs').run();
    const contact = {
      id: 993,
      first_name: 'Sarah',
      display_name: 'Sarah Connor',
      discreet: 0,
      preferences: JSON.stringify({
        interest: 'buyer',
        price_range: '$2.5M-$3M',
        areas: 'Pleasanton'
      })
    };

    // 1. Invented price check: Model hallucinates a price not in the prompt
    let callCount = 0;
    const mockInventedPrice = {
      models: {
        generateContent: async () => {
          callCount++;
          return {
            text: JSON.stringify({
              subject: 'Pleasanton market update',
              body: 'I found a gorgeous home for $6,200,000 near downtown that would be ideal for you.'
            }),
            usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 40 }
          };
        }
      }
    };

    const draftBlockedPrice = await ai.draftMessage({
      contact,
      rule: 'new_lead',
      channel: 'email',
      clientOverride: mockInventedPrice,
      dbInstance: database
    });

    assert.equal(callCount, 2, 'Should retry once on output check failure');
    assert.equal(draftBlockedPrice.source, 'template', 'Blocked output must fallback to template');

    const blockedRun = database.prepare(`
      SELECT * FROM ai_runs WHERE contact_id = 993 AND status = 'blocked' ORDER BY id DESC LIMIT 1
    `).get();
    assert.ok(blockedRun, 'Audit log must record blocked status');
    assert.ok(blockedRun.error.includes('unprompted dollar amount'));

    // 2. Blocked phrase check: Model outputs steering / superlatives / Fair Housing terms
    const mockBlockedPhrase = {
      models: {
        generateContent: async () => {
          return {
            text: JSON.stringify({
              subject: 'Exclusive neighborhood opportunity',
              body: 'This enclave is very safe with the best schools and a family-friendly atmosphere.'
            }),
            usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 40 }
          };
        }
      }
    };

    const draftBlockedPhrase = await ai.draftMessage({
      contact,
      rule: 'new_lead',
      channel: 'email',
      clientOverride: mockBlockedPhrase,
      dbInstance: database
    });

    assert.equal(draftBlockedPhrase.source, 'template');
    const blockedPhraseRun = database.prepare(`
      SELECT * FROM ai_runs WHERE contact_id = 993 AND status = 'blocked' ORDER BY id DESC LIMIT 1
    `).get();
    assert.ok(blockedPhraseRun);
    assert.ok(blockedPhraseRun.error.includes('blocked phrase'));

    // 3. Valid compliant draft: Passes all checks and returns gemini source
    const mockValid = {
      models: {
        generateContent: async () => {
          return {
            text: JSON.stringify({
              subject: 'Following up on your Pleasanton search',
              body: 'Hi Sarah, I saw your interest in Pleasanton properties in the $2.5M-$3M range. Would later this week work for a brief call to discuss off-market opportunities?'
            }),
            usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 50 }
          };
        }
      }
    };

    const draftValid = await ai.draftMessage({
      contact,
      rule: 'new_lead',
      channel: 'email',
      clientOverride: mockValid,
      dbInstance: database
    });

    assert.equal(draftValid.source, 'gemini', 'Compliant draft must have source gemini');
    assert.equal(draftValid.subject, 'Following up on your Pleasanton search');
    assert.ok(draftValid.body.includes('Hi Sarah'));

    const successRun = database.prepare(`
      SELECT * FROM ai_runs WHERE contact_id = 993 AND status = 'success' ORDER BY id DESC LIMIT 1
    `).get();
    assert.ok(successRun);
    assert.equal(successRun.input_tokens, 200);
    assert.equal(successRun.output_tokens, 50);
    assert.ok(successRun.cost_usd > 0);
  });

  // Acceptance Test 16: Budget cap enforcement & Today banner
  await t.test('Monthly budget cap enforcement & Today banner (AC #16)', async () => {
    // 1. Seed ai_runs with spend exceeding the monthly cap
    const nowIso = testNow.toISOString();
    database.prepare(`
      INSERT INTO ai_runs (
        purpose, prompt_version, model, contact_id, input_json,
        output_text, input_tokens, output_tokens, cost_usd, status, created_at
      ) VALUES ('action_item_draft', 'draft-v1', 'gemini-2.5-flash', 1, '{}', 'text', 100000, 50000, 26.50, 'success', ?)
    `).run(nowIso);

    // Verify isOverBudget returns true
    assert.equal(ai.isOverBudget(database, testNow), true);

    // 2. Attempt to draft message when over budget
    let modelCalled = false;
    const mockClient = {
      models: {
        generateContent: async () => {
          modelCalled = true;
          return { text: '{}' };
        }
      }
    };

    const contact = { id: 994, first_name: 'BudgetTest', discreet: 0 };
    const draft = await ai.draftMessage({
      contact,
      rule: 'new_lead',
      channel: 'email',
      clientOverride: mockClient,
      dbInstance: database
    });

    assert.equal(modelCalled, false, 'No model call must be made when spend is at or over cap');
    assert.equal(draft.source, 'template', 'Must fallback to template when over budget');

    const overBudgetRun = database.prepare(`
      SELECT * FROM ai_runs WHERE contact_id = 994 AND status = 'over_budget' ORDER BY id DESC LIMIT 1
    `).get();
    assert.ok(overBudgetRun);
    assert.equal(overBudgetRun.cost_usd, 0);

    // 3. Verify Today overview includes the budget banner
    const overview = await actionPlan.getTodayOverview(database, testNow);
    assert.ok(overview.banners.some(b => b.type === 'ai_budget'), 'Today overview must show AI budget banner');
  });

  // Redrafting Action Items (Max 3 redrafts)
  await t.test('Redraft action item workflow & 3-attempt limit', async () => {
    // Clear residual test spend from ai_runs to allow mock redrafts under budget
    database.prepare('DELETE FROM ai_runs').run();

    const planDate = actionPlan.getPlanDate(testNow);
    const cRes = database.prepare(`
      INSERT INTO contacts (first_name, display_name, type, stage, created_at, updated_at)
      VALUES ('Redraft', 'Redraft User', 'lead', 'new', ?, ?)
    `).run(testNow.toISOString(), testNow.toISOString());
    const testCid = Number(cRes.lastInsertRowid);

    const itemRes = database.prepare(`
      INSERT INTO action_items (
        plan_date, contact_id, rule, reason, channel,
        draft_subject, draft_body, draft_source, status, created_at
      ) VALUES (?, ?, 'new_lead', 'Inquiry', 'email', 'Old Subject', 'Old Body', 'template', 'open', ?)
    `).run(planDate, testCid, testNow.toISOString());
    const itemId = Number(itemRes.lastInsertRowid);

    let redraftCounter = 0;
    const mockRedraft = {
      models: {
        generateContent: async () => {
          redraftCounter++;
          return {
            text: JSON.stringify({
              subject: `Redraft Attempt ${redraftCounter}`,
              body: `Hello, this is regenerated draft version ${redraftCounter}.`
            }),
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 30 }
          };
        }
      }
    };

    // Attempt 1: Success
    const r1 = await ai.redraftActionItem(itemId, database, mockRedraft);
    assert.equal(r1.draft_source, 'gemini');
    assert.equal(r1.draft_subject, 'Redraft Attempt 1');

    // Attempt 2: Success
    const r2 = await ai.redraftActionItem(itemId, database, mockRedraft);
    assert.equal(r2.draft_subject, 'Redraft Attempt 2');

    // Attempt 3: Success
    const r3 = await ai.redraftActionItem(itemId, database, mockRedraft);
    assert.equal(r3.draft_subject, 'Redraft Attempt 3');

    // Attempt 4: Should throw REDRAFT_LIMIT
    await assert.rejects(async () => {
      await ai.redraftActionItem(itemId, database, mockRedraft);
    }, /Maximum of 3 redrafts reached/);
  });
});

test('Step 10: Contact Merge & Privacy Export/Delete (Acceptance Tests 6 & 9)', async (t) => {
  const database = db.getDb();
  const testNow = new Date('2026-11-14T15:00:00.000Z');

  // Acceptance Test 6: Contact Merge
  await t.test('Contact Merge: Ownership re-assignment, consent precedence & score update (AC #6)', () => {
    const tIso = testNow.toISOString();
    const suffix = Date.now();
    const emailA = `alice_survivor_${suffix}@test.com`;
    const phoneB = `+1925555${String(suffix).slice(-4)}`;

    // 1. Create Contact A (Survivor)
    const cARes = database.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, type, stage, notes, created_at, updated_at)
      VALUES ('Alice', 'Survivor', 'Alice Survivor', 'lead', 'contacted', 'Alice primary notes', ?, ?)
    `).run(tIso, tIso);
    const idA = Number(cARes.lastInsertRowid);

    database.prepare(`
      INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
      VALUES (?, 'email', ?, 1, 'ok')
    `).run(idA, emailA);

    database.prepare(`
      INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
      VALUES (?, 'email_marketing', 1, '2026-11-v1', 'web', '2026-11-14T10:00:00.000Z')
    `).run(idA);

    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, occurred_at, created_at)
      VALUES (?, 'call', 'out', 'Call with Alice', '2026-11-14T10:00:00.000Z', ?)
    `).run(idA, tIso);

    database.prepare(`
      INSERT INTO tasks (contact_id, title, due_at, created_at)
      VALUES (?, 'Alice follow-up task', '2026-11-16T10:00:00.000Z', ?)
    `).run(idA, tIso);

    database.prepare(`
      INSERT INTO deals (contact_id, pipeline_id, stage_id, title, stage_changed_at, created_at, updated_at)
      VALUES (?, 1, 1, 'Alice Purchase Deal', ?, ?, ?)
    `).run(idA, tIso, tIso, tIso);

    // 2. Create Contact B (Other / Merged into A)
    const cBRes = database.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, type, stage, notes, interest, budget, created_at, updated_at)
      VALUES ('Bob', 'Other', 'Bob Other', 'lead', 'new', 'Bob secondary notes', 'buyer', '$2M-$3M', ?, ?)
    `).run(tIso, tIso);
    const idB = Number(cBRes.lastInsertRowid);

    database.prepare(`
      INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
      VALUES (?, 'phone', ?, 1, 'ok')
    `).run(idB, phoneB);

    // Later consent: withdrawn at 11:00 AM
    database.prepare(`
      INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
      VALUES (?, 'email_marketing', 0, '2026-11-v1', 'unsubscribe', '2026-11-14T11:00:00.000Z')
    `).run(idB);

    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, occurred_at, created_at)
      VALUES (?, 'email_in', 'in', 'Inquiry note from Bob', '2026-11-14T11:00:00.000Z', ?)
    `).run(idB, tIso);

    database.prepare(`
      INSERT INTO tasks (contact_id, title, due_at, created_at)
      VALUES (?, 'Bob staging task', '2026-11-18T10:00:00.000Z', ?)
    `).run(idB, tIso);

    database.prepare(`
      INSERT INTO deals (contact_id, pipeline_id, stage_id, title, stage_changed_at, created_at, updated_at)
      VALUES (?, 1, 2, 'Bob Townhouse Deal', ?, ?, ?)
    `).run(idB, tIso, tIso, tIso);

    // 3. Execute Merge B -> A
    const mergeRes = db.adminMergeContacts(idA, idB, database);
    assert.ok(mergeRes.ok);
    assert.equal(mergeRes.survivor_id, idA);
    assert.equal(mergeRes.merged_id, idB);

    // 4. Assertions:
    // Activities belong to survivor A
    const actsA = database.prepare('SELECT * FROM activities WHERE contact_id = ?').all(idA);
    assert.ok(actsA.some(a => a.subject === 'Call with Alice'));
    assert.ok(actsA.some(a => a.subject === 'Inquiry note from Bob'));
    assert.ok(actsA.some(a => a.subject === 'Merged contact record'));

    const actsB = database.prepare('SELECT * FROM activities WHERE contact_id = ?').all(idB);
    assert.equal(actsB.length, 0, 'No activities should remain assigned to merged contact');

    // Deals belong to survivor A
    const dealsA = database.prepare('SELECT * FROM deals WHERE contact_id = ?').all(idA);
    assert.equal(dealsA.length, 2, 'Survivor must own both deals');
    const dealsB = database.prepare('SELECT * FROM deals WHERE contact_id = ?').all(idB);
    assert.equal(dealsB.length, 0);

    // Tasks belong to survivor A
    const tasksA = database.prepare('SELECT * FROM tasks WHERE contact_id = ?').all(idA);
    assert.equal(tasksA.length, 2, 'Survivor must own both tasks');

    // Phone transferred to survivor A
    const idnsA = database.prepare('SELECT * FROM contact_identities WHERE contact_id = ?').all(idA);
    assert.ok(idnsA.some(i => i.kind === 'phone' && i.value === phoneB));

    // Consents: latest consent is the withdrawn row (11:00 AM)
    const latestConsent = database.prepare(`
      SELECT * FROM consents WHERE contact_id = ? AND channel = 'email_marketing' ORDER BY recorded_at DESC LIMIT 1
    `).get(idA);
    assert.equal(latestConsent.granted, 0, 'Survivor latest consent must be the newest record');

    // Notes merged
    const survivorRecord = db.adminGetContact(idA, database);
    assert.ok(survivorRecord.notes.includes('Alice primary notes'));
    assert.ok(survivorRecord.notes.includes('Bob secondary notes'));

    // Contact B marked as merged_into A
    const mergedRecord = database.prepare('SELECT * FROM contacts WHERE id = ?').get(idB);
    assert.equal(mergedRecord.merged_into, idA);
  });

  // Acceptance Test 9: Privacy Export & Permanent Deletion
  await t.test('Privacy Export & Permanent Delete (AC #9)', () => {
    const tIso = testNow.toISOString();
    const suffix = Date.now();
    const privEmail = `privacy_${suffix}@test.com`;
    // 1. Create a contact with full records
    const cRes = database.prepare(`
      INSERT INTO contacts (first_name, last_name, display_name, type, stage, created_at, updated_at)
      VALUES ('Privacy', 'Subject', 'Privacy Subject', 'lead', 'contacted', ?, ?)
    `).run(tIso, tIso);
    const cId = Number(cRes.lastInsertRowid);

    database.prepare(`
      INSERT INTO contact_identities (contact_id, kind, value, is_primary, status)
      VALUES (?, 'email', ?, 1, 'ok')
    `).run(cId, privEmail);

    database.prepare(`
      INSERT INTO consents (contact_id, channel, granted, text_version, source, recorded_at)
      VALUES (?, 'email_marketing', 1, '2026-11-v1', 'web', ?)
    `).run(cId, tIso);

    database.prepare(`
      INSERT INTO activities (contact_id, kind, direction, subject, occurred_at, created_at)
      VALUES (?, 'form', 'in', 'Contact Us Form', ?, ?)
    `).run(cId, tIso, tIso);

    database.prepare(`
      INSERT INTO messages (contact_id, channel, to_value, subject, body, origin, status, approved_at, created_at)
      VALUES (?, 'email', 'test@test.com', 'Welcome Note', 'Body content', 'manual', 'delivered', ?, ?)
    `).run(cId, tIso, tIso);

    database.prepare(`
      INSERT INTO tasks (contact_id, title, due_at, created_at)
      VALUES (?, 'Privacy client task', '2026-11-20T10:00:00.000Z', ?)
    `).run(cId, tIso);

    database.prepare(`
      INSERT INTO deals (contact_id, pipeline_id, stage_id, title, stage_changed_at, created_at, updated_at)
      VALUES (?, 1, 1, 'Privacy Deal', ?, ?, ?)
    `).run(cId, tIso, tIso, tIso);

    database.prepare(`
      INSERT INTO leads (contact_id, lead_id, name, email, status, received_at)
      VALUES (?, ?, 'Privacy Subject', ?, 'contacted', ?)
    `).run(cId, 'lead_' + suffix, privEmail, tIso);

    // 2. Export contact
    const exported = db.adminExportContact(cId, database);
    assert.ok(exported);
    assert.equal(exported.contact.display_name, 'Privacy Subject');
    assert.equal(exported.identities.length, 1);
    assert.equal(exported.consents.length, 1);
    assert.equal(exported.activities.length, 1);
    assert.equal(exported.messages.length, 1);
    assert.equal(exported.tasks.length, 1);
    assert.equal(exported.deals.length, 1);
    assert.equal(exported.linked_leads.length, 1);

    // 3. Permanent Delete
    const delRes = db.adminDeleteContact(cId, database);
    assert.ok(delRes.ok);
    assert.equal(delRes.deleted_id, cId);

    // 4. Verify ZERO rows remain in any table referring to this contact
    assert.equal(database.prepare('SELECT 1 FROM contacts WHERE id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM contact_identities WHERE contact_id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM consents WHERE contact_id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM activities WHERE contact_id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM messages WHERE contact_id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM tasks WHERE contact_id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM deals WHERE contact_id = ?').get(cId), undefined);
    assert.equal(database.prepare('SELECT 1 FROM leads WHERE contact_id = ?').get(cId), undefined);
  });
});

test('Step 11: Route Security & Performance Benchmark (Acceptance Tests 17 & 19)', async (t) => {
  const database = db.getDb();
  const actionPlan = require('../site/lib/actionPlan');

  // Acceptance Test 17: Route Security (Auth 401 & CSRF 403 Header enforcement)
  await t.test('Route Security: 401 without session and 403 without header (AC #17)', async () => {
    const adminApi = require('../site/api/admin');
    const { EventEmitter } = require('node:events');
    const crypto = require('node:crypto');

    function createMockReqRes({ method = 'GET', route = '/contacts', cookie = '', headers = {} }) {
      const req = new EventEmitter();
      req.method = method;
      req.url = route;
      req.headers = Object.assign({
        cookie,
        host: 'localhost'
      }, headers);

      let statusCode = 0;
      let responseBody = '';
      const res = {
        writeHead: (code, hdrs) => { statusCode = code; },
        setHeader: () => {},
        end: (data) => { responseBody = data; }
      };

      return { req, res, getStatus: () => statusCode, getBody: () => responseBody };
    }

    // 1. Unauthenticated request to /api/admin/contacts -> 401
    const t1 = createMockReqRes({ method: 'GET', route: '/api/admin/contacts', cookie: '' });
    await adminApi.handleAdminApi(t1.req, t1.res, new URL('http://localhost/api/admin/contacts'), '127.0.0.1');
    assert.equal(t1.getStatus(), 401, 'Unauthenticated request must return 401');

    // 2. Unauthenticated request to /api/admin/today -> 401
    const t2 = createMockReqRes({ method: 'GET', route: '/api/admin/today', cookie: '' });
    await adminApi.handleAdminApi(t2.req, t2.res, new URL('http://localhost/api/admin/today'), '127.0.0.1');
    assert.equal(t2.getStatus(), 401, 'Unauthenticated request to /today must return 401');

    // 3. Authenticated request with session
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    db.createSession(tokenHash, 86400000, '127.0.0.1');
    const authCookie = `sl_admin=${rawToken}`;

    // Valid session GET request -> 200
    const t3 = createMockReqRes({ method: 'GET', route: '/api/admin/today', cookie: authCookie });
    await adminApi.handleAdminApi(t3.req, t3.res, new URL('http://localhost/api/admin/today'), '127.0.0.1');
    assert.equal(t3.getStatus(), 200, 'Authenticated request must succeed with 200');

    // 4. Mutation POST without X-SL-Admin header -> 403
    const t4 = createMockReqRes({ method: 'POST', route: '/api/admin/action-plan/generate', cookie: authCookie, headers: {} });
    await adminApi.handleAdminApi(t4.req, t4.res, new URL('http://localhost/api/admin/action-plan/generate'), '127.0.0.1');
    assert.equal(t4.getStatus(), 403, 'Mutation without X-SL-Admin: 1 header must return 403');

    // 5. Mutation POST with X-SL-Admin header -> 200
    const t5 = createMockReqRes({ method: 'POST', route: '/api/admin/action-plan/generate', cookie: authCookie, headers: { 'x-sl-admin': '1' } });
    await adminApi.handleAdminApi(t5.req, t5.res, new URL('http://localhost/api/admin/action-plan/generate'), '127.0.0.1');
    assert.equal(t5.getStatus(), 200, 'Mutation with X-SL-Admin header must succeed with 200');

    // Clean up session
    db.deleteSession(tokenHash);
  });

  // Acceptance Test 19: Performance Benchmark (5,000 contacts & 50,000 activities)
  await t.test('Performance: Contacts list and Today load under 500ms with 5,000 contacts & 50,000 activities (AC #19)', async () => {
    const nowIso = new Date().toISOString();
    let firstInsertedCId = 0;
    let firstInsertedAId = 0;

    // Seed 5,000 contacts in bulk inside a transaction
    database.exec('BEGIN IMMEDIATE');
    try {
      const stmtC = database.prepare(`
        INSERT INTO contacts (first_name, last_name, display_name, type, stage, score, score_band, created_at, updated_at)
        VALUES (?, ?, ?, 'lead', 'contacted', 50, 'warm', ?, ?)
      `);
      for (let i = 0; i < 5000; i++) {
        const res = stmtC.run(`BenchFirst${i}`, `BenchLast${i}`, `Bench Contact ${i}`, nowIso, nowIso);
        if (i === 0) firstInsertedCId = Number(res.lastInsertRowid);
      }

      // Seed 50,000 activities in bulk (10 per contact for the 5,000 contacts)
      const stmtA = database.prepare(`
        INSERT INTO activities (contact_id, kind, direction, subject, occurred_at, created_at)
        VALUES (?, 'call', 'out', 'Benchmark activity record', ?, ?)
      `);
      for (let i = 0; i < 50000; i++) {
        const cId = firstInsertedCId + (i % 5000);
        const res = stmtA.run(cId, nowIso, nowIso);
        if (i === 0) firstInsertedAId = Number(res.lastInsertRowid);
      }
      database.exec('COMMIT');
    } catch (err) {
      try { database.exec('ROLLBACK'); } catch (_) {}
      throw err;
    }

    // 1. Measure Contacts query performance
    const startContacts = performance.now();
    const contactsResult = db.adminListContacts({ limit: 50, offset: 0 });
    const durationContacts = performance.now() - startContacts;

    assert.ok(contactsResult.contacts.length > 0);
    assert.ok(durationContacts < 500, `Contacts list query took ${durationContacts.toFixed(1)}ms (must be < 500ms)`);

    // 2. Measure Today overview performance
    const startToday = performance.now();
    const todayResult = await actionPlan.getTodayOverview(database);
    const durationToday = performance.now() - startToday;

    assert.ok(todayResult.ok);
    assert.ok(durationToday < 500, `Today screen overview took ${durationToday.toFixed(1)}ms (must be < 500ms)`);

    // Clean up seeded benchmark rows to keep test DB compact
    database.exec('BEGIN IMMEDIATE');
    try {
      if (firstInsertedAId) database.prepare('DELETE FROM activities WHERE id >= ?').run(firstInsertedAId);
      if (firstInsertedCId) database.prepare('DELETE FROM contacts WHERE id >= ?').run(firstInsertedCId);
      database.exec('COMMIT');
    } catch (_) {
      try { database.exec('ROLLBACK'); } catch (_) {}
    }
  });
});


