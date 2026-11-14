/**
 * server/ai.js
 * Intelligent Real Estate NLP & Advisory Agent for Steven Lenz Jr. (Compass)
 * Strictly adheres to verified listing data, California DRE standards, and Fair Housing regulations.
 */
'use strict';

const db = require('./db');

function calculateMortgage(price, downPercent = 0.20, interestRate = 0.065, loanYears = 30) {
  const downPayment = price * downPercent;
  const loanAmount = price - downPayment;
  const monthlyRate = interestRate / 12;
  const numPayments = loanYears * 12;

  // Monthly Principal & Interest: M = P [ i(1 + i)^n ] / [ (1 + i)^n – 1]
  const monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);

  // CA Property Tax ~1.15% annually
  const monthlyTax = (price * 0.0115) / 12;
  // Estimated Insurance
  const monthlyInsurance = Math.max(100, Math.round((price * 0.002) / 12));

  const totalMonthly = Math.round(monthlyPI + monthlyTax + monthlyInsurance);

  return {
    price,
    downPayment: Math.round(downPayment),
    loanAmount: Math.round(loanAmount),
    monthlyPI: Math.round(monthlyPI),
    monthlyTax: Math.round(monthlyTax),
    monthlyInsurance,
    totalMonthly
  };
}

function formatCurrency(num) {
  return '$' + Number(num || 0).toLocaleString('en-US');
}

class AIAgent {
  constructor() {
    this.name = 'AI Assistant';
    this.agentIdentity = 'Steven Lenz Jr. · Compass California II, Inc. · CA DRE# 01989811';
  }

