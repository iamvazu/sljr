'use strict';

/**
 * Steven Lenz Jr. CRM - AI Phrase Blocklist
 *
 * Implements Fair Housing Act & California Unruh Civil Rights Act compliance,
 * plus Compass luxury brand standards:
 * - No steering or community characterizations (safety, crime, schools, demographics).
 * - No false guarantees or superlative claims.
 * - No protected-class references.
 *
 * Reference: Build PRD M1 CRM Core and M2 AI Scoring & Daily Action Plan.md (line 480)
 */

const BLOCKED_PHRASES = [
  // Safety & Crime
  'safe',
  'safest',
  'safety',
  'crime',
  'crime rate',
  'low crime',
  'zero crime',
  'dangerous',

  // Schools steering
  'good schools',
  'best schools',
  'top schools',
  'great schools',
  'school rating',

  // Demographics & Steering
  'family-friendly',
  'family friendly',
  'exclusive',
  'exclusivity',
  'prestigious crowd',

  // Guarantees & Superlatives
  'guarantee',
  'guaranteed',
  'guarantees',
  'number one',
  '#1',
  'best agent',

  // Fair Housing Act & California Unruh Act Protected Classes
  'race',
  'caucasian',
  'african american',
  'asian',
  'hispanic',
  'latino',
  'religion',
  'religious',
  'christian',
  'jewish',
  'muslim',
  'hindu',
  'church',
  'synagogue',
  'mosque',
  'familial status',
  'no children',
  'adults only',
  'handicap',
  'handicapped',
  'disabled',
  'disability',
  'national origin',
  'ancestry',
  'marital status',
  'sexual orientation',
  'source of income',
  'section 8'
];

/**
 * Checks if text contains any blocked phrase (case-insensitive with word boundary).
 * @param {string} text
 * @returns {{ blocked: boolean, phrase: string | null }}
 */
function checkBlockedPhrases(text) {
  if (!text || typeof text !== 'string') {
    return { blocked: false, phrase: null };
  }

  const normalized = text.toLowerCase();

  for (const phrase of BLOCKED_PHRASES) {
    // Escape special regex characters in phrase
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Word boundary check
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(normalized)) {
      return { blocked: true, phrase };
    }
  }

  return { blocked: false, phrase: null };
}

module.exports = {
  BLOCKED_PHRASES,
  checkBlockedPhrases
};

