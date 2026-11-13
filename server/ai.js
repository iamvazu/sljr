/**
 * server/ai.js
 * Intelligent Real Estate NLP & RAG Agent for Steven Lenz Jr. (Compass)
 */
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
  // Estimated Insurance ~$1,500/yr for median home
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
  return '$' + Number(num).toLocaleString('en-US');
}

class AIAgent {
  constructor() {
    this.name = 'Steve';
    this.agentIdentity = 'Steven Lenz Jr. · Compass California II, Inc.';
  }

  processQuery(userMessage, sessionHistory = []) {
    const raw = (userMessage || '').trim();
    const text = raw.toLowerCase();

    // 1. Check for Areas Covered
    if (text.includes('area') || text.includes('cover') || text.includes('where do you') || text.includes('cities') || text.includes('location')) {
      const campConnell = db.getPropertyByAddress('91 Segale');
      const richmond = db.getPropertyByAddress('1232 York');
      const properties = [campConnell, richmond].filter(Boolean);

      return {
        reply: "I cover Camp Connell, CA and Richmond, CA, as well as Pleasanton, Danville, Alamo, and the broader Bay Area. If you want, I can also show you the homes I have there.",
        properties: properties,
        card: {
          eyebrow: 'HOMES · SHOWING NOW',
          title: `${properties.length} homes`,
          priceRange: `${formatCurrency(450000)} to ${formatCurrency(825000)}`,
          actionText: 'Browse homes →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Browse homes', 'Tell me about 1232 York St', 'Talk to Steven'],
        intent: 'AREAS_COVERED'
      };
    }

    // 2. Check for Specific Property Inquiry
    if (text.includes('1232') || text.includes('york')) {
      const prop = db.getPropertyByAddress('1232 York');
      return {
        reply: `1232 York St in Richmond, CA is currently listed at ${formatCurrency(prop.price)}. It offers ${prop.beds} bedrooms, ${prop.baths} baths, and ${prop.sqft.toLocaleString()} sq ft of bright, contemporary living space with designer finishes and an attached garage. Would you like me to connect you with Steven for a private viewing?`,
        properties: [prop],
        card: {
          eyebrow: 'FEATURED PROPERTY',
          title: prop.address,
          priceRange: formatCurrency(prop.price),
          actionText: 'View Property →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Talk to Steven', 'Calculate mortgage', 'What are HOA fees?'],
        intent: 'PROPERTY_SPECIFIC'
      };
    }

    if (text.includes('segale') || text.includes('camp connell')) {
      const prop = db.getPropertyByAddress('91 Segale');
      return {
        reply: `91 Segale Dr in Camp Connell, CA is listed at ${formatCurrency(prop.price)}. It's a peaceful 2-bedroom mountain cabin retreat on 1,563 sq ft with cedar decks, vaulted ceilings, and close access to Big Trees State Park and Bear Valley skiing.`,
        properties: [prop],
        card: {
          eyebrow: 'FEATURED CABIN',
          title: prop.address,
          priceRange: formatCurrency(prop.price),
          actionText: 'View Property →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Talk to Steven', 'Calculate monthly cost'],
        intent: 'PROPERTY_SPECIFIC'
      };
    }

    if (text.includes('ruby hill') || text.includes('pleasanton')) {
      const props = db.getProperties({ city: 'pleasanton' });
      return {
        reply: "In Pleasanton, Steven represents luxury properties across prestigious enclaves including the gated Jack Nicklaus golf community at Ruby Hill, historic downtown Del Prado, and Vintage Hills.",
        properties: props,
        card: {
          eyebrow: 'PLEASANTON HOMES',
          title: `${props.length} Featured Homes`,
          priceRange: props.length > 0 ? `${formatCurrency(props[0].price)}+` : 'Price on request',
          actionText: 'Browse homes →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Tell me about Ruby Hill', 'Pleasanton schools', 'Talk to Steven'],
        intent: 'CITY_INQUIRY'
      };
    }

    // 3. Mortgage / Monthly Cost Query
    const priceMatch = text.match(/\$?(\d{1,3}(?:,\d{3})*|\d+)(?:k|m|000)?\s*(?:home|house|dollar|mortgage|cost|month)/);
    if (text.includes('cost a month') || text.includes('monthly') || text.includes('mortgage') || (priceMatch && (text.includes('cost') || text.includes('payment')))) {
      let price = 700000;
      if (text.includes('700') || text.includes('700k')) price = 700000;
      else if (text.includes('800') || text.includes('800k')) price = 800000;
      else if (text.includes('500') || text.includes('500k')) price = 500000;
      else if (text.includes('1m') || text.includes('1 million') || text.includes('1,000,000')) price = 1000000;
      else if (text.includes('1.5m')) price = 1500000;
      else if (priceMatch) {
        const val = priceMatch[1].replace(/,/g, '');
        const num = parseFloat(val);
        if (num < 100) price = num * 1000000;
        else if (num < 10000) price = num * 1000;
        else price = num;
      }

      const calc = calculateMortgage(price);
      return {
        reply: `For a ${formatCurrency(price)} home with 20% down (${formatCurrency(calc.downPayment)}) at an estimated 6.5% interest rate on a 30-year fixed loan:\n\n• Principal & Interest: ~${formatCurrency(calc.monthlyPI)}/mo\n• Estimated CA Property Tax (1.15%): ~${formatCurrency(calc.monthlyTax)}/mo\n• Estimated Home Insurance: ~${formatCurrency(calc.monthlyInsurance)}/mo\n\nTotal Estimated Payment: ~${formatCurrency(calc.totalMonthly)}/month.\n\nRates fluctuate daily. Steven works closely with premier lending partners to secure custom financing strategies.`,
        properties: [],
        card: {
          eyebrow: 'ESTIMATED MONTHLY PAYMENT',
          title: `${formatCurrency(calc.totalMonthly)} / mo`,
          priceRange: `Based on ${formatCurrency(price)} purchase price`,
          actionText: 'Connect with Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'What about 10% down?', 'Browse homes in this range'],
        intent: 'MORTGAGE_CALC'
      };
    }

    // 4. Homes list / Browse
    if (text.includes('what homes') || text.includes('show homes') || text.includes('listings') || text.includes('browse homes') || text.includes('available homes')) {
      const allProps = db.getProperties();
      return {
        reply: `Steven currently has ${allProps.length} showcased properties ranging from accessible starter residences to multi-acre foothill estates. Click below to browse all photos, floor plans, and specs.`,
        properties: allProps,
        card: {
          eyebrow: 'STEVEN’S EXCLUSIVE PORTFOLIO',
          title: `${allProps.length} Showcase Homes`,
          priceRange: `${formatCurrency(450000)} to ${formatCurrency(4195000)}`,
          actionText: 'Browse homes →',
          actionType: 'browse_homes'
        },
        quickReplies: ['Browse homes', 'Schedule a showing', 'Talk to Steven'],
        intent: 'SHOW_HOMES'
      };
    }

    // 5. Connect / Contact / Talk to Steven
    if (text.includes('talk') || text.includes('connect') || text.includes('contact') || text.includes('phone') || text.includes('email') || text.includes('agent')) {
      return {
        reply: "You can connect directly with Steven Lenz Jr. right here! Click 'Talk to Steven' below to leave your contact info and note — Steven receives it immediately on his phone.",
        properties: [],
        card: {
          eyebrow: 'DIRECT AGENT ACCESS',
          title: 'Steven Lenz Jr.',
          priceRange: 'Compass · CA DRE# 01989811',
          actionText: 'Talk to Steven →',
          actionType: 'talk_to_steve'
        },
        quickReplies: ['Talk to Steven', 'Call Steven directly', 'Browse homes'],
        intent: 'TALK_TO_STEVE'
      };
    }

    // 6. Default / Intelligent Fallback
    const featured = db.getProperties({ featured: 1 }).slice(0, 2);
    return {
      reply: `I can help you explore Steven's active listings, calculate monthly mortgage payments, or research neighborhood trends across Pleasanton, Danville, Alamo, and the East Bay. What would you like to know?`,
      properties: featured,
      card: {
        eyebrow: 'POPULAR INQUIRIES',
        title: 'Explore Properties & Advice',
        priceRange: '$450K - $4.2M+',
        actionText: 'Browse homes →',
        actionType: 'browse_homes'
      },
      quickReplies: ['Which areas do you cover?', 'What would a $700K home cost a month?', 'What homes does Steven have?'],
      intent: 'GENERAL_ASSISTANCE'
    };
  }
}

module.exports = new AIAgent();
