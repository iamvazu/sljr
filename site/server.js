'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load project-root/.env if present (Node 22 built-in, no dependency).
try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch (_) {}

const zlib = require('zlib');
const db = require('./db/database');
const outbox = require('./lib/outbox');
const backup = require('./lib/backup');
const { submitLead } = require('./api/lead');
const { handleAdminApi } = require('./api/admin');
const aiAgent = require('../server/ai');
const aiDb = require('../server/db');
const {
  stripHtml,
  isValidEmail,
  isValidPhone,
  normalizePhone,
  getClientIp,
  hashIp,
  applySecurityHeaders,
  createRateLimiter,
  readJsonBody,
  sendJson
} = require('./middleware/security');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const SITE_ROOT = path.resolve(__dirname);

const writeLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 25, prefix: 'write' });
const searchLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120, prefix: 'search' });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const IS_PROD = process.env.NODE_ENV === 'production';

// ---- Legacy 301 Redirect Engine ---------------------------------------
// Permanent redirects (HTTP 301) for all legacy Luxury Presence URLs,
// /neighborhoods/:slug routes, legacy property slugs, and static pages.
const KNOWN_AREAS = new Set([
  'walnut-creek', 'alamo', 'danville', 'san-ramon', 'dublin',
  'pleasanton', 'livermore', 'lafayette', 'oakland', 'berkeley',
  'fremont', 'hayward', 'palo-alto', 'san-jose', 'san-francisco'
]);

const STATIC_REDIRECTS = {
  // Legacy Luxury Presence static routes
  '/home-valuation': '/valuation',
  '/home-valuation.html': '/valuation',
  '/testimonials': '/about#testimonials',
  '/testimonials.html': '/about#testimonials',
  '/private-exclusives': '/experiences',
  '/private-exclusives.html': '/experiences',
  '/home-search/listings': '/properties',
  '/home-search/account': '/',
  '/home-search/auth': '/',
  '/terms-and-conditions': '/terms',
  '/sitemap': '/sitemap.xml',
  '/areas': '/neighborhoods',

  // Canonical extensionless routes (upgrade .html -> clean URL)
  '/about.html': '/about',
  '/buy.html': '/buy',
  '/sell.html': '/sell',
  '/concierge.html': '/concierge',
  '/properties.html': '/properties',
  '/neighborhoods.html': '/neighborhoods',
  '/experiences.html': '/experiences',
  '/connect.html': '/connect',
  '/resources.html': '/resources',
  '/valuation.html': '/valuation',
  '/terms.html': '/terms',
  '/privacy.html': '/privacy',
  '/accessibility.html': '/accessibility',
  '/fair-housing.html': '/fair-housing',
  '/cookies.html': '/cookies',
  '/ai-steve.html': '/ai-steve'
};

function send301(res, target) {
  res.writeHead(301, {
    'Location': target,
    'Cache-Control': 'public, max-age=31536000',
    'Content-Type': 'text/html; charset=utf-8'
  });
  res.end(`<!DOCTYPE html><html><head><title>301 Moved Permanently</title><meta http-equiv="refresh" content="0;url=${target}"></head><body><h1>Moved Permanently</h1><p>The document has moved <a href="${target}">here</a>.</p></body></html>`);
}

function handleLegacyRedirects(req, res, parsedUrl) {
  let pathname = parsedUrl.pathname || '/';
  let normPath = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  normPath = normPath.toLowerCase();

  // Skip assets, apis, and internal scripts
  if (normPath.startsWith('/api/') || normPath.startsWith('/assets/') || normPath.startsWith('/css/') || normPath.startsWith('/js/') || normPath.startsWith('/content/')) {
    return false;
  }

  // 1. If trailing slash on non-root, redirect to normalized path
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const target = STATIC_REDIRECTS[normPath] || normPath;
    send301(res, target);
    return true;
  }

  // 2. Static redirect lookup (e.g. /buy.html -> /buy, /home-valuation -> /valuation)
  if (STATIC_REDIRECTS[normPath]) {
    send301(res, STATIC_REDIRECTS[normPath]);
    return true;
  }

  // 3. Legacy /neighborhoods/:slug -> /areas/:slug.html
  if (normPath.startsWith('/neighborhoods/')) {
    const slug = normPath.slice('/neighborhoods/'.length).replace(/\/$/, '');
    if (KNOWN_AREAS.has(slug)) {
      send301(res, `/areas/${slug}.html`);
      return true;
    }
    send301(res, '/neighborhoods');
    return true;
  }

  // 4. /areas/:slug -> /areas/:slug.html
  if (normPath.startsWith('/areas/')) {
    const slug = normPath.slice('/areas/'.length).replace(/\/$/, '');
    if (KNOWN_AREAS.has(slug)) {
      send301(res, `/areas/${slug}.html`);
      return true;
    }
    send301(res, '/neighborhoods');
    return true;
  }

  // 5. Legacy /properties/:slug -> /listing.html?id=:slug
  if (normPath.startsWith('/properties/')) {
    const slug = normPath.slice('/properties/'.length).replace(/\/$/, '');
    if (slug) {
      send301(res, `/listing.html?id=${encodeURIComponent(slug)}`);
      return true;
    }
    send301(res, '/properties');
    return true;
  }

  return false;
}

