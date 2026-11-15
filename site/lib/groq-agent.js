'use strict';

/**
 * site/lib/groq-agent.js
 * LLM Advisory Agent powered by Groq (Qwen / Llama open-source models).
 * Strict adherence to California DRE standards, Fair Housing laws, and live listings data.
 */

const siteDb = require('../db/database');
const fallbackAgent = require('../../server/ai');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function getActiveListingsContext() {
  try {
    const listings = siteDb.getAllListings();
    if (!listings || !listings.length) return 'No public listings currently active.';
    return listings.map((l) => {
      const price = l.price_num ? `$${Number(l.price_num).toLocaleString()}` : (l.price || 'Contact for Price');
      const beds = l.beds || 'N/A';
      const baths = l.baths || 'N/A';
      const sqft = l.sqft ? `${l.sqft} sqft` : '';
      const status = l.active ? 'Active' : 'Closed / Off-Market';
      return `• [ID: ${l.id}] ${l.address}, ${l.city}, ${l.state || 'CA'} ${l.zip || ''} | Price: ${price} | ${beds} bd, ${baths} ba, ${sqft} | Status: ${status} | Features: ${l.summary || l.description || 'Luxury estate'}`;
    }).join('\n');
  } catch (err) {
    return 'Listings temporarily unavailable.';
  }
}

function buildSystemPrompt(locationContext = {}) {
  const listingsText = getActiveListingsContext();
  const visitorLoc = locationContext.city ? `${locationContext.city}, ${locationContext.region || 'CA'} (${locationContext.country || 'USA'})` : 'San Francisco Bay Area';
  const currentPage = locationContext.page_url || '/';

  return `You are AI Steve, the digital real estate concierge for Steven Lenz Jr.
Steven Lenz Jr. is a premier luxury Real Estate Advisor affiliated with Compass California II, Inc. (CA DRE# 01989811).

BIOGRAPHY & BRAND IDENTITY:
• Steven is a lifelong Tri-Valley native, raised in Pleasanton, CA, and a graduate of Amador Valley High School.
• He played semi-pro basketball throughout the Bay Area and coaches local youth and high school basketball, emphasizing discipline, teamwork, and integrity.
• Specializes in the East Bay Tri-Valley luxury corridor: Pleasanton, Danville, Alamo, Walnut Creek, San Ramon, Dublin, Livermore, and Lafayette.
• Direct contact: (925) 998-9711 | steven.lenzjr@compass.com | Office: Compass California II, Inc.
• Key Programs:
  - Compass Concierge: Fronts 100% of upfront home staging, paint, flooring, and cosmetic prep costs with $0 fees and 0% interest until close of escrow.
  - Valuation Tool: Users can get an instant estimate at /valuation.
  - 1031 Exchanges & Prop 19: Expert guidance on tax-deferred replacement properties and base-year tax transfers for California seniors (55+) and wildfire victims.

CURRENT VISITOR CONTEXT:
• Visitor Location: ${visitorLoc}
• Visitor Currently Viewing Page: ${currentPage}

VERIFIED COMPASS LISTINGS PORTFOLIO:
${listingsText}

STRICT PROFESSIONAL COMPLIANCE (CALIFORNIA DRE & FEDERAL FAIR HOUSING ACT):
1. SAFETY & CRIME: You MUST NEVER rate, evaluate, or comment on neighborhood crime, safety statistics, police reports, or whether an area is "safe" or "dangerous". Under federal Fair Housing laws, doing so is unlawful steering. If asked about crime, safety, or safest areas, state courteously: "Under Fair Housing regulations and real estate professional standards, real estate advisors do not evaluate neighborhood crime rates or safety statistics. For objective public safety data, I recommend consulting municipal police department crime maps and local civic reports. Steven is always happy to discuss neighborhood amenities, parks, commute corridors, and lifestyle."
2. DEMOGRAPHICS & SCHOOL BIAS: Never discuss neighborhood demographics, racial/ethnic balance, or religious institutions.
3. PRICING & FACTUAL ACCURACY: Only quote prices and specs matching the verified listings above. If asked about a property outside this portfolio, offer to connect them directly with Steven for off-market Compass Private Exclusives.
4. TONE: Warm, polished, articulate, professional, and knowledgeable. Keep responses concise (2-4 brief paragraphs or clean bullet points). Avoid fluff.
5. LEAD CAPTURE: When the visitor shows interest in buying, selling, touring, or valuation, offer to connect them with Steven and invite them to leave their name, phone number, or email.

OUTPUT INSTRUCTIONS:
Always respond with helpful, warm prose as Steven's digital assistant. If recommending a specific property from the portfolio, mention its address and key features.`;
}

