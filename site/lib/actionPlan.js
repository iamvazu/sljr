'use strict';

/**
 * Steven Lenz Jr. CRM - M2 Daily Action Plan Engine (Pre-AI & Templates)
 *
 * Implements selection rules, exclusions, ranking, templates,
 * consent validation, and approval/done/snooze/skip workflows.
 */

const { getDb } = require('../db/database');
const { stripHtml } = require('../middleware/security');

const RULES = {
  NEW_LEAD: 'new_lead',
  AWAITING_REPLY: 'awaiting_reply',
  FOLLOW_UP_DUE: 'follow_up_due',
  HOT_NO_TOUCH: 'hot_no_touch',
  WARM_NO_TOUCH: 'warm_no_touch',
  DEAL_STALLED: 'deal_stalled',
  PAST_CLIENT_TOUCH: 'past_client_touch'
};

const RULE_PRIORITY_ORDER = [
  RULES.NEW_LEAD,
  RULES.AWAITING_REPLY,
  RULES.FOLLOW_UP_DUE,
  RULES.HOT_NO_TOUCH,
  RULES.WARM_NO_TOUCH,
  RULES.DEAL_STALLED,
  RULES.PAST_CLIENT_TOUCH
];

/**
 * Get date string (YYYY-MM-DD) in America/Los_Angeles timezone.
 */
function getPlanDate(now) {
  const d = now ? new Date(now) : new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

/**
 * Check if the given date is within working hours (8:00 AM - 7:00 PM Pacific).
 */
function isWorkingHours(date) {
  const d = new Date(date);
  const hour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    hour12: false
  }).format(d), 10);
  return hour >= 8 && hour < 19;
}

/**
 * Calculate elapsed working hours between two dates.
 */
function elapsedWorkingHours(startDate, endDate) {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (end <= start) return 0;
  // Approximation of working hours: ~11 working hours per 24 hours
  const totalHours = (end - start) / (1000 * 60 * 60);
  return totalHours * (11 / 24);
}

/**
 * Fixed deterministic templates for each rule when Gemini is not used or unavailable.
 */
