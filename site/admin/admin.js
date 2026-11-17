/* Back Office — single-page admin for leads, listings, reviews, and activity.
   Talks only to /api/admin/*. No data is stored in the browser. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');
  var state = {
    view: 'today',
    pipeline: { active_id: 1 },
    tasks: { filter: 'open', offset: 0 },
    contacts: { stage: '', type: '', score_band: '', q: '', offset: 0 },
    leads: { status: '', type: '', q: '', offset: 0 },
    chatLogs: { q: '', offset: 0 },
    statuses: [],
    pipelines: []
  };
  var LIMIT = 50;

  function getPipelines(forceRefresh) {
    if (!forceRefresh && state.pipelines && state.pipelines.length) return Promise.resolve(state.pipelines);
    return api('/pipelines').then(function (d) {
      state.pipelines = d.pipelines || [];
      return state.pipelines;
    }).catch(function () { return []; });
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 19 ? iso.replace(' ', 'T') + 'Z' : iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function toast(text, isError) {
    var t = $('toast');
    t.textContent = text; t.hidden = false; t.classList.toggle('is-error', Boolean(isError));
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, isError ? 6000 : 2600);
  }

  function api(path, method, body) {
    if (typeof method === 'object' && method !== null) {
      body = method.body !== undefined ? (typeof method.body === 'string' ? (function () { try { return JSON.parse(method.body); } catch (_) { return method.body; } })() : method.body) : undefined;
      method = method.method || 'GET';
    }
    var opts = { method: method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (opts.method !== 'GET') { opts.headers['X-SL-Admin'] = '1'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
    return fetch('/api/admin' + path, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (res.status === 401 && path !== '/login') { showLogin(); throw new Error('Please sign in again.'); }
        if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || 'The server did not respond. Is it running with "npm start"?');
        return data;
      });
    }, function () { throw new Error('Could not reach the server. Is it running with "npm start"?'); });
  }
  function fail(err) { toast(err.message, true); }

  /* ---------- Session ---------- */
  function showLogin(message) {
    $('app').hidden = true; $('login').hidden = false; closeDrawer();
    var msg = $('login-msg'); msg.hidden = !message; msg.textContent = message || '';
    $('pw').focus();
  }
  function showApp(me) {
    $('login').hidden = true; $('app').hidden = false;
    var on = me.channels || {};
    var active = Object.keys(on).filter(function (k) { return on[k]; });
    var banner = $('banner');
    banner.hidden = active.length > 0;
    banner.textContent = active.length ? '' : 'No notification channel is set up, so new leads only appear here — nobody is emailed. Fill in the email or webhook settings in the .env file and restart the site.';
    var initialView = (window.location.hash || '').replace('#', '') || state.view;
    go(initialView);
  }
  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = e.target.querySelector('button'); btn.disabled = true;
    api('/login', 'POST', { password: $('pw').value })
      .then(function () { $('pw').value = ''; return api('/me'); })
      .then(showApp)
      .catch(function (err) { showLogin(err.message); })
      .then(function () { btn.disabled = false; });
  });
  $('logout').addEventListener('click', function () { api('/logout', 'POST').catch(function () {}).then(function () { showLogin(); }); });

  /* ---------- Navigation ---------- */
  var topHeader = document.querySelector('.top');
  if (topHeader) {
    topHeader.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (b) {
        go(b.getAttribute('data-view'));
        closeMoreMenu();
      }
    });
  }

  // More Dropdown toggle
  var btnTabsMore = $('btn-tabs-more');
  var tabsMoreMenu = $('tabs-more-menu');
  function toggleMoreMenu() {
    if (!tabsMoreMenu) return;
    var isHidden = tabsMoreMenu.hidden;
    tabsMoreMenu.hidden = !isHidden;
    if (btnTabsMore) btnTabsMore.setAttribute('aria-expanded', String(isHidden));
  }
  function closeMoreMenu() {
    if (tabsMoreMenu) {
      tabsMoreMenu.hidden = true;
      if (btnTabsMore) btnTabsMore.setAttribute('aria-expanded', 'false');
    }
  }
  if (btnTabsMore) {
    btnTabsMore.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMoreMenu();
    });
  }
  document.addEventListener('click', function (e) {
    if (tabsMoreMenu && !tabsMoreMenu.hidden && !e.target.closest('#tabs-more')) {
      closeMoreMenu();
    }
  });

  // Tab Scroll Buttons
  var tabsContainer = $('tabs');
  var scrollLeftBtn = $('tabs-scroll-left');
  var scrollRightBtn = $('tabs-scroll-right');
  if (scrollLeftBtn && tabsContainer) {
    scrollLeftBtn.addEventListener('click', function () {
      tabsContainer.scrollBy({ left: -180, behavior: 'smooth' });
    });
  }
  if (scrollRightBtn && tabsContainer) {
    scrollRightBtn.addEventListener('click', function () {
      tabsContainer.scrollBy({ left: 180, behavior: 'smooth' });
    });
  }

  function go(name) {
    state.view = name;
    if (window.location.hash !== '#' + name) {
      window.location.hash = name;
    }
    // Update all matching data-view buttons (tabs, settings in top__right, more dropdown items)
    document.querySelectorAll('[data-view]').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-view') === name);
    });
    document.querySelectorAll('#bottom-nav button').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-nav') === name);
    });

    // Check if the view is inside "More" dropdown
    var moreViews = {
      dashboard: 'Dashboard',
      listings: 'Listings',
      reviews: 'Reviews',
      subscribers: 'Subscribers',
      activity: 'Activity'
    };
    var moreLabel = $('tabs-more-label');
    var btnMore = $('btn-tabs-more');
    if (moreViews[name]) {
      if (btnMore) btnMore.classList.add('is-on');
      if (moreLabel) moreLabel.textContent = 'More: ' + moreViews[name];
    } else {
      if (btnMore) btnMore.classList.remove('is-on');
      if (moreLabel) moreLabel.textContent = 'More';
    }

    view.innerHTML = '<p class="muted">Loading…</p>';
    var routes = {
      copilot: copilotView,
      today: today,
      pipeline: pipeline,
      pipelines: pipeline,
      contacts: contacts,
      tasks: tasks,
      leads: leads,
      'chat-logs': chatLogs,
      chatLogs: chatLogs,
      dashboard: dashboard,
      listings: listings,
      reviews: reviews,
      subscribers: subscribers,
      activity: activity,
      settings: settings
    };
    if (routes[name]) routes[name]();
    else today();
  }

  /* ---------- Drawer ---------- */
  function openDrawer(html) { $('drawer-body').innerHTML = html; $('drawer').hidden = false; $('drawer').querySelector('.drawer__close').focus(); }
  function closeDrawer() { $('drawer').hidden = true; $('drawer-body').innerHTML = ''; }
  $('drawer').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });

  /* ---------- Co-Pilot Executive AI Assistant & Voice Mode ---------- */
  var copilotState = {
    history: [],
    voiceFeedback: true,
    handsFree: false,
    mediaRecorder: null,
    audioChunks: [],
    isRecording: false
  };

  function formatMarkdown(str) {
    if (!str) return '';
    var safe = esc(str);
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*(.+?)\*/g, '<em>$1</em>');
    safe = safe.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
    safe = safe.replace(/(<li>.*<\/li>)/s, '<ul style="margin:8px 0; padding-left:20px;">$1</ul>');
    safe = safe.replace(/\n\n/g, '<br><br>');
    return safe;
  }

  function speakResponse(text) {
    if (!copilotState.voiceFeedback || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var cleanText = text.replace(/[*_#`]/g, '').trim();
      var utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      var voices = window.speechSynthesis.getVoices();
      var preferred = voices.find(function (v) {
        return (v.lang === 'en-US' || v.lang.startsWith('en')) &&
          (v.name.includes('Natural') || v.name.includes('Siri') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel'));
      });
      if (preferred) utterance.voice = preferred;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }
  window.sljrSpeak = function (text) {
    speakResponse(text);
  };

  function updateRecordingUI(recording) {
    var orb = $('copilot-voice-orb');
    if (orb) orb.classList.toggle('is-recording', recording);

    var stage = $('copilot-stage');
    if (stage) stage.classList.toggle('is-recording', recording);

    var recBtn = $('btn-copilot-record');
    if (recBtn) {
      recBtn.classList.toggle('is-recording', recording);
      var lbl = $('copilot-record-label');
      if (lbl) lbl.textContent = recording ? 'Listening… Tap to Send' : 'Tap to Talk to Co-Pilot';
    }

    var hint = $('copilot-record-hint');
    if (hint) {
      hint.textContent = recording
        ? 'Recording voice memo… Tap button or wait to send to Groq Whisper.'
        : 'Tap to speak naturally, or tap again to send. Works hands-free with AirPods.';
    }
  }

  function toggleRecording(callback) {
    if (copilotState.isRecording) {
      stopRecording();
    } else {
      startRecording(callback);
    }
  }

  function startRecording(callback) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('Microphone access is not supported on this browser.', true);
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      copilotState.audioChunks = [];
      var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      var options = mimeType ? { mimeType: mimeType } : undefined;
      var recorder = new MediaRecorder(stream, options);
      copilotState.mediaRecorder = recorder;
      copilotState.isRecording = true;

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) copilotState.audioChunks.push(e.data);
      };

      recorder.onstop = function () {
        stream.getTracks().forEach(function (track) { track.stop(); });
        var blob = new Blob(copilotState.audioChunks, { type: mimeType || 'audio/webm' });
        uploadAudioCommand(blob, mimeType || 'audio/webm', callback);
      };

      recorder.start();
      updateRecordingUI(true);
      if (navigator.vibrate) navigator.vibrate(50);
    }).catch(function (err) {
      toast('Microphone permission denied: ' + err.message, true);
    });
  }

  function stopRecording() {
    if (copilotState.mediaRecorder && copilotState.isRecording) {
      copilotState.mediaRecorder.stop();
      copilotState.isRecording = false;
      updateRecordingUI(false);
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    }
  }

  function uploadAudioCommand(blob, mimeType, callback) {
    toast('Transcribing voice memo with Groq Whisper…');
    var reader = new FileReader();
    reader.onloadend = function () {
      var base64Data = (reader.result || '').split(',')[1];
      api('/copilot/voice', 'POST', {
        audio_base64: base64Data,
        mime_type: mimeType,
        history: copilotState.history.slice(-4)
      }).then(function (res) {
        handleCopilotResult(res, res.transcript || 'Voice Memo');
        if (callback) callback(res);
      }).catch(function (err) {
        toast('Voice processing failed: ' + err.message, true);
      });
    };
    reader.readAsDataURL(blob);
  }

  function executeTextCommand(promptText) {
    copilotState.history.push({
      role: 'user',
      text: promptText,
      timestamp: new Date().toISOString()
    });
    var thread = $('copilot-thread');
    if (thread) thread.innerHTML = renderCopilotHistory();

    toast('Co-Pilot thinking…');
    api('/copilot/chat', 'POST', {
      message: promptText,
      history: copilotState.history.slice(-4)
    }).then(function (res) {
      handleCopilotResult(res, promptText);
    }).catch(function (err) {
      toast('Command failed: ' + err.message, true);
    });
  }

  function handleCopilotResult(res, promptText) {
    copilotState.history.push({
      role: 'assistant',
      spoken_reply: res.spoken_reply || '',
      detailed_markdown: res.detailed_markdown || res.spoken_reply || '',
      actionResult: res.actionResult,
      timestamp: new Date().toISOString()
    });

    var thread = $('copilot-thread');
    if (thread) thread.innerHTML = renderCopilotHistory();

    if (res.spoken_reply && copilotState.voiceFeedback) {
      speakResponse(res.spoken_reply);
    }

    if (res.actionResult && res.actionResult.message) {
      toast(res.actionResult.message);
    }
  }

  function renderCopilotHistory() {
    if (!copilotState.history.length) {
      return '<div class="card muted text-center" style="padding: 30px;">' +
        '<p style="margin: 0; font-size: 0.95rem;">No commands in this session yet. Tap the microphone above or pick a prompt to begin.</p>' +
      '</div>';
    }
    return copilotState.history.map(function (item) {
      var isUser = item.role === 'user';
      if (isUser) {
        return '<div class="copilot-bubble copilot-bubble--user">' +
          '<div class="copilot-bubble__meta"><span>Steven Lenz Jr.</span><span>' + when(item.timestamp) + '</span></div>' +
          '<div>' + esc(item.text) + '</div>' +
        '</div>';
      } else {
        var actionCardHtml = '';
        if (item.actionResult) {
          var isDraft = item.actionResult.type === 'DRAFT_EMAIL_SUCCESS';
          var isTask = item.actionResult.type === 'CREATE_TASK_SUCCESS';
          var isNote = item.actionResult.type === 'LOG_NOTE_SUCCESS';
          actionCardHtml =
            '<div class="copilot-action-card ' + (isDraft ? 'action-draft' : '') + '">' +
              '<div>' +
                '<span class="copilot-action-card__badge ' + (isDraft ? 'copilot-action-card__badge--draft' : 'copilot-action-card__badge--success') + '">' +
                  (isDraft ? 'Outbox Draft Ready' : (isTask ? 'Task Created' : (isNote ? 'Note Logged' : 'CRM Updated'))) +
                '</span>' +
                '<p style="margin: 6px 0 0; font-size: 0.84rem; color: #FFF;">' + esc(item.actionResult.message || 'Action executed.') + '</p>' +
              '</div>' +
              (isDraft ? '<button class="btn btn--primary btn--sm" onclick="location.hash=\'today\'; go(\'today\');">Review in Outbox →</button>' : '') +
              (isTask ? '<button class="btn btn--quiet btn--sm" onclick="location.hash=\'tasks\'; go(\'tasks\');">View Tasks →</button>' : '') +
            '</div>';
        }
        return '<div class="copilot-bubble copilot-bubble--ai">' +
          '<div class="copilot-bubble__meta">' +
            '<span>⚡ Steven\'s Co-Pilot</span>' +
            '<div style="display:flex; gap:8px;">' +
              (item.spoken_reply ? '<button class="btn btn--quiet btn--sm" style="padding:2px 8px; font-size:0.75rem;" onclick="window.sljrSpeak(\'' + esc(item.spoken_reply).replace(/'/g, "\\'") + '\')">🔊 Listen</button>' : '') +
              '<span>' + when(item.timestamp) + '</span>' +
            '</div>' +
          '</div>' +
          (item.spoken_reply ? '<div class="copilot-bubble__spoken">"' + esc(item.spoken_reply) + '"</div>' : '') +
          '<div class="copilot-bubble__details">' + formatMarkdown(item.detailed_markdown || '') + '</div>' +
          actionCardHtml +
        '</div>';
      }
    }).reverse().join('');
  }

  function attachCopilotEvents() {
    var recBtn = $('btn-copilot-record');
    if (recBtn) {
      recBtn.addEventListener('click', function () {
        toggleRecording();
      });
    }

    var textForm = $('copilot-text-form');
    if (textForm) {
      textForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var inp = $('copilot-text-input');
        var val = (inp.value || '').trim();
        if (!val) return;
        inp.value = '';
        executeTextCommand(val);
      });
    }

    var chips = $('copilot-chips');
    if (chips) {
      chips.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-prompt]');
        if (!btn) return;
        executeTextCommand(btn.getAttribute('data-prompt'));
      });
    }

    var toggleVoice = $('toggle-voice-reply');
    if (toggleVoice) {
      toggleVoice.addEventListener('click', function () {
        copilotState.voiceFeedback = !copilotState.voiceFeedback;
        toggleVoice.classList.toggle('is-active', copilotState.voiceFeedback);
        toggleVoice.querySelector('strong').textContent = copilotState.voiceFeedback ? 'ON' : 'OFF';
      });
    }

    var toggleHandsFree = $('toggle-hands-free');
    if (toggleHandsFree) {
      toggleHandsFree.addEventListener('click', function () {
        copilotState.handsFree = !copilotState.handsFree;
        toggleHandsFree.classList.toggle('is-active', copilotState.handsFree);
        toggleHandsFree.querySelector('strong').textContent = copilotState.handsFree ? 'ON' : 'OFF';
        if (copilotState.handsFree) {
          toast('Driving mode ON: Audio responses will speak automatically through your car/AirPods.');
        }
      });
    }
  }

  function copilotView() {
    view.innerHTML =
      '<div class="copilot-console">' +
        '<div class="copilot-hero">' +
          '<div class="copilot-hero__header">' +
            '<div>' +
              '<h1 class="copilot-hero__title">⚡ Steven\'s Co-Pilot</h1>' +
              '<p class="muted small" style="margin: 4px 0 0;">Executive AI Chief of Staff & Voice Operating System</p>' +
            '</div>' +
            '<div style="display: flex; gap: 8px; align-items: center;">' +
              '<span class="copilot-hero__status">Online · Groq Llama/Qwen + Whisper</span>' +
            '</div>' +
          '</div>' +
          '<div class="copilot-voice-stage" id="copilot-stage">' +
            '<div class="copilot-wave" id="copilot-wave">' +
              '<div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>' +
              '<div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div><div class="wave-bar"></div>' +
            '</div>' +
            '<button id="btn-copilot-record" class="copilot-record-btn">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>' +
              '<span id="copilot-record-label">Tap to Talk to Co-Pilot</span>' +
            '</button>' +
            '<p class="small muted" id="copilot-record-hint" style="margin: 12px 0 0;">Tap to speak naturally, or tap again to send. Works hands-free with AirPods.</p>' +
          '</div>' +
          '<div class="copilot-toggles">' +
            '<button id="toggle-voice-reply" class="toggle-btn ' + (copilotState.voiceFeedback ? 'is-active' : '') + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' +
              '<span>Voice Audio Response: <strong>' + (copilotState.voiceFeedback ? 'ON' : 'OFF') + '</strong></span>' +
            '</button>' +
            '<button id="toggle-hands-free" class="toggle-btn ' + (copilotState.handsFree ? 'is-active' : '') + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
              '<span>Driving Mode: <strong>' + (copilotState.handsFree ? 'ON' : 'OFF') + '</strong></span>' +
            '</button>' +
          '</div>' +
          '<div class="copilot-chips" id="copilot-chips">' +
            '<button class="chip-btn" data-prompt="What are my top priorities and pipeline volume today?">⚡ Today\'s Priorities</button>' +
            '<button class="chip-btn" data-prompt="Which deals or contacts are going cold?">❄️ Deals Going Cold</button>' +
            '<button class="chip-btn" data-prompt="Prep me for my upcoming showings and meetings">📋 Prep Me For Tours</button>' +
            '<button class="chip-btn" data-prompt="Draft a follow-up email to the newest lead">📧 Draft Follow-Up</button>' +
            '<button class="chip-btn" data-prompt="Give me a quick market check for Pleasanton and Westside Danville">🏡 Market Check</button>' +
          '</div>' +
          '<form id="copilot-text-form" class="copilot-input-bar">' +
            '<input id="copilot-text-input" type="text" placeholder="Or type an instruction: \'Log showing note for Dr. Thorne...\'" autocomplete="off" />' +
            '<button type="submit" class="btn btn--primary">Send</button>' +
          '</form>' +
        '</div>' +
        '<div class="copilot-thread" id="copilot-thread">' +
          renderCopilotHistory() +
        '</div>' +
      '</div>';

    attachCopilotEvents();
  }

  /* ---------- Today & Daily Action Plan ---------- */
  function today() {
    api('/today').then(function (d) {
      var planDate = d.plan_date || '';
      var items = d.action_items || [];
      var tasks = d.due_tasks || [];
      var leads = d.new_leads || [];
      var banners = d.banners || [];

      var bannerHtml = '';
      if (banners.length) {
        bannerHtml = banners.map(function (b) {
          return '<div class="banner" style="margin: 0 0 16px; border-color: rgba(232,120,104,.6); background: rgba(232,120,104,.14); color: #FFD9D2;">' + esc(b.message) + '</div>';
        }).join('');
      }

      var newLeadsAlert = '';
      if (leads.length) {
        newLeadsAlert =
          '<div class="card" style="margin-bottom: 20px; border-color: var(--gold); background: rgba(216,165,90,.08);">' +
            '<div style="display:flex; justify-content:space-between; align-items:center;">' +
              '<div>' +
                '<strong style="color:var(--gold); font-size:1.05rem;">' + leads.length + ' New Inquiries Awaiting Response</strong>' +
                '<p class="muted small" style="margin:4px 0 0;">Inquiries submitted via website forms that have not yet had initial outreach logged.</p>' +
              '</div>' +
              '<button class="btn btn--primary" id="btn-goto-leads">Review Leads</button>' +
            '</div>' +
          '</div>';
      }

      var itemsHtml = '';
      if (items.length) {
        itemsHtml = items.map(function (item) {
          var isDone = item.status === 'sent' || item.status === 'done' || item.status === 'snoozed' || item.status === 'skipped';
          var statusPill = '';
          if (item.status === 'sent') statusPill = '<span class="pill pill--closed">Sent</span>';
          else if (item.status === 'done') statusPill = '<span class="pill pill--closed">Done</span>';
          else if (item.status === 'snoozed') statusPill = '<span class="pill">Snoozed until ' + esc(item.snoozed_until) + '</span>';
          else if (item.status === 'skipped') statusPill = '<span class="pill pill--off">Skipped: ' + esc(item.skip_reason || '') + '</span>';

          var draftHtml = '';
          if (item.channel === 'email') {
            draftHtml =
              '<div style="margin: 12px 0;">' +
                '<label class="small muted" style="margin-top:0;">Subject Line</label>' +
                '<input type="text" class="card-draft-subject" data-item-id="' + item.id + '" value="' + esc(item.draft_subject || '') + '" ' + (isDone ? 'disabled' : '') + ' style="min-height:38px; margin-bottom:8px; font-size:0.9rem;" />' +
                '<label class="small muted" style="margin-top:0;">Message Draft</label>' +
                '<textarea class="card-draft-body" data-item-id="' + item.id + '" rows="4" ' + (isDone ? 'disabled' : '') + ' style="font-size:0.9rem;">' + esc(item.draft_body || '') + '</textarea>' +
              '</div>';
          } else {
            draftHtml =
              '<div style="margin: 12px 0;">' +
                '<label class="small muted" style="margin-top:0;">' + (item.channel === 'call' ? 'Call Talking Points' : 'Suggested Text') + '</label>' +
                '<textarea class="card-draft-body" data-item-id="' + item.id + '" rows="3" ' + (isDone ? 'disabled' : '') + ' style="font-size:0.9rem;">' + esc(item.draft_body || '') + '</textarea>' +
              '</div>';
          }

          var actionsHtml = '';
          if (!isDone) {
            actionsHtml =
              '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:14px; padding-top:12px; border-top:1px solid var(--line);">' +
                (item.channel === 'email' ?
                  (item.consent_allowed ?
                    '<button class="btn btn--primary" data-item-action="approve" data-item-id="' + item.id + '">Approve &amp; Send</button>' :
                    '<span class="pill pill--off">Blocked: ' + esc(item.consent_reason || 'No consent') + '</span>') +
                  '<button class="btn btn--quiet small" data-item-action="save-draft" data-item-id="' + item.id + '">Save Draft</button>' :
                  (item.channel === 'call' ?
                    '<a class="btn btn--primary" href="tel:' + esc(item.primary_phone || '') + '">Call ' + esc(item.primary_phone || '') + '</a>' +
                    '<button class="btn" data-item-action="done" data-item-id="' + item.id + '">Mark Done</button>' :
                    '<button class="btn btn--primary" data-item-action="copy-text" data-text="' + esc(item.draft_body || '') + '">Copy Text</button>' +
                    '<button class="btn" data-item-action="done" data-item-id="' + item.id + '">Mark Done</button>')) +
                '<button class="btn btn--quiet small" data-item-action="redraft" data-item-id="' + item.id + '">↻ Redraft (AI)</button>' +
                '<button class="btn btn--quiet small" data-item-action="snooze" data-item-id="' + item.id + '">Snooze (1d)</button>' +
                '<button class="btn btn--quiet small" data-item-action="skip" data-item-id="' + item.id + '">Skip</button>' +
              '</div>';
          }

          return '<div class="card" style="margin-bottom: 16px; ' + (isDone ? 'opacity:0.65;' : '') + '">' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">' +
              '<div>' +
                '<div style="display:flex; align-items:center; gap:8px;">' +
                  '<a href="#contacts" data-open-contact="' + item.contact_id + '" style="font-size:1.15rem; font-weight:600; text-decoration:none; color:var(--ink);">' + esc(item.display_name) + '</a>' +
                  '<span class="pill pill--' + esc(item.contact_score_band) + '">' + esc(item.contact_score_band).toUpperCase() + ' ' + esc(item.contact_score) + '</span>' +
                  '<span class="pill">' + esc(item.rule.replace(/_/g, ' ').toUpperCase()) + '</span>' +
                  (item.draft_source ? '<span class="pill" style="font-size:0.7rem; color:var(--gold);">' + (item.draft_source === 'gemini' ? 'Drafted by AI' : 'Template') + '</span>' : '') +
                  (item.edited ? '<span class="pill" style="font-size:0.7rem;">Edited</span>' : '') +
                  statusPill +
                '</div>' +
                '<p class="muted small" style="margin: 4px 0 0;">' + esc(item.reason) + ' · Suggested channel: <strong>' + esc(item.channel.toUpperCase()) + '</strong></p>' +
              '</div>' +
            '</div>' +
            draftHtml +
            actionsHtml +
          '</div>';
        }).join('');
      } else {
        itemsHtml =
          '<div class="empty" style="padding:32px 16px;">' +
            '<p style="margin:0 0 16px; font-size:1rem;">All action items for today are completed (or no client outreach pending today).</p>' +
            '<div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">' +
              '<button class="btn btn--primary" id="btn-seed-demo-today">Load Luxury Tri-Valley Clients &amp; Pipeline</button>' +
              '<button class="btn" id="btn-force-gen-today">↻ Generate Today\'s Action Plan</button>' +
            '</div>' +
          '</div>';
      }

      var tasksHtml = '';
      if (tasks.length) {
        tasksHtml =
          '<div class="card" style="margin-top: 24px;">' +
            '<h2>Tasks Due Today &amp; Overdue</h2>' +
            '<div class="list">' +
              tasks.map(function (tk) {
                return '<div class="row" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px;">' +
                  '<label style="display:flex; align-items:center; gap:8px; margin:0; cursor:pointer; flex:1;">' +
                    '<input type="checkbox" data-today-task-toggle="' + tk.id + '" style="width:18px; height:18px;" />' +
                    '<span><strong>' + esc(tk.title) + '</strong> ' + (tk.contact_name ? '<span class="muted">(' + esc(tk.contact_name) + ')</span>' : '') + '</span>' +
                  '</label>' +
                  '<span class="row__side" style="color:var(--gold);">' + (tk.due_at ? when(tk.due_at) : '') + '</span>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div>';
      }

      view.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">' +
          '<div>' +
            '<h1 style="margin:0;">Today</h1>' +
            '<p class="muted small" style="margin:4px 0 0;">Action plan &amp; priorities for <strong>' + esc(planDate) + '</strong> · America/Los_Angeles</p>' +
          '</div>' +
          '<button class="btn" id="btn-refresh-plan">↻ Refresh Plan</button>' +
        '</div>' +
        bannerHtml +
        newLeadsAlert +
        '<div style="margin-bottom: 24px;">' +
          '<h2 style="margin:0 0 12px;">Action Plan (' + items.length + ' of 10)</h2>' +
          itemsHtml +
        '</div>' +
        tasksHtml;

      // Event bindings
      var btnRefresh = $('btn-refresh-plan');
      if (btnRefresh) {
        btnRefresh.onclick = function () {
          btnRefresh.disabled = true;
          api('/action-plan/generate', 'POST').then(function () {
            toast('Action plan refreshed.');
            today();
          }).catch(fail);
        };
      }

      var btnSeedToday = $('btn-seed-demo-today');
      if (btnSeedToday) {
        btnSeedToday.onclick = function () {
          btnSeedToday.disabled = true;
          api('/seed-demo', 'POST').then(function () {
            toast('Luxury demo clients, pipeline deals, and tasks loaded!');
            today();
          }).catch(fail).then(function () { btnSeedToday.disabled = false; });
        };
      }

      var btnForceToday = $('btn-force-gen-today');
      if (btnForceToday) {
        btnForceToday.onclick = function () {
          btnForceToday.disabled = true;
          api('/action-plan/generate', 'POST').then(function () {
            toast('Action plan generated.');
            today();
          }).catch(fail).then(function () { btnForceToday.disabled = false; });
        };
      }

      var btnGotoLeads = $('btn-goto-leads');
      if (btnGotoLeads) {
        btnGotoLeads.onclick = function () { go('leads'); };
      }

      // Contact detail link
      view.querySelectorAll('[data-open-contact]').forEach(function (el) {
        el.onclick = function (e) {
          e.preventDefault();
          contactDetail(el.getAttribute('data-open-contact'));
        };
      });

      // Action Item buttons
      view.querySelectorAll('[data-item-action]').forEach(function (btn) {
        btn.onclick = function () {
          var action = btn.getAttribute('data-item-action');
          var id = btn.getAttribute('data-item-id');
          btn.disabled = true;

          if (action === 'approve') {
            api('/action-items/' + id + '/approve', 'POST').then(function () {
              toast('Approved and queued for delivery!');
              today();
            }).catch(fail);
          } else if (action === 'done') {
            api('/action-items/' + id + '/done', 'POST').then(function () {
              toast('Activity logged as completed.');
              today();
            }).catch(fail);
          } else if (action === 'copy-text') {
            var text = btn.getAttribute('data-text');
            navigator.clipboard.writeText(text).then(function () {
              toast('Draft copied to clipboard!');
              btn.disabled = false;
            }).catch(function () {
              toast('Text: ' + text);
              btn.disabled = false;
            });
          } else if (action === 'save-draft') {
            var card = btn.closest('.card');
            var subjInput = card.querySelector('.card-draft-subject');
            var bodyInput = card.querySelector('.card-draft-body');
            api('/action-items/' + id, 'PATCH', {
              subject: subjInput ? subjInput.value.trim() : undefined,
              body: bodyInput ? bodyInput.value.trim() : ''
            }).then(function () {
              toast('Draft updated.');
              today();
            }).catch(fail);
          } else if (action === 'snooze') {
            api('/action-items/' + id + '/snooze', 'POST', { days: 1 }).then(function (res) {
              toast('Snoozed until ' + res.snoozed_until);
              today();
            }).catch(fail);
          } else if (action === 'skip') {
            var reason = prompt('Reason for skipping this action item (optional):') || 'Skipped by agent';
            api('/action-items/' + id + '/skip', 'POST', { reason: reason }).then(function () {
              toast('Action item skipped.');
              today();
            }).catch(fail);
          } else if (action === 'redraft') {
            api('/action-items/' + id + '/redraft', 'POST').then(function () {
              toast('Draft regenerated via Gemini.');
              today();
            }).catch(fail);
          }
        };
      });

      // Task toggle in Today screen
      view.querySelectorAll('[data-today-task-toggle]').forEach(function (chk) {
        chk.onchange = function () {
          var taskId = chk.getAttribute('data-today-task-toggle');
          api('/tasks/' + taskId, 'PATCH', { done: true }).then(function () {
            toast('Task completed.');
            today();
          }).catch(fail);
        };
      });
    }).catch(fail);
  }

  /* ---------- Drawer Helpers for Deals, Tasks & Contacts ---------- */
  function openAddDealDrawer(preferredPipeId) {
    Promise.all([
      api('/contacts?limit=100'),
      getPipelines()
    ]).then(function (results) {
      var contacts = (results[0] && results[0].contacts) || [];
      var pipelines = results[1] || [];

      var contactOpts = contacts.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.display_name) + (c.budget ? ' (' + esc(c.budget) + ')' : '') + '</option>';
      }).join('');

      var pipeOpts = pipelines.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === preferredPipeId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
      }).join('');

      var firstPipe = pipelines.find(function (p) { return p.id === preferredPipeId; }) || pipelines[0];
      var stageOpts = (firstPipe ? firstPipe.stages : []).map(function (s) {
        return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
      }).join('');

      openDrawer(
        '<h2>Create New Deal</h2>' +
        '<form id="deal-create-form" class="list" style="margin-top:16px;">' +
          '<label for="dcf-contact">Client / Contact</label>' +
          '<select id="dcf-contact" required>' +
            (contactOpts || '<option value="">No contacts available</option>') +
          '</select>' +
          '<label for="dcf-pipeline">Pipeline</label>' +
          '<select id="dcf-pipeline">' + pipeOpts + '</select>' +
          '<label for="dcf-stage">Initial Stage</label>' +
          '<select id="dcf-stage">' + stageOpts + '</select>' +
          '<label for="dcf-title">Deal Title</label>' +
          '<input id="dcf-title" type="text" placeholder="e.g. Vance Family - Ruby Hill Luxury Purchase" required />' +
          '<div class="two">' +
            '<div>' +
              '<label for="dcf-value">Deal Value ($)</label>' +
              '<input id="dcf-value" type="number" placeholder="3500000" min="0" step="50000" />' +
            '</div>' +
            '<div>' +
              '<label for="dcf-close">Target Close Date</label>' +
              '<input id="dcf-close" type="date" />' +
            '</div>' +
          '</div>' +
          '<label for="dcf-address">Target Property Address or Enclave</label>' +
          '<input id="dcf-address" type="text" placeholder="e.g. Ruby Hill Enclave, Pleasanton or 342 El Pintado Rd" />' +
          '<div class="actions" style="margin-top:20px;">' +
            '<button type="submit" class="btn btn--primary">Save Deal</button>' +
            '<button type="button" class="btn btn--quiet" data-close>Cancel</button>' +
          '</div>' +
        '</form>'
      );

      var pipeSel = $('dcf-pipeline');
      var stageSel = $('dcf-stage');
      if (pipeSel && stageSel) {
        pipeSel.onchange = function () {
          var pMatch = pipelines.find(function (p) { return p.id === Number(pipeSel.value); });
          stageSel.innerHTML = (pMatch ? pMatch.stages : []).map(function (s) {
            return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
          }).join('');
        };
      }

      var form = $('deal-create-form');
      form.onsubmit = function (e) {
        e.preventDefault();
        var submitBtn = form.querySelector('button[type=submit]');
        submitBtn.disabled = true;

        var payload = {
          contact_id: $('dcf-contact').value,
          pipeline_id: $('dcf-pipeline').value,
          stage_id: $('dcf-stage').value,
          title: $('dcf-title').value.trim(),
          value_usd: $('dcf-value').value ? Number($('dcf-value').value) : null,
          property_address: $('dcf-address').value.trim(),
          expected_close: $('dcf-close').value || null
        };

        api('/deals', 'POST', payload).then(function () {
          toast('Deal created successfully.');
          closeDrawer();
          go('pipeline');
        }).catch(fail).then(function () { submitBtn.disabled = false; });
      };
    }).catch(fail);
  }

  function openAddTaskDrawer(presetContactId) {
    api('/contacts?limit=100').then(function (d) {
      var contacts = d.contacts || [];
      var contactOpts = '<option value="">None (General Task)</option>' + contacts.map(function (c) {
        return '<option value="' + c.id + '"' + (presetContactId && Number(presetContactId) === c.id ? ' selected' : '') + '>' + esc(c.display_name) + '</option>';
      }).join('');

      var todayStr = new Date().toISOString().slice(0, 10);

      openDrawer(
        '<h2>Create New Task</h2>' +
        '<form id="task-create-form" class="list" style="margin-top:16px;">' +
          '<label for="tcf-title">Task Title</label>' +
          '<input id="tcf-title" type="text" placeholder="e.g. Schedule private showing for Ruby Hill estate" required />' +
          '<label for="tcf-contact">Associated Client</label>' +
          '<select id="tcf-contact">' + contactOpts + '</select>' +
          '<label for="tcf-due">Due Date</label>' +
          '<input id="tcf-due" type="date" value="' + todayStr + '" />' +
          '<div class="actions" style="margin-top:20px;">' +
            '<button type="submit" class="btn btn--primary">Save Task</button>' +
            '<button type="button" class="btn btn--quiet" data-close>Cancel</button>' +
          '</div>' +
        '</form>'
      );

      var form = $('task-create-form');
      form.onsubmit = function (e) {
        e.preventDefault();
        var submitBtn = form.querySelector('button[type=submit]');
        submitBtn.disabled = true;

        var payload = {
          title: $('tcf-title').value.trim(),
          contact_id: $('tcf-contact').value ? Number($('tcf-contact').value) : null,
          due_at: $('tcf-due').value || null
        };

        api('/tasks', 'POST', payload).then(function () {
          toast('Task created successfully.');
          closeDrawer();
          if (state.view === 'tasks') tasks();
          else if (state.view === 'today') today();
          else if (presetContactId) contactDetail(presetContactId);
        }).catch(fail).then(function () { submitBtn.disabled = false; });
      };
    }).catch(fail);
  }

  function openAddContactDrawer() {
    openDrawer(
      '<h2>New Contact Profile</h2>' +
      '<form id="contact-create-form" class="list" style="margin-top:16px;">' +
        '<div class="two">' +
          '<div>' +
            '<label for="ccf-fn">First Name</label>' +
            '<input id="ccf-fn" type="text" placeholder="Marcus" />' +
          '</div>' +
          '<div>' +
            '<label for="ccf-ln">Last Name</label>' +
            '<input id="ccf-ln" type="text" placeholder="Vance" />' +
          '</div>' +
        '</div>' +
        '<label for="ccf-dn">Display Name (or couple/entity)</label>' +
        '<input id="ccf-dn" type="text" placeholder="Dr. Marcus &amp; Elena Vance" />' +
        '<div class="two">' +
          '<div>' +
            '<label for="ccf-email">Primary Email</label>' +
            '<input id="ccf-email" type="email" placeholder="client@example.com" />' +
          '</div>' +
          '<div>' +
            '<label for="ccf-phone">Primary Phone</label>' +
            '<input id="ccf-phone" type="tel" placeholder="(925) 555-0199" />' +
          '</div>' +
        '</div>' +
        '<div class="two">' +
          '<div>' +
            '<label for="ccf-stage">Stage</label>' +
            '<select id="ccf-stage">' +
              '<option value="new">New</option>' +
              '<option value="contacted">Contacted</option>' +
              '<option value="qualified" selected>Qualified</option>' +
              '<option value="showing">Showing</option>' +
              '<option value="listing_prep">Listing Prep</option>' +
              '<option value="offer">Offer</option>' +
              '<option value="under_contract">In Escrow</option>' +
              '<option value="past_client">Past Client</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label for="ccf-type">Relationship Type</label>' +
            '<select id="ccf-type">' +
              '<option value="client" selected>Client</option>' +
              '<option value="lead">Lead</option>' +
              '<option value="past_client">Past Client</option>' +
              '<option value="sphere">Sphere of Influence</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<label for="ccf-interest">Target Corridor or Enclave</label>' +
        '<input id="ccf-interest" type="text" placeholder="e.g. Relocating from SF to Pleasanton / Ruby Hill" />' +
        '<div class="two">' +
          '<div>' +
            '<label for="ccf-budget">Budget / Price Range</label>' +
            '<input id="ccf-budget" type="text" placeholder="e.g. $3,500,000" />' +
          '</div>' +
          '<div>' +
            '<label for="ccf-timeline">Timeline</label>' +
            '<input id="ccf-timeline" type="text" placeholder="e.g. 30-60 days" />' +
          '</div>' +
        '</div>' +
        '<label for="ccf-notes">Internal Advisory Notes</label>' +
        '<textarea id="ccf-notes" rows="3" placeholder="Background, preferences, school requirements, discreet preferences..."></textarea>' +
        '<div class="actions" style="margin-top:20px;">' +
          '<button type="submit" class="btn btn--primary">Create Contact</button>' +
          '<button type="button" class="btn btn--quiet" data-close>Cancel</button>' +
        '</div>' +
      '</form>'
    );

    var form = $('contact-create-form');
    form.onsubmit = function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('button[type=submit]');
      submitBtn.disabled = true;

      var payload = {
        first_name: $('ccf-fn').value.trim(),
        last_name: $('ccf-ln').value.trim(),
        display_name: $('ccf-dn').value.trim(),
        email: $('ccf-email').value.trim(),
        phone: $('ccf-phone').value.trim(),
        stage: $('ccf-stage').value,
        type: $('ccf-type').value,
        interest: $('ccf-interest').value.trim(),
        budget: $('ccf-budget').value.trim(),
        timeline: $('ccf-timeline').value.trim(),
        notes: $('ccf-notes').value.trim()
      };

      api('/contacts', 'POST', payload).then(function (d) {
        toast('Contact created.');
        closeDrawer();
        if (d.contact && d.contact.id) contactDetail(d.contact.id);
        else contacts();
      }).catch(fail).then(function () { submitBtn.disabled = false; });
    };
  }

  /* ---------- Pipelines & Kanban Deals Board (CRM M1/M2) ---------- */
  function pipeline() {
    api('/pipelines').then(function (d) {
      state.pipelines = d.pipelines || [];
      if (!state.pipelines.length) {
        view.innerHTML = '<h1>Pipelines &amp; Deals</h1><div class="empty">No pipelines configured.</div>';
        return;
      }

      var activePipeId = state.pipeline.active_id || state.pipelines[0].id;
      var currentPipe = state.pipelines.find(function (p) { return p.id === activePipeId; }) || state.pipelines[0];
      state.pipeline.active_id = currentPipe.id;

      var totalVolume = currentPipe.total_volume || 0;
      var totalDeals = currentPipe.total_deals || 0;

      var switchesHtml = state.pipelines.map(function (p) {
        var isAct = p.id === currentPipe.id;
        var pVol = p.total_volume ? '$' + Number(p.total_volume).toLocaleString() : '$0';
        return '<button class="kanban-switch' + (isAct ? ' is-active' : '') + '" data-switch-pipe="' + p.id + '">' +
          esc(p.name) + ' (' + (p.total_deals || 0) + ' · ' + pVol + ')</button>';
      }).join('');

      var stagesHtml = (currentPipe.stages || []).map(function (stage) {
        var sDeals = stage.deals || [];
        var sVol = stage.total_volume ? '$' + Number(stage.total_volume).toLocaleString() : '$0';

        var cardsHtml = '';
        if (sDeals.length) {
          cardsHtml = sDeals.map(function (dl) {
            var valStr = dl.value_usd ? '$' + Number(dl.value_usd).toLocaleString() : '';
            var scoreBadge = '';
            if (dl.contact_score != null) {
              var sBand = dl.contact_score_band || (dl.contact_score >= 80 ? 'hot' : dl.contact_score >= 50 ? 'warm' : 'cool');
              var emoji = sBand === 'hot' ? '🔥 ' : sBand === 'warm' ? '⚡ ' : '';
              scoreBadge = '<span class="pill pill--' + esc(sBand) + '" style="font-size:0.68rem; padding:1px 6px;">' + emoji + dl.contact_score + '</span>';
            }

            var allStages = currentPipe.stages || [];
            var stageOpts = allStages.map(function (st) {
              return '<option value="' + st.id + '"' + (st.id === dl.stage_id ? ' selected' : '') + '>' + esc(st.name) + '</option>';
            }).join('');

            return '<div class="kanban-card" data-deal-card="' + dl.id + '" data-contact-id="' + dl.contact_id + '">' +
              '<div class="kanban-card__top">' +
                '<strong class="kanban-card__val">' + esc(valStr) + '</strong>' +
                scoreBadge +
              '</div>' +
              '<h3 class="kanban-card__title">' + esc(dl.title) + '</h3>' +
              '<div class="kanban-card__client">' +
                '<span style="color:var(--ink); font-weight:500;">' + esc(dl.contact_name || 'Client') + '</span>' +
                (dl.contact_phone ? '<span class="muted small">' + esc(dl.contact_phone) + '</span>' : '') +
              '</div>' +
              (dl.property_address ? '<div class="kanban-card__addr">📍 ' + esc(dl.property_address) + '</div>' : '') +
              (dl.expected_close ? '<div class="muted small" style="margin-top:3px; font-size:0.72rem;">Target Close: ' + esc(dl.expected_close) + '</div>' : '') +
              '<div class="kanban-card__stage-move">' +
                '<label class="small muted" style="margin:0 0 2px; font-size:0.7rem;">Move Stage:</label>' +
                '<select class="deal-quick-stage" data-deal-id="' + dl.id + '">' + stageOpts + '</select>' +
              '</div>' +
            '</div>';
          }).join('');
        } else {
          cardsHtml = '<div class="muted small" style="padding:20px 8px; text-align:center; border:1px dashed var(--line); border-radius:6px;">No deals in this stage</div>';
        }

        return '<div class="kanban-col">' +
          '<div class="kanban-col__header">' +
            '<div>' +
              '<h3 class="kanban-col__title">' + esc(stage.name) + '</h3>' +
              '<div class="kanban-col__meta">' + (stage.probability ? stage.probability + '% prob · ' : '') + sDeals.length + ' deals</div>' +
            '</div>' +
            '<div class="kanban-col__val">' + sVol + '</div>' +
          '</div>' +
          '<div class="kanban-cards">' + cardsHtml + '</div>' +
        '</div>';
      }).join('');

      view.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">' +
          '<div>' +
            '<h1 style="margin:0;">Pipelines &amp; Deals</h1>' +
            '<p class="muted small" style="margin:4px 0 0;">Visual Kanban stage tracking for Luxury Tri-Valley buyers &amp; sellers</p>' +
          '</div>' +
          '<div style="display:flex; gap:8px;">' +
            '<button class="btn btn--primary" id="btn-add-deal">+ Add Deal</button>' +
            '<button class="btn btn--quiet" id="btn-seed-sample-deals">Load Sample Deals</button>' +
          '</div>' +
        '</div>' +
        '<div class="kanban-controls">' +
          '<div class="kanban-switches">' + switchesHtml + '</div>' +
          '<div class="kanban-kpis">' +
            '<span>Active Deals: <strong>' + totalDeals + '</strong></span>' +
            '<span>Pipeline Volume: <strong>$' + Number(totalVolume).toLocaleString() + '</strong></span>' +
          '</div>' +
        '</div>' +
        '<div class="kanban-board">' + stagesHtml + '</div>';

      // Switch pipeline event
      view.querySelectorAll('[data-switch-pipe]').forEach(function (btn) {
        btn.onclick = function () {
          state.pipeline.active_id = Number(btn.getAttribute('data-switch-pipe'));
          pipeline();
        };
      });

      // Quick move stage event
      view.querySelectorAll('.deal-quick-stage').forEach(function (sel) {
        sel.onclick = function (e) { e.stopPropagation(); };
        sel.onchange = function (e) {
          e.stopPropagation();
          var dealId = sel.getAttribute('data-deal-id');
          var newStId = Number(sel.value);
          sel.disabled = true;
          api('/deals/' + dealId, 'PATCH', { stage_id: newStId }).then(function () {
            toast('Deal stage updated.');
            pipeline();
          }).catch(function (err) {
            fail(err);
            sel.disabled = false;
          });
        };
      });

      // Card click opens contact drawer
      view.querySelectorAll('[data-deal-card]').forEach(function (card) {
        card.onclick = function (e) {
          if (e.target.closest('select') || e.target.closest('button') || e.target.closest('a')) return;
          var cId = card.getAttribute('data-contact-id');
          if (cId) contactDetail(cId);
        };
      });

      // Add Deal button
      var btnAddDeal = $('btn-add-deal');
      if (btnAddDeal) {
        btnAddDeal.onclick = function () {
          openAddDealDrawer(currentPipe.id);
        };
      }

      // Seed sample deals button
      var btnSeed = $('btn-seed-sample-deals');
      if (btnSeed) {
        btnSeed.onclick = function () {
          btnSeed.disabled = true;
          api('/seed-demo', 'POST').then(function () {
            toast('Loaded Luxury Tri-Valley clients and pipeline deals.');
            pipeline();
          }).catch(fail).then(function () { btnSeed.disabled = false; });
        };
      }
    }).catch(fail);
  }

  /* ---------- Dedicated Tasks View (CRM M1/M2) ---------- */
  function tasks() {
    var f = state.tasks;
    var qs = '?status=' + encodeURIComponent(f.filter || 'open') + '&offset=' + f.offset + '&limit=' + LIMIT;

    api('/tasks' + qs).then(function (d) {
      var allTasks = d.tasks || [];
      var counts = d.counts || { total: 0, open_count: 0, completed_count: 0, overdue_count: 0, today_count: 0 };

      var filters = [
        { id: 'open', label: 'Open Tasks (' + counts.open_count + ')' },
        { id: 'overdue', label: 'Overdue (' + counts.overdue_count + ')' },
        { id: 'today', label: 'Due Today (' + counts.today_count + ')' },
        { id: 'completed', label: 'Completed (' + counts.completed_count + ')' },
        { id: 'all', label: 'All (' + counts.total + ')' }
      ];

      var filterBtns = filters.map(function (fl) {
        var isAct = (f.filter || 'open') === fl.id;
        return '<button class="kanban-switch' + (isAct ? ' is-active' : '') + '" data-task-filter="' + fl.id + '">' +
          esc(fl.label) + '</button>';
      }).join('');

      var tasksListHtml = '';
      if (allTasks.length) {
        tasksListHtml = allTasks.map(function (tk) {
          var isDone = Boolean(tk.done_at);
          var dueBadge = '';
          if (tk.due_at) {
            if (tk.is_overdue && !isDone) {
              dueBadge = '<span class="task-due task-due--overdue">Overdue · ' + esc(tk.due_at.slice(0, 10)) + '</span>';
            } else if (tk.is_today && !isDone) {
              dueBadge = '<span class="task-due task-due--today">Due Today</span>';
            } else {
              dueBadge = '<span class="task-due task-due--upcoming">' + esc(tk.due_at.slice(0, 10)) + '</span>';
            }
          }

          return '<div class="task-item' + (isDone ? ' is-done' : '') + '">' +
            '<input type="checkbox" data-task-toggle="' + tk.id + '" ' + (isDone ? 'checked' : '') + ' aria-label="Mark completed" style="width:20px; height:20px; cursor:pointer;" />' +
            '<div>' +
              '<div class="task-title">' + esc(tk.title) + '</div>' +
              '<div class="task-sub">' +
                (tk.contact_name ? '<a href="#contacts" data-open-contact="' + tk.contact_id + '" style="color:var(--gold); text-decoration:none;">👤 ' + esc(tk.contact_name) + '</a> · ' : '') +
                (tk.deal_title ? '<span class="muted">💼 ' + esc(tk.deal_title) + '</span> · ' : '') +
                (isDone ? '<span class="muted small">Completed ' + when(tk.done_at) + '</span>' : dueBadge) +
              '</div>' +
            '</div>' +
            '<button class="btn btn--quiet small" data-task-del="' + tk.id + '" title="Delete task" style="color:var(--soft); font-size:1.1rem; padding:0 8px;">×</button>' +
          '</div>';
        }).join('');
      } else {
        tasksListHtml = '<div class="empty">No tasks found in this view. Schedule follow-ups or client showings anytime!</div>';
      }

      view.innerHTML =
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">' +
          '<div>' +
            '<h1 style="margin:0;">Tasks &amp; Follow-up</h1>' +
            '<p class="muted small" style="margin:4px 0 0;">Manage upcoming client follow-ups, staging milestones, and showings</p>' +
          '</div>' +
          '<button class="btn btn--primary" id="btn-add-task">+ Add Task</button>' +
        '</div>' +
        '<div class="kpis" style="margin-bottom:16px;">' +
          kpi(counts.overdue_count, 'Overdue Tasks', counts.overdue_count > 0) +
          kpi(counts.today_count, 'Due Today', counts.today_count > 0) +
          kpi(counts.open_count, 'Total Open') +
          kpi(counts.completed_count, 'Completed') +
        '</div>' +
        '<div class="kanban-controls">' +
          '<div class="kanban-switches">' + filterBtns + '</div>' +
        '</div>' +
        '<div class="task-list">' + tasksListHtml + '</div>';

      // Filter switch event
      view.querySelectorAll('[data-task-filter]').forEach(function (btn) {
        btn.onclick = function () {
          state.tasks.filter = btn.getAttribute('data-task-filter');
          tasks();
        };
      });

      // Toggle task done
      view.querySelectorAll('[data-task-toggle]').forEach(function (chk) {
        chk.onchange = function () {
          var taskId = chk.getAttribute('data-task-toggle');
          api('/tasks/' + taskId, 'PATCH', { done: chk.checked }).then(function () {
            toast(chk.checked ? 'Task completed.' : 'Task re-opened.');
            tasks();
          }).catch(fail);
        };
      });

      // Delete task
      view.querySelectorAll('[data-task-del]').forEach(function (btn) {
        btn.onclick = function () {
          if (!confirm('Delete this task?')) return;
          var taskId = btn.getAttribute('data-task-del');
          api('/tasks/' + taskId, 'DELETE').then(function () {
            toast('Task deleted.');
            tasks();
          }).catch(fail);
        };
      });

      // Contact link inside task
      view.querySelectorAll('[data-open-contact]').forEach(function (lnk) {
        lnk.onclick = function (e) {
          e.preventDefault();
          contactDetail(lnk.getAttribute('data-open-contact'));
        };
      });

      // Add Task button
      var btnAddTask = $('btn-add-task');
      if (btnAddTask) {
        btnAddTask.onclick = function () {
          openAddTaskDrawer();
        };
      }
    }).catch(fail);
  }

  /* ---------- Dashboard ---------- */
  function bars(rows) {
    if (!rows || !rows.length) return '<p class="muted small">Nothing yet.</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }));
    return '<ul class="bars">' + rows.map(function (r) {
      return '<li><span title="' + esc(r.k) + '">' + esc(r.k) + '</span><i style="width:' + Math.round(r.n / max * 100) + '%"></i><b>' + r.n + '</b></li>';
    }).join('') + '</ul>';
  }
  function kpi(n, label, alert) { return '<div class="card kpi' + (alert ? ' is-alert' : '') + '"><strong>' + esc(n) + '</strong><span>' + esc(label) + '</span></div>'; }
  function dashboard() {
    api('/stats').then(function (d) {
      var s = d.stats, dl = s.deliveries || {};
      $('badge-new').hidden = !s.uncontacted; $('badge-new').textContent = s.uncontacted;
      var maxDay = Math.max.apply(null, [1].concat(s.by_day.map(function (r) { return r.n; })));
      view.innerHTML =
        '<h1>Dashboard</h1>' +
        '<div class="kpis">' +
          kpi(s.uncontacted, 'Not yet contacted', s.uncontacted > 0) + kpi(s.follow_ups_due, 'Follow-ups due', s.follow_ups_due > 0) +
          kpi(s.last7, 'Leads, last 7 days') + kpi(s.last30, 'Leads, last 30 days') + kpi(s.total, 'All-time leads') + kpi(s.subscribers, 'Subscribers') +
        '</div>' +
        ((dl.dead || dl.pending) ? '<div class="banner" style="margin:0 0 16px;">' + (dl.dead ? '<b>' + dl.dead + '</b> notification(s) failed after every retry. ' : '') + (dl.pending ? dl.pending + ' still retrying. ' : '') + 'Open the lead to see which, and retry.</div>' : '') +
        '<div class="grid2">' +
          '<section class="card"><h2>Leads per day, last 30 days</h2>' + (s.by_day.length ? '<div class="spark" role="img" aria-label="Leads per day">' + s.by_day.map(function (r) { return '<i style="height:' + Math.round(r.n / maxDay * 100) + '%" title="' + esc(r.k) + ': ' + r.n + '"></i>'; }).join('') + '</div>' : '<p class="muted small">Nothing yet.</p>') + '</section>' +
          '<section class="card"><h2>By form, last 90 days</h2>' + bars(s.by_type) + '</section>' +
          '<section class="card"><h2>By page, last 90 days</h2>' + bars(s.by_page) + '</section>' +
          '<section class="card"><h2>By campaign source, last 90 days</h2>' + bars(s.by_source) + '</section>' +
        '</div>';
    }).catch(fail);
  }

  /* ---------- Contacts (CRM M1) ---------- */
  function contacts() {
    var f = state.contacts;
    var qs = '?limit=' + LIMIT + '&offset=' + f.offset +
      '&stage=' + encodeURIComponent(f.stage) +
      '&type=' + encodeURIComponent(f.type) +
      '&score_band=' + encodeURIComponent(f.score_band) +
      '&q=' + encodeURIComponent(f.q);

    api('/contacts' + qs).then(function (d) {
      var stages = d.stages || [];
      var scoreBands = d.score_bands || [];

      view.innerHTML =
        '<h1>Contacts</h1>' +
        '<div class="toolbar">' +
          '<input type="search" id="cq" placeholder="Search name, email, phone, notes…" value="' + esc(f.q) + '" aria-label="Search contacts" />' +
          '<select id="cstage" aria-label="Stage"><option value="">All stages</option>' + stages.map(function (s) { return '<option' + (s === f.stage ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          '<select id="cscore" aria-label="Score Band"><option value="">All score bands</option>' + scoreBands.map(function (b) { return '<option' + (b === f.score_band ? ' selected' : '') + '>' + b + '</option>'; }).join('') + '</select>' +
          '<button class="btn btn--primary" id="btn-add-contact">+ Add Contact</button>' +
          '<a class="btn" href="/api/admin/contacts.csv">Export CSV</a>' +
          '<button class="btn btn--quiet" id="btn-seed-contacts">Load Sample Clients</button>' +
        '</div>' +
        (d.contacts.length ? '<div class="list">' + d.contacts.map(contactRow).join('') + '</div>' : '<div class="empty">No contacts match. Every inbound inquiry automatically creates or matches a contact profile here.</div>') +
        '<div class="pager"><span>' + (d.total ? (f.offset + 1) + '–' + Math.min(f.offset + LIMIT, d.total) + ' of ' + d.total : '') + '</span><span>' +
          (f.offset > 0 ? '<button class="btn" id="cprev">Newer</button> ' : '') + (f.offset + LIMIT < d.total ? '<button class="btn" id="cnext">Older</button>' : '') + '</span></div>';

      var t;
      $('cq').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { f.q = e.target.value.trim(); f.offset = 0; contacts(); }, 350); });
      $('cstage').addEventListener('change', function (e) { f.stage = e.target.value; f.offset = 0; contacts(); });
      $('cscore').addEventListener('change', function (e) { f.score_band = e.target.value; f.offset = 0; contacts(); });
      if ($('cprev')) $('cprev').onclick = function () { f.offset = Math.max(0, f.offset - LIMIT); contacts(); };
      if ($('cnext')) $('cnext').onclick = function () { f.offset += LIMIT; contacts(); };
      var btnAddC = $('btn-add-contact');
      if (btnAddC) btnAddC.onclick = function () { openAddContactDrawer(); };
      var btnSeedC = $('btn-seed-contacts');
      if (btnSeedC) {
        btnSeedC.onclick = function () {
          btnSeedC.disabled = true;
          api('/seed-demo', 'POST').then(function () {
            toast('Loaded sample luxury contacts & deals.');
            contacts();
          }).catch(fail).then(function () { btnSeedC.disabled = false; });
        };
      }
      view.querySelectorAll('[data-contact]').forEach(function (b) { b.onclick = function () { contactDetail(b.getAttribute('data-contact')); }; });
      if (f.q) { var i = $('cq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }).catch(fail);
  }

  function contactRow(c) {
    var metaParts = [
      c.primary_email,
      c.primary_phone,
      c.interest,
      c.budget,
      c.timeline
    ].filter(Boolean).join(' · ');

    var pills = [];
    if (c.discreet) pills.push('<span class="pill pill--discreet">Discreet</span>');
    if (c.score > 0 || c.score_band !== 'cold') {
      var sBand = c.score_band || (c.score >= 80 ? 'hot' : c.score >= 50 ? 'warm' : 'cool');
      var emoji = sBand === 'hot' ? '🔥 ' : sBand === 'warm' ? '⚡ ' : sBand === 'cool' ? '❄️ ' : '';
      pills.push('<span class="pill pill--' + esc(sBand) + '">' + emoji + esc(c.score) + ' ' + esc(sBand).toUpperCase() + '</span>');
    }
    pills.push('<span class="pill pill--' + esc(c.stage) + '">' + esc(c.stage.replace(/_/g, ' ')) + '</span>');
    if (c.deals_count) pills.push('<span class="pill" style="border-color:var(--gold); color:var(--gold);">💼 ' + c.deals_count + ' Deal' + (c.deals_count > 1 ? 's' : '') + '</span>');
    if (c.open_tasks_count) pills.push('<span class="pill" style="border-color:var(--soft);">📋 ' + c.open_tasks_count + ' Task' + (c.open_tasks_count > 1 ? 's' : '') + '</span>');

    return '<button class="row' + (c.stage === 'new' ? ' is-new' : '') + '" data-contact="' + esc(c.id) + '">' +
      '<span class="row__title">' + esc(c.display_name) + ' ' + pills.join(' ') + '</span>' +
      '<span class="row__side">' + when(c.last_inbound_at || c.created_at) + '</span>' +
      '<span class="row__meta">' + esc(metaParts) + (c.notes ? ' — ' + esc(c.notes) : '') + '</span></button>';
  }

  function contactDetail(id) {
    Promise.all([
      api('/contacts/' + encodeURIComponent(id)),
      getPipelines()
    ]).then(function (results) {
      var c = results[0].contact;
      var pipelines = results[1] || [];
      var emails = (c.identities || []).filter(function (i) { return i.kind === 'email'; });
      var phones = (c.identities || []).filter(function (i) { return i.kind === 'phone'; });

      // Deals HTML
      var dealsHtml =
        '<div style="display:flex; justify-content:space-between; align-items:center; margin:16px 0 8px;">' +
          '<h2 style="margin:0;">Deals & Pipeline</h2>' +
          '<div style="display:flex; gap:6px;">' +
            '<button class="btn btn--quiet small" id="btn-start-buyer">+ Start Buyer Deal</button>' +
            '<button class="btn btn--quiet small" id="btn-start-seller">+ Start Seller Deal</button>' +
          '</div>' +
        '</div>';

      if (c.deals && c.deals.length) {
        dealsHtml += '<div class="list" style="margin-bottom:16px;">' +
          c.deals.map(function (dl) {
            var pMatch = pipelines.find(function (p) { return p.id === dl.pipeline_id; });
            var pStages = pMatch ? pMatch.stages : [];
            var stageOptions = pStages.map(function (st) {
              return '<option value="' + st.id + '"' + (st.id === dl.stage_id ? ' selected' : '') + '>' + esc(st.name) + '</option>';
            }).join('');

            var statusPill = dl.is_won ? ' <span class="pill pill--closed">Closed Won</span>' : (dl.is_lost ? ' <span class="pill pill--lost">Lost</span>' : '');
            var valStr = dl.value_usd ? '$' + Number(dl.value_usd).toLocaleString() : '';

            return '<div class="card" style="padding:12px; margin-bottom:8px;">' +
              '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
                '<strong style="font-size:0.95rem;">' + esc(dl.title) + statusPill + '</strong>' +
                (valStr ? '<span style="color:var(--gold); font-weight:600;">' + esc(valStr) + '</span>' : '') +
              '</div>' +
              (dl.property_address ? '<p class="small muted" style="margin:0 0 8px;">' + esc(dl.property_address) + '</p>' : '') +
              '<div style="display:flex; align-items:center; gap:8px;">' +
                '<span class="small muted">' + esc(dl.pipeline_name) + ' Stage:</span>' +
                '<select class="deal-stage-select" data-deal-id="' + dl.id + '" style="min-height:36px; padding:4px 8px; font-size:0.85rem; width:auto; flex:1;">' +
                  stageOptions +
                '</select>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>';
      } else {
        dealsHtml += '<p class="muted small" style="margin:0 0 16px;">No active deals yet. Click above to start a buyer or seller deal.</p>';
      }

      // Tasks HTML
      var openTasks = (c.tasks || []).filter(function (t) { return !t.done_at; });
      var doneTasks = (c.tasks || []).filter(function (t) { return Boolean(t.done_at); });

      var tasksHtml =
        '<div style="margin:16px 0 8px;">' +
          '<h2 style="margin:0 0 8px;">Tasks & Follow-up</h2>' +
          '<form id="task-add-form" style="display:grid; grid-template-columns: 1fr 130px auto; gap:6px; margin-bottom:10px;">' +
            '<input type="text" id="task-add-title" placeholder="New follow-up task…" required style="min-height:36px; padding:6px 10px; font-size:0.85rem;" />' +
            '<input type="date" id="task-add-due" style="min-height:36px; padding:6px 8px; font-size:0.85rem;" />' +
            '<button type="submit" class="btn btn--primary" style="min-height:36px; padding:0 12px; font-size:0.75rem;">Add</button>' +
          '</form>' +
          '<div class="list" style="margin-bottom:16px;">' +
            (openTasks.length ? openTasks.map(function (tk) {
              return '<div class="row is-new" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px;">' +
                '<label style="display:flex; align-items:center; gap:8px; margin:0; cursor:pointer; flex:1;">' +
                  '<input type="checkbox" data-task-toggle="' + tk.id + '" data-done="1" style="width:18px; height:18px;" />' +
                  '<span style="font-weight:600; font-size:0.88rem;">' + esc(tk.title) + '</span>' +
                '</label>' +
                '<span class="row__side" style="display:flex; align-items:center; gap:8px;">' +
                  (tk.due_at ? '<span style="color:var(--gold);">' + when(tk.due_at) + '</span>' : '<span class="muted">No due date</span>') +
                  '<button class="btn btn--quiet small" data-task-del="' + tk.id + '" style="min-height:28px; padding:0 6px;" title="Delete task">×</button>' +
                '</span>' +
              '</div>';
            }).join('') : '<p class="muted small" style="margin:0 0 6px;">No open tasks.</p>') +
            (doneTasks.length ? doneTasks.map(function (tk) {
              return '<div class="row" style="opacity:0.6; display:flex; align-items:center; justify-content:space-between; padding:8px 12px;">' +
                '<label style="display:flex; align-items:center; gap:8px; margin:0; cursor:pointer; flex:1;">' +
                  '<input type="checkbox" checked data-task-toggle="' + tk.id + '" data-done="0" style="width:18px; height:18px;" />' +
                  '<span style="text-decoration:line-through; font-size:0.88rem;">' + esc(tk.title) + '</span>' +
                '</label>' +
                '<span class="row__side" style="display:flex; align-items:center; gap:8px;">' +
                  '<span class="pill pill--closed">Done</span> ' + when(tk.done_at) +
                  '<button class="btn btn--quiet small" data-task-del="' + tk.id + '" style="min-height:28px; padding:0 6px;" title="Delete task">×</button>' +
                '</span>' +
              '</div>';
            }).join('') : '') +
          '</div>' +
        '</div>';

      var actsHtml = '';
      if (c.activities && c.activities.length) {
        actsHtml = '<h2>Activity Stream</h2><div class="list" style="margin-bottom:16px;">' +
          c.activities.map(function (a) {
            return '<div class="row"><span class="row__title">' + esc(a.subject || a.kind) + '</span>' +
              '<span class="row__side">' + when(a.occurred_at || a.created_at) + '</span>' +
              (a.body ? '<span class="row__meta">' + esc(a.body) + '</span>' : '') +
              '</div>';
          }).join('') + '</div>';
      }

      var consentsHtml = '';
      if (c.consents && c.consents.length) {
        consentsHtml = '<h2>Consent Records (Immutable)</h2><div class="list" style="margin-bottom:16px;">' +
          c.consents.map(function (cn) {
            return '<div class="row"><span class="row__title">' + esc(cn.channel) + ': ' + (cn.granted ? '<span class="pill pill--on">Granted</span>' : '<span class="pill pill--off">Withdrawn</span>') + '</span>' +
              '<span class="row__side">' + when(cn.recorded_at) + '</span>' +
              '<span class="row__meta">Source: ' + esc(cn.source) + ' (ver ' + esc(cn.text_version) + ')</span>' +
              '</div>';
          }).join('') + '</div>';
      }

      var html =
        '<h2>' + esc(c.display_name) + (c.discreet ? ' <span class="pill pill--discreet">Discreet</span>' : '') + '</h2>' +
        '<div style="display:flex; align-items:center; gap:8px; margin: 4px 0 10px; flex-wrap:wrap;">' +
          '<span class="eyebrow" style="margin:0;">' + esc(c.type) + ' · ' + esc(c.stage) + '</span>' +
          '<span class="pill pill--' + esc(c.score_band) + '">' + esc(c.score_band).toUpperCase() + ' ' + esc(c.score) + '/100</span>' +
          '<button class="btn btn--quiet small" id="btn-rescore-contact" style="min-height:28px; padding:0 8px; font-size:.72rem;">↻ Rescore</button>' +
        '</div>' +
        (c.score_reasons && c.score_reasons.length ?
          '<div style="margin: 0 0 14px; display:flex; flex-wrap:wrap; gap:4px;">' +
            c.score_reasons.map(function (r) { return '<span class="pill" style="font-size:.76rem; border-color:rgba(255,255,255,.1);">' + esc(r) + '</span>'; }).join('') +
          '</div>' : '') +
        '<div class="actions" style="margin: 8px 0 16px;">' +
          (emails.length ? '<button class="btn btn--primary" id="btn-toggle-composer">✉ Send Email</button>' : '') +
          (phones.length ? '<a class="btn" href="tel:' + esc(phones[0].value) + '">Call ' + esc(phones[0].value) + '</a>' : '') +
        '</div>' +
        '<form id="email-compose-form" class="card" style="margin: 12px 0 16px; border: 1px solid var(--gold);" hidden>' +
          '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
            '<h2 style="margin:0; font-size:1.05rem; color:var(--gold);">Compose Email to Client</h2>' +
            '<button type="button" class="btn btn--quiet small" id="btn-cancel-compose">Cancel</button>' +
          '</div>' +
          '<label for="compose-to">Recipient</label>' +
          '<input type="email" id="compose-to" value="' + esc(emails[0] ? emails[0].value : '') + '" required />' +
          '<label for="compose-subject">Subject</label>' +
          '<input type="text" id="compose-subject" placeholder="e.g. Following up regarding luxury homes in Pleasanton" required />' +
          '<label for="compose-body">Message</label>' +
          '<textarea id="compose-body" placeholder="Write your personal email here…" style="min-height:120px;" required></textarea>' +
          '<p class="muted small" style="margin:8px 0 12px;">Compass CA DRE# 01989811 signature and one-click unsubscribe link will be automatically appended.</p>' +
          '<button type="submit" class="btn btn--primary" id="btn-send-email-submit">Send Email</button>' +
        '</form>' +
        '<dl class="kv">' +
          kv('Email', emails.map(function (e) { return '<a href="mailto:' + esc(e.value) + '">' + esc(e.value) + '</a>'; }).join(', ')) +
          kv('Phone', phones.map(function (p) { return '<a href="tel:' + esc(p.value) + '">' + esc(p.value) + '</a>'; }).join(', ')) +
          kv('Interest', esc(c.interest)) +
          kv('Budget', esc(c.budget)) +
          kv('Timeline', esc(c.timeline)) +
          kv('Areas', esc((c.areas || []).join(', '))) +
          kv('Source', esc(c.source)) +
          kv('Next Follow-Up', when(c.next_follow_up_at)) +
          kv('Last Inbound', when(c.last_inbound_at)) +
          kv('Last Outbound', when(c.last_outbound_at)) +
          kv('Created', when(c.created_at)) +
        '</dl>' +
        (c.notes ? '<div class="quote"><strong>Notes:</strong>\n' + esc(c.notes) + '</div>' : '') +
        dealsHtml +
        tasksHtml +
        actsHtml +
        consentsHtml +
        '<form id="contact-edit-form" class="card" style="margin-top:16px;">' +
          '<h2>Update Contact Profile</h2>' +
          '<label for="contact-stage">Stage</label>' +
          '<select id="contact-stage">' +
            ['new', 'contacted', 'qualified', 'showing', 'listing_prep', 'offer', 'under_contract', 'closed', 'lost', 'spam', 'past_client'].map(function (s) {
              return '<option' + (s === c.stage ? ' selected' : '') + '>' + s + '</option>';
            }).join('') +
          '</select>' +
          '<label for="contact-type">Type</label>' +
          '<select id="contact-type">' +
            ['lead', 'client', 'past_client', 'sphere', 'agent', 'vendor'].map(function (tp) {
              return '<option' + (tp === c.type ? ' selected' : '') + '>' + tp + '</option>';
            }).join('') +
          '</select>' +
          '<label class="check"><input type="checkbox" id="contact-discreet"' + (c.discreet ? ' checked' : '') + ' /> High-Net-Worth / Discreet Client</label>' +
          '<label for="contact-interest">Interest</label>' +
          '<input type="text" id="contact-interest" value="' + esc(c.interest || '') + '" placeholder="e.g. Buying, Selling, Relocation" />' +
          '<label for="contact-budget">Budget</label>' +
          '<input type="text" id="contact-budget" value="' + esc(c.budget || '') + '" placeholder="e.g. $2.5M - $4M" />' +
          '<label for="contact-timeline">Timeline</label>' +
          '<input type="text" id="contact-timeline" value="' + esc(c.timeline || '') + '" placeholder="e.g. 1-3 months" />' +
          '<label for="contact-notes">Internal Notes</label>' +
          '<textarea id="contact-notes" placeholder="Private notes, conversation details, preferences…">' + esc(c.notes || '') + '</textarea>' +
          '<div class="actions">' +
            '<button type="submit" class="btn btn--primary">Save Changes</button>' +
          '</div>' +
        '</form>';

      openDrawer(html);

      var drawer = $('drawer-body');

      // Email composer bindings
      var toggleComposer = $('btn-toggle-composer');
      var composeForm = $('email-compose-form');
      var cancelComposer = $('btn-cancel-compose');

      if (toggleComposer && composeForm) {
        toggleComposer.onclick = function () {
          composeForm.hidden = !composeForm.hidden;
          if (!composeForm.hidden) $('compose-subject').focus();
        };
      }
      if (cancelComposer && composeForm) {
        cancelComposer.onclick = function () { composeForm.hidden = true; };
      }
      if (composeForm) {
        composeForm.onsubmit = function (e) {
          e.preventDefault();
          var btn = $('btn-send-email-submit');
          btn.disabled = true;
          api('/contacts/' + encodeURIComponent(id) + '/email', 'POST', {
            to_value: $('compose-to').value.trim(),
            subject: $('compose-subject').value.trim(),
            body: $('compose-body').value.trim()
          }).then(function () {
            toast('Email sent and recorded.');
            contactDetail(id);
            contacts();
          }).catch(function (err) {
            fail(err);
            btn.disabled = false;
          });
        };
      }

      // Deal button bindings
      var btnBuyer = $('btn-start-buyer');
      if (btnBuyer) {
        btnBuyer.onclick = function () {
          api('/deals', 'POST', { contact_id: id, pipeline_id: 1 }).then(function () {
            toast('Started Buyer deal.');
            contactDetail(id);
            if (state.view === 'pipeline') pipeline();
            else if (state.view === 'contacts') contacts();
          }).catch(fail);
        };
      }
      var btnSeller = $('btn-start-seller');
      if (btnSeller) {
        btnSeller.onclick = function () {
          api('/deals', 'POST', { contact_id: id, pipeline_id: 2 }).then(function () {
            toast('Started Seller deal.');
            contactDetail(id);
            if (state.view === 'pipeline') pipeline();
            else if (state.view === 'contacts') contacts();
          }).catch(fail);
        };
      }
      drawer.querySelectorAll('.deal-stage-select').forEach(function (sel) {
        sel.onchange = function () {
          var dealId = sel.getAttribute('data-deal-id');
          api('/deals/' + dealId, 'PATCH', { stage_id: sel.value }).then(function (res) {
            toast('Deal moved to ' + (res.deal ? res.deal.stage_name : 'new stage'));
            contactDetail(id);
            if (state.view === 'pipeline') pipeline();
            else if (state.view === 'contacts') contacts();
          }).catch(fail);
        };
      });

      // Task bindings
      var taskForm = $('task-add-form');
      if (taskForm) {
        taskForm.onsubmit = function (e) {
          e.preventDefault();
          api('/tasks', 'POST', {
            contact_id: id,
            title: $('task-add-title').value.trim(),
            due_at: $('task-add-due').value || null
          }).then(function () {
            toast('Task added.');
            contactDetail(id);
            contacts();
          }).catch(fail);
        };
      }
      drawer.querySelectorAll('[data-task-toggle]').forEach(function (chk) {
        chk.onchange = function () {
          var taskId = chk.getAttribute('data-task-toggle');
          var isDone = chk.getAttribute('data-done') === '1';
          api('/tasks/' + taskId, 'PATCH', { done: isDone }).then(function () {
            toast(isDone ? 'Task marked complete.' : 'Task reopened.');
            contactDetail(id);
            contacts();
          }).catch(fail);
        };
      });
      drawer.querySelectorAll('[data-task-del]').forEach(function (delBtn) {
        delBtn.onclick = function (e) {
          e.stopPropagation();
          var taskId = delBtn.getAttribute('data-task-del');
          api('/tasks/' + taskId, 'DELETE').then(function () {
            toast('Task deleted.');
            contactDetail(id);
            contacts();
          }).catch(fail);
        };
      });

      var btnRescore = $('btn-rescore-contact');
      if (btnRescore) {
        btnRescore.onclick = function () {
          btnRescore.disabled = true;
          api('/contacts/' + encodeURIComponent(id) + '/rescore', 'POST').then(function (res) {
            toast('Contact rescored: ' + res.scoring.score + ' (' + res.scoring.score_band + ')');
            contactDetail(id);
            contacts();
          }).catch(fail);
        };
      }

      var form = $('contact-edit-form');
      form.onsubmit = function (e) {
        e.preventDefault();
        api('/contacts/' + encodeURIComponent(id), 'PATCH', {
          stage: $('contact-stage').value,
          type: $('contact-type').value,
          discreet: $('contact-discreet').checked,
          interest: $('contact-interest').value.trim(),
          budget: $('contact-budget').value.trim(),
          timeline: $('contact-timeline').value.trim(),
          notes: $('contact-notes').value
        }).then(function () {
          toast('Contact profile updated.');
          closeDrawer();
          contacts();
        }).catch(fail);
      };
    }).catch(fail);
  }

  /* ---------- Leads ---------- */
  function leads() {
    var f = state.leads;
    var qs = '?limit=' + LIMIT + '&offset=' + f.offset + '&status=' + encodeURIComponent(f.status) + '&type=' + encodeURIComponent(f.type) + '&q=' + encodeURIComponent(f.q);
    api('/leads' + qs).then(function (d) {
      state.statuses = d.statuses;
      var types = ['contact', 'listing', 'valuation', 'concierge', 'private-exclusives'];
      view.innerHTML =
        '<h1>Leads</h1>' +
        '<div class="toolbar">' +
          '<input type="search" id="lq" placeholder="Search name, email, phone, message" value="' + esc(f.q) + '" aria-label="Search leads" />' +
          '<select id="ls" aria-label="Status"><option value="">All statuses</option>' + d.statuses.map(function (s) { return '<option' + (s === f.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          '<select id="lt" aria-label="Form"><option value="">All forms</option>' + types.map(function (s) { return '<option' + (s === f.type ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          '<a class="btn" href="/api/admin/leads.csv">Export CSV</a>' +
        '</div>' +
        (d.leads.length ? '<div class="list">' + d.leads.map(leadRow).join('') + '</div>' : '<div class="empty">No leads match. New inquiries from the website appear here the moment they are submitted.</div>') +
        '<div class="pager"><span>' + (d.total ? (f.offset + 1) + '–' + Math.min(f.offset + LIMIT, d.total) + ' of ' + d.total : '') + '</span><span>' +
          (f.offset > 0 ? '<button class="btn" id="lprev">Newer</button> ' : '') + (f.offset + LIMIT < d.total ? '<button class="btn" id="lnext">Older</button>' : '') + '</span></div>';
      var t;
      $('lq').addEventListener('input', function (e) { clearTimeout(t); t = setTimeout(function () { f.q = e.target.value.trim(); f.offset = 0; leads(); }, 350); });
      $('ls').addEventListener('change', function (e) { f.status = e.target.value; f.offset = 0; leads(); });
      $('lt').addEventListener('change', function (e) { f.type = e.target.value; f.offset = 0; leads(); });
      if ($('lprev')) $('lprev').onclick = function () { f.offset = Math.max(0, f.offset - LIMIT); leads(); };
      if ($('lnext')) $('lnext').onclick = function () { f.offset += LIMIT; leads(); };
      view.querySelectorAll('[data-lead]').forEach(function (b) { b.onclick = function () { leadDetail(b.getAttribute('data-lead')); }; });
      if (f.q) { var i = $('lq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }).catch(fail);
  }
  function leadRow(l) {
    var bits = [l.form_type, l.interest, l.budget, l.timeline, (l.areas || []).join(', ')].filter(Boolean).join(' · ');
    return '<button class="row' + (l.status === 'new' ? ' is-new' : '') + '" data-lead="' + esc(l.lead_id) + '">' +
      '<span class="row__title">' + esc(l.name) + (l.segment === 'sports_entertainment' ? ' <span class="pill">Discreet</span>' : '') + '</span>' +
      '<span class="row__side"><span class="pill pill--' + esc(l.status) + '">' + esc(l.status) + '</span> ' + when(l.received_at) + '</span>' +
      '<span class="row__meta">' + esc(bits) + (l.message ? ' — ' + esc(l.message) : '') + '</span></button>';
  }
  function kv(k, v) { return v ? '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>' : ''; }

  function leadDetail(id) {
    api('/leads/' + encodeURIComponent(id)).then(function (d) {
      var l = d.lead;
      var outboxHtml = '';
      if (l.deliveries && l.deliveries.length) {
        outboxHtml = '<h2>Notifications</h2><div class="list" style="margin-bottom:16px;">' +
          l.deliveries.map(function (dl) {
            return '<div class="row"><span class="row__title">' + esc(dl.channel) + ' (' + esc(dl.status) + ')</span>' +
              '<span class="row__side">' + (dl.status !== 'sent' ? '<button class="btn btn--quiet small" data-retry="' + esc(dl.id) + '">Retry</button>' : 'Sent ' + when(dl.sent_at)) + '</span>' +
              (dl.last_error ? '<span class="row__meta" style="color:var(--red);">' + esc(dl.last_error) + '</span>' : '') +
              '</div>';
          }).join('') + '</div>';
      }

      var html =
        '<h2>' + esc(l.name) + '</h2>' +
        '<p class="eyebrow">' + esc(l.form_type) + ' lead · received ' + when(l.received_at) + '</p>' +
        '<dl class="kv">' +
          kv('Email', '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>') +
          kv('Phone', l.phone ? '<a href="tel:' + esc(l.phone) + '">' + esc(l.phone) + '</a>' : '') +
          kv('Interest', esc(l.interest)) +
          kv('Budget', esc(l.budget)) +
          kv('Timeline', esc(l.timeline)) +
          kv('Areas', esc((l.areas || []).join(', '))) +
          kv('Source page', esc(l.source_page)) +
          kv('Campaign', esc([l.utm && l.utm.source, l.utm && l.utm.campaign].filter(Boolean).join(' / '))) +
        '</dl>' +
        (l.message ? '<div class="quote">' + esc(l.message) + '</div>' : '') +
        outboxHtml +
        '<form id="lead-edit-form" class="card" style="margin-top:16px;">' +
          '<h2>Update Lead</h2>' +
          '<label for="lead-status">Status</label>' +
          '<select id="lead-status">' + (state.statuses || ['new', 'contacted', 'qualified', 'closed', 'lost']).map(function (s) { return '<option' + (s === l.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
          '<label for="lead-followup">Follow-up date</label>' +
          '<input type="date" id="lead-followup" value="' + esc((l.follow_up_at || '').slice(0, 10)) + '" />' +
          '<label for="lead-notes">Internal Notes</label>' +
          '<textarea id="lead-notes" placeholder="Notes on conversation, preferences, next steps...">' + esc(l.notes || '') + '</textarea>' +
          '<div class="actions">' +
            '<button type="submit" class="btn btn--primary">Save Changes</button>' +
            '<button type="button" class="btn btn--danger" id="lead-del-btn">Delete Lead</button>' +
          '</div>' +
        '</form>';

      openDrawer(html);

      var drawer = $('drawer-body');
      drawer.querySelectorAll('[data-retry]').forEach(function (b) {
        b.onclick = function () {
          api('/outbox/' + b.getAttribute('data-retry') + '/retry', 'POST').then(function () {
            toast('Notification queued for retry.');
            leadDetail(id);
          }).catch(fail);
        };
      });

      var form = $('lead-edit-form');
      form.onsubmit = function (e) {
        e.preventDefault();
        api('/leads/' + encodeURIComponent(id), 'PATCH', {
          status: $('lead-status').value,
          follow_up_at: $('lead-followup').value || null,
          notes: $('lead-notes').value
        }).then(function () {
          toast('Lead updated.');
          closeDrawer();
          leads();
        }).catch(fail);
      };

      $('lead-del-btn').onclick = function () {
        if (!confirm('Permanently delete this lead record? This cannot be undone.')) return;
        api('/leads/' + encodeURIComponent(id), 'DELETE').then(function () {
          toast('Lead deleted.');
          closeDrawer();
          leads();
        }).catch(fail);
      };
    }).catch(fail);
  }

  /* ---------- Chat Logs (AI Concierge) ---------- */
  function chatLogs() {
    var f = state.chatLogs || (state.chatLogs = { q: '', offset: 0 });
    var qs = '?limit=' + LIMIT + '&offset=' + f.offset + '&q=' + encodeURIComponent(f.q);
    api('/chat-sessions' + qs).then(function (d) {
      var sessions = d.sessions || [];
      view.innerHTML =
        '<h1>AI Chat Logs</h1>' +
        '<div class="toolbar">' +
          '<input type="search" id="chat-q" placeholder="Search location, message, session ID..." value="' + esc(f.q) + '" aria-label="Search chat logs" />' +
        '</div>' +
        (sessions.length ? '<div class="list">' + sessions.map(chatSessionRow).join('') + '</div>' : '<div class="empty">No visitor chat sessions recorded yet. Incoming conversations with AI Steve appear here live.</div>') +
        '<div class="pager"><span>' + (d.total ? (f.offset + 1) + '–' + Math.min(f.offset + LIMIT, d.total) + ' of ' + d.total : '') + '</span><span>' +
          (f.offset > 0 ? '<button class="btn" id="chat-prev">Newer</button> ' : '') + (f.offset + LIMIT < d.total ? '<button class="btn" id="chat-next">Older</button>' : '') + '</span></div>';

      var t;
      $('chat-q').addEventListener('input', function (e) {
        clearTimeout(t);
        t = setTimeout(function () { f.q = e.target.value.trim(); f.offset = 0; chatLogs(); }, 350);
      });
      if ($('chat-prev')) $('chat-prev').onclick = function () { f.offset = Math.max(0, f.offset - LIMIT); chatLogs(); };
      if ($('chat-next')) $('chat-next').onclick = function () { f.offset += LIMIT; chatLogs(); };

      view.querySelectorAll('[data-chat-session]').forEach(function (b) {
        b.onclick = function () { chatSessionDetail(b.getAttribute('data-chat-session')); };
      });
      if (f.q) { var i = $('chat-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }).catch(fail);
  }

  function chatSessionRow(s) {
    var loc = s.city ? '📍 ' + s.city + (s.region ? ', ' + s.region : '') : '📍 Bay Area, CA';
    var dev = s.device ? (s.device === 'mobile' ? '📱 Mobile' : '💻 Desktop') : '💻 Web';
    var contactPill = s.contact_name ? '<span class="pill pill--hot" style="margin-left:6px;">👤 ' + esc(s.contact_name) + '</span>' : '';
    var intentPill = s.intent ? '<span class="pill" style="margin-left:6px; font-size:0.7rem;">' + esc(s.intent) + '</span>' : '';

    return '<button class="row is-new" data-chat-session="' + esc(s.session_id) + '">' +
      '<span class="row__title" style="display:flex; align-items:center; flex-wrap:wrap;">' +
        '<strong>' + esc(loc) + '</strong>' +
        contactPill +
        intentPill +
      '</span>' +
      '<span class="row__side"><span class="pill pill--qualified">' + (s.message_count || 1) + ' msgs</span> ' + when(s.updated_at || s.created_at) + '</span>' +
      '<span class="row__meta">' + esc(dev) + (s.page_url ? ' · On: ' + esc(s.page_url) : '') + (s.last_message ? ' — "' + esc(s.last_message.slice(0, 100)) + (s.last_message.length > 100 ? '…' : '') + '"' : '') + '</span>' +
    '</button>';
  }

  function chatSessionDetail(sessionId) {
    api('/chat-sessions/' + encodeURIComponent(sessionId)).then(function (d) {
      var s = d.session;
      var msgs = s.messages || [];

      var transcriptHtml = '';
      if (msgs.length) {
        transcriptHtml = msgs.map(function (m) {
          var isUser = m.role === 'user';
          var bubbleBg = isUser ? 'rgba(216,165,90,.16)' : 'rgba(255,255,255,.05)';
          var bubbleBorder = isUser ? 'var(--gold)' : 'rgba(255,255,255,.1)';
          var roleName = isUser ? 'Visitor' : 'AI Steve (Assistant)';
          var roleColor = isUser ? 'var(--gold)' : '#A9A398';

          var propsHtml = '';
          if (m.properties && m.properties.length) {
            propsHtml = '<div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">' +
              m.properties.map(function (p) {
                var pPrice = p.price ? (typeof p.price === 'number' ? '$' + p.price.toLocaleString() : p.price) : '';
                return '<div style="padding:6px 10px; background:rgba(0,0,0,.3); border-radius:6px; font-size:0.8rem; display:flex; justify-content:space-between;">' +
                  '<span>🏠 <strong>' + esc(p.address || p.title) + '</strong> (' + esc(p.city) + ')</span>' +
                  '<span style="color:var(--gold);">' + esc(pPrice) + '</span>' +
                '</div>';
              }).join('') +
            '</div>';
          }

          return '<div style="margin-bottom:12px; padding:12px; background:' + bubbleBg + '; border:1px solid ' + bubbleBorder + '; border-radius:8px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
              '<strong style="color:' + roleColor + '; font-size:0.85rem;">' + esc(roleName) + '</strong>' +
              '<span class="muted small">' + when(m.created_at) + '</span>' +
            '</div>' +
            '<div style="white-space:pre-wrap; line-height:1.5; font-size:0.9rem;">' + esc(m.content) + '</div>' +
            propsHtml +
          '</div>';
        }).join('');
      } else {
        transcriptHtml = '<p class="muted">No messages in transcript.</p>';
      }

      var convertBtnHtml = '';
      if (s.contact_id) {
        convertBtnHtml = '<button type="button" class="btn btn--primary" id="btn-view-linked-contact">View Contact Profile →</button>';
      } else {
        convertBtnHtml = '<button type="button" class="btn btn--primary" id="btn-open-convert-chat">+ Convert to CRM Contact</button>';
      }

      var html =
        '<h2>Chat Conversation</h2>' +
        '<p class="eyebrow">Session ' + esc(s.session_id.slice(0, 16)) + '… · ' + (s.city ? esc(s.city) + ', ' + esc(s.region || 'CA') : 'Bay Area') + '</p>' +
        '<div class="actions" style="margin: 8px 0 16px;">' +
          convertBtnHtml +
        '</div>' +
        '<div id="chat-convert-panel" class="card" style="margin: 12px 0 16px; border: 1px solid var(--gold);" hidden>' +
          '<h2 style="margin:0 0 8px; font-size:1.05rem; color:var(--gold);">Convert to Pipeline Contact</h2>' +
          '<form id="form-convert-chat">' +
            '<label for="conv-name">Full Name</label>' +
            '<input type="text" id="conv-name" placeholder="Client Name" value="' + esc(s.contact_name || '') + '" required />' +
            '<div class="two">' +
              '<div>' +
                '<label for="conv-email">Email</label>' +
                '<input type="email" id="conv-email" placeholder="client@example.com" value="' + esc(s.contact_email || '') + '" />' +
              '</div>' +
              '<div>' +
                '<label for="conv-phone">Phone</label>' +
                '<input type="tel" id="conv-phone" placeholder="(925) 555-0199" value="' + esc(s.contact_phone || '') + '" />' +
              '</div>' +
            '</div>' +
            '<div class="actions" style="margin-top:12px;">' +
              '<button type="submit" class="btn btn--primary">Save as Contact</button>' +
              '<button type="button" class="btn btn--quiet" id="btn-cancel-convert">Cancel</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
        '<dl class="kv">' +
          kv('Visitor Location', (s.city ? esc(s.city) + ', ' + esc(s.region || 'CA') + ' ' + esc(s.country || 'USA') : 'Unknown')) +
          kv('IP Address', esc(s.ip || 'Hidden')) +
          kv('Device & Browser', esc((s.device || 'desktop') + (s.user_agent ? ' · ' + s.user_agent.slice(0, 45) + '…' : ''))) +
          kv('Page Viewed', esc(s.page_url || '/')) +
          kv('Campaign Source', esc([s.utm_source, s.utm_medium, s.utm_campaign].filter(Boolean).join(' / ') || 'Direct')) +
          kv('Referrer', esc(s.referrer || 'None')) +
          kv('First Message', when(s.created_at)) +
          kv('Last Active', when(s.updated_at)) +
        '</dl>' +
        '<h2 style="margin-top:20px; margin-bottom:10px;">Full Transcript (' + msgs.length + ' messages)</h2>' +
        '<div class="list">' + transcriptHtml + '</div>';

      openDrawer(html);

      var viewContactBtn = $('btn-view-linked-contact');
      if (viewContactBtn) {
        viewContactBtn.onclick = function () {
          closeDrawer();
          contactDetail(s.contact_id);
        };
      }

      var openConvertBtn = $('btn-open-convert-chat');
      var convertPanel = $('chat-convert-panel');
      if (openConvertBtn && convertPanel) {
        openConvertBtn.onclick = function () {
          convertPanel.hidden = false;
          openConvertBtn.hidden = true;
          $('conv-name').focus();
        };
        $('btn-cancel-convert').onclick = function () {
          convertPanel.hidden = true;
          openConvertBtn.hidden = false;
        };
        $('form-convert-chat').onsubmit = function (e) {
          e.preventDefault();
          var payload = {
            name: $('conv-name').value.trim(),
            email: $('conv-email').value.trim(),
            phone: $('conv-phone').value.trim()
          };
          api('/chat-sessions/' + encodeURIComponent(sessionId) + '/convert', 'POST', payload).then(function (res) {
            toast('Contact created & linked to chat!');
            closeDrawer();
            chatLogs();
            if (res.contact_id) contactDetail(res.contact_id);
          }).catch(fail);
        };
      }
    }).catch(fail);
  }


  /* ---------- Listings ---------- */
  function listings() {
    api('/listings').then(function (d) {
      var all = d.listings || [];
      view.innerHTML =
        '<h1>Listings</h1>' +
        '<div class="toolbar">' +
          '<input type="search" id="list-q" placeholder="Search address, city, MLS..." aria-label="Search listings" />' +
          '<button class="btn btn--primary" id="list-add-btn">+ Add Listing</button>' +
        '</div>' +
        '<div class="list" id="list-container">' +
          (all.length ? all.map(listingRow).join('') : '<div class="empty">No listings in database.</div>') +
        '</div>';

      function filter(q) {
        var query = (q || '').toLowerCase();
        var matched = all.filter(function (item) {
          return !query || (item.address && item.address.toLowerCase().indexOf(query) !== -1) ||
                 (item.city && item.city.toLowerCase().indexOf(query) !== -1) ||
                 (item.mls_id && item.mls_id.toLowerCase().indexOf(query) !== -1);
        });
        $('list-container').innerHTML = matched.length ? matched.map(listingRow).join('') : '<div class="empty">No matching listings found.</div>';
        bindListingClicks();
      }

      function bindListingClicks() {
        view.querySelectorAll('[data-listing-id]').forEach(function (b) {
          b.onclick = function () {
            var lid = b.getAttribute('data-listing-id');
            var item = all.find(function (x) { return x.id === lid; });
            if (item) listingEdit(item);
          };
        });
      }

      var t;
      $('list-q').oninput = function (e) {
        clearTimeout(t);
        t = setTimeout(function () { filter(e.target.value.trim()); }, 300);
      };

      $('list-add-btn').onclick = function () {
        listingEdit(null);
      };

      bindListingClicks();
    }).catch(fail);
  }

  function listingRow(item) {
    var photo = item.photo || '../assets/img/hero-portfolio.jpg';
    if (photo.indexOf('http') !== 0 && photo.indexOf('/') !== 0 && photo.indexOf('../') !== 0) {
      photo = '../' + photo;
    }
    return '<button class="row row--media" data-listing-id="' + esc(item.id) + '">' +
      '<img class="thumb" src="' + esc(photo) + '" alt="" loading="lazy" />' +
      '<div><span class="row__title">' + esc(item.address) + ', ' + esc(item.city) + '</span>' +
      '<span class="row__meta">' + esc(item.price) + ' · ' + (item.beds || 0) + ' bd / ' + (item.baths || 0) + ' ba · ' + esc(item.sqft || '') + ' sq ft</span></div>' +
      '<div class="row__side"><span class="pill pill--' + (item.status === 'Active' ? 'on' : 'closed') + '">' + esc(item.status) + '</span> ' +
      (item.published ? '<span class="pill pill--on">Published</span>' : '<span class="pill pill--off">Hidden</span>') +
      '</div></button>';
  }

  function listingEdit(item) {
    var isNew = !item;
    item = item || { id: '', address: '', city: 'Pleasanton', state: 'CA', zip: '94566', price: '$1,500,000', status: 'Active', beds: 3, baths: 2, sqft: '2,000', photo: 'assets/img/danville-genoa.jpg', published: 1, sort_order: 10 };

    var html =
      '<h2>' + (isNew ? 'New Listing' : 'Edit Listing') + '</h2>' +
      '<form id="listing-form" class="card">' +
        '<label for="lf-addr">Street Address</label>' +
        '<input type="text" id="lf-addr" value="' + esc(item.address) + '" required />' +
        '<div class="two">' +
          '<div><label for="lf-city">City</label><input type="text" id="lf-city" value="' + esc(item.city) + '" required /></div>' +
          '<div><label for="lf-price">Price (e.g. $1,850,000)</label><input type="text" id="lf-price" value="' + esc(item.price) + '" required /></div>' +
        '</div>' +
        '<div class="two">' +
          '<div><label for="lf-beds">Beds</label><input type="number" id="lf-beds" value="' + (item.beds || 0) + '" /></div>' +
          '<div><label for="lf-baths">Baths</label><input type="number" step="0.5" id="lf-baths" value="' + (item.baths || 0) + '" /></div>' +
        '</div>' +
        '<label for="lf-status">Status</label>' +
        '<select id="lf-status">' +
          '<option value="Active"' + (item.status === 'Active' ? ' selected' : '') + '>Active</option>' +
          '<option value="Pending"' + (item.status === 'Pending' ? ' selected' : '') + '>Pending</option>' +
          '<option value="Sold"' + (item.status === 'Sold' ? ' selected' : '') + '>Sold</option>' +
        '</select>' +
        '<label for="lf-photo">Photo Path / URL</label>' +
        '<input type="text" id="lf-photo" value="' + esc(item.photo || '') + '" />' +
        '<label class="check"><input type="checkbox" id="lf-published"' + (item.published ? ' checked' : '') + ' /> Published on live website</label>' +
        '<div class="actions" style="margin-top:20px;">' +
          '<button type="submit" class="btn btn--primary">Save Listing</button>' +
          '<button type="button" class="btn btn--quiet" data-close>Cancel</button>' +
        '</div>' +
      '</form>';

    openDrawer(html);

    $('listing-form').onsubmit = function (e) {
      e.preventDefault();
      var payload = {
        address: $('lf-addr').value.trim(),
        city: $('lf-city').value.trim(),
        state: 'CA',
        zip: item.zip || '94566',
        price: $('lf-price').value.trim(),
        beds: Number($('lf-beds').value) || 0,
        baths: Number($('lf-baths').value) || 0,
        status: $('lf-status').value,
        photo: $('lf-photo').value.trim(),
        published: $('lf-published').checked ? 1 : 0
      };

      var req = isNew ? api('/listings', 'POST', payload) : api('/listings/' + encodeURIComponent(item.id), 'PATCH', payload);
      req.then(function () {
        toast('Listing saved successfully.');
        closeDrawer();
        listings();
      }).catch(fail);
    };
  }

  /* ---------- Reviews ---------- */
  function reviews() {
    api('/testimonials').then(function (d) {
      var all = d.testimonials || [];
      view.innerHTML =
        '<h1>Client Reviews</h1>' +
        '<div class="toolbar">' +
          '<p class="muted small" style="margin:0;flex:1;">Reviews shown on the home carousel and About page. Uncheck "published" to hold back reviews pending permission.</p>' +
          '<button class="btn btn--primary" id="rev-add-btn">+ Add Review</button>' +
        '</div>' +
        '<div class="list">' +
          (all.length ? all.map(reviewRow).join('') : '<div class="empty">No reviews in database.</div>') +
        '</div>';

      view.querySelectorAll('[data-review-id]').forEach(function (b) {
        b.onclick = function () {
          var rid = Number(b.getAttribute('data-review-id'));
          var item = all.find(function (x) { return x.id === rid; });
          if (item) reviewEdit(item);
        };
      });

      $('rev-add-btn').onclick = function () {
        reviewEdit(null);
      };
    }).catch(fail);
  }

  function reviewRow(item) {
    return '<button class="row" data-review-id="' + esc(item.id) + '">' +
      '<span class="row__title">' + esc(item.name) + (item.context ? ' · <span class="muted small">' + esc(item.context) + '</span>' : '') + '</span>' +
      '<span class="row__side">' +
        (item.permission_on_file ? '<span class="pill pill--on">Permission on file</span> ' : '<span class="pill pill--off">No flag</span> ') +
        (item.published ? '<span class="pill pill--on">Published</span>' : '<span class="pill pill--off">Held back</span>') +
      '</span>' +
      '<span class="row__meta">“' + esc(item.quote) + '”</span>' +
    '</button>';
  }

  function reviewEdit(item) {
    var isNew = !item;
    item = item || { id: 0, quote: '', name: '', context: 'Pleasanton Client', source: 'Google', permission_on_file: 1, published: 1 };

    var html =
      '<h2>' + (isNew ? 'New Review' : 'Edit Review') + '</h2>' +
      '<form id="review-form" class="card">' +
        '<label for="rf-quote">Review Quote (exact text)</label>' +
        '<textarea id="rf-quote" required>' + esc(item.quote) + '</textarea>' +
        '<div class="two">' +
          '<div><label for="rf-name">Client Name (e.g. Thomas G.)</label><input type="text" id="rf-name" value="' + esc(item.name) + '" required /></div>' +
          '<div><label for="rf-context">Context (e.g. Pleasanton Home Buyer)</label><input type="text" id="rf-context" value="' + esc(item.context || '') + '" /></div>' +
        '</div>' +
        '<label for="rf-source">Platform / Source</label>' +
        '<input type="text" id="rf-source" value="' + esc(item.source || 'Google Review') + '" />' +
        '<label class="check"><input type="checkbox" id="rf-perm"' + (item.permission_on_file ? ' checked' : '') + ' /> Written client permission on file</label>' +
        '<label class="check"><input type="checkbox" id="rf-pub"' + (item.published ? ' checked' : '') + ' /> Published on live website</label>' +
        '<div class="actions" style="margin-top:20px;">' +
          '<button type="submit" class="btn btn--primary">Save Review</button>' +
          (!isNew ? '<button type="button" class="btn btn--danger" id="rf-del-btn">Delete Review</button>' : '') +
          '<button type="button" class="btn btn--quiet" data-close>Cancel</button>' +
        '</div>' +
      '</form>';

    openDrawer(html);

    $('review-form').onsubmit = function (e) {
      e.preventDefault();
      var payload = {
        quote: $('rf-quote').value.trim(),
        name: $('rf-name').value.trim(),
        context: $('rf-context').value.trim(),
        source: $('rf-source').value.trim(),
        permission_on_file: $('rf-perm').checked ? 1 : 0,
        published: $('rf-pub').checked ? 1 : 0
      };

      var req = isNew ? api('/testimonials', 'POST', payload) : api('/testimonials/' + item.id, 'PATCH', payload);
      req.then(function () {
        toast('Review saved.');
        closeDrawer();
        reviews();
      }).catch(fail);
    };

    if ($('rf-del-btn')) {
      $('rf-del-btn').onclick = function () {
        if (!confirm('Permanently delete this client review?')) return;
        api('/testimonials/' + item.id, 'DELETE').then(function () {
          toast('Review deleted.');
          closeDrawer();
          reviews();
        }).catch(fail);
      };
    }
  }

  /* ---------- Subscribers ---------- */
  function subscribers() {
    api('/subscribers').then(function (d) {
      var all = d.subscribers || [];
      view.innerHTML =
        '<h1>Newsletter Subscribers</h1>' +
        '<div class="toolbar">' +
          '<p class="muted small" style="margin:0;flex:1;">Subscribers who signed up via the website newsletter form.</p>' +
          '<a class="btn" href="/api/admin/subscribers.csv">Export CSV</a>' +
        '</div>' +
        (all.length ?
          '<div class="card" style="padding:0;overflow-x:auto;">' +
            '<table>' +
              '<thead><tr><th>Email</th><th>Subscribed At</th><th>Consent</th><th>Source Page</th></tr></thead>' +
              '<tbody>' + all.map(function (s) {
                return '<tr><td><strong>' + esc(s.email) + '</strong></td><td>' + when(s.created_at) + '</td><td>' + (s.consent ? '<span class="pill pill--on">Opt-in</span>' : 'No') + '</td><td>' + esc(s.source_page || '/') + '</td></tr>';
              }).join('') + '</tbody>' +
            '</table>' +
          '</div>' : '<div class="empty">No newsletter subscribers yet.</div>');
    }).catch(fail);
  }

  /* ---------- Activity ---------- */
  function activity() {
    api('/audit').then(function (d) {
      var all = d.entries || [];
      view.innerHTML =
        '<h1>Activity & Audit Log</h1>' +
        '<div class="toolbar">' +
          '<p class="muted small" style="margin:0;flex:1;">Audit trail of all administrative actions, logins, exports, and updates.</p>' +
        '</div>' +
        (all.length ?
          '<div class="card" style="padding:0;overflow-x:auto;">' +
            '<table>' +
              '<thead><tr><th>Timestamp</th><th>Action</th><th>Detail</th><th>IP Hash</th></tr></thead>' +
              '<tbody>' + all.map(function (a) {
                return '<tr><td>' + when(a.at) + '</td><td><span class="pill">' + esc(a.action) + '</span></td><td>' + esc(a.detail || '—') + '</td><td class="muted small">' + esc(a.ip_hash || '—') + '</td></tr>';
              }).join('') + '</tbody>' +
            '</table>' +
          '</div>' : '<div class="empty">No activity logged yet.</div>');
    }).catch(fail);
  }

  /* ---------- Web Push & PWA Helpers ---------- */
  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function getPushStatus() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { supported: false, subscribed: false };
    }
    try {
      var timeout = new Promise(function (resolve) { setTimeout(resolve, 350, null); });
      var regPromise = navigator.serviceWorker.getRegistration('/admin/').catch(function () { return null; });
      var reg = await Promise.race([regPromise, timeout]);
      if (!reg || !reg.pushManager) {
        return {
          supported: true,
          subscribed: false,
          permission: typeof Notification !== 'undefined' ? Notification.permission : 'default'
        };
      }
      var sub = await reg.pushManager.getSubscription().catch(function () { return null; });
      return {
        supported: true,
        subscribed: Boolean(sub),
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
        subscription: sub
      };
    } catch (_) {
      return { supported: false, subscribed: false };
    }
  }

  async function toggleWebPush(enable) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Web Push is not supported in this browser.');
    }
    var reg = await (navigator.serviceWorker.getRegistration('/admin/').catch(function () { return null; }));
    if (!reg) {
      reg = await navigator.serviceWorker.ready;
    }
    if (enable) {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        throw new Error('Notification permission was ' + perm);
      }
      var d = await api('/push/vapid-key');
      if (!d.publicKey) throw new Error('VAPID public key unavailable.');
      var convertedVapidKey = urlBase64ToUint8Array(d.publicKey);
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });
      var subJson = sub.toJSON();
      await api('/push/subscribe', 'POST', {
        endpoint: sub.endpoint,
        keys: subJson.keys
      });
      return true;
    } else {
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api('/push/subscribe', 'DELETE', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      return false;
    }
  }

  /* ---------- Settings Screen ---------- */
  function settings() {
    api('/settings').then(function (d) {
      var s = d.settings || {};
      var u = d.usage || {};
      var b = d.last_backup;

      var aiPct = u.ai_pct || 0;
      var emailPct = u.email_pct || 0;

      view.innerHTML =
        '<h1>Settings & Operations</h1>' +
        '<div class="two" style="gap:20px;margin-top:16px;">' +
          // Column 1: Notifications & Communication
          '<div>' +
            '<div class="card" style="margin-bottom:16px;">' +
              '<h3>Web Push Notifications</h3>' +
              '<p class="muted small">Instant alerts on your phone or desktop when a new lead submits an inquiry.</p>' +
              '<div id="push-status-container" style="margin:14px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
                '<span class="pill">Checking push status…</span>' +
              '</div>' +
              '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);">' +
                '<button id="btn-push-test" class="btn" disabled style="font-size:.78rem;">Send Test Push</button>' +
                '<span id="push-test-msg" class="muted small" style="margin-left:10px;"></span>' +
              '</div>' +
            '</div>' +

            '<div class="card">' +
              '<h3>Agent Profile & Signature</h3>' +
              '<form id="settings-form">' +
                '<label class="small muted" for="set-sender-name">Sender Name</label>' +
                '<input id="set-sender-name" value="' + esc(s.sender_name || '') + '" maxlength="100" style="margin-bottom:12px;" required />' +

                '<label class="small muted" for="set-working-hours">Working Hours</label>' +
                '<input id="set-working-hours" value="' + esc(s.working_hours || '') + '" maxlength="50" style="margin-bottom:12px;" />' +

                '<label class="small muted" for="set-sender-signature">Email & Outbound Signature</label>' +
                '<textarea id="set-sender-signature" rows="4" style="margin-bottom:14px;">' + esc(s.sender_signature || '') + '</textarea>' +

                '<div style="display:flex;align-items:center;gap:12px;">' +
                  '<button type="submit" class="btn btn--primary">Save Settings</button>' +
                  '<span id="settings-save-msg" class="muted small"></span>' +
                '</div>' +
              '</form>' +
            '</div>' +
          '</div>' +

          // Column 2: Budget Caps & Safety Backups
          '<div>' +
            '<div class="card" style="margin-bottom:16px;">' +
              '<h3>Monthly Budget & Usage</h3>' +
              '<p class="muted small">Hard spending caps enforced in code. Banners appear if a cap is hit.</p>' +

              '<div style="margin:16px 0;">' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:.86rem;">' +
                  '<span>Gemini AI Budget</span>' +
                  '<strong>$' + (u.ai_spend_usd || 0).toFixed(2) + ' / $' + (u.ai_budget_cap_usd || 25).toFixed(2) + '</strong>' +
                '</div>' +
                '<div style="height:8px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;">' +
                  '<div style="height:100%;width:' + aiPct + '%;background:var(--gold);"></div>' +
                '</div>' +
              '</div>' +

              '<div style="margin:16px 0;">' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:.86rem;">' +
                  '<span>Email Deliveries</span>' +
                  '<strong>$' + (u.email_spend_usd || 0).toFixed(2) + ' / $' + (u.email_budget_cap_usd || 20).toFixed(2) + ' (' + (u.email_count_mtd || 0) + ' sent)</strong>' +
                '</div>' +
                '<div style="height:8px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden;">' +
                  '<div style="height:100%;width:' + emailPct + '%;background:#8FB37A;"></div>' +
                '</div>' +
              '</div>' +

              '<p class="muted small" style="margin-top:14px;">Billing cycle: <strong>' + esc(u.month || '') + '</strong></p>' +
              '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);">' +
                '<div class="muted small" style="margin-bottom:6px;"><strong>Draft Quality Signals (MTD):</strong></div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                  '<span class="pill pill--closed">Unedited: ' + ((u.signals && u.signals.unedited) || 0) + '</span>' +
                  '<span class="pill">Edited: ' + ((u.signals && u.signals.edited) || 0) + '</span>' +
                  '<span class="pill">Redrafted: ' + ((u.signals && u.signals.redrafted) || 0) + '</span>' +
                  '<span class="pill pill--off">Skipped: ' + ((u.signals && u.signals.skipped) || 0) + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="card">' +
              '<h3>Database Safety & Backups</h3>' +
              '<p class="muted small">Nightly online SQLite backup with integrity check and 14-day retention rotation.</p>' +
              '<div style="margin:12px 0;font-size:.88rem;">' +
                (b ? '<div>Last backup: <strong>' + when(b.timestamp) + '</strong></div><div class="muted small" style="margin-top:4px;">' + esc(b.details || '') + '</div>' :
                     '<div class="muted">No backup record found yet.</div>') +
              '</div>' +
              '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);">' +
                '<button id="btn-backup-now" class="btn" style="font-size:.78rem;">Run Backup Now</button>' +
                '<span id="backup-run-msg" class="muted small" style="margin-left:10px;"></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      // Asynchronously resolve Web Push status without blocking the UI
      var pushInfo = { supported: false, subscribed: false };
      getPushStatus().then(function (info) {
        pushInfo = info || { supported: false, subscribed: false };
        var container = $('push-status-container');
        if (!container) return;
        var pushLabel = !pushInfo.supported ? '<span class="pill pill--off">Not supported in this browser</span>'
          : (pushInfo.subscribed ? '<span class="pill pill--on">Active on this device</span>' : '<span class="pill pill--off">Disabled on this device</span>');
        container.innerHTML =
          pushLabel +
          (pushInfo.supported ? (pushInfo.subscribed ?
            '<button id="btn-push-toggle" class="btn btn--danger" style="font-size:.78rem;">Disable notifications</button>' :
            '<button id="btn-push-toggle" class="btn btn--primary" style="font-size:.78rem;">Enable notifications</button>') : '');

        var btnTest = $('btn-push-test');
        if (btnTest) btnTest.disabled = !pushInfo.subscribed;

        var btnToggle = $('btn-push-toggle');
        if (btnToggle) {
          btnToggle.addEventListener('click', async function () {
            btnToggle.disabled = true;
            try {
              await toggleWebPush(!pushInfo.subscribed);
              toast(pushInfo.subscribed ? 'Web push disabled on this device.' : 'Web push enabled successfully!');
              settings();
            } catch (err) {
              fail(err);
              btnToggle.disabled = false;
            }
          });
        }
      }).catch(function () {
        var container = $('push-status-container');
        if (container) container.innerHTML = '<span class="pill pill--off">Status unavailable</span>';
      });

      // Event listeners for Push Test
      var btnTest = $('btn-push-test');
      if (btnTest) {
        btnTest.addEventListener('click', function () {
          btnTest.disabled = true;
          var msg = $('push-test-msg');
          msg.textContent = 'Sending…';
          api('/push/test', 'POST').then(function (res) {
            msg.textContent = 'Test push sent (' + res.sent + ' delivered).';
            toast('Test notification sent!');
            setTimeout(function () { btnTest.disabled = false; }, 2000);
          }).catch(function (err) {
            msg.textContent = 'Failed: ' + err.message;
            btnTest.disabled = false;
          });
        });
      }

      // Event listeners for Settings Form
      var f = $('settings-form');
      if (f) {
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var saveBtn = f.querySelector('button[type=submit]');
          saveBtn.disabled = true;
          var msg = $('settings-save-msg');
          msg.textContent = 'Saving…';
          api('/settings', 'PATCH', {
            sender_name: $('set-sender-name').value.trim(),
            working_hours: $('set-working-hours').value.trim(),
            sender_signature: $('set-sender-signature').value.trim()
          }).then(function () {
            msg.textContent = 'Settings saved.';
            toast('Settings saved successfully.');
            saveBtn.disabled = false;
            setTimeout(function () { msg.textContent = ''; }, 3000);
          }).catch(function (err) {
            fail(err);
            saveBtn.disabled = false;
            msg.textContent = '';
          });
        });
      }

      // Event listener for Database Backup
      var btnBackup = $('btn-backup-now');
      if (btnBackup) {
        btnBackup.addEventListener('click', function () {
          btnBackup.disabled = true;
          var msg = $('backup-run-msg');
          msg.textContent = 'Running VACUUM INTO backup…';
          api('/backup/run', 'POST').then(function (res) {
            msg.textContent = 'Backup completed: ' + res.backup.filename;
            toast('Database backup completed successfully!');
            setTimeout(function () { settings(); }, 1500);
          }).catch(function (err) {
            msg.textContent = 'Backup failed: ' + err.message;
            btnBackup.disabled = false;
          });
        });
      }
    }).catch(fail);
  }

  // Register Service Worker for PWA shell and Web Push
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).then(function (reg) {
      console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
    }).catch(function (err) {
      console.warn('[PWA] ServiceWorker registration failed:', err);
    });
  }

  // PWA Installation handling
  var deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var banner = $('pwa-install-banner');
    if (banner) banner.hidden = false;
  });

  var pwaInstallBtn = $('pwa-install-btn');
  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', function () {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function (choice) {
          if (choice.outcome === 'accepted') {
            toast('SLJR Co-Pilot PWA installed!');
          }
          deferredInstallPrompt = null;
          var banner = $('pwa-install-banner');
          if (banner) banner.hidden = true;
        });
      } else {
        toast('To install: tap Share (iOS) or Menu (Android), then tap "Add to Home Screen"');
      }
    });
  }
  var pwaDismissBtn = $('pwa-dismiss-btn');
  if (pwaDismissBtn) {
    pwaDismissBtn.addEventListener('click', function () {
      var banner = $('pwa-install-banner');
      if (banner) banner.hidden = true;
    });
  }

  // Floating Voice Co-Pilot Orb Click Handler
  var voiceOrb = $('copilot-voice-orb');
  if (voiceOrb) {
    voiceOrb.addEventListener('click', function () {
      if (state.view !== 'copilot') {
        go('copilot');
        setTimeout(function () {
          toggleRecording();
        }, 200);
      } else {
        toggleRecording();
      }
    });
  }

  function openMobileMenuDrawer() {
    var html =
      '<div style="padding: 10px 4px;">' +
        '<div style="text-align: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--line);">' +
          '<strong style="font-size: 1.1rem; letter-spacing: 0.16em; text-transform: uppercase; color: #FFF; display: block;">Steven Lenz Jr</strong>' +
          '<div style="margin: 4px 0 6px;"><img src="/assets/brand/sl-compass-banner.png" alt="Compass" style="height: 18px; margin: 0 auto; display: block;" /></div>' +
          '<span style="font-size: 0.65rem; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); display: block;">Back Office & Co-Pilot</span>' +
        '</div>' +
        '<div class="mobile-drawer-menu" style="display: grid; gap: 8px;">' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'copilot\');">⚡ Co-Pilot AI Assistant</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'today\');">📋 Today\'s Action Plan</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'pipeline\');">📊 Pipeline</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'contacts\');">👥 Contacts</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'tasks\');">📝 Tasks</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'leads\');">🔔 Leads & Inquiries</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'chat-logs\');">💬 Chat Logs</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'dashboard\');">📈 Dashboard & KPIs</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'listings\');">🏡 Property Listings</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'reviews\');">⭐ Client Reviews</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'subscribers\');">📬 Newsletter Subscribers</button>' +
          '<button class="btn btn--quiet" style="justify-content: flex-start; width: 100%; font-size: 0.92rem;" onclick="closeDrawer(); go(\'activity\');">📜 Activity & Audit Log</button>' +
          '<div style="margin: 12px 0 8px; border-top: 1px solid var(--line);"></div>' +
          '<button class="btn btn--primary" style="justify-content: center; width: 100%;" onclick="closeDrawer(); go(\'settings\');">⚙️ System Settings</button>' +
          '<a href="/" target="_blank" rel="noopener" class="btn btn--quiet" style="justify-content: center; width: 100%; margin-top: 6px;">View Public Site ↗</a>' +
          '<button class="btn btn--danger" style="justify-content: center; width: 100%; margin-top: 6px;" onclick="closeDrawer(); $(\'logout\').click();">Sign Out</button>' +
        '</div>' +
      '</div>';
    openDrawer(html);
  }

  // Mobile Bottom Navigation Bar Handler
  var bottomNav = $('bottom-nav');
  if (bottomNav) {
    bottomNav.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-nav]');
      if (!btn) return;
      var target = btn.getAttribute('data-nav');
      if (target === 'more') {
        openMobileMenuDrawer();
      } else if (target === 'copilot') {
        go('copilot');
        if (!copilotState.isRecording) {
          setTimeout(function () {
            toggleRecording();
          }, 200);
        }
      } else {
        go(target);
      }
    });
  }

  // Check session on load
  api('/me').then(function (me) {
    if (me.signed_in) showApp(me);
    else showLogin(me.configured ? '' : 'Welcome! Set your admin password using "npm run admin:password" to enable login.');
  }).catch(function (err) {
    showLogin(err.message);
  });
})();