  processQuery(userMessage, sessionHistory = []) {
    const raw = (userMessage || '').trim();
    const text = raw.toLowerCase();

    // 1. Fair Housing / Safety / Crime Queries
    if (text.includes('safest') || text.includes('safe') || text.includes('crime') || text.includes('police') || text.includes('dangerous')) {
      return {
        reply: "Under Fair Housing regulations and professional real estate standards, real estate advisors do not evaluate neighborhood crime rates or safety statistics. For objective public safety data, I recommend consulting local police department crime maps and municipal reports. Steven is always happy to discuss neighborhood amenities, parks, commute corridors, and community lifestyle—you can reach him directly at (925) 998-9711.",
        properties: [],
        card: {
          eyebrow: 'FAIR HOUSING & COMMUNITY INSIGHT',
          title: 'Direct Agent Consultation',
          priceRange: 'Tri-Valley & East Bay Guidance',
          actionText: 'Connect with Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Which areas do you cover?', 'Browse active listings'],
        intent: 'SAFETY_ADVISORY'
      };
    }

    // 2. Valuation / Home Value / What is my house worth / CMA
    if (text.includes('worth') || text.includes('value') || text.includes('cma') || text.includes('valuation') || (text.includes('sell') && (text.includes('home') || text.includes('house') || text.includes('price')))) {
      return {
        reply: "Property valuations depend on specific micro-neighborhood comp sales, lot topography, architectural condition, and recent upgrades. You can get an immediate algorithmic range using our Valuation tool, or connect directly with Steven for an in-person Comparative Market Analysis (CMA) including Compass Concierge prep strategy.",
        properties: [],
        card: {
          eyebrow: 'PROPERTY VALUATION',
          title: 'Instant Valuation Estimate',
          priceRange: 'CMA & Concierge Assessment',
          actionText: 'Value My Home →',
          actionType: 'valuation'
        },
        quickReplies: ['Go to Valuation tool', 'Talk to Steven', 'Compass Concierge'],
        intent: 'VALUATION_INQUIRY'
      };
    }

    // 3. 1031 Exchange / Capital Gains / Tax / Prop 19
    if (text.includes('1031') || text.includes('exchange') || text.includes('capital gain') || text.includes('prop 19') || (text.includes('tax') && !text.includes('property tax rate'))) {
      return {
        reply: "1031 exchanges require strict compliance with IRS statutory deadlines—specifically 45 days to identify replacement property and 180 days to complete closing—in coordination with a Qualified Intermediary and CPA. Steven frequently advises clients on 1031 exchange replacement acquisitions and Proposition 19 tax base transfers across Northern California. Would you like to connect with Steven to review your timeline?",
        properties: [],
        card: {
          eyebrow: 'TAX & WEALTH PRESERVATION',
          title: '1031 Exchange & Prop 19 Advisory',
          priceRange: 'Discreet Replacement Search',
          actionText: 'Talk to Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Prop 19 details', 'Active listings'],
        intent: 'TAX_1031_INQUIRY'
      };
    }

    // 4. Schools / Districts
    if (text.includes('school') || text.includes('district') || text.includes('elementary') || text.includes('high school') || text.includes('amador') || text.includes('de la salle')) {
      return {
        reply: "The Tri-Valley and East Bay corridor feature renowned public school districts—including Pleasanton Unified and San Ramon Valley Unified—as well as premier private institutions such as De La Salle High School (where Steven coached for nine years). Because district attendance boundaries and enrollment capacities shift, we advise buyers to verify specific address assignments directly with the district administration.",
        properties: [],
        card: {
          eyebrow: 'EDUCATION & COMMUNITY',
          title: 'Tri-Valley School Insights',
          priceRange: 'Pleasanton & San Ramon Valley',
          actionText: 'Ask Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Which areas do you cover?', 'Browse homes'],
        intent: 'SCHOOLS_INQUIRY'
      };
    }

    // 5. Compass Concierge
    if (text.includes('concierge') || text.includes('staging') || text.includes('renovation') || text.includes('prep now')) {
      return {
        reply: "Compass Concierge fronts 100% of upfront home preparation and cosmetic upgrade costs—including designer staging, fresh interior/exterior painting, hardwood floor refinishing, modern lighting, and landscaping—with $0 upfront out-of-pocket costs and 0% interest until close of escrow. This proven program maximizes your home's market presentation and net sale proceeds.",
        properties: [],
        card: {
          eyebrow: 'COMPASS CONCIERGE',
          title: 'Prep Now, Pay at Escrow',
          priceRange: '$0 Upfront Fees · 0% Interest',
          actionText: 'Learn More →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'What is my home worth?', 'Active listings'],
        intent: 'CONCIERGE_INQUIRY'
      };
    }

    // 6. Specific Property Inquiry: 2710 Presidio (Active Listing)
    if (text.includes('2710') || text.includes('presidio')) {
      const prop = db.getPropertyByAddress('2710 Presidio');
      const properties = prop ? [prop] : [];
      return {
        reply: "2710 Presidio in Brentwood, CA is currently active and listed at $930,000. It features 4 bedrooms, 3 bathrooms, and 2,890 sq ft of open-concept living space with a private oasis backyard, custom pool and spa, and owned solar. Would you like to schedule a private showing with Steven?",
        properties: properties,
        card: {
          eyebrow: 'ACTIVE LISTING · BRENTWOOD',
          title: '2710 Presidio',
          priceRange: '$930,000',
          actionText: 'View Property →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Schedule showing', 'Calculate monthly cost', 'Talk to Steven'],
        intent: 'PROPERTY_SPECIFIC'
      };
    }

    // 7. Specific Property Inquiry: Past sales (Genoa, Altamont)
    if (text.includes('genoa')) {
      const prop = db.getPropertyByAddress('2261 Genoa');
      return {
        reply: "2261 Genoa St in Danville is a premier 4-bedroom, 3-bath, 3,186 sq ft estate closed by Steven for $1,560,000. It stands as a prime example of his luxury market execution in Contra Costa County.",
        properties: prop ? [prop] : [],
        card: {
          eyebrow: 'CLOSED SALE · DANVILLE',
          title: '2261 Genoa St',
          priceRange: '$1,560,000 · Closed',
          actionText: 'View Portfolio →',
          actionType: 'browse_homes'
        },
        quickReplies: ['View full portfolio', 'Talk to Steven', 'Active listings'],
        intent: 'PROPERTY_SPECIFIC'
      };
    }

    if (text.includes('altamont')) {
      const prop = db.getPropertyByAddress('1631 Altamont');
      return {
        reply: "1631 Altamont Cir in Livermore is a spacious 5-bedroom, 3-bath, 2,829 sq ft home closed by Steven for $900,000, representing outstanding value in the Tri-Valley wine country.",
        properties: prop ? [prop] : [],
        card: {
          eyebrow: 'CLOSED SALE · LIVERMORE',
          title: '1631 Altamont Cir',
          priceRange: '$900,000 · Closed',
          actionText: 'View Portfolio →',
          actionType: 'browse_homes'
        },
        quickReplies: ['View full portfolio', 'Talk to Steven', 'Active listings'],
        intent: 'PROPERTY_SPECIFIC'
      };
    }

    // 8. What homes does Steven have for sale / Active listings / Browse homes
    if (text.includes('what home') || text.includes('for sale') || text.includes('available home') || text.includes('show home') || text.includes('active listing') || text.includes('listings') || text.includes('browse home')) {
      const activeProps = db.getProperties({ status: 'active' });
      return {
        reply: "Steven currently has 1 active listing on the market: 2710 Presidio in Brentwood ($930,000, 4 bed / 3 bath / 2,890 sq ft with private pool & spa). In addition to public MLS listings, Steven represents confidential Compass Private Exclusives and off-market opportunities throughout Pleasanton, Danville, and the Tri-Valley. Click below to view details or connect for private exclusive access.",
        properties: activeProps,
        card: {
          eyebrow: 'ACTIVE MLS LISTING',
          title: '2710 Presidio, Brentwood',
          priceRange: '$930,000',
          actionText: 'View Listing Details →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Tell me about 2710 Presidio', 'Private Exclusives', 'Talk to Steven'],
        intent: 'SHOW_HOMES'
      };
    }

    // 9. Past Sales / Portfolio / Track Record
    if (text.includes('past sale') || text.includes('sold') || text.includes('portfolio') || text.includes('track record') || text.includes('history')) {
      const soldProps = db.getProperties({ status: 'closed' }).slice(0, 3);
      return {
        reply: "Steven's documented career portfolio totals 23 closed transactions and over $12,000,000 in volume across Pleasanton, Danville, Livermore, and the East Bay corridor. Click below to explore his verified closed sales and client results.",
        properties: soldProps,
        card: {
          eyebrow: 'CAREER PORTFOLIO',
          title: '23 Closed Transactions',
          priceRange: '$12,064,500 Documented Volume',
          actionText: 'View Sold Portfolio →',
          actionType: 'browse_homes'
        },
        quickReplies: ['View full portfolio', 'Active listings', 'Talk to Steven'],
        intent: 'PORTFOLIO_INQUIRY'
      };
    }

    // 10. Areas Covered
    if (text.includes('area') || text.includes('cover') || text.includes('where do you') || text.includes('cities') || text.includes('location')) {
      return {
        reply: "Steven specializes in the Tri-Valley and East Bay corridor, with core focus in Pleasanton, Danville, Alamo, Walnut Creek, San Ramon, Livermore, and Lafayette. He represents buyers and sellers across Contra Costa and Alameda counties as well as discrete transactions across the broader Bay Area.",
        properties: [],
        card: {
          eyebrow: 'COMMUNITIES SERVED',
          title: 'Tri-Valley & East Bay Corridor',
          priceRange: 'Pleasanton · Danville · Alamo · Walnut Creek',
          actionText: 'Explore Communities →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['What homes are for sale?', 'Pleasanton guide', 'Talk to Steven'],
        intent: 'AREAS_COVERED'
      };
    }

    // 11. Pleasanton Hometown Inquiry
    if (text.includes('pleasanton') || text.includes('ruby hill') || text.includes('vintage hills')) {
      return {
        reply: "In Pleasanton—Steven's hometown—he provides deep micro-market guidance across gated enclaves like Ruby Hill, historic downtown Pleasanton, and family neighborhoods like Vintage Hills and Del Prado. He continuously tracks off-market opportunities and Compass Private Exclusives throughout the city.",
        properties: [],
        card: {
          eyebrow: 'PLEASANTON HOMETOWN SPECIALIST',
          title: 'Pleasanton & Ruby Hill Intel',
          priceRange: 'Off-Market & Private Exclusives',
          actionText: 'Connect with Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Pleasanton schools', 'Active listings'],
        intent: 'CITY_INQUIRY'
      };
    }

    // 12. Mortgage / Monthly Cost Query
    const priceMatch = text.match(/\$?(\d{1,3}(?:,\d{3})*|\d+)(?:k|m|000)?\s*(?:home|house|dollar|mortgage|cost|month)/);
    if (text.includes('cost a month') || text.includes('monthly') || text.includes('mortgage') || (priceMatch && (text.includes('cost') || text.includes('payment')))) {
      let price = 930000;
      if (text.includes('930') || text.includes('930k')) price = 930000;
      else if (text.includes('700') || text.includes('700k')) price = 700000;
      else if (text.includes('800') || text.includes('800k')) price = 800000;
      else if (text.includes('500') || text.includes('500k')) price = 500000;
      else if (text.includes('1.5m')) price = 1500000;
      else if (text.includes('1m') || text.includes('1 million')) price = 1000000;
      else if (priceMatch) {
        const val = priceMatch[1].replace(/,/g, '');
        const num = parseFloat(val);
        if (num < 100) price = num * 1000000;
        else if (num < 10000) price = num * 1000;
        else price = num;
      }

      const calc = calculateMortgage(price);
      return {
        reply: `For a ${formatCurrency(price)} home with 20% down (${formatCurrency(calc.downPayment)}) at an estimated 6.5% interest rate on a 30-year fixed loan:\n\n• Principal & Interest: ~${formatCurrency(calc.monthlyPI)}/mo\n• Estimated CA Property Tax (1.15%): ~${formatCurrency(calc.monthlyTax)}/mo\n• Estimated Home Insurance: ~${formatCurrency(calc.monthlyInsurance)}/mo\n\nTotal Estimated Payment: ~${formatCurrency(calc.totalMonthly)}/month.\n\nRates fluctuate daily. Steven partners with premier mortgage advisors to structure competitive financing strategies.`,
        properties: [],
        card: {
          eyebrow: 'ESTIMATED MONTHLY PAYMENT',
          title: `${formatCurrency(calc.totalMonthly)} / mo`,
          priceRange: `Based on ${formatCurrency(price)} purchase price`,
          actionText: 'Connect with Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Active listings', 'What about 10% down?'],
        intent: 'MORTGAGE_CALC'
      };
    }

    // 13. Direct Contact / Talk to Steven
    if (text.includes('talk') || text.includes('connect') || text.includes('contact') || text.includes('phone') || text.includes('email') || text.includes('agent')) {
      return {
        reply: "You can connect directly with Steven Lenz Jr. right here! Click 'Talk to Steven' below to send a note directly to his desk, or call him directly at (925) 998-9711.",
        properties: [],
        card: {
          eyebrow: 'DIRECT AGENT ACCESS',
          title: 'Steven Lenz Jr.',
          priceRange: 'Compass · CA DRE# 01989811',
          actionText: 'Talk to Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Active listings', 'What is my home worth?'],
        intent: 'TALK_TO_STEVE'
      };
    }

    // 14. Default / Intelligent Fallback (NO unsolicited property cards)
    return {
      reply: "I'm Steven Lenz Jr.'s AI Assistant. I can assist with information regarding Steven's active listings, verified closed sales, market valuation estimates, or connecting directly with Steven. What would you like to explore?",
      properties: [],
      card: {
        eyebrow: 'TRI-VALLEY REAL ESTATE INTEL',
        title: 'Explore Properties & Advice',
        priceRange: 'Compass · Steven Lenz Jr.',
        actionText: 'Browse Active Listings →',
        actionType: 'browse_homes'
      },
      quickReplies: ['What homes are for sale?', 'What is my home worth?', 'Which areas do you cover?'],
      intent: 'GENERAL_ASSISTANCE'
    };
  }
}

module.exports = new AIAgent();
