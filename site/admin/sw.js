'use strict';

// Steven Lenz Jr. CRM Admin Shell Service Worker
// Cache version: bump whenever the admin shell static assets change
const SHELL_CACHE = 'sljr-admin-shell-v4';

const SHELL_ASSETS = [
  '/admin/',
  '/admin/index.html',
  '/admin/admin.css?v=9',
  '/admin/admin.js?v=9',
  '/admin/manifest.webmanifest',
  '/assets/brand/favicon.png',
  '/assets/brand/sl-monogram.png',
  '/assets/brand/compass-sl-white.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll skipped non-critical asset:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch policy:
// 1. All /api/ routes are strictly network-only and NEVER cached.
// 2. Non-GET requests are strictly network-only.
// 3. Admin shell assets follow a Network-First strategy with Cache fallback.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Rule: API responses are never cached
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') {
    return;
  }

  // Shell assets (HTML, CSS, JS, images inside admin or assets)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(SHELL_CACHE).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.mode === 'navigate') {
            return caches.match('/admin/');
          }
        });
      })
  );
});

// Web Push event handling
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Steven Lenz Jr. CRM';
  const options = {
    body: data.body || 'New update received.',
    icon: data.icon || '/assets/brand/favicon.png',
    badge: data.badge || '/assets/brand/favicon.png',
    tag: data.tag || 'sljr-lead-notification',
    renotify: true,
    data: {
      url: (data.data && data.data.url) || data.url || '/admin/#contacts'
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/admin/#contacts';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/admin') && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

