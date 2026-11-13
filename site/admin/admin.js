/* Back Office — single-page admin for leads, listings, reviews, and activity.
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
    var routes = { dashboard: dashboard, leads: leads, listings: listings, reviews: reviews, subscribers: subscribers, activity: activity };
    if (routes[name]) routes[name]();
    else dashboard();
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

  // Check session on load
  api('/me').then(function (me) {
    if (me.signed_in) showApp(me);
    else showLogin(me.configured ? '' : 'Welcome! Set your admin password using "npm run admin:password" to enable login.');
  }).catch(function (err) {
    showLogin(err.message);
  });
})();
