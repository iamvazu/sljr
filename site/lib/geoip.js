'use strict';

/**
 * site/lib/geoip.js
 * Fast IP Geolocation with in-memory caching and safe fallbacks.
 * Uses ip-api.com (free 45 requests/minute without API key).
 */

const http = require('http');

// In-memory LRU-like cache with 6-hour TTL
const GEO_CACHE = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 5000;

function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '').trim();
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
  if (/^10\./.test(clean)) return true;
  if (/^192\.168\./.test(clean)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  return false;
}

function cleanIp(rawIp) {
  if (!rawIp) return '';
  return String(rawIp).split(',')[0].replace(/^::ffff:/, '').trim();
}

/**
 * Resolves geolocation for a given client IP.
 * @param {string} rawIp
 * @returns {Promise<{ip: string, city: string, region: string, country: string, postal: string, isp: string}>}
 */
async function lookupIp(rawIp) {
  const ip = cleanIp(rawIp);

  if (!ip || isPrivateIp(ip)) {
    return {
      ip: ip || '127.0.0.1',
      city: 'San Francisco Bay Area',
      region: 'CA',
      country: 'United States',
      postal: '94566',
      isp: 'Local / Private Network'
    };
  }

  // Check in-memory cache
  const cached = GEO_CACHE.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const geo = await new Promise((resolve) => {
      const req = http.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,region,city,zip,isp`, {
        timeout: 1800
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (data.status === 'success') {
              resolve({
                ip,
                city: data.city || 'Unknown City',
                region: data.region || 'CA',
                country: data.country || 'USA',
                postal: data.zip || '',
                isp: data.isp || ''
              });
            } else {
              resolve(null);
            }
          } catch (_) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });

    const result = geo || {
      ip,
      city: 'Unknown City',
      region: 'CA',
      country: 'United States',
      postal: '',
      isp: ''
    };

    if (GEO_CACHE.size >= MAX_CACHE_SIZE) {
      const firstKey = GEO_CACHE.keys().next().value;
      GEO_CACHE.delete(firstKey);
    }
    GEO_CACHE.set(ip, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    return {
      ip,
      city: 'Unknown City',
      region: 'CA',
      country: 'United States',
      postal: '',
      isp: ''
    };
  }
}

module.exports = {
  lookupIp,
  cleanIp,
  isPrivateIp
};
