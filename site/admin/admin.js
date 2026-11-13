/* Back Office — single-page admin for leads, listings and reviews.
   Talks only to /api/admin/*. No data is stored in the browser. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var view = $('view');
  var state = { view: 'dashboard', leads: { status: '', type: '', q: '', offset: 0 }, statuses: [] };
  var LIMIT = 50;

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
    go(state.view);
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
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]'); if (b) go(b.getAttribute('data-view'));
  });
  function go(name) {
    state.view = name;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-view') === name); });
    view.innerHTML = '<p class="muted">Loading…</p>';
    ({ dashboard: dashboard, leads: leads, listings: listings, reviews: reviews, subscribers: subscribers, activity: activity })[name]();
  }

  /* ---------- Drawer ---------- */
  function openDrawer(html) { $('drawer-body').innerHTML = html; $('drawer').hidden = false; $('drawer').querySelector('.drawer__close').focus(); }
  function closeDrawer() { $('drawer').hidden = true; $('drawer-body').innerHTML = ''; }
  $('drawer').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeDrawer(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('drawer').hidden) closeDrawer(); });

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
  function kv(k, v) { return v ? '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>' : ''; }