function generateTemplate(rule, channel, contact, context = {}) {
  const firstName = (contact.first_name || (contact.display_name || 'there').split(/\s+/)[0]).trim();
  const taskTitle = context.task_title || 'our conversation';
  const dealTitle = context.deal_title || 'your property';

  if (channel === 'call') {
    switch (rule) {
      case RULES.NEW_LEAD:
        return {
          subject: 'Call Talking Points',
          body: [
            '1. Thank them for visiting the site and submitting their inquiry.',
            '2. Inquire about their target neighborhood and timing.',
            '3. Propose a brief 10-minute discovery call or coffee meeting in Pleasanton.'
          ].join('\n'),
          source: 'template'
        };
      case RULES.AWAITING_REPLY:
        return {
          subject: 'Call Talking Points',
          body: [
            '1. Reference their recent note/inquiry.',
            '2. Directly answer their question regarding the local market.',
            '3. Offer to provide off-market comparables or set up an upcoming tour.'
          ].join('\n'),
          source: 'template'
        };
      case RULES.FOLLOW_UP_DUE:
        return {
          subject: 'Call Talking Points',
          body: [
            `1. Follow up regarding scheduled task: ${taskTitle}.`,
            '2. Check in on search criteria or decision timeline.',
            '3. Outline concrete next steps.'
          ].join('\n'),
          source: 'template'
        };
      case RULES.HOT_NO_TOUCH:
        return {
          subject: 'Call Talking Points',
          body: [
            '1. Highlight upcoming off-market and private exclusive inventory.',
            '2. Reconnect on budget and preferred enclave.',
            '3. Offer private weekend preview appointment.'
          ].join('\n'),
          source: 'template'
        };
      case RULES.WARM_NO_TOUCH:
        return {
          subject: 'Call Talking Points',
          body: [
            '1. Friendly relationship check-in.',
            '2. Share recent neighborhood sales activity.',
            '3. Confirm if timing is still on track.'
          ].join('\n'),
          source: 'template'
        };
      case RULES.DEAL_STALLED:
        return {
          subject: 'Call Talking Points',
          body: [
            `1. Check in on active deal: ${dealTitle}.`,
            '2. Discuss any pending lender or inspection contingencies.',
            '3. Maintain momentum with clear next milestone.'
          ].join('\n'),
          source: 'template'
        };
      case RULES.PAST_CLIENT_TOUCH:
      default:
        return {
          subject: 'Call Talking Points',
          body: [
            '1. Friendly personal check-in.',
            '2. Offer local contractor or service recommendations if needed.',
            '3. Share current home equity and market valuation update.'
          ].join('\n'),
          source: 'template'
        };
    }
  }

  if (channel === 'text') {
    switch (rule) {
      case RULES.NEW_LEAD:
        return {
          subject: '',
          body: `Hi ${firstName}, Steven Lenz Jr. with Compass here. Thank you for your inquiry! I would love to answer any questions about the East Bay market. What timing are you thinking?`,
          source: 'template'
        };
      case RULES.AWAITING_REPLY:
        return {
          subject: '',
          body: `Hi ${firstName}, following up on your note! Let me know if you would like to connect briefly today.`,
          source: 'template'
        };
      case RULES.FOLLOW_UP_DUE:
        return {
          subject: '',
          body: `Hi ${firstName}, checking in regarding ${taskTitle}. Let me know if later this week works for a quick chat!`,
          source: 'template'
        };
      default:
        return {
          subject: '',
          body: `Hi ${firstName}, Steven Lenz Jr. with Compass checking in. Let me know if you have any questions on the local market!`,
          source: 'template'
        };
    }
  }

  // Default: Email draft (60 to 120 words)
  switch (rule) {
    case RULES.NEW_LEAD:
      return {
        subject: 'Following up on your Pleasanton & East Bay inquiry',
        body: `Hi ${firstName},\n\nThank you for reaching out regarding real estate in the East Bay. I wanted to personally connect and see how I can best assist with your plans.\n\nWhether you are exploring neighborhoods, evaluating home values, or considering upcoming timing, I would be glad to share private market insights or arrange a private tour.\n\nWhat timing or neighborhood are you currently focusing on?\n\nBest regards,\nSteven`,
        source: 'template'
      };
    case RULES.AWAITING_REPLY:
      return {
        subject: 'Checking in regarding your note',
        body: `Hi ${firstName},\n\nI wanted to follow up on your recent note and ensure you received the details you needed. The market moves quickly, and I am here to help you navigate options with discreet, direct advice.\n\nPlease let me know if you would like me to pull comparable off-market opportunities or schedule a time to talk.\n\nBest regards,\nSteven`,
        source: 'template'
      };
    case RULES.FOLLOW_UP_DUE:
      return {
        subject: `Scheduled update: ${taskTitle}`,
        body: `Hi ${firstName},\n\nI am touching base regarding our scheduled follow-up on ${taskTitle}. I wanted to review our next steps and see how your timing is evolving.\n\nWould later this week work for a brief conversation?\n\nBest regards,\nSteven`,
        source: 'template'
      };
    case RULES.HOT_NO_TOUCH:
      return {
        subject: 'Private market update for you',
        body: `Hi ${firstName},\n\nI was reviewing upcoming inventory across our core enclaves and thought of you. A few noteworthy opportunities are coming to market that align with what we discussed.\n\nLet me know if you would like a private preview before public marketing begins.\n\nBest regards,\nSteven`,
        source: 'template'
      };
    case RULES.WARM_NO_TOUCH:
      return {
        subject: 'Checking in on your East Bay search',
        body: `Hi ${firstName},\n\nI wanted to check in and see how your timing and search are coming along. Inventory across Pleasanton and surrounding areas continues to shift, and I would be glad to send updated neighborhood comps whenever helpful.\n\nAre you still targeting the same timeline?\n\nBest regards,\nSteven`,
        source: 'template'
      };
    case RULES.DEAL_STALLED:
      return {
        subject: `Next steps on ${dealTitle}`,
        body: `Hi ${firstName},\n\nI wanted to touch base regarding our progress on ${dealTitle}. We want to ensure everything stays on schedule and address any questions you have on timing or contingencies.\n\nCould we connect briefly by phone today?\n\nBest regards,\nSteven`,
        source: 'template'
      };
    case RULES.PAST_CLIENT_TOUCH:
    default:
      return {
        subject: 'Thinking of you — East Bay real estate update',
        body: `Hi ${firstName},\n\nI was thinking of you and wanted to check in. I hope you are enjoying your home and everything is going wonderfully.\n\nIf you ever need local contractor recommendations, home equity updates, or current market valuation insights, I am always here as your resource.\n\nWishing you all the best!\n\nWarmly,\nSteven`,
        source: 'template'
      };
  }
}

