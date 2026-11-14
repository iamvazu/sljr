/* ------------------------------------------------------------------
 * SLForms — the one way every form on the site talks to the server.
 * Resolves ONLY when the server confirms the submission was saved.
 * Any failure (offline, 4xx, 5xx, rate limit, no API) rejects with a
 * message that is safe to show the visitor. Never fake a "thank you".
 * ------------------------------------------------------------------ */
(function () {
  var FALLBACK = "We couldn't send that just now, so it has not reached Steven. " +
    'Please try again, or call or text (925) 998-9711.';
  var utm = {};
  try {
    var saved = JSON.parse(sessionStorage.getItem('sl_utm') || '{}');
    var qs = new URLSearchParams(window.location.search);
    ['source', 'medium', 'campaign', 'term', 'content'].forEach(function (k) {
      var v = qs.get('utm_' + k);
      if (v) saved[k] = v;
    });
    ['gclid', 'fbclid'].forEach(function (k) { if (qs.get(k)) saved[k] = qs.get(k); });
    if (!saved.landing) saved.landing = window.location.pathname;
    if (!('ref' in saved)) saved.ref = document.referrer || '';
    sessionStorage.setItem('sl_utm', JSON.stringify(saved));
    utm = saved;
    // Earlier builds kept a copy of lead details in the browser. Remove it.
    localStorage.removeItem('sl_leads_backup');
  } catch (_) {}

  function post(url, payload) {
    var body = Object.assign({}, payload, { utm: utm, referrer: utm.ref || '' });
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.ok && data && data.ok) return data;
        var msg = (res.status === 400 || res.status === 429) && data && data.error ? data.error : FALLBACK;
        throw new Error(msg);
      });
    }, function () { throw new Error(FALLBACK); });
  }

  function show(el, message, isError) {
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.setAttribute('role', isError ? 'alert' : 'status');
  }

  /* Disable the submit button while sending; returns a restore function. */
  function busy(form) {
    var btn = form && form.querySelector('button[type="submit"]');
    if (!btn) return function () {};
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    return function () { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; };
  }

  window.SLForms = { post: post, show: show, busy: busy, FALLBACK: FALLBACK };
})();

/* ------------------------------------------------------------------
 * Area pages: show Steven's REAL listings and closings for that city,
 * read from the same data the admin panel manages. Nothing is hard-coded.
 * ------------------------------------------------------------------ */
