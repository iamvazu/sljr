/* ============================================================================
   ai-steve.js — AI Steve Real Estate Advisor
   100% Free, Zero-Subscription Client-Side Real Estate Intelligence
   Built for Steven Lenz Jr. · Compass Real Estate · CA DRE# 01989811
   ============================================================================ */
(function () {
  'use strict';

  // Determine path prefix for subdirectories
  var isSubdir = (typeof window !== 'undefined' && (
    window.location.pathname.indexOf('/areas/') !== -1 ||
    window.location.pathname.indexOf('/articles/') !== -1
  ));
  var pfx = isSubdir ? '../' : '';

  // Core Knowledge Base
  var STEVE_INFO = {
    name: 'Steven Lenz Jr.',
    title: 'Luxury REALTOR® · Sports & Entertainment Division',
    dre: '01989811',
    brokerage: 'Compass California II, Inc. (DRE# 01527235)',
    phone: '(925) 998-9711',
    phoneRaw: '+19259989711',
    email: 'steven.lenzjr@compass.com',
    office: '900 Main St., Pleasanton, CA 94566',
    roots: 'Raised in Pleasanton, CA; Amador Valley High alumnus; former semi-pro basketball player; 9 years coaching at De La Salle High School; collegiate coach at Ohlone College.'
  };

  // Top featured listings snapshot for instant client-side lookup
  var FEATURED_LISTINGS = [
    {
      address: '2261 Genoa Street',
      city: 'Danville',
      price: '$1,560,000',
      beds: '4',
      baths: '3',
      sqft: '3,186',
      status: 'Sold',
      photo: 'assets/img/danville-genoa.jpg',
      url: 'properties.html'
    },
    {
      address: '1631 Altamont Circle',
      city: 'Livermore',
      price: '$1,120,000',
      beds: '3',
      baths: '2.5',
      sqft: '2,140',
      status: 'Sold',
      photo: 'assets/img/livermore-altamont.jpg',
      url: 'properties.html'
    },
    {
      address: '3868 Greenwood Avenue',
      city: 'Oakland',
      price: '$1,295,000',
      beds: '3',
      baths: '2',
      sqft: '1,845',
      status: 'Sold',
      photo: 'assets/img/oakland-greenwood.jpg',
      url: 'properties.html'
    },
    {
      address: '1240 York Street',
      city: 'San Francisco',
      price: '$1,850,000',
      beds: '3',
      baths: '2',
      sqft: '1,720',
      status: 'Active',
      photo: 'assets/img/for-sale-1240-york.jpg',
      url: 'properties.html'
    },
    {
      address: '0 Zinn Drive',
      city: 'Far West / Tri-Valley Hills',
      price: '$3,800,000',
      beds: 'Land / Estate',
      baths: 'Custom',
      sqft: '30+ Acres',
      status: 'Active',
      photo: 'assets/img/listings/0-zinn-dr.jpg',
      url: 'properties.html'
    }
  ];

  var CURRENT_LANG = 'en';

  // Inject CSS stylesheet link
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = pfx + 'css/ai-steve.css?v=20261113';
  document.head.appendChild(link);

  // Build Widget DOM
  function createWidget() {
    // 1. Floating Action Button
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'sl-ai-fab';
    fab.id = 'sl-ai-fab';
    fab.setAttribute('aria-label', 'Open AI Steve Real Estate Advisor');
    fab.innerHTML =
      '<div class="sl-ai-fab__avatar-wrap">' +
        '<img class="sl-ai-fab__avatar" src="' + pfx + 'assets/img/steven-headshot.jpg" alt="Steve" />' +
        '<span class="sl-ai-fab__status"></span>' +
      '</div>' +
      '<div class="sl-ai-fab__label">' +
        '<span class="sl-ai-fab__name">Steve</span>' +
        '<span class="sl-ai-fab__hint">Ask AI Steve · Free</span>' +
      '</div>';

    // 2. Chat Window
    var win = document.createElement('div');
    win.className = 'sl-ai-window';
    win.id = 'sl-ai-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat with AI Steve');

    win.innerHTML =
      '<div class="sl-ai-header">' +
        '<div class="sl-ai-header__left">' +
          '<div class="sl-ai-header__avatar-wrap">' +
            '<img class="sl-ai-header__avatar" src="' + pfx + 'assets/img/steven-headshot.jpg" alt="Steve" />' +
            '<span class="sl-ai-header__status"></span>' +
          '</div>' +
          '<div class="sl-ai-header__info">' +
            '<span class="sl-ai-header__name">Steve</span>' +
            '<span class="sl-ai-header__sub">Steven Lenz Jr. · Compass California II, Inc.</span>' +
          '</div>' +
        '</div>' +
        '<div class="sl-ai-header__actions">' +
          '<button type="button" class="sl-ai-icon-btn" id="sl-ai-lang-btn" aria-label="Translate language">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' +
          '</button>' +
          '<button type="button" class="sl-ai-icon-btn" id="sl-ai-options-btn" aria-label="Chat options">' +
            '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="5" cy="12" r="2"></circle></svg>' +
          '</button>' +
          '<button type="button" class="sl-ai-icon-btn" id="sl-ai-close-btn" aria-label="Close chat window">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +

      // Translation menu popup
      '<div class="sl-ai-popup-menu" id="sl-ai-lang-menu">' +
        '<button type="button" class="sl-ai-popup-item" data-lang="en">🇺🇸 English</button>' +
        '<button type="button" class="sl-ai-popup-item" data-lang="es">🇪🇸 Español</button>' +
        '<button type="button" class="sl-ai-popup-item" data-lang="zh">🇨🇳 中文 (Chinese)</button>' +
        '<button type="button" class="sl-ai-popup-item" data-lang="vi">🇻🇳 Tiếng Việt</button>' +
        '<button type="button" class="sl-ai-popup-item" data-lang="tl">🇵🇭 Tagalog</button>' +
        '<button type="button" class="sl-ai-popup-item" data-lang="hi">🇮🇳 हिन्दी (Hindi)</button>' +
      '</div>' +

      // Options menu popup
      '<div class="sl-ai-popup-menu" id="sl-ai-options-menu">' +
        '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-clear">Clear Conversation</button>' +
        '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-call">Call Steven: (925) 998-9711</button>' +
        '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-email">Email Steven: steven.lenzjr@compass.com</button>' +
        '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-about">View Steven’s Bio &amp; Reviews</button>' +
      '</div>' +

      // Messages Body
      '<div class="sl-ai-body" id="sl-ai-body">' +
        '<div class="sl-ai-msg sl-ai-msg--bot">' +
          '<div class="sl-ai-bubble">' +
            'Hi! I\'m Steve. Ask about Steven\'s homes, homes in Pleasanton, CA or Danville, CA, or what a home would cost a month.' +
          '</div>' +
          '<div class="sl-ai-pills" id="sl-ai-starter-pills">' +
            '<button type="button" class="sl-ai-pill-btn" data-query="What homes does Steven have?">What homes does Steven have?</button>' +
            '<button type="button" class="sl-ai-pill-btn" data-query="What would a $700K home cost a month?">What would a $700K home cost a month?</button>' +
            '<button type="button" class="sl-ai-pill-btn" data-query="Which areas do you cover?">Which areas do you cover?</button>' +
            '<button type="button" class="sl-ai-pill-btn" data-query="How does Compass Concierge work?">How does Compass Concierge work?</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Footer
      '<div class="sl-ai-footer">' +
        '<div class="sl-ai-action-row">' +
          '<button type="button" class="sl-ai-talk-btn" id="sl-ai-talk-btn">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
            'Talk to Steven' +
          '</button>' +
        '</div>' +
        '<form class="sl-ai-form" id="sl-ai-form">' +
          '<div class="sl-ai-input-wrap">' +
            '<input type="text" class="sl-ai-input" id="sl-ai-input" placeholder="Ask about Steven\'s homes..." autocomplete="off" />' +
          '</div>' +
          '<button type="button" class="sl-ai-mic-btn" id="sl-ai-mic-btn" aria-label="Voice input (Speech to text)">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>' +
          '</button>' +
          '<button type="submit" class="sl-ai-send-btn" id="sl-ai-send-btn" aria-label="Send message">' +
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
          '</button>' +
        '</form>' +
        '<div class="sl-ai-subfooter">' +
          '<span>AI can make mistakes, verify details.</span>' +
          '<a href="' + pfx + 'about.html">Steven Lenz Jr. · Compass</a>' +
        '</div>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(win);

    setupInteractions(fab, win);
  }

  // Monthly Mortgage & Cost Calculator (Pure Math, 100% Free)
  function calculateMortgage(priceNumber) {
    var downPercent = 0.20;
    var downPayment = priceNumber * downPercent;
    var loanAmount = priceNumber - downPayment;
    var annualInterestRate = 0.066; // Standard 30-year fixed ~6.6%
    var monthlyRate = annualInterestRate / 12;
    var totalMonths = 360;

    // Standard amortization formula: M = P [ i(1 + i)^n ] / [ (1 + i)^n – 1]
    var monthlyPI = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);

    // California property tax is typically ~1.1% of assessed value annually
    var monthlyTax = (priceNumber * 0.011) / 12;

    // Estimated hazard/homeowners insurance based on purchase tier
    var monthlyInsurance = priceNumber > 1500000 ? 250 : 140;

    var totalMonthly = Math.round(monthlyPI + monthlyTax + monthlyInsurance);

    return {
      price: priceNumber,
      downPayment: Math.round(downPayment),
      loanAmount: Math.round(loanAmount),
      monthlyPI: Math.round(monthlyPI),
      monthlyTax: Math.round(monthlyTax),
      monthlyInsurance: Math.round(monthlyInsurance),
      totalMonthly: totalMonthly
    };
  }

  function formatDollar(num) {
    return '$' + num.toLocaleString('en-US');
  }

  // Smart Real Estate Intent Parser & Knowledge Engine
  function generateReply(userText) {
    var raw = userText.toLowerCase().trim();

    // 1. Check for Mortgage / Price Calculation (e.g. "$700K", "$1.5M", "cost a month")
    var priceMatch = raw.match(/\$?(\d+(?:\.\d+)?)\s*(k|m|million|thousand)?/i);
    var isMortgageQuery = raw.indexOf('cost') !== -1 || raw.indexOf('month') !== -1 || raw.indexOf('payment') !== -1 || raw.indexOf('mortgage') !== -1 || raw.indexOf('rate') !== -1;

    if (isMortgageQuery || (priceMatch && priceMatch[1] && (priceMatch[2] || raw.indexOf('$') !== -1))) {
      var num = 700000; // default
      if (priceMatch && priceMatch[1]) {
        var base = parseFloat(priceMatch[1]);
        var unit = (priceMatch[2] || '').toLowerCase();
        if (unit === 'k' || unit === 'thousand') num = base * 1000;
        else if (unit === 'm' || unit === 'million') num = base * 1000000;
        else if (base < 100) num = base * 1000000; // e.g. "1.8" -> 1.8M
        else if (base < 10000) num = base * 1000;
        else num = base;
      }

      var calc = calculateMortgage(num);
      var isJumbo = calc.loanAmount > 1149825; // 2026 Bay Area conforming loan limit

      return '<p>Here is an estimated monthly payment breakdown for a <strong>' + formatDollar(calc.price) + '</strong> home in California:</p>' +
        '<div class="sl-ai-calc-box">' +
          '<div class="sl-ai-calc-row"><span>Purchase Price</span><strong>' + formatDollar(calc.price) + '</strong></div>' +
          '<div class="sl-ai-calc-row"><span>20% Down Payment</span><span>' + formatDollar(calc.downPayment) + '</span></div>' +
          '<div class="sl-ai-calc-row"><span>Loan Amount (80%)</span><span>' + formatDollar(calc.loanAmount) + '</span></div>' +
          '<div class="sl-ai-calc-row"><span>Principal &amp; Interest (~6.6%)</span><span>' + formatDollar(calc.monthlyPI) + '/mo</span></div>' +
          '<div class="sl-ai-calc-row"><span>CA Property Tax (~1.1%)</span><span>' + formatDollar(calc.monthlyTax) + '/mo</span></div>' +
          '<div class="sl-ai-calc-row"><span>Homeowners Insurance (est.)</span><span>' + formatDollar(calc.monthlyInsurance) + '/mo</span></div>' +
          '<div class="sl-ai-calc-row"><span>Estimated Total Monthly Payment</span><span>' + formatDollar(calc.totalMonthly) + '/mo</span></div>' +
        '</div>' +
        '<p style="margin-top:10px;font-size:0.84rem;color:#4B5563;">' +
          (isJumbo ? '⚠️ At ' + formatDollar(calc.loanAmount) + ', this loan falls into the <strong>Jumbo Loan</strong> tier (above Alameda & Contra Costa’s conforming limit of $1,149,825). Steven partners with premier Bay Area jumbo portfolio lenders offering aggressive rate buydowns.' : '✓ This loan falls comfortably within conforming guidelines. Steven can connect you with trusted local lending partners to lock down competitive terms.') +
        '</p>' +
        '<p style="margin-top:6px;"><button type="button" class="sl-ai-pill-btn" data-query="Can Steven help me get pre-approved?">Can Steven help me get pre-approved?</button></p>';
    }

    // 2. Homes & Listings represented by Steven
    if (raw.indexOf('home') !== -1 || raw.indexOf('listing') !== -1 || raw.indexOf('property') !== -1 || raw.indexOf('portfolio') !== -1 || raw.indexOf('for sale') !== -1 || raw.indexOf('sold') !== -1 || raw.indexOf('genoa') !== -1 || raw.indexOf('altamont') !== -1 || raw.indexOf('zinn') !== -1) {
      var cardsHtml = '';
      FEATURED_LISTINGS.slice(0, 3).forEach(function (p) {
        cardsHtml +=
          '<div class="sl-ai-prop-card">' +
            '<img src="' + pfx + p.photo + '" alt="' + p.address + '" />' +
            '<div class="sl-ai-prop-card__info">' +
              '<div class="sl-ai-prop-card__price">' + p.price + ' <span style="font-size:0.75rem;font-weight:normal;color:#059669;">(' + p.status + ')</span></div>' +
              '<div class="sl-ai-prop-card__addr">' + p.address + ', ' + p.city + '</div>' +
              '<div class="sl-ai-prop-card__meta">' + p.beds + ' Beds · ' + p.baths + ' Baths · ' + p.sqft + ' Sq.Ft.</div>' +
              '<a class="sl-ai-prop-card__link" href="' + pfx + p.url + '">View Portfolio Listing →</a>' +
            '</div>' +
          '</div>';
      });

      return '<p>Steven Lenz Jr. represents premier residential properties, luxury estates, and off-market private exclusives across the Tri-Valley, Diablo Valley, and San Francisco Bay Area. Here are highlights from his track record:</p>' +
        cardsHtml +
        '<p style="margin-top:10px;font-size:0.84rem;">Looking for active off-market inventory or private exclusives? Steven has access to Compass Private Exclusives not posted publicly on the MLS.</p>' +
        '<p><button type="button" class="sl-ai-pill-btn" data-query="Tell me about Compass Private Exclusives">Tell me about Compass Private Exclusives</button></p>';
    }

    // 3. Areas & Communities Covered
    if (raw.indexOf('area') !== -1 || raw.indexOf('where') !== -1 || raw.indexOf('pleasanton') !== -1 || raw.indexOf('danville') !== -1 || raw.indexOf('alamo') !== -1 || raw.indexOf('san ramon') !== -1 || raw.indexOf('dublin') !== -1 || raw.indexOf('livermore') !== -1 || raw.indexOf('walnut creek') !== -1 || raw.indexOf('oakland') !== -1 || raw.indexOf('cover') !== -1) {
      return '<p>Steven Lenz Jr. specializes in the entire <strong>East Bay, Tri-Valley, and San Francisco Peninsula</strong>, with hometown roots right in Pleasanton:</p>' +
        '<ul>' +
          '<li><strong>Tri-Valley:</strong> Pleasanton, Danville, Alamo, San Ramon, Dublin, Livermore (wine country & estate parcels).</li>' +
          '<li><strong>Diablo Valley:</strong> Walnut Creek, Lafayette, Orinda, Moraga.</li>' +
          '<li><strong>Greater Bay Area:</strong> Oakland Hills, Berkeley, Fremont, San Francisco, and mid-Peninsula Silicon Valley gateway enclaves.</li>' +
        '</ul>' +
        '<p>Whether evaluating Pleasanton Unified & San Ramon Valley schools, master-planned neighborhoods like Ruby Hill & Gale Ranch, or BART commute corridors, Steven provides micro-neighborhood data.</p>' +
        '<p><a href="' + pfx + 'neighborhoods.html" style="color:#B48439;font-weight:600;text-decoration:none;">Explore All Area Guides →</a></p>';
    }

    // 4. Compass Concierge
    if (raw.indexOf('concierge') !== -1 || raw.indexOf('staging') !== -1 || raw.indexOf('renovat') !== -1 || raw.indexOf('prep') !== -1) {
      return '<p><strong>Compass Concierge</strong> is the market-leading service that fronts 100% of the cost of home improvement services with <strong>zero upfront cost, zero interest, and zero hidden fees</strong>.</p>' +
        '<ul>' +
          '<li><strong>What it covers:</strong> Professional staging, interior/exterior painting, new hardwood or carpet flooring, kitchen & bath refreshes, deep cleaning, and luxury landscaping.</li>' +
          '<li><strong>Repayment:</strong> The costs are simply deducted out of escrow proceeds when your home sells.</li>' +
          '<li><strong>Proven ROI:</strong> Prepped and professionally staged homes sell significantly faster and routinely yield 5%–12% higher final net sales prices.</li>' +
        '</ul>' +
        '<p><a href="' + pfx + 'concierge.html" style="color:#B48439;font-weight:600;text-decoration:none;">Learn More About Compass Concierge →</a></p>';
    }

    // 5. California Prop 19 & Tax Transfers
    if (raw.indexOf('prop 19') !== -1 || raw.indexOf('tax') !== -1 || raw.indexOf('property tax') !== -1 || raw.indexOf('55') !== -1) {
      return '<p><strong>California Proposition 19</strong> allows California homeowners aged <strong>55 or older</strong> (as well as severely disabled homeowners or victims of natural disasters/wildfires) to transfer their low property tax base to a replacement primary residence anywhere in California.</p>' +
        '<ul>' +
          '<li><strong>Any County in CA:</strong> You can move between Alameda, Contra Costa, San Francisco, or all 58 California counties.</li>' +
          '<li><strong>Up to 3 Times:</strong> Eligible homeowners can utilize this tax-base transfer up to 3 times in their lifetime.</li>' +
          '<li><strong>Upsizing Allowed:</strong> You can even purchase a more expensive home; only the incremental price difference is added to your existing tax base!</li>' +
        '</ul>' +
        '<p>Steven frequently advises East Bay downsizers and empty-nesters on unlocking their equity while preserving their generational tax rate.</p>';
    }

    // 6. About Steven & Experience
    if (raw.indexOf('who is') !== -1 || raw.indexOf('steve') !== -1 || raw.indexOf('steven') !== -1 || raw.indexOf('background') !== -1 || raw.indexOf('coach') !== -1 || raw.indexOf('basketball') !== -1) {
      return '<p><strong>Steven Lenz Jr.</strong> is a premier luxury real estate advisor with Compass (CA DRE# 01989811):</p>' +
        '<ul>' +
          '<li><strong>Tri-Valley Native:</strong> Born and raised in Pleasanton, California; attended Amador Valley High School.</li>' +
          '<li><strong>Athletic Discipline:</strong> Former semi-pro basketball player. Spent 9 years coaching basketball at elite De La Salle High School in Concord and currently coaches collegiately at Ohlone College.</li>' +
          '<li><strong>Sports & Entertainment:</strong> Discreet representation for high-profile athletes, corporate executives, and luxury homeowners requiring strict confidentiality and NDAs.</li>' +
        '</ul>' +
        '<p><a href="' + pfx + 'about.html" style="color:#B48439;font-weight:600;text-decoration:none;">Read Steven’s Full Bio & Client Reviews →</a></p>';
    }

    // 7. Contact / How to Reach Steven
    if (raw.indexOf('contact') !== -1 || raw.indexOf('phone') !== -1 || raw.indexOf('call') !== -1 || raw.indexOf('email') !== -1 || raw.indexOf('talk') !== -1 || raw.indexOf('appointment') !== -1 || raw.indexOf('reach') !== -1) {
      return '<p>You can connect directly with Steven Lenz Jr. anytime:</p>' +
        '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin:8px 0;font-size:0.88rem;">' +
          '<strong>Steven Lenz Jr. · Compass</strong><br />' +
          'Direct Cell / Text: <a href="tel:+19259989711" style="color:#B48439;font-weight:bold;">(925) 998-9711</a><br />' +
          'Email: <a href="mailto:steven.lenzjr@compass.com" style="color:#B48439;">steven.lenzjr@compass.com</a><br />' +
          'Office: 900 Main St., Pleasanton, CA 94566<br />' +
          'License: CA DRE# 01989811' +
        '</div>' +
        '<p><a href="' + pfx + 'connect.html" style="color:#B48439;font-weight:600;">Schedule an Appointment on the Connect Page →</a></p>';
    }

    // Default Fallback
    return '<p>Thank you for asking! Steven Lenz Jr. represents luxury buyers and sellers throughout Pleasanton, Danville, Alamo, and the San Francisco Bay Area.</p>' +
      '<p>Would you like to explore:</p>' +
      '<ul>' +
        '<li>Steven’s active and sold portfolio listings</li>' +
        '<li>Monthly mortgage breakdown for a specific price (e.g. $700K, $1.5M, $2.2M)</li>' +
        '<li>Neighborhood insight for Pleasanton, Danville, or surrounding communities</li>' +
        '<li>Compass Concierge or Private Exclusives</li>' +
      '</ul>' +
      '<p><button type="button" class="sl-ai-talk-btn" onclick="window.location.href=\'tel:+19259989711\'">📞 Call Steven Directly at (925) 998-9711</button></p>';
  }

  // Setup DOM Event Listeners & UI Controls
  function setupInteractions(fab, win) {
    var closeBtn = document.getElementById('sl-ai-close-btn');
    var form = document.getElementById('sl-ai-form');
    var input = document.getElementById('sl-ai-input');
    var body = document.getElementById('sl-ai-body');
    var talkBtn = document.getElementById('sl-ai-talk-btn');
    var micBtn = document.getElementById('sl-ai-mic-btn');
    var langBtn = document.getElementById('sl-ai-lang-btn');
    var langMenu = document.getElementById('sl-ai-lang-menu');
    var optBtn = document.getElementById('sl-ai-options-btn');
    var optMenu = document.getElementById('sl-ai-options-menu');

    function toggleChat(open) {
      win.classList.toggle('is-open', open);
      if (open) {
        input.focus();
        closeMenus();
      }
    }

    function closeMenus() {
      if (langMenu) langMenu.classList.remove('is-open');
      if (optMenu) optMenu.classList.remove('is-open');
    }

    fab.addEventListener('click', function () { toggleChat(true); });
    closeBtn.addEventListener('click', function () { toggleChat(false); });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && win.classList.contains('is-open')) {
        toggleChat(false);
      }
    });

    // Language Menu Toggle
    if (langBtn) {
      langBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        optMenu.classList.remove('is-open');
        langMenu.classList.toggle('is-open');
      });
    }

    // Language Selection
    if (langMenu) {
      langMenu.querySelectorAll('.sl-ai-popup-item').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var lang = btn.getAttribute('data-lang');
          CURRENT_LANG = lang;
          langMenu.classList.remove('is-open');
          var greetings = {
            en: 'Switched to English. How can I help you with your Bay Area real estate plans?',
            es: 'Cambiado a Español. ¿En qué le puedo ayudar con sus planes inmobiliarios en el Área de la Bahía?',
            zh: '已切换为中文。请问您需要了解旧金山湾区/Tri-Valley的房产信息吗？',
            vi: 'Đã chuyển sang tiếng Việt. Tôi có thể giúp gì cho quý vị về bất động sản Vùng Vịnh?',
            tl: 'Lumipat sa Tagalog. Paano kita matutulungan sa iyong mga plano sa real estate sa Bay Area?',
            hi: 'हिंदी में स्विच किया गया। मैं बे एरिया में आपके रियल एस्टेट के लिए कैसे मदद कर सकता हूँ?'
          };
          addBotMessage(greetings[lang] || greetings.en);
        });
      });
    }

    // Options Menu Toggle
    if (optBtn) {
      optBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        langMenu.classList.remove('is-open');
        optMenu.classList.toggle('is-open');
      });
    }

    document.addEventListener('click', function () { closeMenus(); });

    // Options Actions
    document.getElementById('sl-ai-opt-clear').addEventListener('click', function () {
      body.innerHTML = '';
      addBotMessage('Conversation cleared. Hi! I\'m Steve. How can I assist you with Steven\'s homes, neighborhood guides, or monthly costs?');
      closeMenus();
    });

    document.getElementById('sl-ai-opt-call').addEventListener('click', function () {
      window.location.href = 'tel:' + STEVE_INFO.phoneRaw;
      closeMenus();
    });

    document.getElementById('sl-ai-opt-email').addEventListener('click', function () {
      window.location.href = 'mailto:' + STEVE_INFO.email + '?subject=Real%20Estate%20Inquiry%20via%20AI%20Steve';
      closeMenus();
    });

    document.getElementById('sl-ai-opt-about').addEventListener('click', function () {
      window.location.href = pfx + 'about.html';
      closeMenus();
    });

    // Talk to Steven Pill Action
    talkBtn.addEventListener('click', function () {
      addUserMessage('I would like to talk to Steven Lenz Jr.');
      setTimeout(function () {
        addBotMessage(
          '<p>I would be delighted to connect you with Steven directly! Here is how to reach him immediately:</p>' +
          '<div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin:8px 0;font-size:0.88rem;">' +
            '<strong>Steven Lenz Jr.</strong><br />' +
            '📱 Direct Cell / Text: <a href="tel:+19259989711" style="color:#B48439;font-weight:bold;">(925) 998-9711</a><br />' +
            '✉️ Direct Email: <a href="mailto:steven.lenzjr@compass.com" style="color:#B48439;">steven.lenzjr@compass.com</a><br />' +
            '📍 Office: 900 Main St., Pleasanton, CA 94566' +
          '</div>' +
          '<p><a href="' + pfx + 'connect.html" style="display:inline-block;background:#111827;color:#FFFFFF;padding:8px 16px;border-radius:20px;text-decoration:none;font-weight:600;font-size:0.84rem;">Open Consultation Booking Form →</a></p>'
        );
      }, 400);
    });

    // Free Browser Web Speech API for Voice Input (Speech-to-Text)
    var recognition = null;
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRec) {
      recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = function () {
        micBtn.classList.add('is-listening');
        input.placeholder = 'Listening... Speak now';
      };

      recognition.onresult = function (event) {
        var transcript = event.results[0][0].transcript;
        input.value = transcript;
        micBtn.classList.remove('is-listening');
        input.placeholder = 'Ask about Steven\'s homes...';
        handleSend();
      };

      recognition.onerror = function () {
        micBtn.classList.remove('is-listening');
        input.placeholder = 'Ask about Steven\'s homes...';
      };

      recognition.onend = function () {
        micBtn.classList.remove('is-listening');
        input.placeholder = 'Ask about Steven\'s homes...';
      };

      micBtn.addEventListener('click', function () {
        if (micBtn.classList.contains('is-listening')) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch (e) {
            recognition.stop();
          }
        }
      });
    } else {
      micBtn.title = 'Voice input not supported in this browser';
      micBtn.style.opacity = '0.5';
      micBtn.style.cursor = 'not-allowed';
    }

    // Message submission
    function handleSend() {
      var query = input.value.trim();
      if (!query) return;

      addUserMessage(query);
      input.value = '';

      // Display typing indicator
      var typingEl = document.createElement('div');
      typingEl.className = 'sl-ai-msg sl-ai-msg--bot';
      typingEl.innerHTML = '<div class="sl-ai-typing"><span class="sl-ai-dot"></span><span class="sl-ai-dot"></span><span class="sl-ai-dot"></span></div>';
      body.appendChild(typingEl);
      body.scrollTop = body.scrollHeight;

      // Realistic thoughtful response delay
      setTimeout(function () {
        typingEl.remove();
        var replyHtml = generateReply(query);
        addBotMessage(replyHtml);
      }, 550);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSend();
    });

    // Delegate Starter Pills
    body.addEventListener('click', function (e) {
      var pill = e.target.closest('.sl-ai-pill-btn');
      if (pill) {
        var q = pill.getAttribute('data-query');
        if (q) {
          input.value = q;
          handleSend();
        }
      }
    });

    function addUserMessage(text) {
      var msg = document.createElement('div');
      msg.className = 'sl-ai-msg sl-ai-msg--user';
      msg.innerHTML =
        '<div class="sl-ai-bubble">' + escapeHtml(text) + '</div>' +
        '<div class="sl-ai-time">' + formatTime() + '</div>';
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function addBotMessage(html) {
      var msg = document.createElement('div');
      msg.className = 'sl-ai-msg sl-ai-msg--bot';
      msg.innerHTML =
        '<div class="sl-ai-bubble">' + html + '</div>' +
        '<div class="sl-ai-time">' + formatTime() + '</div>';
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function formatTime() {
      var d = new Date();
      var h = d.getHours();
      var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }

  // Initialize on document ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();