/**
 * Validate channel against consent rules.
 * If preferred channel is not allowed, falls back gracefully:
 * email -> call -> text (if sms consent) -> none.
 */
function resolveChannelAndConsent(contact, preferredChannel, consents = []) {
  const hasEmail = Boolean(contact.primary_email || (contact.identities && contact.identities.some((i) => i.kind === 'email')));
  const hasPhone = Boolean(contact.primary_phone || (contact.identities && contact.identities.some((i) => i.kind === 'phone')));

  const mktConsent = consents.find((c) => c.channel === 'email_marketing');
  const smsConsent = consents.find((c) => c.channel === 'sms_calls');

  const emailAllowed = hasEmail && (!mktConsent || mktConsent.granted === 1);
  const smsAllowed = hasPhone && (smsConsent && smsConsent.granted === 1);
  const callAllowed = hasPhone;

  let channel = preferredChannel;
  let allowed = false;
  let reason = '';

  if (channel === 'email') {
    if (emailAllowed) {
      allowed = true;
    } else if (callAllowed) {
      channel = 'call';
      allowed = true;
    } else {
      allowed = false;
      reason = 'No active email or phone consent on file.';
    }
  } else if (channel === 'call') {
    if (callAllowed) {
      allowed = true;
    } else if (emailAllowed) {
      channel = 'email';
      allowed = true;
    } else {
      allowed = false;
      reason = 'No phone number on file.';
    }
  } else if (channel === 'text') {
    if (smsAllowed) {
      allowed = true;
    } else if (callAllowed) {
      channel = 'call';
      allowed = true;
    } else if (emailAllowed) {
      channel = 'email';
      allowed = true;
    } else {
      allowed = false;
      reason = 'SMS consent not granted.';
    }
  }

  return { channel, allowed, reason };
}

/**
 * Select qualifying action plan candidates according to PRD priority 1-7 rules.
 * Applies exclusions, ranks by priority, score, and oldest waiting, returns top 10.
 */