(function () {
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function init() {
    var sections = document.querySelectorAll('[data-area-homes]');
    if (!sections.length) return;
    var pfx = sections[0].getAttribute('data-pfx') || '';
    fetch('/api/listings')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) { return d.listings || []; })
      .catch(function () { return fetch(pfx + 'content/listings.json').then(function (r) { return r.json(); }); })
      .catch(function () { return []; })
      .then(function (items) {
        sections.forEach(function (sec) {
          var cities = (sec.getAttribute('data-cities') || '').toLowerCase().split(',').filter(Boolean);
          var grid = sec.querySelector('[data-area-grid]');
          var empty = sec.querySelector('[data-area-empty]');
          var match = items.filter(function (i) {
            return !cities.length || cities.indexOf(String(i.city || '').toLowerCase()) !== -1;
          }).slice(0, 3);
          if (!match.length) { if (grid) grid.hidden = true; if (empty) empty.hidden = false; return; }
          grid.innerHTML = match.map(function (i) {
            var specs = Number(i.beds)
              ? i.beds + ' BEDS · ' + i.baths + ' BATHS · ' + i.sqft + ' SQ.FT'
              : String(i.property_type || 'Land').toUpperCase();
            return '<article class="area-home-card"><a href="' + pfx + 'listing.html?id=' + encodeURIComponent(i.id) + '">' +
              '<div class="area-home-img-wrap"><img src="' + pfx + esc(i.photo) + '" alt="' + esc(i.full_address || i.address) + '" loading="lazy" width="1376" height="768">' +
              '<div class="area-home-badges"><span class="area-home-badge' + (i.active ? ' area-home-badge--gold' : '') + '">' + esc(String(i.status || '').toUpperCase()) + '</span></div></div>' +
              '<div class="area-home-body"><div class="area-home-price">' + esc(i.price) + '</div>' +
              '<div class="area-home-address">' + esc(String(i.full_address || i.address || '').toUpperCase()) + '</div>' +
              '<div class="area-home-specs">' + esc(specs) + '</div></div></a></article>';
          }).join('');
        });
      });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* ============================================================================
   editorial-nav.js — Shared Header, Communities Dropdown, Drawer & Stay-in-Know
   ============================================================================ */
(function () {
  'use strict';

  function subpageShellHTML() {
    var isSubdir = (typeof window !== 'undefined' && (window.location.pathname.indexOf('/areas/') !== -1 || window.location.pathname.indexOf('/articles/') !== -1));
    var pfx = isSubdir ? '../' : '';
    var header = '<header class="ed-header">' +
      '<nav class="ed-nav-group ed-nav-group--left" aria-label="Primary navigation">' +
        '<a class="ed-nav-link" href="' + pfx + 'buy.html">Buy</a>' +
        '<a class="ed-nav-link" href="' + pfx + 'sell.html">Sell</a>' +
        '<a class="ed-nav-link" href="' + pfx + 'properties.html">Portfolio</a>' +
        '<a class="ed-nav-link" href="https://stevenlenzjr.com/home-search/listings" target="_blank" rel="noopener noreferrer">Search Homes</a>' +
      '</nav>' +
      '<a class="ed-brand" href="' + pfx + 'index.html#top" aria-label="Steven Lenz Jr | Compass | Real Estate">' +
        '<span class="ed-brand__name">Steven Lenz Jr</span>' +
        '<div class="ed-brand__compass">' +
          '<img class="ed-brand__banner" src="' + pfx + 'assets/brand/sl-compass-banner.png" alt="Compass" />' +
        '</div>' +
        '<span class="ed-brand__sub">Real Estate</span>' +
      '</a>' +
      '<nav class="ed-nav-group ed-nav-group--right" aria-label="Secondary navigation">' +
        '<a class="ed-nav-link" href="' + pfx + 'about.html">About</a>' +
        '<div class="ed-dropdown ed-dropdown--mega" id="communities-dd-wrap">' +
          '<button type="button" class="ed-nav-link" id="communities-dd-btn" aria-expanded="false" aria-haspopup="true">Communities ▾</button>' +
          '<div class="ed-mega" role="menu">' +
            '<div class="ed-mega__top"><span class="ed-mega__eyebrow">Bay Area &amp; Tri-Valley</span><a class="ed-mega__all" href="' + pfx + 'neighborhoods.html">View all communities →</a></div>' +
            '<div class="ed-mega__grid">' +
              '<a class="ed-mega__card" href="' + pfx + 'neighborhoods.html#tri-valley"><img class="ed-mega__img" src="' + pfx + 'assets/img/danville-genoa.jpg" alt="Tri-Valley Neighborhoods" /><div class="ed-mega__title-row"><span>Tri-Valley</span><span class="ed-mega__arrow">→</span></div><p class="ed-mega__desc">Steven\'s hometown of Pleasanton alongside Danville estates, Livermore wine country, and San Ramon.</p><div class="ed-mega__guide"><span class="ed-mega__guide-label">Tri-Valley Neighborhoods</span><div class="ed-mega__subs">Pleasanton · Danville · Livermore · San Ramon</div></div></a>' +
              '<a class="ed-mega__card" href="' + pfx + 'neighborhoods.html#diablo-valley"><img class="ed-mega__img" src="' + pfx + 'assets/img/neighborhood-walnut-creek.jpg" alt="Diablo Valley Neighborhoods" /><div class="ed-mega__title-row"><span>Diablo Valley</span><span class="ed-mega__arrow">→</span></div><p class="ed-mega__desc">Vibrant downtowns, top-rated schools, and oak-studded estates along the Mt. Diablo foothills.</p><div class="ed-mega__guide"><span class="ed-mega__guide-label">Diablo Valley Neighborhoods</span><div class="ed-mega__subs">Walnut Creek · Lafayette · Alamo</div></div></a>' +
              '<a class="ed-mega__card" href="' + pfx + 'neighborhoods.html#east-bay"><img class="ed-mega__img" src="' + pfx + 'assets/img/oakland-greenwood.jpg" alt="East Bay Corridor" /><div class="ed-mega__title-row"><span>East Bay Corridor</span><span class="ed-mega__arrow">→</span></div><p class="ed-mega__desc">Architectural hills, bay views, and Silicon Valley gateway communities across Alameda County.</p><div class="ed-mega__guide"><span class="ed-mega__guide-label">East Bay Cities</span><div class="ed-mega__subs">Oakland · Berkeley · Hayward · Union City · Fremont · Milpitas</div></div></a>' +
              '<a class="ed-mega__card" href="' + pfx + 'neighborhoods.html#peninsula"><img class="ed-mega__img" src="' + pfx + 'assets/img/hero-portfolio.jpg" alt="San Francisco, Peninsula and Silicon Valley" /><div class="ed-mega__title-row"><span>SF &amp; Peninsula</span><span class="ed-mega__arrow">→</span></div><p class="ed-mega__desc">Iconic city neighborhoods, mid-Peninsula enclaves, and premier Silicon Valley estates.</p><div class="ed-mega__guide"><span class="ed-mega__guide-label">Peninsula &amp; South Bay</span><div class="ed-mega__subs">San Francisco · San Mateo · Redwood City · Palo Alto · Mountain View · Santa Clara · San Jose</div></div></a>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ed-dropdown" id="resources-dd-wrap">' +
          '<button type="button" class="ed-nav-link" id="resources-dd-btn" aria-expanded="false" aria-haspopup="true">Resources ▾</button>' +
          '<div class="ed-dropdown__menu" role="menu" aria-label="Real Estate News and Insights">' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=all">Real Estate News <small>All Insights</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=housing-market">Housing Market <small>Tri-Valley &amp; CA</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=buying-selling">Buying &amp; Selling <small>Advisory</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=mortgage-rates">Mortgage Rates <small>Jumbo &amp; 30-Yr</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=trends">Trends &amp; Insights <small>Prop 19</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=new-construction">New Construction <small>Luxury Builds</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=industry-news">Industry News <small>Compass Intel</small></a>' +
            '<a class="ed-dropdown__item" href="' + pfx + 'resources.html?cat=market-reports">Market Reports <small>Quarterly Comps</small></a>' +
            '<a class="ed-dropdown__all" href="' + pfx + 'resources.html">View All Resources &amp; News →</a>' +
          '</div>' +
        '</div>' +
        '<a class="ed-nav-link" href="' + pfx + 'connect.html">Let\'s Connect</a>' +
        '<button type="button" class="ed-burger" id="menu-open-btn" aria-haspopup="dialog" aria-controls="site-drawer" aria-expanded="false" aria-label="Open menu"><span></span><span></span><span></span></button>' +
      '</nav>' +
      '<div class="ed-mobile-right">' +
        '<button type="button" class="ed-burger" id="menu-open-btn-mobile" aria-haspopup="dialog" aria-controls="site-drawer" aria-expanded="false" aria-label="Open menu"><span></span><span></span><span></span></button>' +
      '</div>' +
    '</header>';

    var drawer = '<div class="site-drawer-backdrop" id="drawer-backdrop"></div>' +
      '<aside class="site-drawer" id="site-drawer" role="dialog" aria-modal="true" aria-label="Site navigation">' +
        '<div class="drawer-head"><img src="' + pfx + 'assets/brand/compass-sl-white.png" alt="SL | Compass" width="124" height="22" /><button type="button" class="modal-close" id="menu-close-btn" aria-label="Close menu">×</button></div>' +
        '<nav class="drawer-nav" aria-label="Full navigation"><a href="' + pfx + 'index.html#top">Home</a><a href="' + pfx + 'buy.html">Buy a Home</a><a href="' + pfx + 'sell.html">Sell Your Home</a><a href="' + pfx + 'properties.html">Portfolio</a><a href="https://stevenlenzjr.com/home-search/listings" target="_blank" rel="noopener noreferrer">Search Homes ↗</a><a href="' + pfx + 'resources.html">Resources &amp; News</a><div class="drawer-sub"><a href="' + pfx + 'resources.html?cat=housing-market">Housing Market</a><a href="' + pfx + 'resources.html?cat=buying-selling">Buying &amp; Selling</a><a href="' + pfx + 'resources.html?cat=mortgage-rates">Mortgage Rates</a><a href="' + pfx + 'resources.html?cat=trends">California Trends</a><a href="' + pfx + 'resources.html?cat=new-construction">New Construction</a><a href="' + pfx + 'resources.html?cat=market-reports">Market Reports</a></div><a href="' + pfx + 'neighborhoods.html">Communities &amp; Area Guides</a><div class="drawer-sub"><a href="' + pfx + 'areas/pleasanton.html">Pleasanton</a><a href="' + pfx + 'areas/danville.html">Danville</a><a href="' + pfx + 'areas/alamo.html">Alamo</a><a href="' + pfx + 'areas/san-ramon.html">San Ramon</a><a href="' + pfx + 'areas/dublin.html">Dublin</a><a href="' + pfx + 'areas/livermore.html">Livermore</a><a href="' + pfx + 'areas/walnut-creek.html">Walnut Creek</a><a href="' + pfx + 'areas/lafayette.html">Lafayette</a><a href="' + pfx + 'areas/oakland.html">Oakland</a><a href="' + pfx + 'areas/berkeley.html">Berkeley</a><a href="' + pfx + 'areas/hayward.html">Hayward</a><a href="' + pfx + 'areas/fremont.html">Fremont</a><a href="' + pfx + 'areas/san-francisco.html">San Francisco</a><a href="' + pfx + 'areas/palo-alto.html">Palo Alto</a><a href="' + pfx + 'areas/san-jose.html">San Jose</a></div><a href="' + pfx + 'about.html">About Steven</a><a href="' + pfx + 'concierge.html">Compass Concierge</a><a href="' + pfx + 'experiences.html">Private Exclusives</a><a href="https://stevenlenzjr.com/home-search/account" target="_blank" rel="noopener noreferrer">My Search Portal ↗</a><a href="' + pfx + 'connect.html" style="color:var(--sw-accent);">Let\'s Connect</a></nav>' +
        '<div class="drawer-footer"><strong style="color:var(--sw-ink);display:block;">Steven Lenz Jr. · CA DRE# 01989811</strong>900 Main St., Pleasanton, CA 94566<br /><a href="tel:+19259989711" style="color:var(--sw-accent);text-decoration:none;">(925) 998-9711</a></div>' +
      '</aside>';

    var isListings = (typeof window !== 'undefined' && (
      window.location.pathname.indexOf('properties') !== -1 ||
      window.location.pathname.indexOf('listing') !== -1 ||
      window.location.pathname.indexOf('areas/') !== -1 ||
      document.querySelector('[data-area-homes], .pf-grid, .listing-detail')
    ));

    var mlsDisclaimerHTML = isListings ? (
      '<h5 class="ed-idx-title">MLS Disclaimer &amp; IDX Information</h5>' +
      '<p class="ed-idx-copy">This information is deemed reliable but not guaranteed. You should rely on this information only to decide whether or not to further investigate a particular property. BEFORE MAKING ANY OTHER DECISION, YOU SHOULD PERSONALLY INVESTIGATE THE FACTS (e.g., square footage and lot size) with the assistance of an appropriate professional. You may use this information only to identify properties you may be interested in investigating further. All uses except for personal, noncommercial use in accordance with the foregoing purpose are prohibited. Redistribution or copying of this information, any photographs, or video tours is strictly prohibited. Displayed property listings may be held by a brokerage firm other than the broker and/or agent responsible for this display. The information, photographs, video tours, and the compilation from which they are derived are protected by copyright. Compilation © 2026 CCAR / Bay East MLS.</p>'
    ) : '';

    var footer = '<footer class="ed-footer">' +
      '<div class="ed-footer__grid">' +
        '<div class="ed-footer__col">' +
          '<div class="ed-footer__brand-wrap">' +
            '<h3 class="ed-footer__brand-name">Steven Lenz Jr</h3>' +
            '<div class="ed-footer__brand-block">' +
              '<img class="ed-footer__brand-logo" src="' + pfx + 'assets/brand/sl-compass-banner.png" alt="Compass Real Estate" />' +
              '<div class="ed-footer__brand-sub">Real Estate</div>' +
            '</div>' +
          '</div>' +
          '<p style="font-size:0.82rem;color:var(--sw-ink-soft);line-height:1.55;margin-top:14px;max-width:28ch;">Discreet, data-sharp representation across the Tri-Valley and East Bay corridor.</p>' +
          '<div style="display:inline-flex;align-items:center;gap:10px;margin-top:14px;color:var(--sw-ink-soft);opacity:0.85;">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-label="Equal Housing Opportunity"><path d="M12 3L2 10h2v10h16V10h2L12 3zm0 2.6L18 10v8H6v-8l6-4.4zM9 12h6v1.5H9V12zm0 3h6v1.5H9V15z"/></svg>' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-label="REALTOR"><path d="M3 2h12v14H3V2zm2.5 2.5v9H9v-3.2h2.1l2 3.2h2.4l-2.3-3.6c1.2-.5 2-1.6 2-3 0-2-1.4-3.4-3.6-3.4H5.5zm3.5 2h2.3c.9 0 1.5.5 1.5 1.4s-.6 1.4-1.5 1.4H9V6.5zM3 18h18v2H3v-2z"/></svg>' +
          '</div>' +
        '</div>' +
        '<div class="ed-footer__col"><h4>Navigation</h4><ul class="ed-footer__links"><li><a href="' + pfx + 'properties.html">Portfolio</a></li><li><a href="' + pfx + 'concierge.html">Compass Concierge</a></li><li><a href="' + pfx + 'experiences.html">Private Exclusives</a></li><li><a href="' + pfx + 'neighborhoods.html">Communities &amp; Guides</a></li><li><a href="' + pfx + 'resources.html">Resources &amp; News</a></li><li><a href="' + pfx + 'about.html">About Steven</a></li><li><a href="' + pfx + 'connect.html">Let\'s Connect</a></li></ul>' +
        '<div class="ed-footer__socials">' +
          '<a href="https://www.instagram.com/steven_lenz_jr/?hl=en" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></a>' +
          '<a href="https://www.linkedin.com/in/stevenlenzjr/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg></a>' +
          '<a href="https://www.facebook.com/StevenLenzJr0" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>' +
          '<a href="https://twitter.com/StevenLenzJr" target="_blank" rel="noopener noreferrer" aria-label="Twitter"><svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>' +
        '</div>' +
        '<ul class="ed-footer__links" style="margin-top:14px;">' +
          '<li><a href="https://www.homes.com/real-estate-agents/steven-lenz-jr/1q8sxz5" target="_blank" rel="noopener noreferrer">Steven Lenz Jr. on Homes.com ↗</a></li>' +
          '<li><a href="https://compass.com/agents/steven-lenz-jr" target="_blank" rel="noopener noreferrer">Steven Lenz Jr. on Compass ↗</a></li>' +
        '</ul></div>' +
        '<div class="ed-footer__col"><h4>Communities</h4><ul class="ed-footer__links"><li><a href="' + pfx + 'neighborhoods.html#tri-valley">Tri-Valley: Pleasanton · Danville · Livermore · San Ramon <span class="ed-footer__hood-label">Guide</span></a></li><li><a href="' + pfx + 'neighborhoods.html#diablo-valley">Diablo Valley: Walnut Creek · Lafayette · Alamo <span class="ed-footer__hood-label">Guide</span></a></li><li><a href="' + pfx + 'neighborhoods.html#east-bay">East Bay: Oakland · Berkeley · Hayward · Fremont <span class="ed-footer__hood-label">Guide</span></a></li></ul></div>' +
        '<div class="ed-footer__col ed-footer__contact"><h4>Contact</h4>' +
          '<p><strong style="color:var(--sw-ink);">Compass Real Estate</strong></p>' +
          '<p style="line-height:1.45;margin-bottom:8px;"><a href="https://www.google.com/maps/search/900+Main+St.%C2%A0+Pleasanton,+Ca.+94566" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;"><strong>Pleasanton:</strong> 900 Main St, Pleasanton, CA 94566</a><br /><a href="https://www.google.com/maps/search/1646+N+California+Blvd,+Suite+101,+Walnut+Creek,+CA+94596" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;margin-top:4px;display:inline-block;"><strong>Walnut Creek:</strong> 1646 N California Blvd, Ste 101, Walnut Creek, CA 94596</a></p>' +
          '<p><a href="tel:+19259989711">(925) 998-9711</a></p>' +
          '<p><a href="mailto:steven.lenzjr@compass.com">steven.lenzjr@compass.com</a></p>' +
          '<p style="font-size:0.78rem;margin-bottom:4px;">CA DRE# 01989811</p>' +
          '<p style="font-size:0.78rem;">Compass California II, Inc. · Brokerage DRE# 01527235</p>' +
          '<div class="ed-stay"><h4>Stay in the Know</h4><p style="font-size:0.8rem;font-style:italic;margin:0 0 6px;">Tri-Valley &amp; East Bay Market Updates. New Listings. Local Insight.</p>' +
            '<form id="ed-stay-form" novalidate><div class="ed-stay__row"><input type="email" placeholder="Email Address" aria-label="Email Address" required /><button type="submit" aria-label="Subscribe">→</button></div>' +
            '<label class="ed-stay__consent"><input type="checkbox" required /><span>I agree to receive email market updates and property alerts from Steven Lenz Jr. at Compass. Unsubscribe anytime. <a href="' + pfx + 'privacy.html" style="color:var(--sw-accent);">Privacy Policy</a>.</span></label>' +
            '<p id="ed-stay-msg" style="font-size:0.74rem;color:var(--sw-accent);margin:6px 0 0;"></p></form></div>' +
        '</div>' +
      '</div>' +
      '<div class="ed-footer__legal">' +
        '<nav class="ed-legal-nav" aria-label="Legal">' +
          '<a href="' + pfx + 'privacy.html">Privacy Policy</a>' +
          '<a href="' + pfx + 'cookies.html">Cookie Policy</a>' +
          '<a href="' + pfx + 'cookies.html#preferences">Cookie Preferences</a>' +
          '<a href="' + pfx + 'terms.html">Terms &amp; Conditions</a>' +
          '<a href="' + pfx + 'accessibility.html">Accessibility</a>' +
          '<a href="' + pfx + 'fair-housing.html">Fair Housing</a>' +
        '</nav>' +
        mlsDisclaimerHTML +
        '<h5 class="ed-idx-title">Compass California II, Inc. | CA DRE# 01527235</h5>' +
        '<p class="ed-idx-copy">Steven Lenz Jr. is a real estate salesperson licensed by the state of California affiliated with Compass. Compass is a real estate broker licensed by the State of California and abides by Equal Housing Opportunity laws. License Number 01527235. All material presented herein is intended for informational purposes only and is compiled from sources deemed reliable but has not been verified. Changes in price, condition, sale or withdrawal may be made without notice. No statement is made as to the accuracy of any description. All measurements and square footage are approximate. If your property is currently listed for sale this is not a solicitation.</p>' +
        '<details class="ed-legal-details"><summary>Fair Housing &amp; Equal Opportunity</summary><p>We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing opportunity throughout the Nation. We encourage and support an affirmative advertising and marketing program in which there are no barriers to obtaining housing because of race, color, religion, sex, handicap, familial status, or national origin.</p></details>' +
        '<details class="ed-legal-details"><summary>Professional Licensing &amp; REALTOR® Information</summary><p>Steven Lenz Jr. · Compass California II, Inc. · License #01989811 · Brokerage DRE# 01527235 · California DRE. REALTOR® is a registered trademark of the National Association of REALTORS® and identifies real estate professionals who are members of the National Association of REALTORS® and subscribe to its strict Code of Ethics.</p></details>' +
        '<div class="ed-footer__bottom"><span>Copyright 2026 Steven Lenz Jr. | Equal Housing Opportunity</span><span style="display:inline-flex;align-items:center;gap:12px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-label="REALTOR"><path d="M3 2h12v14H3V2zm2.5 2.5v9H9v-3.2h2.1l2 3.2h2.4l-2.3-3.6c1.2-.5 2-1.6 2-3 0-2-1.4-3.4-3.6-3.4H5.5zm3.5 2h2.3c.9 0 1.5.5 1.5 1.4s-.6 1.4-1.5 1.4H9V6.5zM3 18h18v2H3v-2z"/></svg><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-label="Equal Housing Opportunity"><path d="M12 3L2 10h2v10h16V10h2L12 3zm0 2.6L18 10v8H6v-8l6-4.4zM9 12h6v1.5H9V12zm0 3h6v1.5H9V15z"/></svg>Steven Lenz Jr. · CA DRE# 01989811 · Compass · CA DRE# 01527235</span></div>' +
      '</div>' +
    '</footer>';

    return { header: header, drawer: drawer, footer: footer };
  }

  function initHeader() {
    var hm = document.getElementById('ed-header-mount');
    var dm = document.getElementById('ed-drawer-mount');
    var fm = document.getElementById('ed-footer-mount');
    if (hm || dm || fm) {
      var parts = subpageShellHTML();
      if (hm) hm.outerHTML = parts.header;
      if (dm) dm.outerHTML = parts.drawer;
      if (fm) fm.outerHTML = parts.footer;
    }

    // Header maintains consistent luxury presentation across all scrolls
    // (no height shrinking or brand abbreviation per client specifications)

    // Ticket 17: Accessible dropdowns with click, Enter, Space, Escape
    function wireDropdown(btnId, wrapId) {
      var btn = document.getElementById(btnId);
      var wrap = document.getElementById(wrapId) || (btn ? btn.closest('.ed-dropdown') : null);
      if (!btn || !wrap) return;

      function toggle(force) {
        var isOpen = typeof force === 'boolean' ? force : !wrap.classList.contains('is-open');
        wrap.classList.toggle('is-open', isOpen);
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggle();
      });

      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          toggle();
        } else if (e.key === 'Escape') {
          toggle(false);
          btn.focus();
        }
      });
    }

    wireDropdown('communities-dd-btn', 'communities-dd-wrap');
    wireDropdown('resources-dd-btn', 'resources-dd-wrap');

    document.addEventListener('click', function (e) {
      ['communities-dd-wrap', 'resources-dd-wrap'].forEach(function (id) {
        var wrap = document.getElementById(id);
        if (wrap && !wrap.contains(e.target)) {
          wrap.classList.remove('is-open');
          var btn = wrap.querySelector('button');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Slide-out Menu Drawer (shared across all pages)
    var drawer = document.getElementById('site-drawer');
    var openBtn = document.getElementById('menu-open-btn');
    var openBtnMobile = document.getElementById('menu-open-btn-mobile');
    var closeBtn = document.getElementById('menu-close-btn');
    var backdrop = document.getElementById('drawer-backdrop');

    function setDrawer(open) {
      if (!drawer) return;
      drawer.classList.toggle('is-open', open);
      drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (openBtnMobile) openBtnMobile.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (openBtn) openBtn.addEventListener('click', function () { setDrawer(true); });
    if (openBtnMobile) openBtnMobile.addEventListener('click', function () { setDrawer(true); });
    if (closeBtn) closeBtn.addEventListener('click', function () { setDrawer(false); });
    if (backdrop) backdrop.addEventListener('click', function () { setDrawer(false); });
    if (drawer) {
      drawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { setDrawer(false); });
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        setDrawer(false);
        if (ddWrap) ddWrap.classList.remove('is-open');
      }
    });

    // Footer "Stay in the Know" form
    var stayForm = document.getElementById('ed-stay-form');
    if (stayForm) {
      stayForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = stayForm.querySelector('input[type="email"]');
        var consent = stayForm.querySelector('input[type="checkbox"]');
        var msgEl = document.getElementById('ed-stay-msg');
        if (!email || !email.value.trim()) {
          if (msgEl) msgEl.textContent = 'Please enter your email address.';
          return;
        }
        if (consent && !consent.checked) {
          if (msgEl) msgEl.textContent = 'Please check the consent box to subscribe.';
          return;
        }
        var done = window.SLForms.busy(stayForm);
        window.SLForms.post('/api/newsletter', {
          email: email.value.trim(),
          consent: Boolean(consent && consent.checked),
          source_page: window.location.pathname
        })
          .then(function () {
            window.SLForms.show(msgEl, 'Thank you — you are subscribed to Tri-Valley & East Bay updates from Steven Lenz Jr.', false);
            stayForm.reset();
          })
          .catch(function (err) { window.SLForms.show(msgEl, err.message, true); })
          .then(done);
      });
    }
  }

  
  // Floating Cookie Consent Banner (CoStar / CCPA / CPRA Standard)
  function initCookieConsent(pfx) {
    var STORAGE_KEY = 'sl_cookie_consent_v1';
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch (e) { return; }

    var banner = document.createElement('div');
    banner.className = 'sl-cookie-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie and Privacy Notice');
    banner.innerHTML =
      '<div class="sl-cookie-banner__inner">' +
        '<div class="sl-cookie-banner__text">' +
          '<strong>Privacy &amp; Cookie Notice:</strong> We use cookies to enhance navigation, analyze site performance, and personalize real estate intelligence in accordance with our <a href="' + pfx + 'cookies.html">Cookie Policy</a> and California privacy rights.' +
        '</div>' +
        '<div class="sl-cookie-banner__btns">' +
          '<button type="button" class="sw-btn sw-btn--primary" id="sl-cookie-accept" style="font-size:0.7rem;padding:6px 14px;">Accept All</button>' +
          '<button type="button" class="sw-btn sw-btn--ghost" id="sl-cookie-essential" style="font-size:0.7rem;padding:6px 14px;">Essential Only</button>' +
          '<a href="' + pfx + 'cookies.html#preferences" class="sw-btn sw-btn--ghost" style="font-size:0.7rem;padding:6px 14px;text-decoration:none;">Preferences</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);

    function dismiss(prefs) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      } catch (e) {}
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(20px)';
      setTimeout(function () { banner.remove(); }, 300);
    }

    var acceptBtn = document.getElementById('sl-cookie-accept');
    if (acceptBtn) acceptBtn.addEventListener('click', function () {
      dismiss({ essential: true, analytics: true, functional: true, marketing: true, timestamp: new Date().toISOString() });
    });

    var essBtn = document.getElementById('sl-cookie-essential');
    if (essBtn) essBtn.addEventListener('click', function () {
      dismiss({ essential: true, analytics: false, functional: false, marketing: false, timestamp: new Date().toISOString() });
    });
  }

  function boot() {
    var isSubdir = (typeof window !== 'undefined' && (window.location.pathname.indexOf('/areas/') !== -1 || window.location.pathname.indexOf('/articles/') !== -1));
    var pfx = isSubdir ? '../' : '';
    initHeader();
    initCookieConsent(pfx);

    // Mount AI Steve Real Estate Advisor
    if (!document.getElementById('ai-steve-script')) {
      var s = document.createElement('script');
      s.id = 'ai-steve-script';
      s.src = pfx + 'js/ai-steve.js?v=20261113';
      s.defer = true;
      document.body.appendChild(s);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
