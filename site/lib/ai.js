'use strict';

/**
 * Steven Lenz Jr. CRM - Gemini AI Integration (M2)
 *
 * Implements M2 AI drafting for the daily action plan:
 * - Single point of entry for all Gemini model interactions.
 * - Strict PII & data minimization (no last names, phones, emails, street addresses, notes).
 * - Anti-hallucination bounds & Fair Housing / Compass phrase blocklist enforcement.
 * - Hard monthly spend ceiling ($25/mo) with seamless fallback to deterministic templates.
 * - Complete audit logging in `ai_runs`.
 *
 * Reference: Build PRD M1 CRM Core and M2 AI Scoring & Daily Action Plan.md (line 442)
 */

const { getDb } = require('../db/database');
const { checkBlockedPhrases } = require('./phraseBlocklist');
const { generateTemplate } = require('./actionPlan');

const PROMPT_VERSION = 'draft-v1';

const SYSTEM_INSTRUCTION = `You draft short, personal follow-up messages for Steven Lenz Jr., a real estate agent with Compass in Pleasanton, California. Steven reviews and sends every message himself.

Write in the first person as Steven: warm, direct, plain words, no hype, no exclamation marks, no emojis.

Rules:
- Use only the facts provided. Do not invent listings, prices, market statistics, dates, or details about the person.
- Do not give legal, tax, lending or price advice. Do not state or imply what a home is worth.
- Do not describe any neighbourhood in terms of safety, schools quality, or the kind of people who live there.
- Do not promise outcomes or use the words guarantee, best, or number one.
- Ask one clear question or propose one next step.
- Do not include a signature, a footer, or a subject line in the body.

Return JSON only: {"subject": string, "body": string} for email, {"body": string} for text, {"points": [string, string, string]} for a call.`;

/**
 * Builds the strictly sanitized payload allowed to be transmitted to the model.
 * Per PRD line 448:
 * - First name only.
 * - Interest, price range, timeline and areas as entered.
 * - Rule id and plain reason.
 * - Contact's own last message cut to 500 characters.
 * - Up to 5 recent activity summaries (kind, date, Steven's subject line).
 *
 * NEVER sends: last name, email, phone, street address, notes, consent records,
 * or anything for contacts with discreet = 1.
 */
function buildSanitizedPayload(contact, rule, channel, context = {}, activities = []) {
  if (!contact || contact.discreet === 1) {
    return null; // Discreet contacts are never sent to model
  }

  // 1. First name only
  let firstName = (contact.first_name || '').trim();
  if (!firstName && contact.display_name) {
    firstName = contact.display_name.trim().split(/\s+/)[0];
  }

  // 2. Preferences
  const preferences = {};
  if (contact.preferences) {
    try {
      const parsed = typeof contact.preferences === 'string' ? JSON.parse(contact.preferences) : contact.preferences;
      if (parsed.interest) preferences.interest = String(parsed.interest).slice(0, 100);
      if (parsed.price_range) preferences.price_range = String(parsed.price_range).slice(0, 100);
      if (parsed.timeline) preferences.timeline = String(parsed.timeline).slice(0, 100);
      if (parsed.areas) preferences.areas = String(parsed.areas).slice(0, 200);
    } catch {}
  }

  // 3. Rule and plain reason
  const ruleInfo = {
    rule_id: rule,
    reason: context.reason || rule.replace(/_/g, ' ')
  };

  // 4. Contact's own last message (max 500 characters)
  let lastVisitorMessage = '';
  if (context.last_message) {
    lastVisitorMessage = String(context.last_message).slice(0, 500);
  } else if (activities && activities.length > 0) {
    const lastInbound = activities.find((a) => a.direction === 'in');
    if (lastInbound && lastInbound.subject) {
      lastVisitorMessage = String(lastInbound.subject).slice(0, 500);
    }
  }

  // 5. Up to five recent activity summaries: kind, date and Steven's subject line. NEVER note bodies or internal notes.
  const recentActivities = (activities || [])
    .filter((a) => a.kind !== 'note')
    .slice(0, 5)
    .map((a) => ({
      kind: a.kind,
      date: (a.occurred_at || a.created_at || '').slice(0, 10),
      subject: (a.subject || '').slice(0, 100)
    }));

  return {
    first_name: firstName,
    preferences,
    rule_info: ruleInfo,
    last_message: lastVisitorMessage,
    recent_activities: recentActivities,
    channel: channel || 'email'
  };
}

/**
 * Validates model output against anti-hallucination rules and phrase blocklists.
 */