// ---- Static allowlist -------------------------------------------------
// Only these folders and root files are ever served. Everything else in
// site/ (server.js, db/, api/, lib/, middleware/, scratch/, package.json…)
// is invisible to visitors — a 404, not a 403, so nothing is confirmed.
const PUBLIC_DIRS = new Set(['assets', 'css', 'js', 'content', 'areas', 'articles', 'admin']);
const PUBLIC_ROOT_FILES = new Set(['robots.txt', 'sitemap.xml', 'llms.txt', 'manifest.webmanifest', 'favicon.ico', 'admin.js', 'admin.css']);
// Internal review pages: available on your own machine, never in production.
const INTERNAL_PAGES = new Set(['pitch.html', 'preview.html']);
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.webmanifest']);

function isPublicPath(relPath) {
  const parts = relPath.split('/').filter(Boolean);
  if (!parts.length) return false;
  if (parts.some((p) => p.startsWith('.'))) return false;
  if (parts.length === 1) {
    const file = parts[0].toLowerCase();
    if (PUBLIC_ROOT_FILES.has(file)) return true;
    if (!file.endsWith('.html')) return false;
    if (INTERNAL_PAGES.has(file)) return !IS_PROD;
    return true;
  }
  return PUBLIC_DIRS.has(parts[0].toLowerCase());
}

function cacheControlFor(relPath, ext) {
  if (ext === '.html') return 'no-cache';
  if (relPath.startsWith('/assets/')) return 'public, max-age=604800';
  if (relPath.startsWith('/content/')) return 'public, max-age=300';
  return 'public, max-age=3600';
}

