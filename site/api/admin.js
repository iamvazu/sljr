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
const { stripHtml, getClientIp, hashIp, createRateLimiter, readJsonBody, sendJson } = require('../middleware/security');

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE = 'sl_admin';
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8, prefix: 'admin-login' });

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

function setSessionCookie(res, token, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSec}${secure}`);
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
    setSessionCookie(res, token, SESSION_TTL_MS / 1000);
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
    setSessionCookie(res, '', 0);
    db.audit('logout', '', ip);
    return sendJson(res, 200, { ok: true });
  }

  const sp = parsedUrl.searchParams;
  let m;

  // ---- Dashboard ----
  if (method === 'GET' && route === '/stats') return sendJson(res, 200, { ok: true, stats: db.adminStats() });
  if (method === 'GET' && route === '/audit') return sendJson(res, 200, { ok: true, entries: db.getAudit(150) });

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

  return sendJson(res, 404, { ok: false, error: 'Admin route not found.' });
}

module.exports = { handleAdminApi, hashPassword, verifyPassword };
