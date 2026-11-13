'use strict';

/**
 * The single lead pipeline for every form on the site.
 *
 *   validate -> save to SQLite (source of truth) -> queue notifications
 *
 * Used by server.js for POST /api/lead and POST /api/valuation. The visitor is
 * only told "thank you" after the row is safely in the database; deliveries
 * (email to Steven, auto-acknowledgment, AI-desk webhook, Sheets) happen from
 * the durable outbox in lib/outbox.js and retry on their own.
 */

const db = require('../db/database');
const outbox = require('../lib/outbox');
const { stripHtml, isValidEmail, isValidPhone, normalizePhone, hashIp, getClientIp } = require('../middleware/security');

const CONSENT_VERSION = '2026-11-v1';
const FORM_TYPES = ['contact', 'listing', 'concierge', 'private-exclusives', 'valuation'];
const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content', 'gclid', 'fbclid'];

class LeadError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

function cleanUtm(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  UTM_KEYS.forEach((k) => {
    if (input[k]) out[k] = stripHtml(input[k]).slice(0, 120);
  });
  return out;
}

function inferFormType(body) {
  const explicit = stripHtml(body.form_type || '').toLowerCase();
  if (FORM_TYPES.includes(explicit)) return explicit;
  const scene = stripHtml(body.scene || '').toLowerCase();
  if (scene.startsWith('listing-')) return 'listing';
  if (scene === 'concierge') return 'concierge';
  if (scene === 'private-exclusives') return 'private-exclusives';
  return 'contact';
}

/**
 * Validate, save and queue one lead.
 * @returns {{ok: true, lead_id: string, spam?: boolean, queued?: string[]}}
 * @throws {LeadError} with a visitor-safe message when input is invalid
 */
function submitLead(body, req, overrides = {}) {
  body = body && typeof body === 'object' ? body : {};

  // Honeypot: bots fill the hidden field. Pretend success, store nothing.
  if (body.company_website) return { ok: true, lead_id: '', spam: true };

  const name = stripHtml(body.name).slice(0, 120);
  const email = stripHtml(body.email).toLowerCase().slice(0, 160);
  const rawPhone = stripHtml(body.phone || '').slice(0, 40);
  const smsConsent = Boolean(body.sms_consent);

  if (!name) throw new LeadError('Please enter your name.');
  if (!isValidEmail(email)) throw new LeadError('Please enter a valid email address.');
  if (rawPhone && !isValidPhone(rawPhone)) throw new LeadError('Please enter a valid 10-digit phone number.');
  if (smsConsent && !rawPhone) throw new LeadError('A phone number is required to agree to calls and texts.');

  const receivedAt = new Date().toISOString();
  const lead = Object.assign({
    lead_id: `lead_${receivedAt.replace(/[:.]/g, '-')}_${Math.random().toString(36).slice(2, 6)}`,
    received_at: receivedAt,
    form_type: inferFormType(body),
    source_page: stripHtml(body.source_page || '/').slice(0, 160),
    scene: stripHtml(body.scene || '').slice(0, 60),
    name,
    email,
    phone: normalizePhone(rawPhone),
    interest: stripHtml(body.interest || '').slice(0, 60),
    budget: stripHtml(body.budget || '').slice(0, 40),
    timeline: stripHtml(body.timeline || '').slice(0, 60),
    areas: Array.isArray(body.areas) ? body.areas.map((a) => stripHtml(a).slice(0, 60)).filter(Boolean).slice(0, 25) : [],
    segment: body.segment === 'sports_entertainment' ? 'sports_entertainment' : 'standard',
    message: stripHtml(body.message || '').slice(0, 2000),
    email_consent: Boolean(body.email_consent),
    sms_consent: smsConsent,
    consent_text_version: CONSENT_VERSION,
    // Server clock is the record of consent; never trust a client timestamp.
    consent_timestamp: receivedAt,
    utm: cleanUtm(body.utm),
    referrer: stripHtml(body.referrer || '').slice(0, 300),
    ip_hash: hashIp(getClientIp(req))
  }, overrides);

  db.insertLead(lead);                       // 1. durable save — throws on failure
  const queued = outbox.enqueueLead(lead);   // 2. notifications, retried in background
  return { ok: true, lead_id: lead.lead_id, queued };
}

module.exports = { submitLead, LeadError, CONSENT_VERSION };