/**
 * Sends conversation to Groq and retrieves response.
 * @param {string} userMessage
 * @param {Array<{role: string, content: string}>} history
 * @param {Object} locationContext
 * @returns {Promise<{reply: string, intent: string, properties: Array, card: Object, quickReplies: Array}>}
 */
async function generateResponse(userMessage, history = [], locationContext = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

  // Fallback to deterministic engine if no API key is set
  if (!apiKey) {
    console.warn('[AI Agent] No GROQ_API_KEY found, using rule-based engine.');
    return fallbackAgent.processQuery(userMessage, history);
  }

  // Pre-filter: Check strict Fair Housing triggers for immediate compliance
  const lowerMsg = (userMessage || '').toLowerCase();
  if (lowerMsg.includes('safest') || lowerMsg.includes('safe') || lowerMsg.includes('crime') || lowerMsg.includes('police') || lowerMsg.includes('dangerous')) {
    return fallbackAgent.processQuery(userMessage, history);
  }

  try {
    const systemPrompt = buildSystemPrompt(locationContext);

    // Format recent history (keep last 6 messages for context)
    const formattedHistory = (history || []).slice(-6).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.content || '')
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userMessage }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.5,
        max_tokens: 600
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Groq API Warning] HTTP ${res.status}: ${errText}. Falling back to rule-based agent.`);
      return fallbackAgent.processQuery(userMessage, history);
    }

    const data = await res.json();
    const replyText = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : null;

    if (!replyText) {
      return fallbackAgent.processQuery(userMessage, history);
    }

    // Determine intent from message & reply
    let intent = 'GENERAL_ADVISORY';
    if (lowerMsg.includes('sell') || lowerMsg.includes('worth') || lowerMsg.includes('value') || lowerMsg.includes('cma')) {
      intent = 'VALUATION_INQUIRY';
    } else if (lowerMsg.includes('buy') || lowerMsg.includes('listing') || lowerMsg.includes('home') || lowerMsg.includes('house')) {
      intent = 'PROPERTY_INQUIRY';
    } else if (lowerMsg.includes('concierge') || lowerMsg.includes('prep') || lowerMsg.includes('staging')) {
      intent = 'CONCIERGE_INQUIRY';
    } else if (lowerMsg.includes('1031') || lowerMsg.includes('tax') || lowerMsg.includes('prop 19')) {
      intent = 'TAX_ADVISORY';
    }

    // Determine relevant property cards to attach if discussed
    const allListings = siteDb.getAllListings();
    const matchedProperties = allListings.filter((l) => {
      const addr = (l.address || '').toLowerCase();
      const city = (l.city || '').toLowerCase();
      return (addr && lowerMsg.includes(addr)) || (city && lowerMsg.includes(city));
    }).slice(0, 2).map((l) => ({
      id: l.id,
      title: l.address,
      address: `${l.address}, ${l.city}, CA ${l.zip || ''}`.trim(),
      city: l.city,
      price: l.price_num || 0,
      beds: Number(l.beds) || 0,
      baths: Number(l.baths) || 0,
      sqft: Number(l.sqft) || 0,
      image_url: l.photo || 'assets/img/danville-genoa.jpg'
    }));

    return {
      reply: replyText,
      properties: matchedProperties,
      intent,
      quickReplies: ['Talk to Steven', 'Home Valuation', 'Browse Active Listings']
    };
  } catch (err) {
    console.error('[Groq Agent Error]', err.message);
    return fallbackAgent.processQuery(userMessage, history);
  }
}

module.exports = {
  generateResponse,
  buildSystemPrompt,
  getActiveListingsContext
};

