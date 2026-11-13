'use strict';

const crypto = require('crypto');

const RATE_BUCKETS = new Map();

function stripHtml(str = '') {
  return String(str).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function isValidEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

function isValidPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function normalizePhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// X-Forwarded-For can be forged by any visitor, so it is only believed when
// the server really sits behind a proxy you control (set TRUST_PROXY=1 on
// Cloudflare / Render / Fly / nginx). Otherwise the socket address is used.
function getClientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.trim()) return cf.trim();
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function hashIp(ip) {
  const salt = process.env.IP_HASH_SALT || 'sl-local-salt';
  return crypto.createHash('sha256').update(salt + String(ip || '')).digest('hex').slice(0, 16);
}

function applySecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  );

  // CORS: only local development origins. In production the site and API are
  // same-origin, so no cross-origin access is granted at all.
  const origin = req.headers.origin;
  if (process.env.NODE_ENV !== 'production' && origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

// Drop expired rate-limit buckets so memory cannot grow without bound.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of RATE_BUCKETS) {
    if (!entry.hits.length || now - entry.hits[entry.hits.length - 1] > entry.windowMs) RATE_BUCKETS.delete(key);
  }
}, 5 * 60 * 1000);
sweep.unref();

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 30, prefix = 'api' } = {}) {
  return function checkRateLimit(req, res) {
    const ip = getClientIp(req);
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    const hits = ((RATE_BUCKETS.get(key) || {}).hits || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(Math.ceil(windowMs / 1000)) });
      res.end(JSON.stringify({ ok: false, error: 'Too many requests. Please try again shortly.' }));
      return false;
    }
    hits.push(now);
    RATE_BUCKETS.set(key, { hits, windowMs });
    return true;
  };
}

function readJsonBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(Object.assign(new Error('Invalid JSON payload'), { statusCode: 400 }));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

module.exports = {
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
};

