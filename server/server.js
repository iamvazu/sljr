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

  // If path is a directory without trailing slash, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  // If extensionless URL (e.g. /neighborhoods), try .html
  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
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
      status: 'healthy',
      service: 'AI Steve Real Estate Engine',
      db: 'connected (node:sqlite)',
      tables: ['properties', 'leads', 'conversations', 'feedback'],
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
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

  // Properties Catalog endpoint
  if (pathname === '/api/properties' && method === 'GET') {
    try {
      const properties = db.getProperties(parsedUrl.query);
      return sendJson(res, 200, { success: true, count: properties.length, properties });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- STATIC FILE SERVING ---
  serveStatic(req, res, pathname);
}

server.listen(PORT, '127.0.0.1', () => {
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
