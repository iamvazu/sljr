/* ============================================================================
   scroll-world.js — oso95/scroll-world Blob-backed inertial scrub engine
   Adapted for Steven Lenz Jr. | Compass ("See Real Estate Through a New Lenz")
   ============================================================================ */
(function (global) {
  'use strict';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  function mountScrollWorld(container, config) {
    if (!container || !config || !Array.isArray(config.sections) || !config.sections.length) return null;

    var reduce = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var coarse = global.matchMedia('(hover: none) and (pointer: coarse)').matches;
    var smallMQ = global.matchMedia('(max-width: 860px)');
    var saveData = Boolean(navigator.connection && navigator.connection.saveData);
    var isMobile = function () { return coarse || smallMQ.matches; };

    var SECTIONS = config.sections;
    var CONNECTORS = config.connectors || [];
    var CONNECTORS_M = config.connectorsMobile || [];
    var DIVE_W = config.diveScroll || 1.4;
    var CONN_W = config.connScroll || 0.9;
    var CROSSFADE = config.crossfade != null ? config.crossfade : 0.22;
    var N = SECTIONS.length;

    var pageMode = safeGet('sw_view_as_page') === '1';
    document.body.classList.toggle('sw-page-mode', pageMode);

    container.classList.add('sw-root');

    // Build segment chain
    var SEGMENTS = [];
    SECTIONS.forEach(function (s, i) {
      var dive = {
        kind: 'dive', si: i,
        clip: s.clip, clipM: s.clipMobile,
        still: s.still, stillM: s.stillMobile,
        accent: s.accent, w: s.scroll || DIVE_W, linger: s.linger || 0,
        el: null, img: null, video: null, hasClip: false,
        loading: false, ready: false, cur: 0, target: 0, visible: false,
        start: 0, end: 0
      };
      SEGMENTS.push(dive);
      s._seg = dive;
      if (i < N - 1 && CONNECTORS[i]) {
        SEGMENTS.push({
          kind: 'conn', si: i,
          clip: CONNECTORS[i], clipM: CONNECTORS_M[i],
          still: SECTIONS[i + 1].still, stillM: SECTIONS[i + 1].stillMobile,
          accent: SECTIONS[i + 1].accent, w: CONN_W, linger: 0,
          el: null, img: null, video: null, hasClip: false,
          loading: false, ready: false, cur: 0, target: 0, visible: false,
          start: 0, end: 0
        });
      }
    });
    var NSEG = SEGMENTS.length;

    // DOM references (topbar & track live in index.html for semantic + SEO HTML)
    var stage = document.getElementById('sw-stage');
    var nav = document.getElementById('sw-nav');
    var route = document.getElementById('sw-route');
    var hint = document.getElementById('sw-hint');
    var scrollbarFill = document.getElementById('sw-scrollbar-fill');
    var track = document.getElementById('sw-track');
    var toggleBtn = document.getElementById('view-as-page-toggle');

    var copyNodes = Array.from(document.querySelectorAll('.sw-copy[data-scene]'));
    var panelNodes = Array.from(document.querySelectorAll('.sw-panel[data-scene]'));
    var dots = [];
    var navItems = [];

    // Populate video/still stage
    if (stage) {
      stage.innerHTML = '';
      SEGMENTS.forEach(function (s, idx) {
        var scene = document.createElement('div');
        scene.className = 'sw-scene';
        scene.style.setProperty('--sw-accent', '#D8A55A');
        scene.style.zIndex = String(10 + idx);
        var img = document.createElement('img');
        img.className = 'sw-scene__still';
        img.alt = '';
        img.decoding = 'async';
        img.loading = idx === 0 ? 'eager' : 'lazy';
        if (idx === 0) img.setAttribute('fetchpriority', 'high');
        var poster = (isMobile() && s.stillM) ? s.stillM : s.still;
        if (poster) img.src = poster;
        scene.appendChild(img);
        stage.appendChild(scene);
        s.el = scene;
        s.img = img;
      });
    }

    // Build top pill nav & right route dots
    SECTIONS.forEach(function (s, i) {
      if (nav) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sw-nav__item' + (i === 0 ? ' is-active' : '');
        b.textContent = s.label || '';
        b.addEventListener('click', function () { jumpTo(i); });
        nav.appendChild(b);
        navItems.push(b);
      }
      if (route) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'sw-route__dot' + (i === 0 ? ' is-active' : '');
        dot.style.setProperty('--sw-accent', '#D8A55A');
        dot.setAttribute('aria-label', 'Jump to ' + (s.label || 'section'));
        dot.innerHTML = '<span class="sw-route__label">' + (s.label || '') + '</span><i></i>';
        dot.addEventListener('click', function () { jumpTo(i); });
        route.appendChild(dot);
        dots.push(dot);
      }
    });

    function clamp(x, a, b) {
      if (a === undefined) a = 0;
      if (b === undefined) b = 1;
      return Math.min(b, Math.max(a, x));
    }
    function smooth(x) { x = clamp(x); return x * x * (3 - 2 * x); }
    function lingerEase(x, L) {
      L = clamp(L);
      var c = x - 0.5;
      return (1 - L) * x + L * (4 * c * c * c + 0.5);
    }

    var vh = global.innerHeight;
    var totalW = 0;
    var activeIndex = -1;
    var ticking = false;
    var laidOutW = global.innerWidth;
    var userReady = false;

    function alignRootsPortrait() {
      if (global.innerWidth <= 960) {
        var mw = document.querySelector('.meet-portrait__meta-wrap');
        if (mw) mw.style.marginTop = '';
        return;
      }
      var statsBar = document.querySelector('#roots .sw-stats-bar');
      var metaWrap = document.querySelector('.meet-portrait__meta-wrap');
      var portraitRing = document.querySelector('.meet-portrait__ring');
      var rootsPanel = document.querySelector('.sw-panel[data-scene="roots"]');
      if (!statsBar || !metaWrap || !rootsPanel || !portraitRing) return;

      var statsRect = statsBar.getBoundingClientRect();
      var panelRect = rootsPanel.getBoundingClientRect();
      var ringH = portraitRing.offsetHeight;

      var targetOffset = statsRect.top - panelRect.top;
      var gap = Math.max(16, Math.round(targetOffset - ringH));
      metaWrap.style.marginTop = gap + 'px';
    }

    function layout() {
      vh = global.innerHeight;
      laidOutW = global.innerWidth;
      var off = 0;
      SEGMENTS.forEach(function (s) {
        s.start = off * vh;
        off += s.w;
        s.end = off * vh;
      });
      totalW = off;
      if (track && !pageMode) {
        track.style.height = Math.round(totalW * vh + vh * 0.4) + 'px';
      }
      alignRootsPortrait();
      read();
    }

    function jumpTo(i) {
      if (pageMode) {
        var target = document.getElementById(SECTIONS[i].id);
        if (target) target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
        return;
      }
      var seg = SECTIONS[i]._seg;
      var pos = i === 0 ? 0 : (i === N - 1 ? seg.start + (seg.end - seg.start) * 0.65 : seg.start + (seg.end - seg.start) * 0.5);
      global.scrollTo({ top: pos, behavior: reduce ? 'auto' : 'smooth' });
    }

    function scrollToSection(id) {
      var idx = SECTIONS.findIndex(function (s) { return s.id === id; });
      if (idx >= 0) jumpTo(idx);
    }

    function primeVideo(v) {
      if (!isMobile() || !v) return;
      try {
        var p = v.play();
        if (p && p.then) p.then(function () { try { v.pause(); } catch (_) {} }).catch(function () {});
      } catch (_) {}
    }

    function loadClip(s) {
      if (reduce || saveData || pageMode || s.loading || !s.clip) return;
      s.loading = true;
      var url = (isMobile() && s.clipM) ? s.clipM : s.clip;
      fetch(url)
        .then(function (r) { return r.ok ? r.blob() : Promise.reject(new Error('404')); })
        .then(function (blob) {
          var v = document.createElement('video');
          v.className = 'sw-scene__video';
          v.muted = true;
          v.playsInline = true;
          v.preload = 'auto';
          v.setAttribute('muted', '');
          v.setAttribute('playsinline', '');
          v.setAttribute('webkit-playsinline', '');
          v.setAttribute('aria-hidden', 'true');
          v.src = URL.createObjectURL(blob);
          v.addEventListener('loadedmetadata', function () { s.ready = true; read(); });
          v.addEventListener('seeked', function () { s.el.classList.add('has-clip'); }, { once: true });
          v.addEventListener('loadeddata', function () {
            try { v.pause(); } catch (_) {}
            if (userReady) primeVideo(v);
          });
          s.el.appendChild(v);
          s.video = v;
          s.hasClip = true;
        })
        .catch(function () { s.loading = false; });
    }

    function read() {
      if (pageMode) return;
      var y = global.scrollY || global.pageYOffset || 0;
      var fade = CROSSFADE * vh;
      var ci = 0;
      for (var i = 0; i < NSEG; i++) {
        if (y >= SEGMENTS[i].start) ci = i;
      }

      for (var i = 0; i < NSEG; i++) {
        var s = SEGMENTS[i];
        if (y > s.start - 2.5 * vh && y < s.end + 2.5 * vh) loadClip(s);
        var local = clamp((y - s.start) / Math.max(1, s.end - s.start), 0, 1);
        s.target = s.linger ? lingerEase(local, s.linger) : local;

        var op = 0;
        var vis = false;

        if (i === 0) {
          // Base first scene
          if (NSEG > 1) {
            // Next scene (1) finishes fading in at SEGMENTS[1].start == s.end
            if (y >= s.end) {
              op = 0;
              vis = false;
            } else {
              op = 1;
              vis = true;
            }
          } else {
            op = 1;
            vis = true;
          }
        } else {
          // Scenes 1..NSEG-1: incoming transition window [s.start - fade, s.start]
          if (y < s.start - fade) {
            op = 0;
            vis = false;
          } else if (y < s.start) {
            op = smooth((y - (s.start - fade)) / fade);
            vis = op > 0.005;
          } else if (i === NSEG - 1 || y < s.end) {
            op = 1;
            vis = true;
          } else {
            // Past s.end: next scene (i+1) is now covering us completely
            op = 0;
            vis = false;
          }
        }

        if (s.el) {
          s.el.style.opacity = op;
          s.el.style.visibility = vis ? 'visible' : 'hidden';
          s.visible = vis;
        }
      }

      // Update left editorial copy & right/interactive panels
      for (var i = 0; i < N; i++) {
        var seg = SECTIONS[i]._seg;
        var span = Math.max(1, seg.end - seg.start);
        var pr = clamp((y - seg.start) / span, 0, 1);
        var before = y < seg.start;
        var after = y > seg.end;
        var cop = 0;

        if (i === 0) {
          // Hero scene: fully visible from start, stays solid until 35% through scroll, then fades out smoothly
          cop = after ? 0 : (pr < 0.35 ? 1 : smooth(1 - (pr - 0.35) / 0.50));
        } else if (i === N - 1) {
          // Final scene (Terrace / Contact): fades in smoothly, stays solid to the bottom
          cop = before ? 0 : (pr > 0.30 ? 1 : smooth(pr / 0.30));
        } else {
          // Middle scenes: generous reading plateau (full 1.0 opacity between 0.18 and 0.82)
          if (before || after) {
            cop = 0;
          } else if (pr < 0.18) {
            cop = smooth(pr / 0.18);
          } else if (pr > 0.82) {
            cop = smooth((1 - pr) / 0.18);
          } else {
            cop = 1;
          }
        }

        var c = copyNodes[i];
        if (c) {
          c.style.opacity = cop;
          c.style.transform = reduce ? 'none' : 'translate3d(0, ' + ((0.5 - pr) * 2.0).toFixed(2) + 'vh, 0)';
          c.style.pointerEvents = cop > 0.45 ? 'auto' : 'none';
        }
        var p = panelNodes[i];
        if (p) {
          p.style.opacity = cop;
          p.style.pointerEvents = cop > 0.45 ? 'auto' : 'none';
          if (SECTIONS[i].id !== 'terrace') {
            p.style.transform = reduce ? 'none' : 'translate3d(0, ' + ((0.5 - pr) * 2.2).toFixed(2) + 'vh, 0)';
          }
        }
      }

      var cur = SEGMENTS[ci];
      var near = clamp(cur.kind === 'dive' ? cur.si : (((y - cur.start) / (cur.end - cur.start)) > 0.5 ? cur.si + 1 : cur.si), 0, N - 1);
      if (near !== activeIndex) {
        activeIndex = near;
        dots.forEach(function (d, k) { d.classList.toggle('is-active', k === near); });
        navItems.forEach(function (n, k) { n.classList.toggle('is-active', k === near); });
        container.style.setProperty('--sw-accent', '#D8A55A');
        if (near === 1) alignRootsPortrait();
      }

      if (scrollbarFill) {
        scrollbarFill.style.transform = 'scaleX(' + clamp(y / Math.max(1, totalW * vh)) + ')';
      }
      if (hint) {
        hint.style.opacity = clamp(1 - y / (0.45 * vh));
      }
      ticking = false;
    }

    function raf() {
      var eps = isMobile() ? 0.015 : 0.005;
      for (var i = 0; i < NSEG; i++) {
        var s = SEGMENTS[i];
        if (!s.hasClip || !s.ready || !s.video) continue;
        s.cur += (s.target - s.cur) * (reduce ? 1 : 0.18);
        if (s.video.seeking) continue;
        if (!s.visible && Math.abs(s.cur - s.target) < 0.002) continue;
        var dur = s.video.duration || 1;
        var t = clamp(s.cur, 0, 0.998) * dur;
        if (Math.abs(s.video.currentTime - t) > eps) {
          try { s.video.currentTime = t; } catch (_) {}
        }
      }
      global.requestAnimationFrame(raf);
    }

    function onFirstGesture() {
      if (userReady) return;
      userReady = true;
      SEGMENTS.forEach(function (s) { primeVideo(s.video); });
    }

    function applyPageModeBtn() {
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-pressed', pageMode ? 'true' : 'false');
        toggleBtn.textContent = pageMode ? 'Experience 3D Tour' : 'View as page';
      }
    }

    function togglePageMode() {
      pageMode = !pageMode;
      safeSet('sw_view_as_page', pageMode ? '1' : '0');
      document.body.classList.toggle('sw-page-mode', pageMode);
      applyPageModeBtn();
      if (!pageMode) {
        layout();
      } else {
        copyNodes.forEach(function (c) { c.style.opacity = ''; c.style.transform = ''; c.style.pointerEvents = ''; });
        panelNodes.forEach(function (p) { p.style.opacity = ''; p.style.transform = ''; p.style.pointerEvents = ''; });
      }
    }

    if (toggleBtn) {
      applyPageModeBtn();
      toggleBtn.addEventListener('click', togglePageMode);
    }

    global.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
    global.addEventListener('touchstart', onFirstGesture, { once: true, passive: true });
    global.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(read);
      }
    }, { passive: true });
    global.addEventListener('resize', function () {
      if (coarse && global.innerWidth === laidOutW) return;
      layout();
    });
    global.addEventListener('orientationchange', layout);
    global.addEventListener('load', layout);

    layout();
    global.requestAnimationFrame(raf);

    var api = { scrollToSection: scrollToSection, togglePageMode: togglePageMode };
    global.__scrollWorld = api;
    return api;
  }

  global.mountScrollWorld = mountScrollWorld;
})(window);
