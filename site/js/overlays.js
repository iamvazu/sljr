/**
 * overlays.js — Hydrates real listings & verbatim testimonials, service modals,
 * testimonial carousel, deep-link CTAs, and lead-form submission.
 */
(function () {
  'use strict';

  var SERVICE_COPY = {
    concierge: {
      title: 'Compass Concierge',
      body: 'Get fronted for the cost of home improvement services with no interest — ever. Compass Concierge is the hassle-free way to sell your home faster and for a higher price with Smart, Fast, Transparent, and Easy prep including staging, flooring, painting, and landscaping.',
      note: 'Program terms and eligibility apply; ask Steven for current Compass Concierge details.',
      ctaLabel: 'Ask about Concierge prep',
      interest: 'selling'
    },
    exclusives: {
      title: 'Compass Private Exclusives',
      body: 'List or tour discreetly before a property reaches public portals. Ideal for sellers who value privacy and buyers seeking early access to Tri-Valley and East Bay inventory.',
      note: 'Program terms and eligibility apply; ask for details.',
      ctaLabel: 'Request private access',
      interest: 'buying'
    },
    valuation: {
      title: 'Custom Home Valuation',
      body: 'Receive a tailored broker price opinion grounded in micro-neighborhood comps, absorption rates, and condition adjustments—never an automated estimate.',
      note: 'A broker price opinion prepared for discussion purposes; not an appraisal.',
      ctaLabel: 'Request a home valuation',
      interest: 'selling'
    }
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderListings(items) {
    var grid = document.getElementById('listings-grid');
    if (!grid || !Array.isArray(items)) return;

    grid.innerHTML = items.map(function (item) {
      var statusText = (item.status && item.status.toLowerCase().includes('sold')) ? 'SOLD' : 'ACTIVE';
      var formattedPrice = item.price || '$1,560,000';
      var addressLine = (item.address ? (item.address + (item.city ? ', ' + item.city.toUpperCase() : '') + ', CALIFORNIA') : '').toUpperCase();
      var specsLine = [
        item.beds ? item.beds + ' BEDS' : '',
        item.baths ? item.baths + ' BATHS' : '',
        item.sqft ? item.sqft.toLocaleString() + ' SQ.FT' : ''
      ].filter(Boolean).join(' · ');

      return (
        '<article class="listing-card">' +
          '<a class="listing-card__hit" href="listing.html?id=' + encodeURIComponent(item.id) + '">' +
            '<div class="listing-photo-wrap">' +
              '<img src="' + esc(item.photo) + '" alt="' + esc(item.address) + '" loading="lazy" />' +
              '<span class="listing-badge ' + (statusText === 'SOLD' ? 'badge--sold' : 'badge--active') + '">' + esc(statusText) + '</span>' +
            '</div>' +
            '<div class="listing-body">' +
              '<div class="listing-price">' + esc(formattedPrice) + '</div>' +
              '<h3 class="listing-address">' + esc(addressLine) + '</h3>' +
              '<div class="listing-specs">' + esc(specsLine) + '</div>' +
            '</div>' +
          '</a>' +
        '</article>'
      );
    }).join('');

    var prevBtn = document.getElementById('listings-prev');
    var nextBtn = document.getElementById('listings-next');
    if (prevBtn) {
      prevBtn.onclick = function () {
        grid.scrollBy({ left: -320, behavior: 'smooth' });
      };
    }
    if (nextBtn) {
      nextBtn.onclick = function () {
        grid.scrollBy({ left: 320, behavior: 'smooth' });
      };
    }

    var trackFill = document.getElementById('listings-track-fill');
    if (trackFill) {
      grid.addEventListener('scroll', function () {
        var maxScroll = grid.scrollWidth - grid.clientWidth;
        var ratio = maxScroll > 0 ? (grid.scrollLeft / maxScroll) : 0;
        trackFill.style.transform = 'translateX(' + (ratio * 200).toFixed(1) + '%)';
      }, { passive: true });
    }
  }

  function initTestimonials(items) {
    var tqTrack = document.getElementById('tq-track');
    var tqPrev = document.getElementById('tq-prev');
    var tqNext = document.getElementById('tq-next');

    if (tqTrack && Array.isArray(items) && items.length) {
      tqTrack.innerHTML = items.map(function (t) {
        return (
          '<div class="tq-card">' +
            '<div class="tq-stars" aria-label="5 out of 5 stars">★★★★★</div>' +
            '<p class="tq-quote">“' + esc(t.quote) + '”</p>' +
            '<div class="tq-person">' +
              '<span class="tq-name">' + esc(t.name) + '</span>' +
              '<span class="tq-context">' + esc(t.context) + '</span>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    if (tqTrack && tqPrev) {
      tqPrev.onclick = function () {
        tqTrack.scrollBy({ left: -340, behavior: 'smooth' });
      };
    }
    if (tqTrack && tqNext) {
      tqNext.onclick = function () {
        tqTrack.scrollBy({ left: 340, behavior: 'smooth' });
      };
    }
  }

  function initServiceModals() {
    var dialog = document.getElementById('service-modal');
    if (!dialog) return;
    var titleEl = document.getElementById('modal-title');
    var bodyEl = document.getElementById('modal-body');
    var noteEl = document.getElementById('modal-note');
    var ctaEl = document.getElementById('modal-cta');
    var closeBtn = document.getElementById('modal-close');

    document.querySelectorAll('[data-service]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-service');
        var data = SERVICE_COPY[key];
        if (!data) return;
        titleEl.textContent = data.title;
        bodyEl.textContent = data.body;
        noteEl.textContent = data.note;
        ctaEl.textContent = data.ctaLabel;
        ctaEl.dataset.interest = data.interest || 'selling';
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        }
      });
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        dialog.close();
      });
    }

    if (ctaEl) {
      ctaEl.addEventListener('click', function () {
        var interest = ctaEl.dataset.interest || 'selling';
        dialog.close();
        jumpToConnect({ interest: interest });
      });
    }
  }

  function jumpToConnect(opts) {
    var select = document.getElementById('lead-interest');
    var discreet = document.getElementById('lead-discreet');
    if (opts && opts.interest && select) {
      select.value = opts.interest;
    }
    if (opts && opts.segment === 'sports_entertainment' && discreet) {
      discreet.checked = true;
    }
    if (window.__scrollWorld) {
      window.__scrollWorld.scrollToSection('terrace');
    } else {
      var target = document.getElementById('terrace');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
    setTimeout(function () {
      var nameInput = document.getElementById('lead-name');
      if (nameInput) nameInput.focus();
    }, 550);
  }

  function initConnectAnchors() {
    document.querySelectorAll('[data-connect]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        jumpToConnect({
          interest: el.getAttribute('data-interest') || '',
          segment: el.getAttribute('data-segment') || ''
        });
      });
    });
  }

  function initLeadForm() {
    var form = document.getElementById('lead-form');
    if (!form) return;
    var phoneInput = document.getElementById('lead-phone');
    var statusEl = document.getElementById('form-status');
    var submitBtn = document.getElementById('lead-submit');

    if (phoneInput) {
      phoneInput.required = true;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (phoneInput) {
        var digits = (phoneInput.value || '').replace(/\D/g, '');
        if (digits.length < 10) {
          phoneInput.setCustomValidity('Please enter a valid 10-digit phone number.');
          phoneInput.reportValidity();
          return;
        } else {
          phoneInput.setCustomValidity('');
        }
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var areas = [];
      form.querySelectorAll('input[name="areas"]:checked').forEach(function (cb) {
        areas.push(cb.value);
      });

      var payload = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        interest: form.interest.value,
        budget: form.budget.value,
        timeline: form.timeline.value,
        areas: areas,
        segment: form.discreet.checked ? 'sports_entertainment' : 'standard',
        message: form.message.value.trim(),
        email_consent: form.email_consent.checked,
        sms_consent: form.sms_consent.checked,
        consent_text_version: '2026-11-v1',
        consent_timestamp: new Date().toISOString(),
        source_page: window.location.pathname + window.location.hash,
        scene: 'terrace',
        company_website: form.company_website ? form.company_website.value : ''
      };

      var done = window.SLForms.busy(form);
      submitBtn.textContent = 'Sending…';
      statusEl.hidden = true;

      window.SLForms.post('/api/lead', payload)
        .then(function () { showConfirmation(payload.name); })
        .catch(function (err) {
          // Keep the form and everything the visitor typed; say what happened.
          window.SLForms.show(statusEl, err.message, true);
          statusEl.scrollIntoView({ block: 'nearest' });
        })
        .then(done);
    });

    function showConfirmation(name) {
      statusEl.classList.remove('is-error');
      statusEl.setAttribute('role', 'status');
      var first = (name || 'there').split(/\s+/)[0];
      form.style.display = 'none';
      statusEl.hidden = false;
      statusEl.innerHTML =
        '<h3 tabindex="-1" id="confirm-heading" style="margin:0 0 8px;font-family:var(--sw-font-display);font-weight:400;">Thank you, ' +
        first.replace(/[<>&]/g, '') +
        '.</h3>' +
        '<p style="margin:0;">Steven received your note and will reply personally shortly. For urgent matters, call or text <strong>(925) 998-9711</strong>.</p>';
      var heading = document.getElementById('confirm-heading');
      if (heading) heading.focus();
    }
  }

  function initHeroSearch() {
    var form = document.getElementById('hero-search-form');
    var input = document.getElementById('hero-search-input');
    var resultsBox = document.getElementById('hero-search-results');
    if (!form || !input || !resultsBox) return;

    var timer = null;
    function renderResults(items, q) {
      if (!q) {
        resultsBox.hidden = true;
        resultsBox.innerHTML = '';
        return;
      }
      if (!items.length) {
        resultsBox.innerHTML = '<div style="padding:12px 14px;font-size:0.84rem;color:var(--sw-ink-soft);">No curated listings match &ldquo;' + esc(q) + '&rdquo;. <a href="buy.html?q=' + encodeURIComponent(q) + '" style="color:var(--sw-accent);">Search all East Bay homes →</a></div>';
        resultsBox.hidden = false;
        return;
      }
      resultsBox.innerHTML = items.slice(0, 5).map(function (item) {
        return '<a class="hero-search-result-item" href="listing.html?id=' + encodeURIComponent(item.id) + '">' +
          '<img src="' + esc(item.photo) + '" alt="' + esc(item.address) + '" />' +
          '<div class="hero-search-result-meta">' +
            '<strong>' + esc(item.address) + ' · ' + esc(item.price) + '</strong>' +
            '<span>' + esc(item.city) + ', ' + esc(item.state) + ' · ' + esc(item.status) + ' · ' + esc(item.beds) + ' Bd / ' + esc(item.baths) + ' Ba</span>' +
          '</div>' +
        '</a>';
      }).join('');
      resultsBox.hidden = false;
    }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (!q) {
        resultsBox.hidden = true;
        return;
      }
      timer = setTimeout(function () {
        fetch('/api/listings/search?q=' + encodeURIComponent(q))
          .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
          .then(function (data) { renderResults(data.listings || [], q); })
          .catch(function () {
            fetch('content/listings.json')
              .then(function (r) { return r.json(); })
              .then(function (all) {
                var low = q.toLowerCase();
                var filtered = all.filter(function (i) {
                  return (i.city + ' ' + i.full_address + ' ' + i.county + ' ' + i.zip).toLowerCase().indexOf(low) !== -1;
                });
                renderResults(filtered, q);
              })
              .catch(function () {});
          });
      }, 180);
    });

    document.addEventListener('click', function (e) {
      if (!form.contains(e.target) && !resultsBox.contains(e.target)) {
        resultsBox.hidden = true;
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      window.location.href = 'buy.html' + (q ? '?q=' + encodeURIComponent(q) : '');
    });
  }

  Promise.all([
    fetch('/api/listings').then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (d) { return d.listings || []; }).catch(function () {
      return fetch('content/listings.json').then(function (r) { return r.json(); }).catch(function () { return []; });
    }),
    fetch('content/testimonials.json').then(function (r) { return r.json(); }).catch(function () { return []; })
  ]).then(function (results) {
    renderListings(results[0]);
    initTestimonials(results[1]);
  });

  function initDrawer() {
    var openBtn = document.getElementById('menu-open-btn');
    var closeBtn = document.getElementById('menu-close-btn');
    var drawer = document.getElementById('site-drawer');
    var backdrop = document.getElementById('drawer-backdrop');
    if (!openBtn || !drawer || !backdrop) return;

    function open() {
      drawer.classList.add('is-open');
      backdrop.classList.add('is-open');
      openBtn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      drawer.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      openBtn.setAttribute('aria-expanded', 'false');
    }

    openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    drawer.querySelectorAll('[data-jump]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var id = el.getAttribute('data-jump');
        close();
        if (window.__scrollWorld) window.__scrollWorld.scrollToSection(id);
      });
    });
    drawer.querySelectorAll('[data-close-drawer]').forEach(function (el) {
      el.addEventListener('click', close);
    });
  }

  initHeroSearch();
  initServiceModals();
  initConnectAnchors();
  initLeadForm();
  initDrawer();
})();