function selectActionPlanCandidates(dbInstance, now = new Date()) {
  const db = dbInstance || getDb();
  const nowDate = new Date(now);
  const nowIso = nowDate.toISOString();
  const planDateStr = getPlanDate(nowDate);

  const contacts = db.prepare(`
    SELECT c.*,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_email,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'phone' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_phone
    FROM contacts c
    WHERE c.merged_into IS NULL
  `).all();

  const candidates = [];

  for (const c of contacts) {
    // ----------------------------------------------------
    // EXCLUSIONS (applied before ranking)
    // ----------------------------------------------------
    // 1. Stage spam or lost
    if (c.stage === 'spam' || c.stage === 'lost') continue;

    // 2. Discreet contacts are never handled automatically
    if (c.discreet === 1) continue;

    // 3. Snoozed until a future date
    const snoozedItem = db.prepare(`
      SELECT 1 FROM action_items
      WHERE contact_id = ? AND status = 'snoozed' AND snoozed_until > ?
      LIMIT 1
    `).get(c.id, planDateStr);
    if (snoozedItem) continue;

    // Fetch contact's activities, open tasks, deals, and consents
    const activities = db.prepare(`
      SELECT * FROM activities WHERE contact_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 50
    `).all(c.id);

    const openTasks = db.prepare(`
      SELECT * FROM tasks WHERE contact_id = ? AND done_at IS NULL ORDER BY due_at ASC
    `).all(c.id);

    const openDeals = db.prepare(`
      SELECT d.*, s.is_won, s.is_lost
      FROM deals d
      JOIN pipeline_stages s ON s.id = d.stage_id
      WHERE d.contact_id = ? AND s.is_won = 0 AND s.is_lost = 0
    `).all(c.id);

    const consents = db.prepare(`
      SELECT * FROM consents WHERE contact_id = ? ORDER BY recorded_at DESC
    `).all(c.id);

    const lastActivity = activities[0] || null;
    const lastInbound = activities.find((a) => a.direction === 'in') || null;
    const lastOutbound = activities.find((a) => a.direction === 'out') || null;

    let matchedRule = null;
    let rulePriority = 99;
    let ruleReason = '';
    let suggestedChannel = 'email';
    let context = {};

    // ----------------------------------------------------
    // Priority 1: new_lead (Stage new, no outbound activity yet)
    // ----------------------------------------------------
    if (c.stage === 'new' && !lastOutbound && !c.last_outbound_at) {
      matchedRule = RULES.NEW_LEAD;
      rulePriority = 1;
      ruleReason = 'New lead, not yet contacted';
      suggestedChannel = c.primary_phone ? 'call' : 'email';
    }

    // ----------------------------------------------------
    // Priority 2: awaiting_reply (Last activity is inbound & older than 4 working hours)
    // ----------------------------------------------------
    else if (lastActivity && lastActivity.direction === 'in') {
      const elapsedWork = elapsedWorkingHours(lastActivity.occurred_at || lastActivity.created_at, nowIso);
      if (elapsedWork >= 4) {
        matchedRule = RULES.AWAITING_REPLY;
        rulePriority = 2;
        ruleReason = 'Awaiting reply to inbound inquiry';
        suggestedChannel = lastActivity.kind === 'sms_in' ? 'text' : (lastActivity.kind === 'call_in' ? 'call' : 'email');
      }
    }

    // ----------------------------------------------------
    // Priority 3: follow_up_due (Open task is due today or overdue)
    // ----------------------------------------------------
    if (!matchedRule && openTasks.length > 0) {
      const dueTask = openTasks.find((t) => t.due_at && t.due_at.slice(0, 10) <= planDateStr);
      if (dueTask) {
        matchedRule = RULES.FOLLOW_UP_DUE;
        rulePriority = 3;
        ruleReason = `Follow-up task due: ${dueTask.title}`;
        suggestedChannel = 'email';
        context.task_title = dueTask.title;
      }
    }

    // ----------------------------------------------------
    // Priority 4: hot_no_touch (Band Hot & no outbound in 3 days)
    // ----------------------------------------------------
    if (!matchedRule && c.score_band === 'hot') {
      const daysSinceOutbound = c.last_outbound_at
        ? (nowDate.getTime() - new Date(c.last_outbound_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999;
      if (daysSinceOutbound >= 3) {
        matchedRule = RULES.HOT_NO_TOUCH;
        rulePriority = 4;
        ruleReason = 'Hot prospect with no touchpoint in 3 days';
        suggestedChannel = c.primary_phone ? 'call' : 'email';
      }
    }

    // ----------------------------------------------------
    // Priority 5: warm_no_touch (Band Warm & no outbound in 7 days)
    // ----------------------------------------------------
    if (!matchedRule && c.score_band === 'warm') {
      const daysSinceOutbound = c.last_outbound_at
        ? (nowDate.getTime() - new Date(c.last_outbound_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999;
      if (daysSinceOutbound >= 7) {
        matchedRule = RULES.WARM_NO_TOUCH;
        rulePriority = 5;
        ruleReason = 'Warm contact with no touchpoint in 7 days';
        suggestedChannel = 'email';
      }
    }

    // ----------------------------------------------------
    // Priority 6: deal_stalled (Open deal with no activity in 14 days)
    // ----------------------------------------------------
    if (!matchedRule && openDeals.length > 0) {
      const daysSinceAct = lastActivity
        ? (nowDate.getTime() - new Date(lastActivity.occurred_at || lastActivity.created_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999;
      if (daysSinceAct >= 14) {
        matchedRule = RULES.DEAL_STALLED;
        rulePriority = 6;
        ruleReason = `Active deal "${openDeals[0].title}" stalled with no update in 14 days`;
        suggestedChannel = 'call';
        context.deal_title = openDeals[0].title;
      }
    }

    // ----------------------------------------------------
    // Priority 7: past_client_touch (Type past_client, no outbound in 90 days)
    // ----------------------------------------------------
    if (!matchedRule && (c.type === 'past_client' || c.stage === 'past_client')) {
      const daysSinceOutbound = c.last_outbound_at
        ? (nowDate.getTime() - new Date(c.last_outbound_at).getTime()) / (1000 * 60 * 60 * 24)
        : 999;
      if (daysSinceOutbound >= 90) {
        matchedRule = RULES.PAST_CLIENT_TOUCH;
        rulePriority = 7;
        ruleReason = 'Past client check-in / closing anniversary';
        suggestedChannel = 'email';
      }
    }

    if (!matchedRule) continue;

    // Check exclusion 4: Contact skipped under the same rule in the last 7 days
    const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentSkip = db.prepare(`
      SELECT 1 FROM action_items
      WHERE contact_id = ? AND rule = ? AND status = 'skipped' AND resolved_at > ?
      LIMIT 1
    `).get(c.id, matchedRule, sevenDaysAgo);
    if (recentSkip) continue;

    // Resolve channel & consent
    const channelResult = resolveChannelAndConsent(c, suggestedChannel, consents);

    // Build draft
    const template = generateTemplate(matchedRule, channelResult.channel, c, context);

    candidates.push({
      contact_id: c.id,
      contact: c,
      rule: matchedRule,
      rule_priority: rulePriority,
      reason: ruleReason,
      channel: channelResult.channel,
      consent_allowed: channelResult.allowed,
      consent_reason: channelResult.reason,
      draft_subject: template.subject,
      draft_body: template.body,
      draft_source: template.source,
      score: c.score || 0,
      waiting_since: c.last_inbound_at || c.created_at || nowIso
    });
  }

  // ----------------------------------------------------
  // RANKING:
  // 1. By priority ascending (1 -> 7)
  // 2. By score descending
  // 3. By oldest waiting ascending
  // ----------------------------------------------------
  candidates.sort((a, b) => {
    if (a.rule_priority !== b.rule_priority) return a.rule_priority - b.rule_priority;
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.waiting_since).getTime() - new Date(b.waiting_since).getTime();
  });

  return candidates;
}

/**
 * Generate or update the daily action plan for Today.
 * Idempotent: running twice on the same day preserves existing items and adds only new ones up to 10.
 */
function generateDailyActionPlan(dbInstance, now = new Date()) {
  const db = dbInstance || getDb();
  const planDateStr = getPlanDate(now);
  const nowIso = new Date(now).toISOString();

  // 1. Check existing items for today
  const existingItems = db.prepare(`
    SELECT * FROM action_items WHERE plan_date = ?
  `).all(planDateStr);

  const existingContactIds = new Set(existingItems.map((item) => item.contact_id));
  const remainingSlots = Math.max(0, 10 - existingItems.length);

  let added = 0;
  if (remainingSlots > 0) {
    const candidates = selectActionPlanCandidates(db, now);
    for (const cand of candidates) {
      if (existingContactIds.has(cand.contact_id)) continue;
      if (added >= remainingSlots) break;

      db.prepare(`
        INSERT INTO action_items (
          plan_date, contact_id, rule, reason, channel,
          draft_subject, draft_body, draft_source, status,
          edited, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)
      `).run(
        planDateStr,
        cand.contact_id,
        cand.rule,
        cand.reason,
        cand.channel,
        cand.draft_subject,
        cand.draft_body,
        cand.draft_source,
        nowIso
      );

      existingContactIds.add(cand.contact_id);
      added++;
    }
  }

  return {
    ok: true,
    plan_date: planDateStr,
    existing: existingItems.length,
    added,
    total: existingItems.length + added
  };
}

/**
 * Get Today's complete overview: action plan cards, due tasks, new leads, and budget banners.
 */
function getTodayOverview(dbInstance, now = new Date()) {
  const db = dbInstance || getDb();
  const planDateStr = getPlanDate(now);

  // Auto-generate plan for today if empty
  generateDailyActionPlan(db, now);

  const items = db.prepare(`
    SELECT ai.*,
      c.display_name, c.first_name, c.last_name, c.stage as contact_stage,
      c.score as contact_score, c.score_band as contact_score_band,
      c.score_reasons_json as contact_score_reasons_json,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_email,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'phone' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_phone
    FROM action_items ai
    JOIN contacts c ON c.id = ai.contact_id
    WHERE ai.plan_date = ?
    ORDER BY ai.id ASC
  `).all(planDateStr).map((item) => {
    try { item.contact_score_reasons = JSON.parse(item.contact_score_reasons_json || '[]'); } catch (_) { item.contact_score_reasons = []; }
    delete item.contact_score_reasons_json;

    // Check consent for current channel
    const consents = db.prepare('SELECT * FROM consents WHERE contact_id = ? ORDER BY recorded_at DESC').all(item.contact_id);
    const resolved = resolveChannelAndConsent({
      primary_email: item.primary_email,
      primary_phone: item.primary_phone
    }, item.channel, consents);

    item.consent_allowed = resolved.allowed;
    item.consent_reason = resolved.reason;
    return item;
  });

  // Open tasks due today or overdue
  const dueTasks = db.prepare(`
    SELECT t.*, c.display_name as contact_name
    FROM tasks t
    LEFT JOIN contacts c ON c.id = t.contact_id
    WHERE t.done_at IS NULL AND t.due_at IS NOT NULL AND t.due_at <= ?
    ORDER BY t.due_at ASC
  `).all(planDateStr + 'T23:59:59.999Z');

  // New leads not yet contacted
  const newLeads = db.prepare(`
    SELECT * FROM leads WHERE status = 'new' ORDER BY received_at DESC LIMIT 10
  `).all();

  // Budget status and banners
  const dbModule = require('../db/database');
  const usage = dbModule.getUsageStats();
  const banners = [];

  if (usage.ai_spend_usd >= usage.ai_budget_cap_usd) {
    banners.push({ type: 'ai_budget', message: `Gemini AI monthly budget cap ($${usage.ai_budget_cap_usd}) reached. Standard templates are active.` });
  }
  if (usage.email_spend_usd >= usage.email_budget_cap_usd) {
    banners.push({ type: 'email_budget', message: `Email sending monthly budget cap ($${usage.email_budget_cap_usd}) reached.` });
  }

  return {
    ok: true,
    plan_date: planDateStr,
    action_items: items,
    due_tasks: dueTasks,
    new_leads: newLeads,
    banners,
    usage
  };
}

/**
 * Approve & Send an action plan item:
 * Runs consent check, creates messages row with approved_at, queues outbox,
 * writes email_out activity, marks item 'sent'.
 */
function approveActionItem(actionItemId, dbInstance, baseUrl = '') {
  const db = dbInstance || getDb();
  const item = db.prepare(`
    SELECT ai.*, c.first_name, c.display_name,
      (SELECT value FROM contact_identities WHERE contact_id = c.id AND kind = 'email' ORDER BY is_primary DESC, id ASC LIMIT 1) as primary_email
    FROM action_items ai
    JOIN contacts c ON c.id = ai.contact_id
    WHERE ai.id = ?
  `).get(actionItemId);

  if (!item) throw new Error('Action item not found.');
  if (item.status === 'sent') return { ok: true, already_sent: true };

  const consents = db.prepare('SELECT * FROM consents WHERE contact_id = ? ORDER BY recorded_at DESC').all(item.contact_id);
  const resolved = resolveChannelAndConsent({ primary_email: item.primary_email }, item.channel, consents);

  if (!resolved.allowed) {
    throw new Error(`Cannot approve: ${resolved.reason || 'Consent check failed.'}`);
  }

  const now = new Date().toISOString();

  if (item.channel === 'email') {
    if (!item.primary_email) throw new Error('No email address on file for this contact.');

    const { sendOutboundEmail } = require('./crm');
    const sendRes = sendOutboundEmail({
      contact_id: item.contact_id,
      to_value: item.primary_email,
      subject: item.draft_subject || 'Following up',
      body: item.draft_body || '',
      origin: 'action_plan',
      baseUrl: baseUrl || 'http://127.0.0.1:4173'
    }, db);

    // Update message row with approved_at
    db.prepare(`
      UPDATE messages SET approved_at = ? WHERE id = ?
    `).run(now, sendRes.message_id);

    // Mark action item sent
    db.prepare(`
      UPDATE action_items SET status = 'sent', resolved_at = ? WHERE id = ?
    `).run(now, actionItemId);

    return { ok: true, status: 'sent', message_id: sendRes.message_id };
  }

  // Non-email approval (e.g. approved call)
  db.prepare(`
    UPDATE action_items SET status = 'approved', resolved_at = ? WHERE id = ?
  `).run(now, actionItemId);

  return { ok: true, status: 'approved' };
}

/**
 * Mark a call or text action item done:
 * Writes the corresponding activity and marks item 'done'.
 */
function markActionItemDone(actionItemId, dbInstance) {
  const db = dbInstance || getDb();
  const item = db.prepare('SELECT * FROM action_items WHERE id = ?').get(actionItemId);
  if (!item) throw new Error('Action item not found.');

  const now = new Date().toISOString();
  const kind = item.channel === 'call' ? 'call' : (item.channel === 'text' ? 'note' : 'note');

  db.prepare(`
    INSERT INTO activities (
      contact_id, kind, direction, subject, body, meta_json, occurred_at, created_at
    ) VALUES (?, ?, 'out', ?, ?, ?, ?, ?)
  `).run(
    item.contact_id,
    kind,
    `Action Plan: ${item.channel.toUpperCase()} completed`,
    item.draft_body || item.reason,
    JSON.stringify({ action_item_id: actionItemId, rule: item.rule }),
    now,
    now
  );

  db.prepare(`
    UPDATE action_items SET status = 'done', resolved_at = ? WHERE id = ?
  `).run(now, actionItemId);

  // Update last_outbound_at on contact
  db.prepare(`
    UPDATE contacts SET last_outbound_at = ?, updated_at = ? WHERE id = ?
  `).run(now, now, item.contact_id);

  // Rescore contact
  try {
    const { rescoreContact } = require('../db/database');
    rescoreContact(item.contact_id, db);
  } catch (_) {}

  return { ok: true, status: 'done' };
}

/**
 * Snooze an action item for N days.
 */
function snoozeActionItem(actionItemId, days = 1, dbInstance) {
  const db = dbInstance || getDb();
  const now = new Date();
  const snoozeDate = new Date(now.getTime() + (Number(days) || 1) * 24 * 60 * 60 * 1000);
  const snoozeDateStr = getPlanDate(snoozeDate);

  db.prepare(`
    UPDATE action_items
    SET status = 'snoozed', snoozed_until = ?, resolved_at = ?
    WHERE id = ?
  `).run(snoozeDateStr, now.toISOString(), actionItemId);

  return { ok: true, status: 'snoozed', snoozed_until: snoozeDateStr };
}

/**
 * Skip an action item with a reason.
 */
function skipActionItem(actionItemId, reason = '', dbInstance) {
  const db = dbInstance || getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE action_items
    SET status = 'skipped', skip_reason = ?, resolved_at = ?
    WHERE id = ?
  `).run(stripHtml(reason).slice(0, 200), now, actionItemId);

  return { ok: true, status: 'skipped', skip_reason: reason };
}

/**
 * Edit an action item's draft: sets edited = 1.
 */
function editActionItemDraft(actionItemId, { subject, body } = {}, dbInstance) {
  const db = dbInstance || getDb();
  const updates = [];
  const params = [];

  if (subject !== undefined) {
    updates.push('draft_subject = ?');
    params.push(stripHtml(subject).slice(0, 200));
  }
  if (body !== undefined) {
    updates.push('draft_body = ?');
    params.push(String(body).slice(0, 5000));
  }

  if (!updates.length) return { ok: false, error: 'No fields to update.' };

  updates.push('edited = 1');
  params.push(actionItemId);

  db.prepare(`
    UPDATE action_items SET ${updates.join(', ')} WHERE id = ?
  `).run(...params);

  return { ok: true, edited: true };
}

module.exports = {
  RULES,
  RULE_PRIORITY_ORDER,
  getPlanDate,
  isWorkingHours,
  elapsedWorkingHours,
  generateTemplate,
  resolveChannelAndConsent,
  selectActionPlanCandidates,
  generateDailyActionPlan,
  getTodayOverview,
  approveActionItem,
  markActionItemDone,
  snoozeActionItem,
  skipActionItem,
  editActionItemDraft
};
