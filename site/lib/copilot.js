'use strict';

/**
 * site/lib/copilot.js
 * Steven Lenz Jr. Executive AI Co-Pilot & Voice Assistant
 * Powered by Groq Whisper (voice-to-text) and Qwen/Llama (reasoning & tool execution).
 */

const { getDb } = require('../db/database');
const siteDb = require('../db/database');

const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Transcribes an audio buffer using Groq Whisper large-v3-turbo.
 * @param {Buffer} audioBuffer
 * @param {string} [mimeType='audio/webm']
 * @returns {Promise<{ok: boolean, text?: string, error?: string}>}
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'GROQ_API_KEY is not configured.' };
  }

  try {
    const ext = mimeType.includes('mp4') ? 'mp4' : (mimeType.includes('wav') ? 'wav' : 'webm');
    const filename = `voice_memo_${Date.now()}.${ext}`;

    const formData = new FormData();
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('file', new Blob([audioBuffer], { type: mimeType }), filename);
    formData.append('response_format', 'json');
    formData.append('temperature', '0.0');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(GROQ_AUDIO_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Groq Whisper Error]', res.status, errText);
      return { ok: false, error: `Audio transcription failed: HTTP ${res.status}` };
    }

    const data = await res.json();
    return { ok: true, text: (data.text || '').trim() };
  } catch (err) {
    console.error('[Groq Whisper Exception]', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Gathers live CRM context from SQLite for the Co-Pilot's reasoning.
 */
function gatherCrmContext() {
  const db = getDb();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  // 1. Active Listings
  let listings = [];
  try {
    listings = siteDb.getAllListings().map((l) => ({
      id: l.id,
      address: l.address,
      city: l.city,
      price: l.price || (l.price_num ? `$${Number(l.price_num).toLocaleString()}` : 'Price Upon Request'),
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft
    }));
  } catch (_) {}

  // 2. Open / Overdue Tasks
  let tasks = [];
  try {
    tasks = db.prepare(`
      SELECT t.id, t.title, t.due_at, t.done_at, c.display_name as contact_name, c.id as contact_id
      FROM tasks t
      LEFT JOIN contacts c ON c.id = t.contact_id
      WHERE t.done_at IS NULL
      ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC
      LIMIT 10
    `).all();
  } catch (_) {}

  // 3. Recent Contacts
  let contacts = [];
  try {
    contacts = db.prepare(`
      SELECT c.id, c.display_name, c.stage, c.type, c.score, c.score_band, c.preferences, c.discreet,
             (SELECT body FROM activities WHERE contact_id = c.id ORDER BY occurred_at DESC, id DESC LIMIT 1) as last_note,
             (SELECT occurred_at FROM activities WHERE contact_id = c.id ORDER BY occurred_at DESC, id DESC LIMIT 1) as last_touch
      FROM contacts c
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT 15
    `).all();
  } catch (_) {}

  // 4. Stale Deals & Contacts (no activity for 7+ days)
  let staleContacts = [];
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    staleContacts = db.prepare(`
      SELECT c.id, c.display_name, c.stage, c.score,
             (SELECT MAX(occurred_at) FROM activities WHERE contact_id = c.id) as last_activity
      FROM contacts c
      WHERE c.stage IN ('lead', 'contacted', 'engaged', 'active', 'touring')
        AND (last_activity < ? OR last_activity IS NULL)
      ORDER BY c.score DESC
      LIMIT 6
    `).all(sevenDaysAgo);
  } catch (_) {}

  // 5. Active Pipeline Summary
  let pipelineSummary = { count: 0, volume: 0, deals: [] };
  try {
    const deals = db.prepare(`
      SELECT d.id, d.title, d.value, d.stage_id, s.name as stage_name, c.display_name as contact_name, c.id as contact_id
      FROM deals d
      LEFT JOIN pipeline_stages s ON s.id = d.stage_id
      LEFT JOIN contacts c ON c.id = d.contact_id
      WHERE d.status = 'open'
      ORDER BY d.value DESC
      LIMIT 10
    `).all();
    pipelineSummary.count = deals.length;
    pipelineSummary.volume = deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    pipelineSummary.deals = deals;
  } catch (_) {}

  return {
    today: todayIso,
    now: now.toISOString(),
    listings,
    tasks,
    contacts,
    staleContacts,
    pipelineSummary
  };
}

/**
 * Builds the system instruction for Steven's Co-Pilot.
 */
function buildCopilotSystemInstruction(crmContext) {
  return `You are "Steven's Co-Pilot", the elite, private AI Executive Assistant & Chief of Staff to Steven Lenz Jr., a premier luxury real estate advisor with Compass California II, Inc. (CA DRE# 01989811).

Steven is talking to you directly through his Progressive Web App (PWA) in the field—frequently via voice while driving between showings or leaving client properties.

YOUR PERSONALITY & TONE:
• Crisp, executive, highly capable, proactive, and respectful.
• Speak directly to Steven ("You have 2 showings today...", "I logged that note for Dr. Thorne...", "Marcus's file is updated...").
• NO fluff, NO conversational filler, NO robotic corporate disclaimers. Give direct answers and execute CRM actions instantly.

CURRENT REAL-TIME CONTEXT:
• Today's Date: ${crmContext.today}
• Active Pipeline Volume: $${crmContext.pipelineSummary.volume.toLocaleString()} across ${crmContext.pipelineSummary.count} open deals.
• Open Portfolio Listings:
${crmContext.listings.map((l) => `  - [ID: ${l.id}] ${l.address}, ${l.city} (${l.price}, ${l.beds}bd/${l.baths}ba, ${l.sqft}sf)`).join('\n') || '  None active'}

OPEN TASKS:
${crmContext.tasks.map((t) => `  - [Task #${t.id}] ${t.title} (Due: ${t.due_at || 'No date'}, Priority: ${t.priority || 'norm'}, Contact: ${t.contact_name || 'None'})`).join('\n') || '  No open tasks'}

RECENT CLIENTS / CONTACTS:
${crmContext.contacts.map((c) => `  - [Contact #${c.id}] ${c.display_name} (Stage: ${c.stage}, Score: ${c.score_band || 'warm'}, Last Touch: ${c.last_touch || 'None'}, Last Note: ${c.last_note ? String(c.last_note).slice(0, 80) : 'None'})`).join('\n')}

STALE CONTACTS (>7 DAYS INACTIVE):
${crmContext.staleContacts.map((c) => `  - ${c.display_name} (#${c.id}, Stage: ${c.stage}, Inactive since: ${c.last_activity || 'long ago'})`).join('\n') || '  No stale contacts'}

YOUR CAPABILITIES & ACTIONS:
When Steven gives an instruction, you can execute one of the following structured actions by returning a valid JSON object:

1. LOG_NOTE: When Steven logs showing feedback, meeting notes, or client calls.
   {"action": "LOG_NOTE", "contact_id": number or null, "contact_name": string, "kind": "note"|"showing"|"call", "subject": string, "body": string}

2. CREATE_TASK: When Steven asks to create a task, set a reminder, or schedule a follow-up.
   {"action": "CREATE_TASK", "title": string, "due_at": "YYYY-MM-DD" or "YYYY-MM-DD HH:MM", "priority": "high"|"normal", "contact_id": number or null}

3. DRAFT_EMAIL: When Steven asks to draft a follow-up, inquiry response, or property pitch.
   {"action": "DRAFT_EMAIL", "contact_id": number or null, "contact_name": string, "subject": string, "body": string}

4. PREP_DOSSIER: When Steven asks to prepare for a call, meeting, or showing.
   {"action": "PREP_DOSSIER", "contact_id": number, "contact_name": string, "summary": string, "talking_points": [string, string], "comps": [string]}

5. STALE_DEALS_REPORT: When Steven asks what deals or clients need attention.
   {"action": "STALE_DEALS_REPORT", "summary": string, "recommendations": [string, string]}

6. NONE: For general questions, market discussions, or briefings without DB mutations.
   {"action": "NONE"}

MANDATORY OUTPUT FORMAT:
You MUST respond with valid JSON ONLY matching this schema:
{
  "spoken_reply": "A concise 1-3 sentence spoken reply that will be read aloud to Steven through his AirPods or car audio.",
  "detailed_markdown": "Full details, formatted notes, lists, or briefing cards for the Back Office screen.",
  "action": { ...action object from above... }
}`;
}

/**
 * Processes a text or voice transcript prompt from Steven.
 * @param {string} userPrompt
 * @param {Array<{role: string, content: string}>} [history=[]]
 * @returns {Promise<{ok: boolean, spoken_reply: string, detailed_markdown: string, actionResult?: Object}>}
 */
async function processCopilotCommand(userPrompt, history = []) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

  if (!apiKey) {
    return {
      ok: false,
      spoken_reply: "I need a Groq API key to process voice commands.",
      detailed_markdown: "Please verify GROQ_API_KEY in server environment."
    };
  }

  const crmContext = gatherCrmContext();
  const systemInstruction = buildCopilotSystemInstruction(crmContext);

  const formattedHistory = (history || []).slice(-6).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: typeof m.content === 'object' ? JSON.stringify(m.content) : String(m.content || '')
  }));

  const messages = [
    { role: 'system', content: systemInstruction },
    ...formattedHistory,
    { role: 'user', content: userPrompt }
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        max_tokens: 800
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Groq Co-Pilot Chat Error]', res.status, errText);
      return {
        ok: false,
        spoken_reply: "I had trouble connecting to the intelligence server. Please try again.",
        detailed_markdown: `Server error: HTTP ${res.status}`
      };
    }

    const data = await res.json();
    const rawContent = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : null;

    if (!rawContent) {
      return {
        ok: false,
        spoken_reply: "I received an empty response. Could you please repeat that?",
        detailed_markdown: "Empty response from language model."
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (_) {
      parsed = {
        spoken_reply: rawContent.slice(0, 160),
        detailed_markdown: rawContent,
        action: { action: 'NONE' }
      };
    }

    // Execute database mutations if action is present
    const actionResult = executeAction(parsed.action, crmContext);

    return {
      ok: true,
      spoken_reply: parsed.spoken_reply || "Done.",
      detailed_markdown: parsed.detailed_markdown || parsed.spoken_reply,
      action: parsed.action,
      actionResult
    };
  } catch (err) {
    console.error('[Groq Co-Pilot Exception]', err.message);
    return {
      ok: false,
      spoken_reply: "An error occurred while executing that command.",
      detailed_markdown: `Error: ${err.message}`
    };
  }
}

/**
 * Executes recognized CRM actions directly in SQLite.
 */
function executeAction(actionObj, crmContext) {
  if (!actionObj || !actionObj.action || actionObj.action === 'NONE') return null;

  const db = getDb();
  const nowIso = new Date().toISOString();

  try {
    // 1. LOG_NOTE
    if (actionObj.action === 'LOG_NOTE') {
      let contactId = actionObj.contact_id;
      if (!contactId && actionObj.contact_name) {
        const found = db.prepare('SELECT id FROM contacts WHERE display_name LIKE ? LIMIT 1').get(`%${actionObj.contact_name}%`);
        if (found) contactId = found.id;
      }

      if (contactId) {
        const kind = actionObj.kind || 'note';
        const subject = actionObj.subject || 'Voice Memo / Showing Feedback';
        const body = actionObj.body || actionObj.note || '';

        db.prepare(`
          INSERT INTO activities (contact_id, kind, direction, subject, body, occurred_at, created_at)
          VALUES (?, ?, 'out', ?, ?, ?, ?)
        `).run(contactId, kind, subject, body, nowIso, nowIso);

        db.prepare(`UPDATE contacts SET updated_at = ? WHERE id = ?`).run(nowIso, contactId);

        return {
          type: 'LOG_NOTE_SUCCESS',
          message: `Note successfully attached to Contact #${contactId}.`,
          contact_id: contactId
        };
      }
    }

    // 2. CREATE_TASK
    if (actionObj.action === 'CREATE_TASK') {
      let contactId = actionObj.contact_id;
      if (!contactId && actionObj.contact_name) {
        const found = db.prepare('SELECT id FROM contacts WHERE display_name LIKE ? LIMIT 1').get(`%${actionObj.contact_name}%`);
        if (found) contactId = found.id;
      }
      const title = (actionObj.priority === 'high' ? '🔥 ' : '') + (actionObj.title || 'Follow up');
      const dueAt = actionObj.due_at || null;

      const res = db.prepare(`
        INSERT INTO tasks (contact_id, title, due_at, created_at)
        VALUES (?, ?, ?, ?)
      `).run(contactId || null, title, dueAt, nowIso);

      return {
        type: 'CREATE_TASK_SUCCESS',
        task_id: res.lastInsertRowid,
        message: `Task #${res.lastInsertRowid} created: "${title}".`
      };
    }

    // 3. DRAFT_EMAIL
    if (actionObj.action === 'DRAFT_EMAIL') {
      let contactId = actionObj.contact_id;
      if (!contactId && actionObj.contact_name) {
        const found = db.prepare('SELECT id FROM contacts WHERE display_name LIKE ? LIMIT 1').get(`%${actionObj.contact_name}%`);
        if (found) contactId = found.id;
      }

      if (contactId) {
        const subject = actionObj.subject || 'Follow-up from Steven Lenz Jr.';
        const body = actionObj.body || '';
        const todayIso = nowIso.slice(0, 10);

        const res = db.prepare(`
          INSERT INTO action_items (plan_date, contact_id, rule, reason, channel, draft_subject, draft_body, draft_source, status, created_at)
          VALUES (?, ?, 'copilot_voice_draft', 'Drafted by AI Co-Pilot', 'email', ?, ?, 'copilot', 'open', ?)
        `).run(todayIso, contactId, subject, body, nowIso);

        return {
          type: 'DRAFT_EMAIL_SUCCESS',
          action_item_id: res.lastInsertRowid,
          message: `Email draft created for Contact #${contactId} and placed in Outbox for approval.`
        };
      }
    }

    return null;
  } catch (err) {
    console.error('[Action Execution Error]', err.message);
    return { type: 'ERROR', error: err.message };
  }
}

module.exports = {
  transcribeAudio,
  processCopilotCommand,
  gatherCrmContext
};