function validateOutput(rawText, sanitizedPayload, channel) {
  if (!rawText || typeof rawText !== 'string') {
    return { ok: false, error: 'Empty model output' };
  }

  // 1. JSON parsing
  let parsed;
  try {
    // Strip markdown code fences if present
    const cleaned = rawText.replace(/^```(json)?\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { ok: false, error: 'Output is not valid JSON: ' + err.message };
  }

  // 2. Shape check per channel
  if (channel === 'call') {
    if (!parsed.points || !Array.isArray(parsed.points) || parsed.points.length !== 3) {
      return { ok: false, error: 'Call output must contain an array of exactly 3 points' };
    }
    for (const pt of parsed.points) {
      if (typeof pt !== 'string' || pt.trim().length === 0) {
        return { ok: false, error: 'Invalid call talking point string' };
      }
    }
  } else if (channel === 'text') {
    if (!parsed.body || typeof parsed.body !== 'string' || parsed.body.trim().length === 0) {
      return { ok: false, error: 'Text output must contain non-empty body' };
    }
    if (parsed.body.length > 320) {
      return { ok: false, error: 'Text body exceeds maximum character length' };
    }
  } else {
    // Default: email
    if (!parsed.subject || typeof parsed.subject !== 'string' || parsed.subject.trim().length === 0) {
      return { ok: false, error: 'Email output must contain non-empty subject' };
    }
    if (!parsed.body || typeof parsed.body !== 'string' || parsed.body.trim().length === 0) {
      return { ok: false, error: 'Email output must contain non-empty body' };
    }
  }

  const combinedText = channel === 'call'
    ? parsed.points.join(' ')
    : `${parsed.subject || ''} ${parsed.body || ''}`;

  // 3. Blocked phrase check
  const blockCheck = checkBlockedPhrases(combinedText);
  if (blockCheck.blocked) {
    return { ok: false, error: `Output contains blocked phrase: "${blockCheck.phrase}"` };
  }

  // 4. Anti-hallucination: No invented dollar amounts, percentages, or street addresses
  const inputStr = JSON.stringify(sanitizedPayload || {}).toLowerCase();

  // Dollar check
  const outputDollars = (combinedText.match(/\$[\d,]+(\.\d+)?/g) || []).map((s) => s.toLowerCase());
  for (const d of outputDollars) {
    if (!inputStr.includes(d)) {
      return { ok: false, error: `Output contains unprompted dollar amount: "${d}"` };
    }
  }

  // Percentage check
  const outputPcts = (combinedText.match(/\b\d+(\.\d+)?%/g) || []).map((s) => s.toLowerCase());
  for (const p of outputPcts) {
    if (!inputStr.includes(p)) {
      return { ok: false, error: `Output contains unprompted percentage: "${p}"` };
    }
  }

  // Street address check (e.g. "123 Main St", "4500 Valley Ave")
  const streetRegex = /\b\d{1,5}\s+[A-Za-z0-9\s]+(street|st|avenue|ave|drive|dr|road|rd|lane|ln|court|ct|boulevard|blvd|way|place|pl)\b/gi;
  const addresses = combinedText.match(streetRegex) || [];
  for (const addr of addresses) {
    if (!inputStr.includes(addr.toLowerCase())) {
      return { ok: false, error: `Output contains unprompted street address: "${addr}"` };
    }
  }

  return { ok: true, data: parsed };
}

/**
 * Calculates execution cost in USD based on token counts and env pricing.
 */
function calculateCostUsd(inputTokens = 0, outputTokens = 0) {
  const priceInputPerMTok = parseFloat(process.env.AI_PRICE_INPUT_PER_MTOK) || 0.075;
  const priceOutputPerMTok = parseFloat(process.env.AI_PRICE_OUTPUT_PER_MTOK) || 0.30;

  const cost = (inputTokens / 1000000) * priceInputPerMTok + (outputTokens / 1000000) * priceOutputPerMTok;
  return Math.round(cost * 1000000) / 1000000;
}

/**
 * Computes current month spend in USD from ai_runs table.
 */
function getCurrentMonthSpend(dbInstance, date = new Date()) {
  const db = dbInstance || getDb();
  const yearMonth = new Date(date).toISOString().slice(0, 7); // 'YYYY-MM'

  const row = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total_usd, COUNT(*) as count
    FROM ai_runs
    WHERE strftime('%Y-%m', created_at) = ? AND status = 'success'
  `).get(yearMonth);

  return {
    total_usd: row ? row.total_usd : 0,
    count: row ? row.count : 0
  };
}

/**
 * Checks if current month spend is at or over budget.
 */
function isOverBudget(dbInstance, date = new Date()) {
  const budget = parseFloat(process.env.AI_MONTHLY_BUDGET_USD) || 25.0;
  const spend = getCurrentMonthSpend(dbInstance, date);
  return spend.total_usd >= budget;
}

/**
 * Records an entry in the ai_runs audit log.
 */
function logAiRun(dbInstance, {
  purpose = 'action_item_draft',
  contactId = null,
  model = process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  inputJson = '{}',
  outputText = null,
  inputTokens = 0,
  outputTokens = 0,
  costUsd = 0.0,
  status = 'success',
  error = null,
  createdAt = new Date().toISOString()
}) {
  const db = dbInstance || getDb();
  try {
    const res = db.prepare(`
      INSERT INTO ai_runs (
        purpose, prompt_version, model, contact_id,
        input_json, output_text, input_tokens, output_tokens,
        cost_usd, status, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purpose,
      PROMPT_VERSION,
      model,
      contactId,
      typeof inputJson === 'string' ? inputJson : JSON.stringify(inputJson),
      outputText,
      inputTokens,
      outputTokens,
      costUsd,
      status,
      error,
      createdAt
    );
    return res.lastInsertRowid;
  } catch (err) {
    console.error('[AI] Failed to log ai_runs entry:', err);
    return null;
  }
}

/**
 * Main module function to draft an action item message.
 * Follows strict error isolation, retry policy, and deterministic template fallback.
 *
 * @param {Object} options
 * @param {Object} options.contact - Contact database row
 * @param {string} options.rule - PRD rule id (e.g. 'new_lead')
 * @param {string} options.channel - 'email', 'text', or 'call'
 * @param {Object} [options.context] - Additional task/deal context
 * @param {Object} [options.dbInstance] - Optional SQLite database handle
 * @param {Object} [options.clientOverride] - Mock client for automated tests
 * @returns {Promise<{ subject: string, body: string, points?: string[], source: 'gemini' | 'template' }>}
 */
async function draftMessage({
  contact,
  rule,
  channel = 'email',
  context = {},
  purpose = 'action_item_draft',
  dbInstance = null,
  clientOverride = null
}) {
  const db = dbInstance || getDb();
  const nowIso = new Date().toISOString();
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // 1. Fallback template generator helper
  function getFallbackTemplate() {
    return generateTemplate(rule, channel, contact, context);
  }

  // 2. Check discreet contact rule: discreet contacts never use AI
  if (contact && contact.discreet === 1) {
    return getFallbackTemplate();
  }

  // 3. Check monthly budget ceiling
  if (isOverBudget(db)) {
    logAiRun(db, {
      purpose,
      contactId: contact ? contact.id : null,
      model: modelName,
      inputJson: { reason: 'Monthly budget cap exceeded' },
      status: 'over_budget',
      error: 'Monthly spend at or above AI_MONTHLY_BUDGET_USD ceiling',
      createdAt: nowIso
    });
    return getFallbackTemplate();
  }

  // 4. Check API key presence
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !clientOverride) {
    // No API key configured: silently use deterministic template without error log
    return getFallbackTemplate();
  }

  // 5. Build sanitized payload (PII and restricted fields omitted)
  const activities = db.prepare(`
    SELECT * FROM activities WHERE contact_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 5
  `).all(contact.id);

  const payload = buildSanitizedPayload(contact, rule, channel, context, activities);
  if (!payload) {
    return getFallbackTemplate();
  }

  const payloadJson = JSON.stringify(payload);

  // 6. Setup Gemini client (or test mock)
  let aiClient = clientOverride;
  if (!aiClient) {
    try {
      const { GoogleGenAI } = require('@google/genai');
      aiClient = new GoogleGenAI({ apiKey });
    } catch (err) {
      logAiRun(db, {
        purpose,
        contactId: contact.id,
        model: modelName,
        inputJson: payload,
        status: 'error',
        error: 'Failed to initialize @google/genai SDK: ' + err.message,
        createdAt: nowIso
      });
      return getFallbackTemplate();
    }
  }

  // 7. Execute call with 15-second timeout and 1 retry
  let attempts = 0;
  let lastError = null;
  let rawText = null;
  let usage = { promptTokenCount: 0, candidatesTokenCount: 0 };

  while (attempts < 2) {
    attempts++;
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out after 15 seconds')), 15000)
      );

      const callPromise = aiClient.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Draft follow-up:\n${payloadJson}` }]
          }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json'
        }
      });

      const response = await Promise.race([callPromise, timeoutPromise]);

      rawText = response.text || (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts[0] && response.candidates[0].content.parts[0].text) || '';

      if (response.usageMetadata) {
        usage.promptTokenCount = response.usageMetadata.promptTokenCount || 0;
        usage.candidatesTokenCount = response.usageMetadata.candidatesTokenCount || 0;
      }

      // Validate output checks
      const validation = validateOutput(rawText, payload, channel);
      if (!validation.ok) {
        lastError = new Error(validation.error);
        // Continue to retry once if first attempt
        continue;
      }

      // Output validated successfully!
      const costUsd = calculateCostUsd(usage.promptTokenCount, usage.candidatesTokenCount);
      const loggedPayload = context.action_item_id ? { ...payload, action_item_id: context.action_item_id } : payload;
      logAiRun(db, {
        purpose,
        contactId: contact.id,
        model: modelName,
        inputJson: loggedPayload,
        outputText: rawText,
        inputTokens: usage.promptTokenCount,
        outputTokens: usage.candidatesTokenCount,
        costUsd,
        status: 'success',
        createdAt: nowIso
      });

      if (channel === 'call') {
        return {
          subject: 'Call Talking Points',
          body: validation.data.points.map((p, idx) => `${idx + 1}. ${p}`).join('\n'),
          points: validation.data.points,
          source: 'gemini'
        };
      } else if (channel === 'text') {
        return {
          subject: '',
          body: validation.data.body,
          source: 'gemini'
        };
      } else {
        return {
          subject: validation.data.subject,
          body: validation.data.body,
          source: 'gemini'
        };
      }
    } catch (err) {
      lastError = err;
      // Network/timeout error, proceed to retry once
    }
  }

  // If we reach here, both attempts failed or were blocked
  const isBlock = lastError && lastError.message && (lastError.message.includes('blocked phrase') || lastError.message.includes('unprompted'));
  const failureStatus = isBlock ? 'blocked' : 'error';
  const costUsd = calculateCostUsd(usage.promptTokenCount, usage.candidatesTokenCount);

  logAiRun(db, {
    purpose,
    contactId: contact.id,
    model: modelName,
    inputJson: context.action_item_id ? { ...payload, action_item_id: context.action_item_id } : payload,
    outputText: rawText,
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    costUsd,
    status: failureStatus,
    error: lastError ? lastError.message : 'Unknown validation failure',
    createdAt: nowIso
  });

  return getFallbackTemplate();
}

