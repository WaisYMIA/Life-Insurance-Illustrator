/**
 * Service worker for the Plan Illustrator PWA.
 *
 * Strategy:
 *  - App shell (the illustrator page, manifest, icons) is cached so the app
 *    installs and launches offline. Cache-first, with a background refresh
 *    (stale-while-revalidate) so an update deployed to the server is picked
 *    up on the next launch without the person ever seeing a stale asset for
 *    more than one load.
 *  - Everything under /api/ (OTP, premium quotes, illustrations, rate
 *    tables) is NEVER served from cache. Insurance figures must always come
 *    from the live engine/rate data on the server — a cached quote could be
 *    wrong the moment rates change. Network-only; if there's no network the
 *    request simply fails, same as it would for a non-PWA page.
 */
'use strict';

const CACHE_VERSION = 'plan-illustrator-2026.10.23';
// Paths are relative to this file's own location (self.location), so the
// same list works whether sw.js is served from a domain root (an Express
// deployment) or from a GitHub Pages project subpath — both keep sw.js,
// manifest.json, plan-illustrator.html and icons/ side by side.
const APP_SHELL = [
  'plan-illustrator.html',
  'manifest.json',
  'app-config.js',
  'help-content.js',
  'icons/icon-72.png',
  'icons/icon-96.png',
  'icons/icon-128.png',
  'icons/icon-144.png',
  'icons/icon-152.png',
  'icons/icon-192.png',
  'icons/icon-384.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never intercept POST (OTP, compute, uploads, etc.)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin requests

  // Never cache API traffic — always hit the network for live data.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // The update-control file must always reflect the live server, never a stored copy — it is how
  // the app learns a newer (or mandatory) version exists.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(new Request(req, { cache: 'no-store' })));
    return;
  }

  // Deployment settings: network first (so a changed backend address takes effect), cached copy offline.
  if (url.pathname.endsWith('/app-config.js')) {
    event.respondWith(
      fetch(new Request(req, { cache: 'no-store' })).then((res) => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || new Response('window.APP_CONFIG=window.APP_CONFIG||{};', { headers: { 'Content-Type': 'application/javascript' } })))
    );
    return;
  }

  // Stale-while-revalidate for the app shell and any other same-origin GET.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Serve the cached copy immediately; refresh the cache in the background.
        networkFetch.catch(() => {});
        return cached;
      }
      const fresh = await networkFetch;
      return fresh || new Response('Offline and not cached yet.', { status: 503, statusText: 'Offline' });
    })
  );
});

// The page can ask a freshly installed worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Periodic Background Sync (installed Android PWAs, when the browser allows it): wake up now and then, even
// with the app closed, and fetch the newest app files so the next launch is already current.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-update') {
    event.waitUntil(
      fetch('version.json', { cache: 'no-store' }).catch(() => null).then(() => self.registration.update())
    );
  }
});