function sendNotFound(req, res) {
  const page = path.join(SITE_ROOT, '404.html');
  fs.readFile(page, (err, buf) => {
    res.writeHead(404, { 'Content-Type': err ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : (err ? 'Not Found' : buf));
  });
}

function computeValuation({ address, type, beds, baths, sqft, timeline }) {
  const low = String(address || '').toLowerCase();
  let submarket = 'Tri-Valley & East Bay';
  let ppsf = 625;
  if (low.includes('alamo') || low.includes('94507')) { submarket = 'Alamo'; ppsf = 815; }
  else if (low.includes('danville') || low.includes('blackhawk') || low.includes('94506') || low.includes('94526')) { submarket = 'Danville / Blackhawk'; ppsf = 760; }
  else if (low.includes('pleasanton') || low.includes('94566') || low.includes('94588')) { submarket = 'Pleasanton'; ppsf = 745; }
  else if (low.includes('walnut creek') || low.includes('94596') || low.includes('94595') || low.includes('94598')) { submarket = 'Walnut Creek'; ppsf = 695; }
  else if (low.includes('orinda') || low.includes('lafayette')) { submarket = 'Lamorinda'; ppsf = 860; }
  else if (low.includes('livermore') || low.includes('94550') || low.includes('94551')) { submarket = 'Livermore'; ppsf = 610; }
  else if (low.includes('san ramon') || low.includes('94582') || low.includes('94583')) { submarket = 'San Ramon'; ppsf = 690; }
  else if (low.includes('brentwood') || low.includes('94513')) { submarket = 'Brentwood'; ppsf = 410; }
  else if (low.includes('oakland') || low.includes('946')) { submarket = 'Oakland'; ppsf = 670; }
  else if (low.includes('richmond') || low.includes('948')) { submarket = 'Richmond'; ppsf = 560; }

  const typeMult = type === 'Estate / Acreage' ? 1.16 : type === 'Townhome / Condo' ? 0.88 : type === 'Multi-Family' ? 1.08 : 1.0;
  const bedAdj = (Number(beds) - 3) * 28000;
  const bathAdj = (Number(baths) - 2) * 22000;
  const area = Math.max(400, Math.min(20000, Number(sqft) || 2000));
  const mid = Math.round((area * ppsf * typeMult + bedAdj + bathAdj) / 5000) * 5000;
  const estLow = Math.round(mid * 0.94 / 5000) * 5000;
  const estHigh = Math.round(mid * 1.06 / 5000) * 5000;
  const conciergeUplift = Math.round(mid * 0.055 / 5000) * 5000;
  const strategy = timeline === 'Ready now'
    ? 'Immediate Compass Private Exclusive preview followed by full MLS launch.'
    : '4-week Compass Concierge prep (paint, staging, lighting) to capture top-quartile offers.';

  return {
    submarket,
    ppsf: Math.round(mid / area),
    est_low: estLow,
    est_mid: mid,
    est_high: estHigh,
    concierge_uplift: conciergeUplift,
    low: '$' + estLow.toLocaleString(),
    mid: '$' + mid.toLocaleString(),
    high: '$' + estHigh.toLocaleString(),
    uplift: '+$' + conciergeUplift.toLocaleString(),
    strategy
  };
}

async function handleApi(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Back office (leads inbox, listings, reviews) — see api/admin.js
  if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
    return handleAdminApi(req, res, parsedUrl);
  }

  // Health Check
  if (req.method === 'GET' && pathname === '/api/health') {
    db.getDb().prepare('SELECT 1').get();
    return sendJson(res, 200, { ok: true, status: 'healthy' });
  }

  // AI Chat endpoint (AI Steve)
  if (req.method === 'POST' && pathname === '/api/chat') {
    const body = await readJsonBody(req);
    const { message, sessionId = 'default-session' } = body;
    if (!message || typeof message !== 'string') {
      return sendJson(res, 400, { ok: false, error: 'Message text is required' });
    }
    try {
      const response = aiAgent.processQuery(message);
      aiDb.recordConversation(sessionId, 'user', message);
      aiDb.recordConversation(sessionId, 'assistant', response.reply, response.intent, response.properties);
      return sendJson(res, 200, {
        success: true,
        ok: true,
        ...response,
        sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[AI Chat Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Internal AI Error', message: err.message });
    }
  }

  // AI Steve Lead Generation ("Talk to Steven") endpoint
  if (req.method === 'POST' && pathname === '/api/leads') {
    if (!writeLimiter(req, res)) return;
    const body = await readJsonBody(req);
    const name = stripHtml(body.name || '').slice(0, 120);
    const email = stripHtml(body.email || '').toLowerCase().slice(0, 160);
    const phone = stripHtml(body.phone || '').slice(0, 40);
    const replyMethod = stripHtml(body.reply_method || 'email').slice(0, 30);
    const propertyAddress = stripHtml(body.property_address || '').slice(0, 200);
    const message = stripHtml(body.message || '').slice(0, 2000);
    const sessionId = stripHtml(body.sessionId || '').slice(0, 60);

    if (!name || !isValidEmail(email)) {
      return sendJson(res, 400, { ok: false, error: 'Name and a valid email are required.' });
    }

    try {
      // 1. Record in AI DB
      const inserted = aiDb.insertLead({
        name,
        email,
        phone,
        reply_method: replyMethod,
        property_address: propertyAddress,
        message,
        session_id: sessionId,
        ip: getClientIp(req),
        user_agent: req.headers['user-agent']
      });

      // 2. Submit to Main Office Lead Pipeline (SQLite + Outbox + Resend/Webhooks)
      try {
        submitLead({
          name,
          email,
          phone,
          interest: propertyAddress ? `Inquiry on ${propertyAddress}` : 'General Inquiry',
          form_type: 'contact',
          scene: 'ai-steve',
          source_page: '/ai-steve',
          email_consent: true,
          message: message ? `[AI Steve Inquiry] ${message} (Property: ${propertyAddress || 'N/A'})` : `Inquiry via AI Steve for ${propertyAddress || 'general representation'}`
        }, req);
      } catch (leadErr) {
        console.warn('[AI Steve Pipeline Note]', leadErr.message);
      }

      return sendJson(res, 201, {
        success: true,
        ok: true,
        leadId: inserted.id,
        message: 'Thank you! Steven has received your details and will follow up shortly.'
      });
    } catch (err) {
      console.error('[AI Leads Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Database Error', message: err.message });
    }
  }

  // AI Leads List endpoint (Admin/Review)
  if (req.method === 'GET' && pathname === '/api/leads') {
    const leads = aiDb.getLeads();
    return sendJson(res, 200, { success: true, count: leads.length, leads });
  }

  // AI Feedback (thumbs up / thumbs down)
  if (req.method === 'POST' && pathname === '/api/feedback') {
    const body = await readJsonBody(req);
    const { sessionId = 'anon', messageId = null, rating, comment = null } = body;
    if (!rating || !['up', 'down'].includes(String(rating).toLowerCase())) {
      return sendJson(res, 400, { ok: false, error: "Rating must be 'up' or 'down'" });
    }
    aiDb.recordFeedback(sessionId, messageId, String(rating).toLowerCase(), comment);
    return sendJson(res, 200, { success: true, recorded: rating });
  }

  // AI Properties Catalog endpoint
  if (req.method === 'GET' && pathname === '/api/properties') {
    const properties = aiDb.getProperties(Object.fromEntries(parsedUrl.searchParams));
    return sendJson(res, 200, { success: true, count: properties.length, properties });
  }

  // All Listings
  if (req.method === 'GET' && pathname === '/api/listings') {
    if (!searchLimiter(req, res)) return;
    const items = db.getAllListings();
    return sendJson(res, 200, { ok: true, count: items.length, listings: items });
  }

  // Search Listings
  if (req.method === 'GET' && pathname === '/api/listings/search') {
    if (!searchLimiter(req, res)) return;
    const sp = parsedUrl.searchParams;
    const results = db.searchListings({
      q: stripHtml(sp.get('q') || '').slice(0, 100),
      city: stripHtml(sp.get('city') || '').slice(0, 60),
      minPrice: Number(sp.get('minPrice')) || 0,
      maxPrice: Number(sp.get('maxPrice')) || 999999999,
      beds: Number(sp.get('beds')) || 0,
      baths: Number(sp.get('baths')) || 0,
      status: stripHtml(sp.get('status') || '').slice(0, 20)
    });
    return sendJson(res, 200, { ok: true, count: results.length, listings: results });
  }

  // Single Listing by ID
  if (req.method === 'GET' && pathname.startsWith('/api/listings/')) {
    if (!searchLimiter(req, res)) return;
    const id = stripHtml(decodeURIComponent(pathname.slice('/api/listings/'.length))).slice(0, 80);
    const item = db.getListingById(id);
    if (!item) return sendJson(res, 404, { ok: false, error: 'Listing not found' });
    return sendJson(res, 200, { ok: true, listing: item });
  }

  // Submit Lead — every contact form on the site posts here.
  if (req.method === 'POST' && pathname === '/api/lead') {
    if (!writeLimiter(req, res)) return;
    const body = await readJsonBody(req);
    const result = submitLead(body, req);
    return sendJson(res, 200, { ok: true, lead_id: result.lead_id });
  }

  // Steven Lenz AI Valuation
  if (req.method === 'POST' && pathname === '/api/valuation') {
    if (!writeLimiter(req, res)) return;
    const body = await readJsonBody(req);
    const address = stripHtml(body.address).slice(0, 200);
    const name = stripHtml(body.name).slice(0, 120);
    const email = stripHtml(body.email).toLowerCase().slice(0, 160);
    const rawValPhone = stripHtml(body.phone || '');
    const phone = normalizePhone(rawValPhone);
    const type = stripHtml(body.type || 'Single Family').slice(0, 60);
    const beds = stripHtml(body.beds || '3').slice(0, 10);
    const baths = stripHtml(body.baths || '2').slice(0, 10);
    const sqft = Number(body.sqft) || 2000;
    const timeline = stripHtml(body.timeline || 'Exploring').slice(0, 60);
    const consent = Boolean(body.consent);

    if (!address || !name || !isValidEmail(email)) {
      return sendJson(res, 400, { ok: false, error: 'Address, name, and valid email are required.' });
    }
    if (rawValPhone && !isValidPhone(rawValPhone)) {
      return sendJson(res, 400, { ok: false, error: 'Please enter a valid 10-digit phone number.' });
    }

    const val = computeValuation({ address, type, beds, baths, sqft, timeline });
    const valuationId = `val_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    db.insertValuation({
      valuation_id: valuationId,
      address,
      submarket: val.submarket,
      property_type: type,
      beds,
      baths,
      sqft,
      timeline,
      name,
      email,
      phone,
      consent,
      est_low: val.est_low,
      est_mid: val.est_mid,
      est_high: val.est_high,
      concierge_uplift: val.concierge_uplift,
      ppsf: val.ppsf
    });

    // A valuation request is a seller lead: put it in the same inbox and
    // notification pipeline as every other form.
    submitLead({
      name, email, phone: rawValPhone,
      interest: 'selling',
      timeline,
      form_type: 'valuation',
      scene: 'valuation',
      source_page: stripHtml(body.source_page || '/sell.html').slice(0, 160),
      email_consent: consent,
      utm: body.utm,
      referrer: body.referrer,
      message: `Valuation request for ${address} — ${type}, ${beds} bd / ${baths} ba, ${sqft} sq.ft. ` +
        `Rough estimate shown: ${val.low} – ${val.high} (${valuationId}).`
    }, req);

    return sendJson(res, 200, { ok: true, valuation_id: valuationId, valuation: val });
  }

  // Newsletter Subscribe
  if (req.method === 'POST' && pathname === '/api/newsletter') {
    if (!writeLimiter(req, res)) return;
    const body = await readJsonBody(req);
    const email = stripHtml(body.email).toLowerCase().slice(0, 160);
    const consent = Boolean(body.consent);
    if (!isValidEmail(email)) {
      return sendJson(res, 400, { ok: false, error: 'Please enter a valid email address.' });
    }
    if (!consent) {
      return sendJson(res, 400, { ok: false, error: 'Please check the consent box to subscribe.' });
    }
    db.upsertNewsletter({
      email,
      consent,
      source_page: stripHtml(body.source_page || '/').slice(0, 120)
    });
    return sendJson(res, 200, { ok: true });
  }

  // Unsubscribe route for CRM emails
  if (req.method === 'GET' && (pathname === '/api/unsubscribe' || pathname === '/unsubscribe')) {
    const contactId = Number(parsedUrl.searchParams.get('c'));
    const token = parsedUrl.searchParams.get('t');
    const { unsubscribeContact } = require('./lib/crm');
    const result = unsubscribeContact(contactId, token);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (result.ok) {
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribed — Steven Lenz Jr.</title>
  <style>
    body { background: #0D1117; color: #F3EEE6; font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #141A23; border: 1px solid rgba(243,238,230,.14); border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; }
    h1 { color: #D8A55A; font-weight: 300; margin-top: 0; font-size: 1.6rem; }
    p { color: #A9A398; line-height: 1.6; }
    a { color: #D8A55A; text-decoration: none; font-weight: 600; display: inline-block; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Unsubscribed</h1>
    <p>You have been successfully unsubscribed from email communications from Steven Lenz Jr. at Compass.</p>
    <p>If this was a mistake, or if you need to reach Steven directly, please call or text (925) 998-9711.</p>
    <a href="/">Return to Homepage &rarr;</a>
  </div>
</body>
</html>`);
    } else {
      res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribe — Steven Lenz Jr.</title>
<style>body { background: #0D1117; color: #F3EEE6; font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; } .card { background: #141A23; border: 1px solid rgba(232,120,104,.4); border-radius: 12px; padding: 32px; max-width: 480px; text-align: center; } h1 { color: #E87868; font-weight: 300; margin-top: 0; } p { color: #A9A398; } a { color: #D8A55A; text-decoration: none; }</style></head>
<body><div class="card"><h1>Link Invalid or Expired</h1><p>We could not process this unsubscribe link. Please contact steven.lenzjr@compass.com directly.</p><a href="/">Return to Homepage &rarr;</a></div></body></html>`);
    }
    return;
  }

  return sendJson(res, 404, { ok: false, error: 'API route not found' });
}

function serveStatic(req, res, parsedUrl) {
  let reqPath = decodeURIComponent(parsedUrl.pathname);
  if (reqPath === '/') reqPath = '/index.html';

  // Listings and reviews are managed in the admin panel, so the JSON the
  // pages read is generated from the database (published items only).
  if (req.method === 'GET' && (reqPath === '/content/listings.json' || reqPath === '/content/testimonials.json')) {
    const data = reqPath.endsWith('listings.json') ? db.getAllListings() : db.getPublishedTestimonials();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(data));
    return;
  }

  // Admin panel shell: redirect /admin -> /admin/ for canonical relative asset loading
  if (reqPath === '/admin') {
    res.writeHead(301, {
      'Location': '/admin/',
      'Cache-Control': 'no-store'
    });
    res.end();
    return;
  }
  if (reqPath === '/admin/') reqPath = '/admin/index.html';
  if (reqPath === '/admin.js') reqPath = '/admin/admin.js';
  if (reqPath === '/admin.css') reqPath = '/admin/admin.css';
  if (reqPath.startsWith('/admin/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
  }

  // Handle reference area redirects & clean URLs handled by handleLegacyRedirects (301)


  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  if (reqPath.includes('\0') || reqPath.includes('..') || reqPath.includes('\\')) {
    return sendNotFound(req, res);
  }

  let filePath = path.resolve(SITE_ROOT, '.' + reqPath);
  if (!filePath.toLowerCase().startsWith(SITE_ROOT.toLowerCase() + path.sep)) {
    return sendNotFound(req, res);
  }

  // Support clean URLs without .html extension
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
    reqPath = reqPath + '.html';
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!MIME_TYPES[ext] || !isPublicPath(reqPath)) {
    return sendNotFound(req, res);
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendNotFound(req, res);

    const mime = MIME_TYPES[ext];
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const baseHeaders = {
      'Content-Type': mime,
      'Cache-Control': reqPath.startsWith('/admin/') ? 'no-store' : cacheControlFor(reqPath, ext),
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString()
    };

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, baseHeaders);
      res.end();
      return;
    }

    // HTTP Range requests for video scrubbing (.mp4)
    const range = req.headers.range;
    if (range && ext === '.mp4') {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      let start = m && m[1] !== '' ? parseInt(m[1], 10) : NaN;
      let end = m && m[2] !== '' ? parseInt(m[2], 10) : stat.size - 1;
      if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, stat.size - parseInt(m[2], 10)); end = stat.size - 1; }
      end = Math.min(end, stat.size - 1);
      if (!m || isNaN(start) || start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, Object.assign({}, baseHeaders, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1
      }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (COMPRESSIBLE.has(ext) && acceptsGzip && stat.size > 1024) {
      res.writeHead(200, Object.assign({}, baseHeaders, { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }));
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(filePath).pipe(zlib.createGzip({ level: 6 })).pipe(res);
      return;
    }

    res.writeHead(200, Object.assign({}, baseHeaders, {
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes'
    }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

// Initialize SQLite database, notification worker, and backup scheduler on boot
db.getDb();
outbox.start();
backup.scheduleNightlyBackup();

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  let logPath = '-';
  res.on('finish', () => {
    console.log(`[${req.method}] ${logPath} ${res.statusCode} (${Date.now() - start}ms)`);
  });
  applySecurityHeaders(req, res);

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    logPath = parsedUrl.pathname;
    decodeURIComponent(parsedUrl.pathname);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  // Legacy 301 Redirect Engine - permanent redirects for SEO & backlinks
  if (handleLegacyRedirects(req, res, parsedUrl)) {
    return;
  }

  try {
    if (parsedUrl.pathname.startsWith('/api/')) {
      await handleApi(req, res, parsedUrl);
    } else {
      serveStatic(req, res, parsedUrl);
    }
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.error('[server] request failed:', err);
    if (res.headersSent) { res.end(); return; }
    sendJson(res, code, {
      ok: false,
      error: code >= 500
        ? 'Something went wrong on our side and your message was not saved. Please call or text (925) 998-9711.'
        : err.message
    });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = PORT === 4173 ? 4174 : PORT + 1;
    console.warn(`[server] Port ${PORT} is busy, switching to fallback port http://localhost:${nextPort}`);
    server.listen(nextPort);
  } else {
    console.error('[server] Server error:', err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Steven Lenz Jr. | Compass server running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

