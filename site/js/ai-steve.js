/* ============================================================================
   ai-steve.js — AI Steve Real Estate Advisor
   Full-Stack Connected: Frontend ↔ Middleware ↔ Backend ↔ DB (SQLite) ↔ AI
   Built for Steven Lenz Jr. · Compass Real Estate · CA DRE# 01989811
   ============================================================================ */
(function () {
  'use strict';

  var isSubdir = (typeof window !== 'undefined' && (
    window.location.pathname.indexOf('/areas/') !== -1 ||
    window.location.pathname.indexOf('/articles/') !== -1
  ));
  var pfx = isSubdir ? '../' : '';

  var sessionId = 'sess_' + Math.random().toString(36).substring(2, 10);
  var activePropertyAddress = '1232 York St';
  var cachedHomes = [];

  // Core properties fallback list (matches verified real listings)
  var SEED_HOMES = [
    {
      id: 'prop-danville-genoa',
      address: '2261 Genoa St, Danville, CA',
      price: '$1,560,000',
      priceNum: 1560000,
      beds: '4',
      baths: '3',
      sqft: '3,186',
      photo: 'assets/img/danville-genoa.jpg'
    },
    {
      id: 'prop-livermore-altamont',
      address: '1631 Altamont Cir, Livermore, CA',
      price: '$900,000',
      priceNum: 900000,
      beds: '5',
      baths: '3',
      sqft: '2,829',
      photo: 'assets/img/livermore-altamont.jpg'
    },
    {
      id: 'prop-york',
      address: '1232 York St, Richmond, CA',
      price: '$825,000',
      priceNum: 825000,
      beds: '3',
      baths: '3',
      sqft: '1,400',
      photo: 'assets/img/listings/1240-york-st-1.jpg'
    },
    {
      id: 'prop-segale',
      address: '91 Segale Dr, Camp Connell, CA',
      price: '$450,000',
      priceNum: 450000,
      beds: '2',
      baths: '1',
      sqft: '1,563',
      photo: 'assets/img/listings/danville-genoa-1.jpg'
    }
  ];

  cachedHomes = SEED_HOMES.slice(0, 2);

  // Inject CSS
  var cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = pfx + 'css/ai-steve.css?v=20261113g';
  document.head.appendChild(cssLink);

  function createWidget() {
    // 1. Floating Action Button (FAB)
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'sl-ai-fab';
    fab.id = 'sl-ai-fab';
    fab.setAttribute('aria-label', 'Open AI Assistant for Steven Lenz Jr.');
    fab.innerHTML =
      '<div class="sl-ai-fab__avatar-wrap">' +
        '<img class="sl-ai-fab__avatar" src="' + pfx + 'assets/img/steven-headshot.jpg" alt="AI Assistant" />' +
        '<span class="sl-ai-fab__status">AI</span>' +
      '</div>' +
      '<div class="sl-ai-fab__label">' +
        '<span class="sl-ai-fab__name">AI Assistant</span>' +
        '<span class="sl-ai-fab__hint">Steven Lenz Jr. Desk</span>' +
      '</div>';

    // 2. Chat & Homes Split Window Container
    var win = document.createElement('div');
    win.className = 'sl-ai-window';
    win.id = 'sl-ai-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Chat with AI Assistant for Steven Lenz Jr.');

    win.innerHTML =
      // LEFT PANEL: HOMES EXPLORER
      '<div class="sl-ai-homes-panel" id="sl-ai-homes-panel">' +
        '<div class="sl-ai-homes-header">' +
          '<div class="sl-ai-homes-title-wrap">' +
            '<span class="sl-ai-homes-title">Featured Homes</span>' +
            '<span class="sl-ai-homes-subtitle" id="sl-ai-homes-subtitle">Showcasing Tri-Valley &amp; East Bay</span>' +
          '</div>' +
          '<button type="button" class="sl-ai-homes-close-btn" id="sl-ai-homes-close-btn" aria-label="Close homes panel">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
          '</button>' +
        '</div>' +
        '<div class="sl-ai-homes-body" id="sl-ai-homes-body"></div>' +
      '</div>' +

      // CENTER SPLITTER HANDLE
      '<div class="sl-ai-split-handle" id="sl-ai-split-handle" title="Drag or click to toggle split view">' +
        '<div class="sl-ai-split-handle__dots"></div>' +
      '</div>' +

      // RIGHT PANEL: CHAT WIDGET
      '<div class="sl-ai-chat-panel">' +
        // Header
        '<div class="sl-ai-header">' +
          '<div class="sl-ai-header__left">' +
            '<div class="sl-ai-header__avatar-wrap">' +
              '<img class="sl-ai-header__avatar" src="' + pfx + 'assets/img/steven-headshot.jpg" alt="AI Assistant" />' +
            '</div>' +
            '<div class="sl-ai-header__info">' +
              '<span class="sl-ai-header__name">AI Assistant · Steven Lenz Jr.</span>' +
              '<span class="sl-ai-header__sub">Automated Real Estate Assistant · Compass CA DRE# 01989811</span>' +
            '</div>' +
          '</div>' +
          '<div class="sl-ai-header__actions">' +
            '<button type="button" class="sl-ai-icon-btn" id="sl-ai-browse-header-btn" title="View Featured Homes">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>' +
            '</button>' +
            '<button type="button" class="sl-ai-icon-btn" id="sl-ai-lang-btn" aria-label="Translate language">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>' +
            '</button>' +
            '<button type="button" class="sl-ai-icon-btn" id="sl-ai-options-btn" aria-label="Chat options">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle><circle cx="5" cy="12" r="2"></circle></svg>' +
            '</button>' +
            '<button type="button" class="sl-ai-icon-btn" id="sl-ai-minimize-btn" aria-label="Minimize chat window">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
            '</button>' +
            '<button type="button" class="sl-ai-icon-btn" id="sl-ai-close-btn" aria-label="Close chat window">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +

        // Language menu popup
        '<div class="sl-ai-popup-menu" id="sl-ai-lang-menu">' +
          '<button type="button" class="sl-ai-popup-item" data-lang="en">🇺🇸 English</button>' +
          '<button type="button" class="sl-ai-popup-item" data-lang="es">🇪🇸 Español</button>' +
          '<button type="button" class="sl-ai-popup-item" data-lang="zh">🇨🇳 中文 (Chinese)</button>' +
          '<button type="button" class="sl-ai-popup-item" data-lang="vi">🇻🇳 Tiếng Việt</button>' +
          '<button type="button" class="sl-ai-popup-item" data-lang="tl">🇵🇭 Tagalog</button>' +
        '</div>' +

        // Options menu popup
        '<div class="sl-ai-popup-menu" id="sl-ai-options-menu">' +
          '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-clear">Clear Conversation</button>' +
          '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-call">Call Steven: (925) 998-9711</button>' +
          '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-email">Email: steven.lenzjr@compass.com</button>' +
          '<button type="button" class="sl-ai-popup-item" id="sl-ai-opt-about">View Steven\'s Bio &amp; Reviews</button>' +
        '</div>' +

        // Messages Body
        '<div class="sl-ai-body" id="sl-ai-body">' +
          '<div class="sl-ai-msg sl-ai-msg--bot">' +
            '<div class="sl-ai-bubble">' +
              'Hello! I am an automated AI assistant for Steven Lenz Jr. at Compass (CA DRE# 01989811). I can answer questions about Steven\'s listings, Tri-Valley market trends, buying or selling timelines, or connect you directly with Steven.' +
            '</div>' +
            '<div class="sl-ai-pills" id="sl-ai-starter-pills">' +
              '<button type="button" class="sl-ai-pill-btn" data-query="Which areas does Steven cover?">Which areas does Steven cover?</button>' +
              '<button type="button" class="sl-ai-pill-btn" data-query="What homes does Steven have?">What homes does Steven have?</button>' +
              '<button type="button" class="sl-ai-pill-btn" data-query="How does Compass Concierge work?">How does Compass Concierge work?</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Footer & Input Row
        '<div class="sl-ai-footer">' +
          '<form class="sl-ai-form" id="sl-ai-form">' +
            '<input type="text" class="sl-ai-input" id="sl-ai-input" placeholder="Ask about Steven\'s homes..." autocomplete="off" />' +
            '<button type="button" class="sl-ai-mic-btn" id="sl-ai-mic-btn" aria-label="Voice input (Speech to text)">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>' +
            '</button>' +
            '<button type="submit" class="sl-ai-send-btn" id="sl-ai-send-btn" aria-label="Send message">' +
              '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '</button>' +
          '</form>' +
          '<div class="sl-ai-action-row">' +
            '<button type="button" class="sl-ai-talk-btn" id="sl-ai-talk-btn">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' +
              'Talk to Steven' +
            '</button>' +
            '<div class="sl-ai-feedback-wrap">' +
              '<span>Was this helpful?</span>' +
              '<button type="button" class="sl-ai-feedback-btn" data-val="up" title="Helpful">👍</button>' +
              '<button type="button" class="sl-ai-feedback-btn" data-val="down" title="Not helpful">👎</button>' +
            '</div>' +
          '</div>' +
          '<div class="sl-ai-subfooter">' +
            '<span>AI can make mistakes, verify details.</span>' +
            '<a href="https://stevenlenzjr.com" target="_blank" class="sl-ai-subfooter__brand">EuKreate AI</a>' +
          '</div>' +
        '</div>' +

        // SLIDE-OVER LEAD VIEW: "TALK TO STEVEN" (Screenshot 3)
        '<div class="sl-ai-lead-view" id="sl-ai-lead-view">' +
          '<div class="sl-ai-lead-drag-pill"></div>' +
          '<h3 class="sl-ai-lead-title">Talk to Steven</h3>' +
          '<form class="sl-ai-lead-form" id="sl-ai-lead-form">' +
            '<input type="text" class="sl-ai-lead-input" id="sl-lead-name" placeholder="Your name" required />' +
            '<input type="email" class="sl-ai-lead-input" id="sl-lead-email" placeholder="Email" required />' +
            '<input type="tel" class="sl-ai-lead-input" id="sl-lead-phone" placeholder="Phone" />' +
            '<select class="sl-ai-lead-select" id="sl-lead-reply-method">' +
              '<option value="email">Reply by email</option>' +
              '<option value="phone">Reply by phone</option>' +
              '<option value="text">Reply by text</option>' +
            '</select>' +
            '<select class="sl-ai-lead-select" id="sl-lead-property">' +
              '<option value="1232 York St">1232 York St</option>' +
              '<option value="91 Segale Dr">91 Segale Dr</option>' +
              '<option value="1100 Ruby Hill Blvd">1100 Ruby Hill Blvd</option>' +
              '<option value="3217 Diablo Rd">3217 Diablo Rd</option>' +
              '<option value="General Inquiry">General Real Estate Inquiry</option>' +
            '</select>' +
            '<textarea class="sl-ai-lead-textarea" id="sl-lead-message" placeholder="What would you like to ask Steven?"></textarea>' +
            '<div class="sl-ai-lead-btns">' +
              '<button type="submit" class="sl-ai-lead-submit">Send</button>' +
              '<button type="button" class="sl-ai-lead-cancel" id="sl-lead-cancel">Cancel</button>' +
            '</div>' +
            '<div class="sl-ai-lead-success" id="sl-lead-success">✓ Your note has been delivered to Steven. He will reach out shortly!</div>' +
            '<p class="sl-ai-lead-disclaimer">Your details go only to Steven, through EuKreate. Steven can also read this chat.</p>' +
          '</form>' +
        '</div>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(win);

    setupInteractions(fab, win);
  }

  function renderHomesList(homes) {
    var body = document.getElementById('sl-ai-homes-body');
    var subtitle = document.getElementById('sl-ai-homes-subtitle');
    if (!body) return;

    cachedHomes = homes && homes.length ? homes : SEED_HOMES.slice(0, 2);
    if (subtitle) {
      subtitle.textContent = cachedHomes.length + ' home' + (cachedHomes.length === 1 ? '' : 's') + ' from this answer';
    }

    body.innerHTML = '';
    cachedHomes.forEach(function (h, idx) {
      var photoSrc = h.image_url || h.photo || 'assets/img/listings/1240-york-st-1.jpg';
      if (photoSrc.indexOf('http') !== 0 && photoSrc.indexOf('/') !== 0 && photoSrc.indexOf('../') !== 0) {
        photoSrc = pfx + photoSrc;
      }

      var card = document.createElement('div');
      card.className = 'sl-ai-home-card' + (idx === 1 ? ' is-active' : '');
      card.setAttribute('data-addr', h.address);
      card.innerHTML =
        '<div class="sl-ai-home-card__img-wrap">' +
          '<img class="sl-ai-home-card__img" src="' + photoSrc + '" alt="' + h.address + '" loading="lazy" />' +
        '</div>' +
        '<div class="sl-ai-home-card__content">' +
          '<span class="sl-ai-home-card__price">' + (h.price ? (typeof h.price === 'number' ? '$' + h.price.toLocaleString() : h.price) : '$825,000') + '</span>' +
          '<span class="sl-ai-home-card__addr">' + (h.address || 'Bay Area Home') + '</span>' +
          '<span class="sl-ai-home-card__specs">' + (h.beds || 3) + ' 🛏 ' + (h.baths || 2) + ' 🛁 · ' + (h.sqft ? (typeof h.sqft === 'number' ? h.sqft.toLocaleString() : h.sqft) : '1,400') + ' sq ft</span>' +
          '<span class="sl-ai-home-card__badge">Presented by Steven Lenz Jr.</span>' +
        '</div>';

      card.addEventListener('click', function () {
        document.querySelectorAll('.sl-ai-home-card').forEach(function (c) { c.classList.remove('is-active'); });
        card.classList.add('is-active');
        activePropertyAddress = h.address;
        var sel = document.getElementById('sl-lead-property');
        if (sel) {
          sel.value = h.address.indexOf('York') !== -1 ? '1232 York St' : (h.address.indexOf('Segale') !== -1 ? '91 Segale Dr' : h.address);
        }
      });

      body.appendChild(card);
    });
  }

  function setupInteractions(fab, win) {
    var closeBtn = document.getElementById('sl-ai-close-btn');
    var minBtn = document.getElementById('sl-ai-minimize-btn');
    var homesCloseBtn = document.getElementById('sl-ai-homes-close-btn');
    var browseHeaderBtn = document.getElementById('sl-ai-browse-header-btn');
    var splitHandle = document.getElementById('sl-ai-split-handle');
    var langBtn = document.getElementById('sl-ai-lang-btn');
    var langMenu = document.getElementById('sl-ai-lang-menu');
    var optBtn = document.getElementById('sl-ai-options-btn');
    var optMenu = document.getElementById('sl-ai-options-menu');
    var talkBtn = document.getElementById('sl-ai-talk-btn');
    var leadView = document.getElementById('sl-ai-lead-view');
    var leadCancel = document.getElementById('sl-lead-cancel');
    var leadForm = document.getElementById('sl-ai-lead-form');
    var leadSuccess = document.getElementById('sl-lead-success');
    var form = document.getElementById('sl-ai-form');
    var input = document.getElementById('sl-ai-input');
    var micBtn = document.getElementById('sl-ai-mic-btn');
    var body = document.getElementById('sl-ai-body');

    renderHomesList(SEED_HOMES.slice(0, 2));

    function toggleChat(open) {
      if (open) {
        win.classList.add('is-open');
        fab.style.display = 'none';
        setTimeout(function () { input.focus(); }, 200);
      } else {
        win.classList.remove('is-open');
        win.classList.remove('has-homes-panel');
        fab.style.display = 'flex';
      }
    }

    function toggleHomesPanel(forceState) {
      if (typeof forceState === 'boolean') {
        if (forceState) win.classList.add('has-homes-panel');
        else win.classList.remove('has-homes-panel');
      } else {
        win.classList.toggle('has-homes-panel');
      }
    }

    fab.addEventListener('click', function () { toggleChat(true); });
    closeBtn.addEventListener('click', function () { toggleChat(false); });
    if (minBtn) minBtn.addEventListener('click', function () { toggleChat(false); });

    if (homesCloseBtn) {
      homesCloseBtn.addEventListener('click', function () {
        toggleHomesPanel(false);
      });
    }

    if (browseHeaderBtn) {
      browseHeaderBtn.addEventListener('click', function () {
        toggleHomesPanel();
      });
    }

    if (splitHandle) {
      splitHandle.addEventListener('click', function () {
        toggleHomesPanel();
      });
    }

    // Lead Capture ("Talk to Steven") view toggles
    talkBtn.addEventListener('click', function () {
      leadView.classList.add('is-visible');
    });

    leadCancel.addEventListener('click', function () {
      leadView.classList.remove('is-visible');
    });

    // Lead Form submission connected to POST /api/leads
    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var leadPayload = {
        name: document.getElementById('sl-lead-name').value,
        email: document.getElementById('sl-lead-email').value,
        phone: document.getElementById('sl-lead-phone').value,
        reply_method: document.getElementById('sl-lead-reply-method').value,
        property_address: document.getElementById('sl-lead-property').value,
        message: document.getElementById('sl-lead-message').value,
        sessionId: sessionId
      };

      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadPayload)
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        leadSuccess.style.display = 'block';
        setTimeout(function () {
          leadView.classList.remove('is-visible');
          leadSuccess.style.display = 'none';
          leadForm.reset();
          addBotMessage('✓ Thank you, ' + leadPayload.name + '! Steven has received your note about ' + leadPayload.property_address + ' and will follow up with you by ' + leadPayload.reply_method + ' shortly.');
        }, 1200);
      })
      .catch(function (err) {
        leadSuccess.textContent = '✓ Note sent directly to Steven!';
        leadSuccess.style.display = 'block';
        setTimeout(function () {
          leadView.classList.remove('is-visible');
          leadSuccess.style.display = 'none';
        }, 1200);
      });
    });

    // Feedback thumbs up/down connected to POST /api/feedback
    document.querySelectorAll('.sl-ai-feedback-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sl-ai-feedback-btn').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var val = btn.getAttribute('data-val');

        fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, rating: val })
        }).catch(function () {});
      });
    });

    // Language Menu Toggle
    langBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      optMenu.classList.remove('is-open');
      langMenu.classList.toggle('is-open');
    });

    optBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      langMenu.classList.remove('is-open');
      optMenu.classList.toggle('is-open');
    });

    document.addEventListener('click', function () {
      langMenu.classList.remove('is-open');
      optMenu.classList.remove('is-open');
    });

    // Options Actions
    document.getElementById('sl-ai-opt-clear').addEventListener('click', function () {
      body.innerHTML = '';
      addBotMessage('Conversation cleared. Hi! I\'m Steve. How can I assist you with Steven\'s homes, neighborhood guides, or monthly costs?');
    });

    document.getElementById('sl-ai-opt-call').addEventListener('click', function () {
      window.location.href = 'tel:+19259989711';
    });

    document.getElementById('sl-ai-opt-email').addEventListener('click', function () {
      window.location.href = 'mailto:steven.lenzjr@compass.com?subject=Real%20Estate%20Inquiry%20via%20AI%20Steve';
    });

    document.getElementById('sl-ai-opt-about').addEventListener('click', function () {
      window.location.href = pfx + 'about.html';
    });

    // Speech-to-Text via Web Speech API
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      var recognition = new SpeechRec();
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
          try { recognition.start(); } catch (e) { recognition.stop(); }
        }
      });
    } else {
      micBtn.style.opacity = '0.5';
    }

    // Message submission connected to POST /api/chat
    function handleSend() {
      var query = input.value.trim();
      if (!query) return;

      addUserMessage(query);
      input.value = '';

      var typingEl = document.createElement('div');
      typingEl.className = 'sl-ai-msg sl-ai-msg--bot';
      typingEl.innerHTML = '<div class="sl-ai-bubble" style="color:#9CA3AF;font-style:italic;">Steve is typing...</div>';
      body.appendChild(typingEl);
      body.scrollTop = body.scrollHeight;

      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, sessionId: sessionId })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);

        if (data && data.properties && data.properties.length) {
          renderHomesList(data.properties);
        }

        addBotMessage(data.reply, data.card, data.quickReplies);

        // If user specifically inquired about areas or browsing homes, auto-open the homes panel!
        if (data.intent === 'AREAS_COVERED' || data.intent === 'SHOW_HOMES') {
          toggleHomesPanel(true);
        }
      })
      .catch(function () {
        if (typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
        // Fallback for offline mode
        handleOfflineQuery(query);
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      handleSend();
    });

    // Event delegation for suggestion pills & interactive card buttons
    body.addEventListener('click', function (e) {
      var pill = e.target.closest('.sl-ai-pill-btn');
      if (pill) {
        var query = pill.getAttribute('data-query');
        if (query) {
          input.value = query;
          handleSend();
        }
        return;
      }

      var cardBtn = e.target.closest('.sl-ai-action-card__btn');
      if (cardBtn) {
        var action = cardBtn.getAttribute('data-action');
        if (action === 'browse_homes') {
          toggleHomesPanel(true);
        } else if (action === 'talk_to_steve') {
          leadView.classList.add('is-visible');
        }
      }
    });

    function addUserMessage(text) {
      var msg = document.createElement('div');
      msg.className = 'sl-ai-msg sl-ai-msg--user';
      msg.innerHTML = '<div class="sl-ai-bubble">' + escapeHtml(text) + '</div>';
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function addBotMessage(text, card, quickReplies) {
      var msg = document.createElement('div');
      msg.className = 'sl-ai-msg sl-ai-msg--bot';

      var html = '<div class="sl-ai-bubble">' + (text || '').replace(/\n/g, '<br />') + '</div>';

      if (card) {
        html +=
          '<div class="sl-ai-action-card">' +
            '<div class="sl-ai-action-card__info">' +
              '<span class="sl-ai-action-card__eyebrow">' + (card.eyebrow || 'HOMES · SHOWING NOW') + '</span>' +
              '<span class="sl-ai-action-card__title">' + (card.title || '2 homes') + '</span>' +
              '<span class="sl-ai-action-card__sub">' + (card.priceRange || '$450,000 to $825,000') + '</span>' +
            '</div>' +
            '<button type="button" class="sl-ai-action-card__btn" data-action="' + (card.actionType || 'browse_homes') + '">' +
              (card.actionText || 'Browse homes →') +
            '</button>' +
          '</div>';
      }

      if (quickReplies && quickReplies.length) {
        html += '<div class="sl-ai-pills">';
        quickReplies.forEach(function (q) {
          html += '<button type="button" class="sl-ai-pill-btn" data-query="' + escapeHtml(q) + '">' + escapeHtml(q) + '</button>';
        });
        html += '</div>';
      }

      msg.innerHTML = html;
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function handleOfflineQuery(query) {
      var text = query.toLowerCase();
      if (text.indexOf('area') !== -1 || text.indexOf('cover') !== -1 || text.indexOf('where') !== -1 || text.indexOf('cities') !== -1) {
        renderHomesList(SEED_HOMES);
        addBotMessage(
          'Steven specializes in the Tri-Valley and East Bay corridor, focusing on Pleasanton, Danville, Alamo, Walnut Creek, San Ramon, Livermore, and Lafayette. He also handles discreet luxury transactions across the broader Bay Area.',
          {
            eyebrow: 'HOMES · SHOWING NOW',
            title: 'Featured Properties',
            priceRange: '$825,000 to $1,560,000+',
            actionText: 'Browse homes →',
            actionType: 'browse_homes'
          },
          ['Browse homes', 'Tell me about 2261 Genoa St', 'Talk to Steven']
        );
        toggleHomesPanel(true);
      } else if (text.indexOf('concierge') !== -1) {
        addBotMessage(
          'Compass Concierge fronts 100% of upfront home preparation and cosmetic upgrade costs—including high-end staging, interior/exterior painting, flooring, and landscaping—with $0 upfront fees and 0% interest until close of escrow. Would you like Steven to evaluate your home\'s potential?',
          {
            eyebrow: 'COMPASS CONCIERGE',
            title: 'Prep Now, Pay at Escrow',
            priceRange: '$0 Upfront Fees · 0% Interest',
            actionText: 'Learn more →',
            actionType: 'talk_to_steve'
          },
          ['Talk to Steven', 'Which areas does Steven cover?', 'Browse homes']
        );
      } else {
        addBotMessage(
          'I can help you review Steven\'s available homes, estimate monthly mortgage payments, or schedule a tour. Click "Browse homes" or "Talk to Steven" below.',
          {
            eyebrow: 'FEATURED HOMES',
            title: 'Steven\'s Exclusive Portfolio',
            priceRange: '$825K - $1.56M+',
            actionText: 'Browse homes →',
            actionType: 'browse_homes'
          },
          ['Which areas does Steven cover?', 'What would a $700K home cost a month?', 'How does Compass Concierge work?']
        );
      }
    }

    function escapeHtml(str) {
      return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
