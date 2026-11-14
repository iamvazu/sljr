'use strict';

/**
 * Steven Lenz Jr. CRM - M2 Deterministic Scoring Engine
 * Pure function: scoreContact(contact, activities, consents, now) -> { score, band, reasons }
 */

const SCORING_CONFIG = {
  intent: {
    max: 40,
    timeline: {
      zeroToThreeMonths: 20,
      threeToSixMonths: 12,
      sixToTwelveMonths: 6,
      exploringOrBlank: 2
    },
    forms: {
      valuationOrListing: 10,
      privateExclusivesOrConcierge: 8,
      contact: 5,
      newsletterOnly: 1,
      additionalFormType: 3,
      maxAdditionalFormPoints: 6
    },
    buyAndSell: 5
  },
  fit: {
    max: 20,
    priceRangeGiven: 5,
    luxuryBudget: 5, // >= $1.5M
    coreEnclaveArea: 5,
    hasPhone: 3,
    smsCallsConsent: 2
  },
  engagement: {
    max: 25,
    firstInboundReply: 10,
    furtherInboundReply: 3,
    maxFurtherInbound: 9,
    multipleSubmissions30d: 5,
    meetingOrShowing: 8
  },
  recency: {
    max: 15,
    within2d: 15,
    within7d: 10,
    within14d: 6,
    within30d: 3
  },
  overrides: {
    spamOrLostScore: 0,
    pastClientOrClosedCap: 30,
    bouncedEmailPenalty: 15,
    withdrawnConsentPenalty: 10
  },
  bands: {
    hot: 70,
    warm: 40,
    cool: 15
  },
  coreAreas: [
    'pleasanton',
    'danville',
    'alamo',
    'walnut creek',
    'san ramon',
    'dublin',
    'livermore',
    'lafayette'
  ]
};

/**
 * Parse budget string into numeric value if possible.
 */
function parseBudgetAmount(budget) {
  if (!budget) return 0;
  const str = String(budget).toUpperCase();
  if (str.includes('M')) {
    const match = str.match(/([\d.]+)\s*M/);
    if (match) return parseFloat(match[1]) * 1000000;
  }
  const clean = str.replace(/[^\d.]/g, '');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
}

/**
 * Pure scoring function.
 *
 * @param {object} contact - Contact row with fields (stage, type, budget, timeline, interest, areas...)
 * @param {Array} activities - Chronological list of activities for this contact
 * @param {Array} consents - Consent rows for this contact
 * @param {Date|string|number} [now] - Current timestamp (defaults to Date.now())
 * @returns {{ score: number, band: 'hot'|'warm'|'cool'|'cold', reasons: string[], breakdown: object }}
 */
