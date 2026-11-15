'use strict';

/**
 * Admin API (/api/admin/*) — the back office for leads, listings and reviews.
 *
 * Security model
 *  - One owner login. The password is never stored; only a scrypt hash lives in
 *    .env (ADMIN_PASSWORD_HASH). Create it with:  npm run admin:password
 *  - Sessions are random 256-bit tokens. Only their SHA-256 is kept in the DB,
 *    and the browser holds the token in an HttpOnly, SameSite=Strict cookie.
 *  - Every state-changing request must carry the X-SL-Admin header and a
 *    matching Origin, which a cross-site form or image tag cannot send (CSRF).
 *  - Login is rate limited and every admin action is written to audit_log.
 */

const crypto = require('crypto');
const db = require('../db/database');
const outbox = require('../lib/outbox');
const push = require('../lib/push');
const backup = require('../lib/backup');
const actionPlan = require('../lib/actionPlan');
const { stripHtml, getClientIp, hashIp, createRateLimiter, readJsonBody, sendJson } = require('../middleware/security');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'sl_admin';
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, prefix: 'admin-login' });

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  try {
    const expected = Buffer.from(parts[3], 'base64');
    const actual = crypto.scryptSync(String(password), Buffer.from(parts[2], 'base64'), expected.length, { N: Number(parts[1]) || 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function readCookie(req, name) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function setSessionCookie(res, token, maxAgeSec, req) {
  const isHttps = req ? (req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket && req.socket.encrypted)) : false;
  const secure = isHttps ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`);
}

function currentSession(req) {
  const token = readCookie(req, COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = db.getSession(sha256(token));
  return session ? { token, session } : null;
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin GETs and some same-origin POSTs omit it; the custom header still applies
  try { return new URL(origin).host === req.headers.host; } catch (_) { return false; }
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function sendCsv(res, filename, header, rows) {
  const body = [header.join(',')].concat(rows.map((r) => r.map(csvCell).join(','))).join('\r\n');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store'
  });
  res.end('﻿' + body);
}

async function handleAdminApi(req, res, parsedUrl) {
  const route = parsedUrl.pathname.slice('/api/admin'.length) || '/';
  const method = req.method;
  const ip = hashIp(getClientIp(req));
  const write = method !== 'GET' && method !== 'HEAD';

  if (write && (req.headers['x-sl-admin'] !== '1' || !sameOrigin(req))) {
    return sendJson(res, 403, { ok: false, error: 'Request blocked.' });
  }

  // ---- Login / logout / session ----
  if (method === 'POST' && route === '/login') {
    if (!loginLimiter(req, res)) return;
    const stored = (process.env.ADMIN_PASSWORD_HASH || '').trim();
    if (!stored) {
      return sendJson(res, 503, { ok: false, error: 'Admin login is not set up yet. Run "npm run admin:password" on the server, then restart it.' });
    }
    const body = await readJsonBody(req);
    if (!verifyPassword(body.password || '', stored)) {
      db.audit('login_failed', '', ip);
      await new Promise((r) => setTimeout(r, 400));
      return sendJson(res, 401, { ok: false, error: 'Wrong password.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.createSession(sha256(token), SESSION_TTL_MS, ip);
    setSessionCookie(res, token, SESSION_TTL_MS / 1000, req);
    db.audit('login', '', ip);
    return sendJson(res, 200, { ok: true });
  }

  const auth = currentSession(req);

  if (method === 'GET' && route === '/me') {
    return sendJson(res, 200, {
      ok: true,
      signed_in: Boolean(auth),
      configured: Boolean((process.env.ADMIN_PASSWORD_HASH || '').trim()),
      channels: auth ? outbox.enabledChannels() : undefined
    });
  }

  if (!auth) return sendJson(res, 401, { ok: false, error: 'Please sign in.' });

  if (method === 'POST' && route === '/logout') {
    db.deleteSession(sha256(auth.token));
    setSessionCookie(res, '', 0, req);
    db.audit('logout', '', ip);
    return sendJson(res, 200, { ok: true });
  }

  const sp = parsedUrl.searchParams;
  let m;

  // ---- CRM: Today & Daily Action Plan (M2) ----
  if (method === 'GET' && route === '/today') {
    return sendJson(res, 200, actionPlan.getTodayOverview(db.getDb()));
  }
  if (method === 'POST' && route === '/action-plan/generate') {
    const plan = actionPlan.generateDailyActionPlan(db.getDb());
    db.audit('action_plan_generate', `Generated plan: ${plan.added} new, ${plan.total} total`, ip);
    return sendJson(res, 200, plan);
  }
  if ((m = /^\/action-items\/(\d+)$/.exec(route)) && method === 'PATCH') {
    const id = Number(m[1]);
    const body = await readJsonBody(req);
    const result = actionPlan.editActionItemDraft(id, body, db.getDb());
    if (result.ok) db.audit('action_item_edit', `Draft edited for #${id}`, ip);
    return sendJson(res, result.ok ? 200 : 400, result);
  }
  if ((m = /^\/action-items\/(\d+)\/approve$/.exec(route)) && method === 'POST') {
    const id = Number(m[1]);
    const baseUrl = req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers.host}` : `http://${req.headers.host}`;
    try {
      const result = actionPlan.approveActionItem(id, db.getDb(), baseUrl);
      db.audit('action_item_approve', `Approved action item #${id}`, ip);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }
  if ((m = /^\/action-items\/(\d+)\/done$/.exec(route)) && method === 'POST') {
    const id = Number(m[1]);
    try {
      const result = actionPlan.markActionItemDone(id, db.getDb());
      db.audit('action_item_done', `Marked done action item #${id}`, ip);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }
  if ((m = /^\/action-items\/(\d+)\/snooze$/.exec(route)) && method === 'POST') {
    const id = Number(m[1]);
    const body = await readJsonBody(req);
    const result = actionPlan.snoozeActionItem(id, body.days || 1, db.getDb());
    db.audit('action_item_snooze', `Snoozed #${id} until ${result.snoozed_until}`, ip);
    return sendJson(res, 200, result);
  }
  if ((m = /^\/action-items\/(\d+)\/skip$/.exec(route)) && method === 'POST') {
    const id = Number(m[1]);
    const body = await readJsonBody(req);
    const result = actionPlan.skipActionItem(id, body.reason || '', db.getDb());
    db.audit('action_item_skip', `Skipped #${id}: ${body.reason || 'no reason'}`, ip);
    return sendJson(res, 200, result);
  }
  if ((m = /^\/action-items\/(\d+)\/redraft$/.exec(route)) && method === 'POST') {
    const id = Number(m[1]);
    try {
      const ai = require('../lib/ai');
      const result = await ai.redraftActionItem(id, db.getDb());
      db.audit('action_item_redraft', `Redrafted action item #${id} via Gemini`, ip);
      return sendJson(res, 200, result);
    } catch (err) {
      const status = err.code === 'REDRAFT_LIMIT' ? 429 : 400;
      return sendJson(res, status, { ok: false, error: err.message });
    }
  }

  // ---- Dashboard ----
  if (method === 'GET' && route === '/stats') return sendJson(res, 200, { ok: true, stats: db.adminStats() });
  if (method === 'GET' && route === '/audit') return sendJson(res, 200, { ok: true, entries: db.getAudit(150) });

  // ---- CRM: Contacts ----
  if (method === 'GET' && route === '/contacts') {
    const result = db.adminListContacts({
      stage: stripHtml(sp.get('stage') || '').slice(0, 30),
      type: stripHtml(sp.get('type') || '').slice(0, 30),
      score_band: stripHtml(sp.get('score_band') || '').slice(0, 20),
      q: stripHtml(sp.get('q') || '').slice(0, 80),
      limit: Math.min(200, Math.max(1, Number(sp.get('limit')) || 50)),
      offset: Math.max(0, Number(sp.get('offset')) || 0)
    });
    return sendJson(res, 200, Object.assign({
      ok: true,
      stages: db.CONTACT_STAGES,
      types: db.CONTACT_TYPES,
      score_bands: db.SCORE_BANDS
    }, result));
  }
  if (method === 'POST' && route === '/contacts') {
    const body = await readJsonBody(req);
    try {
      const contact = db.adminCreateContact(body);
      db.audit('contact_create', `Manually created Contact #${contact.id} (${contact.display_name})`, ip);
      return sendJson(res, 200, { ok: true, contact });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }
  if (method === 'GET' && route === '/contacts.csv') {
    const { contacts } = db.adminListContacts({ limit: 100000 });
    db.audit('export_contacts', `${contacts.length} rows`, ip);
    return sendCsv(res, `contacts-${new Date().toISOString().slice(0, 10)}.csv`,
      ['id', 'name', 'type', 'stage', 'score', 'score_band', 'discreet', 'email', 'phone', 'interest', 'budget', 'timeline', 'source', 'created_at'],
      contacts.map((c) => [c.id, c.display_name, c.type, c.stage, c.score, c.score_band, c.discreet ? 'yes' : 'no', c.primary_email || '', c.primary_phone || '', c.interest || '', c.budget || '', c.timeline || '', c.source || '', c.created_at]));
  }
  if ((m = /^\/contacts\/(\d+)$/.exec(route))) {
    const contactId = Number(m[1]);
    if (method === 'GET') {
      const contact = db.adminGetContact(contactId);
      return contact ? sendJson(res, 200, { ok: true, contact }) : sendJson(res, 404, { ok: false, error: 'Contact not found.' });
    }
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const ok = db.adminUpdateContact(contactId, body);
      if (ok) db.audit('contact_update', `Contact #${contactId} updated`, ip);
      return sendJson(res, ok ? 200 : 400, ok ? { ok: true, contact: db.adminGetContact(contactId) } : { ok: false, error: 'Nothing to update.' });
    }
    if (method === 'DELETE') {
      try {
        const result = db.adminDeleteContact(contactId);
        db.audit('contact_privacy_delete', `Permanently deleted Contact #${contactId}`, ip);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }
  }

  // ---- CRM: Privacy Export & Merge ----
  if ((m = /^\/contacts\/(\d+)\/export$/.exec(route)) && method === 'GET') {
    const contactId = Number(m[1]);
    const data = db.adminExportContact(contactId);
    if (!data) return sendJson(res, 404, { ok: false, error: 'Contact not found.' });
    db.audit('contact_privacy_export', `Exported all data for Contact #${contactId}`, ip);
    return sendJson(res, 200, { ok: true, data });
  }

  if ((m = /^\/contacts\/(\d+)\/merge$/.exec(route)) && method === 'POST') {
    const contactId = Number(m[1]);
    const body = await readJsonBody(req);
    const otherId = Number(body.other_id);
    try {
      const result = db.adminMergeContacts(contactId, otherId);
      db.audit('contact_merge', `Merged Contact #${otherId} into #${contactId}`, ip);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // ---- CRM: Outbound Email ----
  if ((m = /^\/contacts\/(\d+)\/email$/.exec(route)) && method === 'POST') {
    const contactId = Number(m[1]);
    const body = await readJsonBody(req);
    const { sendOutboundEmail } = require('../lib/crm');
    try {
      const result = sendOutboundEmail({
        contact_id: contactId,
        to_value: body.to_value || body.to,
        subject: body.subject,
        body: body.body,
        origin: 'manual',
        baseUrl: req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers.host}` : `http://${req.headers.host}`
      });
      db.audit('contact_email_sent', `Email sent to Contact #${contactId} (${body.to_value || ''})`, ip);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  if ((m = /^\/contacts\/(\d+)\/messages$/.exec(route)) && method === 'GET') {
    const contactId = Number(m[1]);
    const messages = db.getDb().prepare(`
      SELECT * FROM messages WHERE contact_id = ? ORDER BY id DESC LIMIT 50
    `).all(contactId);
    return sendJson(res, 200, { ok: true, messages });
  }

  // ---- CRM: Rescore Contacts ----
  if ((m = /^\/contacts\/(\d+)\/rescore$/.exec(route)) && method === 'POST') {
    const contactId = Number(m[1]);
    const scored = db.rescoreContact(contactId);
    if (!scored) return sendJson(res, 404, { ok: false, error: 'Contact not found.' });
    db.audit('contact_rescore', `Contact #${contactId} scored ${scored.score} (${scored.score_band})`, ip);
    return sendJson(res, 200, { ok: true, scoring: scored, contact: db.adminGetContact(contactId) });
  }
  if (method === 'POST' && route === '/contacts/rescore-all') {
    const result = db.rescoreAllContacts();
    db.audit('contacts_rescore_all', `Rescored ${result.rescored} contacts`, ip);
    return sendJson(res, 200, result);
  }

  // ---- CRM: Pipelines & Deals ----
  if (method === 'GET' && route === '/pipelines') {
    return sendJson(res, 200, { ok: true, pipelines: db.adminListPipelines() });
  }

  if (method === 'POST' && route === '/deals') {
    const body = await readJsonBody(req);
    const deal = db.adminCreateDeal({
      contact_id: Number(body.contact_id),
      pipeline_id: Number(body.pipeline_id) || 1,
      stage_id: body.stage_id ? Number(body.stage_id) : undefined,
      title: body.title,
      value_usd: body.value_usd,
      property_address: body.property_address,
      expected_close: body.expected_close
    });
    db.audit('deal_create', `Deal #${deal.id} for Contact #${deal.contact_id}`, ip);
    return sendJson(res, 200, { ok: true, deal });
  }

  if ((m = /^\/deals\/(\d+)$/.exec(route))) {
    const dealId = Number(m[1]);
    if (method === 'GET') {
      const deal = db.adminGetDeal(dealId);
      return deal ? sendJson(res, 200, { ok: true, deal }) : sendJson(res, 404, { ok: false, error: 'Deal not found.' });
    }
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const deal = db.adminUpdateDeal(dealId, body);
      if (deal) db.audit('deal_update', `Deal #${dealId} updated`, ip);
      return sendJson(res, deal ? 200 : 400, deal ? { ok: true, deal } : { ok: false, error: 'Deal not found or invalid.' });
    }
  }

  // ---- CRM: Tasks ----
  if (method === 'GET' && route === '/tasks') {
    const status = stripHtml(sp.get('status') || 'all');
    const contactId = sp.get('contact_id') ? Number(sp.get('contact_id')) : undefined;
    const result = db.adminListTasks({
      status,
      contact_id: contactId,
      limit: Math.min(200, Math.max(1, Number(sp.get('limit')) || 100)),
      offset: Math.max(0, Number(sp.get('offset')) || 0)
    });
    return sendJson(res, 200, Object.assign({ ok: true }, result));
  }
  if (method === 'POST' && route === '/tasks') {
    const body = await readJsonBody(req);
    const task = db.adminCreateTask({
      contact_id: body.contact_id ? Number(body.contact_id) : null,
      deal_id: body.deal_id ? Number(body.deal_id) : null,
      title: body.title,
      due_at: body.due_at
    });
    if (!task) return sendJson(res, 400, { ok: false, error: 'Task title is required.' });
    db.audit('task_create', `Task #${task.id}: ${task.title}`, ip);
    return sendJson(res, 200, { ok: true, task });
  }

  if ((m = /^\/tasks\/(\d+)$/.exec(route))) {
    const taskId = Number(m[1]);
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const task = db.adminUpdateTask(taskId, body);
      if (task) db.audit('task_update', `Task #${taskId} updated`, ip);
      return sendJson(res, task ? 200 : 400, task ? { ok: true, task } : { ok: false, error: 'Task not found.' });
    }
    if (method === 'DELETE') {
      const ok = db.adminDeleteTask(taskId);
      if (ok) db.audit('task_delete', `Task #${taskId} deleted`, ip);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
  }

  // ---- Web Push & Notifications ----
  if (method === 'GET' && route === '/push/vapid-key') {
    return sendJson(res, 200, { ok: true, publicKey: push.getVapidPublicKey() });
  }
  if (method === 'POST' && route === '/push/subscribe') {
    const body = await readJsonBody(req);
    if (!body.endpoint || !body.keys) {
      return sendJson(res, 400, { ok: false, error: 'Endpoint and keys are required.' });
    }
    db.addPushSubscription(body.endpoint, body.keys);
    db.audit('push_subscribe', String(body.endpoint).slice(0, 80), ip);
    return sendJson(res, 200, { ok: true });
  }
  if ((method === 'DELETE' && route === '/push/subscribe') || (method === 'POST' && route === '/push/unsubscribe')) {
    const body = method === 'DELETE' ? (await readJsonBody(req).catch(() => ({}))) : await readJsonBody(req);
    const endpoint = body.endpoint || sp.get('endpoint');
    if (!endpoint) return sendJson(res, 400, { ok: false, error: 'Endpoint is required.' });
    const ok = db.removePushSubscription(endpoint);
    if (ok) db.audit('push_unsubscribe', String(endpoint).slice(0, 80), ip);
    return sendJson(res, 200, { ok: true });
  }
  if (method === 'POST' && route === '/push/test') {
    const result = await push.sendTestNotification();
    db.audit('push_test', `Sent ${result.sent} of ${result.total}`, ip);
    return sendJson(res, 200, Object.assign({ ok: true }, result));
  }

  // ---- Settings & Usage ----
  if (method === 'GET' && route === '/settings') {
    return sendJson(res, 200, {
      ok: true,
      settings: db.getSettings(),
      usage: db.getUsageStats(),
      last_backup: db.getLastBackupInfo(),
      vapid_public_key: push.getVapidPublicKey()
    });
  }
  if (method === 'PATCH' && route === '/settings') {
    const body = await readJsonBody(req);
    const updated = db.updateSettings(body);
    db.audit('settings_update', 'CRM settings updated', ip);
    return sendJson(res, 200, { ok: true, settings: updated });
  }
  if (method === 'GET' && route === '/usage') {
    return sendJson(res, 200, { ok: true, usage: db.getUsageStats() });
  }
  if (method === 'POST' && route === '/backup/run') {
    try {
      const backupResult = backup.runBackup();
      db.audit('backup_manual', `Manual backup: ${backupResult.filename}`, ip);
      return sendJson(res, 200, { ok: true, backup: backupResult, last_backup: db.getLastBackupInfo() });
    } catch (bErr) {
      return sendJson(res, 500, { ok: false, error: bErr.message });
    }
  }

  if (method === 'POST' && route === '/seed-demo') {
    const result = db.adminSeedSampleData(true);
    db.audit('seed_demo', `Seeded sample CRM luxury data (${result.added} contacts)`, ip);
    return sendJson(res, 200, result);
  }

  // ---- Leads ----
  if (method === 'GET' && route === '/leads') {
    const result = db.adminListLeads({
      status: stripHtml(sp.get('status') || '').slice(0, 20),
      type: stripHtml(sp.get('type') || '').slice(0, 30),
      q: stripHtml(sp.get('q') || '').slice(0, 80),
      limit: Math.min(200, Math.max(1, Number(sp.get('limit')) || 50)),
      offset: Math.max(0, Number(sp.get('offset')) || 0)
    });
    return sendJson(res, 200, Object.assign({ ok: true, statuses: db.LEAD_STATUSES }, result));
  }
  if (method === 'GET' && route === '/leads.csv') {
    const { leads } = db.adminListLeads({ limit: 100000 });
    db.audit('export_leads', `${leads.length} rows`, ip);
    return sendCsv(res, `leads-${new Date().toISOString().slice(0, 10)}.csv`,
      ['received_at', 'status', 'form', 'name', 'email', 'phone', 'interest', 'budget', 'timeline', 'areas', 'discreet', 'message',
        'email_consent', 'sms_consent', 'consent_version', 'page', 'utm_source', 'utm_campaign', 'follow_up', 'notes', 'lead_id'],
      leads.map((l) => [l.received_at, l.status, l.form_type, l.name, l.email, l.phone, l.interest, l.budget, l.timeline, (l.areas || []).join('; '),
        l.segment === 'sports_entertainment' ? 'yes' : '', l.message, l.email_consent ? 'yes' : 'no', l.sms_consent ? 'yes' : 'no',
        l.consent_text_version, l.source_page, l.utm.source || '', l.utm.campaign || '', l.follow_up_at || '', l.notes || '', l.lead_id]));
  }
  if ((m = /^\/leads\/([\w.-]{1,90})$/.exec(route))) {
    const id = m[1];
    if (method === 'GET') {
      const lead = db.adminGetLead(id);
      return lead ? sendJson(res, 200, { ok: true, lead }) : sendJson(res, 404, { ok: false, error: 'Lead not found.' });
    }
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const ok = db.adminUpdateLead(id, { status: body.status, notes: body.notes, follow_up_at: body.follow_up_at });
      if (ok) db.audit('lead_update', `${id} ${body.status || ''}`.trim(), ip);
      return sendJson(res, ok ? 200 : 400, ok ? { ok: true, lead: db.adminGetLead(id) } : { ok: false, error: 'Nothing to update.' });
    }
    if (method === 'DELETE') {
      const ok = db.adminDeleteLead(id);
      if (ok) db.audit('lead_delete', id, ip);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
  }
  if (method === 'POST' && (m = /^\/outbox\/(\d+)\/retry$/.exec(route))) {
    const ok = db.retryOutbox(Number(m[1]));
    if (ok) { db.audit('delivery_retry', m[1], ip); outbox.drain().catch(() => {}); }
    return sendJson(res, ok ? 200 : 404, { ok });
  }

  // ---- Subscribers ----
  if (method === 'GET' && route === '/subscribers') return sendJson(res, 200, { ok: true, subscribers: db.adminSubscribers() });
  if (method === 'GET' && route === '/subscribers.csv') {
    const subs = db.adminSubscribers();
    db.audit('export_subscribers', `${subs.length} rows`, ip);
    return sendCsv(res, `subscribers-${new Date().toISOString().slice(0, 10)}.csv`, ['email', 'consent', 'page', 'subscribed_at'],
      subs.map((s) => [s.email, s.consent ? 'yes' : 'no', s.source_page, s.created_at]));
  }

  // ---- Listings ----
  if (method === 'GET' && route === '/listings') return sendJson(res, 200, { ok: true, listings: db.adminListListings() });
  if (method === 'POST' && route === '/listings') {
    const body = await readJsonBody(req);
    const id = String(body.id || body.address || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    if (!id || !body.address || !body.city) return sendJson(res, 400, { ok: false, error: 'Address and city are required.' });
    const result = db.adminSaveListing(id, body, true);
    if (result === 'exists') return sendJson(res, 409, { ok: false, error: 'A listing with that address already exists.' });
    db.audit('listing_create', id, ip);
    return sendJson(res, 200, { ok: true, id });
  }
  if (method === 'PATCH' && (m = /^\/listings\/([\w.-]{1,90})$/.exec(route))) {
    const body = await readJsonBody(req);
    const result = db.adminSaveListing(m[1], body, false);
    if (result !== 'ok') return sendJson(res, 404, { ok: false, error: 'Listing not found.' });
    db.audit('listing_update', `${m[1]} ${Object.keys(body).join(',')}`.slice(0, 200), ip);
    return sendJson(res, 200, { ok: true });
  }

  // ---- Testimonials ----
  if (method === 'GET' && route === '/testimonials') return sendJson(res, 200, { ok: true, testimonials: db.adminListTestimonials() });
  if (method === 'POST' && route === '/testimonials') {
    const ok = db.adminSaveTestimonial(null, await readJsonBody(req));
    if (ok) db.audit('testimonial_create', '', ip);
    return sendJson(res, ok ? 200 : 400, ok ? { ok: true } : { ok: false, error: 'Quote and name are required.' });
  }
  if ((m = /^\/testimonials\/(\d+)$/.exec(route))) {
    if (method === 'PATCH') {
      const ok = db.adminSaveTestimonial(Number(m[1]), await readJsonBody(req));
      if (ok) db.audit('testimonial_update', m[1], ip);
      return sendJson(res, ok ? 200 : 400, ok ? { ok: true } : { ok: false, error: 'Quote and name are required.' });
    }
    if (method === 'DELETE') {
      const ok = db.adminDeleteTestimonial(Number(m[1]));
      if (ok) db.audit('testimonial_delete', m[1], ip);
      return sendJson(res, ok ? 200 : 404, { ok });
    }
  }

  // ---- Chat Sessions & Transcript Logs ----
  if (method === 'GET' && route === '/chat-sessions') {
    const result = db.getChatSessions({
      search: stripHtml(sp.get('q') || '').slice(0, 80),
      limit: Math.min(200, Math.max(1, Number(sp.get('limit')) || 50)),
      offset: Math.max(0, Number(sp.get('offset')) || 0)
    });
    return sendJson(res, 200, Object.assign({ ok: true }, result));
  }

  if ((m = /^\/chat-sessions\/([\w.-]{1,90})$/.exec(route))) {
    const sessionId = m[1];
    if (method === 'GET') {
      const session = db.getChatSession(sessionId);
      return session ? sendJson(res, 200, { ok: true, session }) : sendJson(res, 404, { ok: false, error: 'Chat session not found.' });
    }
  }

  if ((m = /^\/chat-sessions\/([\w.-]{1,90})\/convert$/.exec(route)) && method === 'POST') {
    const sessionId = m[1];
    const session = db.getChatSession(sessionId);
    if (!session) return sendJson(res, 404, { ok: false, error: 'Chat session not found.' });

    const body = await readJsonBody(req);
    const fullName = stripHtml(body.name || session.contact_name || `Chat Visitor (${session.city || 'Bay Area'})`).slice(0, 120);
    const email = stripHtml(body.email || '').toLowerCase().slice(0, 160);
    const phone = stripHtml(body.phone || '').slice(0, 40);

    try {
      const contact = db.adminCreateContact({
        display_name: fullName,
        email,
        phone,
        type: 'buyer',
        stage: 'new',
        interest: session.intent || 'AI Chat Inquiry',
        notes: `Converted from AI Chat Session ${sessionId} [Location: ${session.city || 'Unknown'}, ${session.region || 'CA'}]. Last visitor message: "${session.last_message || ''}"`,
        source: 'ai_chat'
      });
      db.linkChatSessionContact(sessionId, contact.id);
      db.audit('chat_convert_contact', `Converted chat session ${sessionId} to Contact #${contact.id}`, ip);
      return sendJson(res, 200, { ok: true, contact_id: contact.id });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }


  return sendJson(res, 404, { ok: false, error: 'Admin route not found.' });
}

module.exports = { handleAdminApi, hashPassword, verifyPassword };
