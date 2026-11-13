'use strict';

/**
 * Durable notification worker.
 *
 * A lead is written to SQLite first (source of truth). Each downstream
 * delivery — email to Steven, acknowledgment to the visitor, AI-desk webhook,
 * Sheets webhook — is a row in the `outbox` table. This worker delivers due
 * rows and retries failures with exponential backoff (30s, 1m, 2m … capped at
 * 1h, 8 attempts). Rows survive restarts, so a lead is never lost because an
 * email provider or webhook was down.
 */

const db = require('../db/database');

const MAX_ATTEMPTS = 8;
const AGENT_PHONE = '(925) 998-9711';

function env(name) {
  return (process.env[name] || '').trim();
}

/** Which channels are switched on by environment configuration. */
function enabledChannels() {
  const hasResend = Boolean(env('RESEND_API_KEY') && env('RESEND_FROM_EMAIL'));
  return {
    agent_email: hasResend && Boolean(env('LEAD_NOTIFY_EMAIL')),
    lead_ack: hasResend && env('LEAD_AUTO_ACK') !== '0',
    desk_webhook: Boolean(env('OMB_LEAD_WEBHOOK_URL') && env('OMB_LEAD_WEBHOOK_TOKEN')),
    sheet_webhook: Boolean(env('LEAD_PERSIST_WEBHOOK_URL'))
  };
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

function sendResend(message) {
  return postJson('https://api.resend.com/emails', message, {
    Authorization: `Bearer ${env('RESEND_API_KEY')}`
  });
}

function agentEmailBody(lead) {
  const line = (label, value) => (value ? `${label}: ${value}\n` : '');
  return (
    `New ${lead.form_type} inquiry from the website\n` +
    `${'-'.repeat(44)}\n` +
    line('Name', lead.name) +
    line('Email', lead.email) +
    line('Phone', lead.phone) +
    line('Interested in', lead.interest) +
    line('Price range', lead.budget) +
    line('Timeline', lead.timeline) +
    line('Areas', (lead.areas || []).join(', ')) +
    line('Discreet / S&E', lead.segment === 'sports_entertainment' ? 'YES' : '') +
    line('Message', lead.message) +
    `\nConsent — email: ${lead.email_consent ? 'yes' : 'no'}, calls/texts: ${lead.sms_consent ? 'yes' : 'no'}\n` +
    line('Page', lead.source_page) +
    line('Campaign', lead.utm && Object.keys(lead.utm).length ? JSON.stringify(lead.utm) : '') +
    `Received: ${lead.received_at}\nLead ID: ${lead.lead_id}\n`
  );
}

const SENDERS = {
  agent_email(lead) {
    return sendResend({
      from: env('RESEND_FROM_EMAIL'),
      to: [env('LEAD_NOTIFY_EMAIL')],
      reply_to: lead.email,
      subject: `New ${lead.form_type} lead: ${lead.name}` + (lead.segment === 'sports_entertainment' ? ' (discreet)' : ''),
      text: agentEmailBody(lead)
    });
  },
  lead_ack(lead) {
    const first = (lead.name || '').split(/\s+/)[0] || 'there';
    return sendResend({
      from: env('RESEND_FROM_EMAIL'),
      to: [lead.email],
      subject: 'Thanks for reaching out — Steven Lenz Jr. | Compass',
      text:
        `Thanks, ${first} — I got your note and I'll personally follow up shortly.\n` +
        `If it's urgent, call or text me at ${AGENT_PHONE}.\n\n` +
        `— Steven Lenz Jr., Compass, CA DRE# 01989811\n` +
        `900 Main St., Pleasanton, CA 94566\n` +
        `Compass California II, Inc. | CA DRE# 01527235`
    });
  },
  desk_webhook(lead) {
    return postJson(env('OMB_LEAD_WEBHOOK_URL'), lead, {
      Authorization: `Bearer ${env('OMB_LEAD_WEBHOOK_TOKEN')}`
    });
  },
  sheet_webhook(lead) {
    return postJson(env('LEAD_PERSIST_WEBHOOK_URL'), lead);
  }
};

/** Queue every enabled delivery for a saved lead. Returns the channel names. */
function enqueueLead(lead) {
  const on = enabledChannels();
  const queued = [];
  Object.keys(SENDERS).forEach((channel) => {
    if (!on[channel]) return;
    db.enqueueOutbox(lead.lead_id, channel, lead);
    queued.push(channel);
  });
  setImmediate(() => { drain().catch(() => {}); });
  return queued;
}

let draining = false;
async function drain() {
  if (draining) return;
  draining = true;
  try {
    const jobs = db.dueOutbox(10);
    for (const job of jobs) {
      const sender = SENDERS[job.channel];
      try {
        if (!sender) throw new Error('Unknown channel');
        await sender(JSON.parse(job.payload_json));
        db.markOutboxSent(job.id);
        console.log(`[outbox] sent ${job.channel} for ${job.lead_id}`);
      } catch (err) {
        const dead = db.markOutboxFailed(job.id, job.attempts + 1, err && err.message, MAX_ATTEMPTS);
        console.error(
          `[outbox] ${dead ? 'GAVE UP on' : 'retry scheduled for'} ${job.channel} / ${job.lead_id}: ${err && err.message}`
        );
      }
    }
  } finally {
    draining = false;
  }
}

function start() {
  const on = enabledChannels();
  const active = Object.keys(on).filter((k) => on[k]);
  if (active.length) {
    console.log(`[outbox] notification channels active: ${active.join(', ')}`);
  } else {
    console.warn(
      '[outbox] WARNING: no notification channel is configured. Leads are saved to the database ' +
      'but nobody is notified. Copy .env.example to .env and fill it in.'
    );
  }
  const timer = setInterval(() => { drain().catch(() => {}); }, 20000);
  timer.unref();
  drain().catch(() => {});
}

module.exports = { start, drain, enqueueLead, enabledChannels };