function scoreContact(contact, activities, consents, now) {
  contact = contact || {};
  activities = Array.isArray(activities) ? activities : [];
  consents = Array.isArray(consents) ? consents : [];
  const nowDate = now ? new Date(now) : new Date();
  const nowMs = nowDate.getTime();

  const positiveReasons = [];
  const overrideReasons = [];

  // ==========================================
  // 1. INTENT (max 40)
  // ==========================================
  let intentScore = 0;

  // Timeline
  const tl = String(contact.timeline || '').toLowerCase().trim();
  if (tl.includes('0-3') || tl.includes('0 to 3') || tl.includes('immediate') || tl.includes('1-3') || tl.includes('< 3') || tl.includes('asap') || tl.includes('now')) {
    intentScore += SCORING_CONFIG.intent.timeline.zeroToThreeMonths;
    positiveReasons.push({ pts: SCORING_CONFIG.intent.timeline.zeroToThreeMonths, reason: 'Wants to move within 3 months' });
  } else if (tl.includes('3-6') || tl.includes('3 to 6')) {
    intentScore += SCORING_CONFIG.intent.timeline.threeToSixMonths;
    positiveReasons.push({ pts: SCORING_CONFIG.intent.timeline.threeToSixMonths, reason: 'Timeline 3 to 6 months' });
  } else if (tl.includes('6-12') || tl.includes('6 to 12') || tl.includes('year')) {
    intentScore += SCORING_CONFIG.intent.timeline.sixToTwelveMonths;
    positiveReasons.push({ pts: SCORING_CONFIG.intent.timeline.sixToTwelveMonths, reason: 'Timeline 6 to 12 months' });
  } else {
    intentScore += SCORING_CONFIG.intent.timeline.exploringOrBlank;
    positiveReasons.push({ pts: SCORING_CONFIG.intent.timeline.exploringOrBlank, reason: 'Exploring timeline' });
  }

  // Form submissions from activities or contact source
  const formActivities = activities.filter((a) => a.kind === 'form' || a.kind === 'valuation' || a.kind === 'chat');
  const distinctFormTypes = new Set();
  formActivities.forEach((a) => {
    let fType = 'contact';
    try {
      const meta = typeof a.meta === 'object' ? a.meta : (a.meta_json ? JSON.parse(a.meta_json) : {});
      if (meta && meta.form_type) fType = meta.form_type;
    } catch (_) {}
    if (a.kind === 'valuation') fType = 'valuation';
    distinctFormTypes.add(fType.toLowerCase());
  });

  if (contact.source && !distinctFormTypes.size) {
    distinctFormTypes.add(String(contact.source).toLowerCase());
  }

  let highestFormPoints = 0;
  let highestFormReason = '';

  for (const f of distinctFormTypes) {
    if (f.includes('valuation') || f.includes('listing') || f.includes('property')) {
      if (SCORING_CONFIG.intent.forms.valuationOrListing > highestFormPoints) {
        highestFormPoints = SCORING_CONFIG.intent.forms.valuationOrListing;
        highestFormReason = 'Asked for a home valuation or listing inquiry';
      }
    } else if (f.includes('private') || f.includes('concierge') || f.includes('pocket') || f.includes('exclusive')) {
      if (SCORING_CONFIG.intent.forms.privateExclusivesOrConcierge > highestFormPoints) {
        highestFormPoints = SCORING_CONFIG.intent.forms.privateExclusivesOrConcierge;
        highestFormReason = 'Private exclusives / concierge inquiry';
      }
    } else if (f.includes('contact') || f.includes('consultation') || f.includes('inquiry') || f.includes('chat')) {
      if (SCORING_CONFIG.intent.forms.contact > highestFormPoints) {
        highestFormPoints = SCORING_CONFIG.intent.forms.contact;
        highestFormReason = 'Submitted direct contact inquiry';
      }
    } else if (f.includes('newsletter') || f.includes('subscriber')) {
      if (SCORING_CONFIG.intent.forms.newsletterOnly > highestFormPoints) {
        highestFormPoints = SCORING_CONFIG.intent.forms.newsletterOnly;
        highestFormReason = 'Subscribed to newsletter';
      }
    }
  }

  // Fallback if no specific form mapped but forms exist
  if (!highestFormPoints && distinctFormTypes.size > 0) {
    highestFormPoints = SCORING_CONFIG.intent.forms.contact;
    highestFormReason = 'Submitted inquiry form';
  }

  if (highestFormPoints > 0) {
    intentScore += highestFormPoints;
    positiveReasons.push({ pts: highestFormPoints, reason: highestFormReason });
  }

  // Additional distinct form types (3 pts each, up to 6 pts)
  if (distinctFormTypes.size > 1) {
    const additionalCount = distinctFormTypes.size - 1;
    const additionalPts = Math.min(
      SCORING_CONFIG.intent.forms.maxAdditionalFormPoints,
      additionalCount * SCORING_CONFIG.intent.forms.additionalFormType
    );
    intentScore += additionalPts;
    positiveReasons.push({ pts: additionalPts, reason: `${distinctFormTypes.size} distinct inquiry forms submitted` });
  }

  // Interest in both buying and selling
  const interestStr = String(contact.interest || '').toLowerCase();
  if ((interestStr.includes('buy') && interestStr.includes('sell')) || interestStr.includes('both')) {
    intentScore += SCORING_CONFIG.intent.buyAndSell;
    positiveReasons.push({ pts: SCORING_CONFIG.intent.buyAndSell, reason: 'Interested in both buying and selling' });
  }

  const cappedIntent = Math.min(SCORING_CONFIG.intent.max, intentScore);

  // ==========================================
  // 2. FIT (max 20)
  // ==========================================
  let fitScore = 0;

  // Price range given
  const rawBudget = String(contact.budget || '').trim();
  if (rawBudget) {
    fitScore += SCORING_CONFIG.fit.priceRangeGiven;
    positiveReasons.push({ pts: SCORING_CONFIG.fit.priceRangeGiven, reason: 'Budget range specified' });

    // Luxury Budget ($1.5M or more)
    const budgetVal = parseBudgetAmount(rawBudget);
    if (budgetVal >= 1500000 || rawBudget.includes('1.5M') || rawBudget.includes('2M') || rawBudget.includes('3M') || rawBudget.includes('4M') || rawBudget.includes('5M')) {
      fitScore += SCORING_CONFIG.fit.luxuryBudget;
      positiveReasons.push({ pts: SCORING_CONFIG.fit.luxuryBudget, reason: 'Targeting luxury tier ($1.5M+)' });
    }
  }

  // Core East Bay enclave area
  let areas = [];
  if (Array.isArray(contact.areas)) {
    areas = contact.areas;
  } else if (typeof contact.areas_json === 'string') {
    try { areas = JSON.parse(contact.areas_json); } catch (_) {}
  } else if (typeof contact.areas === 'string') {
    areas = [contact.areas];
  }

  const matchedArea = areas.some((a) => {
    const aLower = String(a).toLowerCase();
    return SCORING_CONFIG.coreAreas.some((core) => aLower.includes(core));
  });

  if (matchedArea) {
    fitScore += SCORING_CONFIG.fit.coreEnclaveArea;
    positiveReasons.push({ pts: SCORING_CONFIG.fit.coreEnclaveArea, reason: 'Focusing on core East Bay enclaves' });
  }

  // Phone number on file
  const hasPhone = Boolean(contact.phone || (contact.identities && contact.identities.some((i) => i.type === 'phone')));
  if (hasPhone) {
    fitScore += SCORING_CONFIG.fit.hasPhone;
    positiveReasons.push({ pts: SCORING_CONFIG.fit.hasPhone, reason: 'Phone number on file' });
  }

  // Calls and texts consent granted
  const smsConsentRow = consents.find((c) => c.channel === 'sms_calls');
  const smsConsentGranted = smsConsentRow ? smsConsentRow.granted === 1 : Boolean(contact.sms_consent);
  if (smsConsentGranted) {
    fitScore += SCORING_CONFIG.fit.smsCallsConsent;
    positiveReasons.push({ pts: SCORING_CONFIG.fit.smsCallsConsent, reason: 'Direct call/text consent granted' });
  }

  const cappedFit = Math.min(SCORING_CONFIG.fit.max, fitScore);

  // ==========================================
  // 3. ENGAGEMENT (max 25)
  // ==========================================
  let engagementScore = 0;

  // Inbound messages/replies after the initial form
  const inboundActivities = activities.filter((a) => a.direction === 'in' || a.kind === 'email_in' || a.kind === 'sms_in' || a.kind === 'call_in');
  if (inboundActivities.length >= 1) {
    engagementScore += SCORING_CONFIG.engagement.firstInboundReply;
    positiveReasons.push({ pts: SCORING_CONFIG.engagement.firstInboundReply, reason: 'Replied to communication' });

    if (inboundActivities.length > 1) {
      const furtherCount = inboundActivities.length - 1;
      const furtherPts = Math.min(
        SCORING_CONFIG.engagement.maxFurtherInbound,
        furtherCount * SCORING_CONFIG.engagement.furtherInboundReply
      );
      engagementScore += furtherPts;
      positiveReasons.push({ pts: furtherPts, reason: 'Multiple inbound replies logged' });
    }
  }

  // Two or more form submissions within 30 days
  if (formActivities.length >= 2) {
    let hasPairWithin30d = false;
    for (let i = 0; i < formActivities.length; i++) {
      const t1 = new Date(formActivities[i].occurred_at || formActivities[i].created_at).getTime();
      for (let j = i + 1; j < formActivities.length; j++) {
        const t2 = new Date(formActivities[j].occurred_at || formActivities[j].created_at).getTime();
        if (Math.abs(t1 - t2) <= 30 * 24 * 60 * 60 * 1000) {
          hasPairWithin30d = true;
          break;
        }
      }
      if (hasPairWithin30d) break;
    }
    if (hasPairWithin30d) {
      engagementScore += SCORING_CONFIG.engagement.multipleSubmissions30d;
      positiveReasons.push({ pts: SCORING_CONFIG.engagement.multipleSubmissions30d, reason: 'Submitted multiple forms within 30 days' });
    }
  }

  // Meeting or showing logged
  const hasMeeting = activities.some((a) => a.kind === 'meeting' || a.kind === 'showing');
  if (hasMeeting) {
    engagementScore += SCORING_CONFIG.engagement.meetingOrShowing;
    positiveReasons.push({ pts: SCORING_CONFIG.engagement.meetingOrShowing, reason: 'In-person meeting or showing conducted' });
  }

  const cappedEngagement = Math.min(SCORING_CONFIG.engagement.max, engagementScore);

  // ==========================================
  // 4. RECENCY (max 15)
  // ==========================================
  let recencyScore = 0;

  // Find most recent inbound activity or form submission
  const relevantActivities = activities.filter((a) => a.direction === 'in' || a.kind === 'form' || a.kind === 'valuation' || a.kind === 'chat');
  let newestInboundMs = 0;

  for (const a of relevantActivities) {
    const t = new Date(a.occurred_at || a.created_at).getTime();
    if (t > newestInboundMs) newestInboundMs = t;
  }

  // Also check contact.created_at as fallback
  if (!newestInboundMs && contact.created_at) {
    newestInboundMs = new Date(contact.created_at).getTime();
  }

  if (newestInboundMs > 0) {
    const ageMs = Math.max(0, nowMs - newestInboundMs);
    const dayMs = 24 * 60 * 60 * 1000;

    if (ageMs <= 2 * dayMs) {
      recencyScore = SCORING_CONFIG.recency.within2d;
      positiveReasons.push({ pts: SCORING_CONFIG.recency.within2d, reason: 'Active within past 2 days' });
    } else if (ageMs <= 7 * dayMs) {
      recencyScore = SCORING_CONFIG.recency.within7d;
      positiveReasons.push({ pts: SCORING_CONFIG.recency.within7d, reason: 'Active within past 7 days' });
    } else if (ageMs <= 14 * dayMs) {
      recencyScore = SCORING_CONFIG.recency.within14d;
      positiveReasons.push({ pts: SCORING_CONFIG.recency.within14d, reason: 'Active within past 14 days' });
    } else if (ageMs <= 30 * dayMs) {
      recencyScore = SCORING_CONFIG.recency.within30d;
      positiveReasons.push({ pts: SCORING_CONFIG.recency.within30d, reason: 'Active within past 30 days' });
    }
  }

  const cappedRecency = Math.min(SCORING_CONFIG.recency.max, recencyScore);

  // Raw Total
  let total = cappedIntent + cappedFit + cappedEngagement + cappedRecency;

  // ==========================================
  // 5. OVERRIDES (in exact order)
  // ==========================================
  const stage = String(contact.stage || '').toLowerCase();
  const type = String(contact.type || '').toLowerCase();

  // 1. Stage spam or lost: score 0
  if (stage === 'spam' || stage === 'lost') {
    total = SCORING_CONFIG.overrides.spamOrLostScore;
    overrideReasons.push('Contact marked as ' + stage);
  }

  // 2. Type past_client or stage closed: capped at 30
  if (type === 'past_client' || stage === 'closed' || stage === 'past_client') {
    if (total > SCORING_CONFIG.overrides.pastClientOrClosedCap) {
      total = SCORING_CONFIG.overrides.pastClientOrClosedCap;
    }
    overrideReasons.push('Past client / transaction closed');
  }

  // 3. Primary email status bounced: subtract 15
  const emailIdentity = (contact.identities || []).find((i) => i.type === 'email');
  const isBounced = (emailIdentity && emailIdentity.status === 'bounced') || contact.email_status === 'bounced';
  if (isBounced) {
    total -= SCORING_CONFIG.overrides.bouncedEmailPenalty;
    overrideReasons.push('Primary email bounced');
  }

  // 4. Email marketing consent withdrawn: subtract 10
  const mktConsentRow = consents.find((c) => c.channel === 'email_marketing');
  const mktConsentWithdrawn = mktConsentRow ? mktConsentRow.granted === 0 : false;
  if (mktConsentWithdrawn) {
    total -= SCORING_CONFIG.overrides.withdrawnConsentPenalty;
    overrideReasons.push('Email marketing consent withdrawn');
  }

  // Final Clamp 0 to 100
  const finalScore = Math.max(0, Math.min(100, Math.round(total)));

  // Determine Band
  let band = 'cold';
  if (finalScore >= SCORING_CONFIG.bands.hot) {
    band = 'hot';
  } else if (finalScore >= SCORING_CONFIG.bands.warm) {
    band = 'warm';
  } else if (finalScore >= SCORING_CONFIG.bands.cool) {
    band = 'cool';
  }

  // Top 3 positive contributions + all active overrides
  positiveReasons.sort((a, b) => b.pts - a.pts);
  const topReasons = positiveReasons.slice(0, 3).map((r) => r.reason);
  const reasons = [...topReasons, ...overrideReasons];

  return {
    score: finalScore,
    band,
    reasons,
    all_reasons: positiveReasons.map((r) => r.reason).concat(overrideReasons),
    breakdown: {
      intent: cappedIntent,
      fit: cappedFit,
      engagement: cappedEngagement,
      recency: cappedRecency,
      raw_total: cappedIntent + cappedFit + cappedEngagement + cappedRecency,
      final_score: finalScore
    }
  };
}

module.exports = {
  SCORING_CONFIG,
  scoreContact
};
