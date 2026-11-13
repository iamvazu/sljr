/**
 * server/middleware.js
 * Production-ready Middleware Pipeline for AI Steve API
 */

// In-memory sliding window rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60; // 60 req/min per IP

function rateLimiter(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();

  let entry = rateLimitMap.get(ip);
  if (!entry) {
    entry = { count: 1, startTime: now };
    rateLimitMap.set(ip, entry);
  } else {
    if (now - entry.startTime > RATE_LIMIT_WINDOW_MS) {
      entry.count = 1;
      entry.startTime = now;
    } else {
      entry.count++;
      if (entry.count > MAX_REQUESTS_PER_WINDOW) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please wait a moment before sending another message.'
        }));
      }
    }
  }

  // Periodic cleanup
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now - v.startTime > RATE_LIMIT_WINDOW_MS) {
        rateLimitMap.delete(k);
      }
    }
  }

  next();
}

function requestLogger(req, res, next) {
  const start = Date.now();
  const originalEnd = res.end;

  res.end = function (...args) {
    const duration = Date.now() - start;
    if (req.url.startsWith('/api/')) {
      console.log(`[API ${req.method}] ${req.url} -> ${res.statusCode} (${duration}ms)`);
    }
    return originalEnd.apply(this, args);
  };

  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  next();
}

function jsonBodyParser(req, res, next) {
  if (req.method === 'POST' || req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Guard against payloads larger than 1MB
      if (body.length > 1e6) {
        req.destroy();
      }
    });
    req.on('end', () => {
      if (body) {
        try {
          req.body = JSON.parse(body);
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Invalid JSON', message: e.message }));
        }
      } else {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
}

function validateLeadPayload(req, res, next) {
  const { name, email } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Validation Error', message: 'Name is required.' }));
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Validation Error', message: 'A valid email address is required.' }));
  }
  next();
}

module.exports = {
  rateLimiter,
  requestLogger,
  securityHeaders,
  jsonBodyParser,
  validateLeadPayload
};
