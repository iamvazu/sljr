/**
 * server/server.js
 * Unified Full-Stack HTTP Server for Steven Lenz Jr. Real Estate & AI Steve
 * Handles API (AI, DB, Leads, Middleware) & Static Website Hosting
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

const db = require('./db');
const ai = require('./ai');
const middleware = require('./middleware');

const PORT = process.env.PORT || 4173;
const SITE_DIR = path.resolve(__dirname, '..', 'site');

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
  '/experiences': '/private-exclusives',
  '/experiences.html': '/private-exclusives',
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
  '/private-exclusives.html': '/private-exclusives',
  '/connect.html': '/connect',
  '/resources.html': '/resources',
  '/valuation.html': '/valuation',
  '/terms.html': '/terms',
  '/privacy.html': '/privacy',
  '/accessibility.html': '/accessibility',
  '/fair-housing.html': '/fair-housing',
  '/cookies.html': '/cookies',
  '/ai-steve.html': '/ai-steve',
  '/relocation.html': '/relocation',
  '/relocation/san-francisco-to-pleasanton.html': '/relocation/san-francisco-to-pleasanton',
  '/relocation/silicon-valley-to-danville.html': '/relocation/silicon-valley-to-danville',
  '/relocation/fremont-to-san-ramon.html': '/relocation/fremont-to-san-ramon'
};

function send301(res, target) {
  res.writeHead(301, {
    'Location': target,
    'Cache-Control': 'public, max-age=31536000',
    'Content-Type': 'text/html; charset=UTF-8'
  });
  res.end(`<!DOCTYPE html><html><head><title>301 Moved Permanently</title><meta http-equiv="refresh" content="0;url=${target}"></head><body><h1>Moved Permanently</h1><p>The document has moved <a href="${target}">here</a>.</p></body></html>`);
}

function handleLegacyRedirects(req, res, parsedUrl) {
  let pathname = (parsedUrl ? parsedUrl.pathname : url.parse(req.url).pathname) || '/';
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

  // 2b. Relocation .html -> clean extensionless
  if (normPath.startsWith('/relocation/') && normPath.endsWith('.html')) {
    send301(res, normPath.slice(0, -5));
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

function getListings() {
  try {
    const raw = fs.readFileSync(path.join(SITE_DIR, 'content', 'listings.json'), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Listings Read Error]', err);
    return [];
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, pathname) {
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(SITE_DIR, safePath);

  // If extensionless URL (e.g. /neighborhoods, /relocation), prefer matching .html file
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  } else if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=UTF-8' });
    return res.end('<h1>404 - Page Not Found</h1><p><a href="/">Return to Home</a></p>');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const stream = fs.createReadStream(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  // Legacy 301 Redirect Engine - intercept immediately before middleware to preserve crawl budget
  if (handleLegacyRedirects(req, res)) {
    return;
  }

  // Middleware pipeline execution
  middleware.requestLogger(req, res, () => {
    middleware.securityHeaders(req, res, () => {
      middleware.rateLimiter(req, res, () => {
        middleware.jsonBodyParser(req, res, () => {
          handleRequest(req, res);
        });
      });
    });
  });
});

function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // --- API ROUTES ---

  // Healthcheck endpoint
  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      status: 'healthy'
    });
  }

  // AI Chat endpoint
  if (pathname === '/api/chat' && method === 'POST') {
    const { message, sessionId = 'default-session' } = req.body;
    if (!message || typeof message !== 'string') {
      return sendJson(res, 400, { error: 'Message text is required' });
    }

    try {
      const response = ai.processQuery(message);
      
      // Persist conversation in database
      db.recordConversation(sessionId, 'user', message);
      db.recordConversation(sessionId, 'assistant', response.reply, response.intent, response.properties);

      return sendJson(res, 200, {
        success: true,
        ...response,
        sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('[AI Chat Error]', err);
      return sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
    }
  }

  // Lead Generation ("Talk to Steven") endpoint
  if (pathname === '/api/leads' && method === 'POST') {
    middleware.validateLeadPayload(req, res, () => {
      try {
        const leadData = {
          name: req.body.name.trim(),
          email: req.body.email.trim(),
          phone: req.body.phone ? req.body.phone.trim() : null,
          reply_method: req.body.reply_method || 'email',
          property_address: req.body.property_address || null,
          message: req.body.message ? req.body.message.trim() : null,
          session_id: req.body.sessionId || null,
          ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          user_agent: req.headers['user-agent']
        };

        const inserted = db.insertLead(leadData);
        console.log(`[Lead Captured] ID: ${inserted.id} | ${inserted.name} (${inserted.email}) for ${inserted.property_address || 'General'}`);

        return sendJson(res, 201, {
          success: true,
          leadId: inserted.id,
          message: 'Thank you! Steven has received your details and will follow up shortly.'
        });
      } catch (err) {
        console.error('[Leads Error]', err);
        return sendJson(res, 500, { error: 'Database Error', message: err.message });
      }
    });
    return;
  }

  // Leads list (Admin/Review)
  if (pathname === '/api/leads' && method === 'GET') {
    try {
      const leads = db.getLeads();
      return sendJson(res, 200, { success: true, count: leads.length, leads });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // User Feedback (thumbs up / thumbs down)
  if (pathname === '/api/feedback' && method === 'POST') {
    try {
      const { sessionId = 'anon', messageId = null, rating, comment = null } = req.body;
      if (!rating || !['up', 'down'].includes(rating.toLowerCase())) {
        return sendJson(res, 400, { error: "Rating must be 'up' or 'down'" });
      }
      db.recordFeedback(sessionId, messageId, rating.toLowerCase(), comment);
      return sendJson(res, 200, { success: true, recorded: rating });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Properties Catalog endpoint (AI DB)
  if (pathname === '/api/properties' && method === 'GET') {
    try {
      const properties = db.getProperties(parsedUrl.query);
      return sendJson(res, 200, { success: true, count: properties.length, properties });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Listings endpoint (JSON catalog for listing.html & site components)
  if (pathname === '/api/listings' && method === 'GET') {
    const listings = getListings();
    return sendJson(res, 200, { ok: true, count: listings.length, listings });
  }

  // Single Listing by ID
  if (pathname.startsWith('/api/listings/') && method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/listings/'.length)).trim();
    const listings = getListings();
    const item = listings.find(l => l.id === id);
    if (!item) {
      return sendJson(res, 404, { ok: false, error: 'Listing not found' });
    }
    return sendJson(res, 200, { ok: true, listing: item });
  }

  // --- STATIC FILE SERVING ---
  serveStatic(req, res, pathname);
}

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`  STEVEN LENZ JR. FULL-STACK SERVER RUNNING         `);
  console.log(`  Local URL:   http://localhost:${PORT}             `);
  console.log(`  Healthcheck: http://localhost:${PORT}/api/health  `);
  console.log(`  AI Engine:   Connected & Ready                    `);
  console.log(`  Database:    SQLite (WAL mode active)             `);
  console.log(`====================================================`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  server.close(() => {
    console.log('[Server] Shut down cleanly.');
    process.exit(0);
  });
});