/**
 * Re-draft an action item by contacting Gemini.
 * Limited to 3 redrafts per action item.
 */
async function redraftActionItem(actionItemId, dbInstance = null, clientOverride = null) {
  const db = dbInstance || getDb();

  const item = db.prepare('SELECT * FROM action_items WHERE id = ?').get(actionItemId);
  if (!item) {
    throw new Error('Action item not found');
  }

  if (item.status !== 'open') {
    throw new Error('Cannot redraft a resolved or snoozed action item');
  }

  // Count redrafts for this item in ai_runs
  const redraftRuns = db.prepare(`
    SELECT COUNT(*) as count FROM ai_runs
    WHERE purpose = 'redraft' AND contact_id = ?
      AND json_extract(input_json, '$.action_item_id') = ?
  `).get(item.contact_id, item.id);

  if (redraftRuns && redraftRuns.count >= 3) {
    const err = new Error('Maximum of 3 redrafts reached for this action item');
    err.code = 'REDRAFT_LIMIT';
    throw err;
  }

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(item.contact_id);
  if (!contact) {
    throw new Error('Contact not found');
  }

  const draft = await draftMessage({
    contact,
    rule: item.rule,
    channel: item.channel,
    context: { action_item_id: item.id, reason: item.reason },
    purpose: 'redraft',
    dbInstance: db,
    clientOverride
  });

  db.prepare(`
    UPDATE action_items
    SET draft_subject = ?, draft_body = ?, draft_source = ?, edited = 0
    WHERE id = ?
  `).run(draft.subject, draft.body, draft.source, item.id);

  return {
    ok: true,
    action_item_id: item.id,
    draft_subject: draft.subject,
    draft_body: draft.body,
    draft_source: draft.source
  };
}

module.exports = {
  SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
  buildSanitizedPayload,
  validateOutput,
  calculateCostUsd,
  getCurrentMonthSpend,
  isOverBudget,
  logAiRun,
  draftMessage,
  redraftActionItem
};
