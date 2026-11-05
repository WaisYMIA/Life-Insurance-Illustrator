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

const CACHE_VERSION = 'plan-illustrator-2026.11.6';
// Paths are relative to this file's own location (self.location), so the
// same list works whether sw.js is served from a domain root (an Express
// deployment) or from a GitHub Pages project subpath — both keep sw.js,
// manifest.json, plan-illustrator.html and icons/ side by side.
const APP_SHELL = [
  'plan-illustrator.html',
  'manifest.json',
  'app-config.js',
  'help-content.js',
  'agent-tools.js',
  'agent-apps.js',
  'agent-growth.js',
  'market-data.js',
  'market-compare.js',
  'daily-quote.js',
  'daily-quotes.js',
  'daily-library.js',
  'calculator.js',
  'custom-products.js',
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

// Only these files must be cached for the app to install; everything else is added if it can be and
// fetched later if it cannot, so one missing file never stops the whole app from working offline.
const ESSENTIAL = ['plan-illustrator.html', 'manifest.json', 'app-config.js'];

// Fetch with a time limit, so a connection that is "up" but not answering never leaves the app waiting.
function timedFetch(req, ms, init) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  return fetch(req, Object.assign({}, init || {}, ctl ? { signal: ctl.signal } : {})).finally(() => { if (timer) clearTimeout(timer); });
}

// Store every app file for offline use. Shared by install and by the page's "update now" (which clears the stores first).
async function precache() {
  {
    const cache = await caches.open(CACHE_VERSION);
    const results = await Promise.all(APP_SHELL.map(async (u) => {
      try {
        const res = await timedFetch(new Request(u, { cache: 'reload' }), 20000);
        if (!res || !res.ok) throw new Error('bad status ' + (res && res.status));
        await cache.put(u, res); return true;
      } catch (e) { return false; }
    }));
    // The app page itself must be there, otherwise installing would give a worker with nothing to serve offline.
    const missing = ESSENTIAL.filter((u, i) => !results[APP_SHELL.indexOf(u)]);
    if (missing.length) throw new Error('Could not cache: ' + missing.join(', '));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
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

// Pages that are the app itself: the site root, index.html, the app page and the Node host's /app route,
// with or without a query string. When offline all of them open the stored app page.
const BASE = new URL('./', self.location).pathname;
function isAppNavigation(req, url) {
  if (req.mode !== 'navigate') return false;
  const p = url.pathname;
  return p === BASE || p === BASE + 'index.html' || p === BASE + 'plan-illustrator.html' || p === BASE + 'app' || p === BASE + 'app/';
}
const offlineLike = () => self.navigator && self.navigator.onLine === false;

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
  // the app learns a newer (or mandatory) version exists. Offline it simply fails and the app carries on.
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(timedFetch(new Request(req, { cache: 'no-store' }), 8000));
    return;
  }

  // Deployment settings: network first (so a changed backend address takes effect), but never wait long:
  // after 3 seconds, or offline, the stored copy is used so the app always opens quickly.
  if (url.pathname.endsWith('/app-config.js')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      if (offlineLike()) { const hit = await cache.match(req, { ignoreSearch: true }); if (hit) return hit; }
      try {
        const res = await timedFetch(new Request(req, { cache: 'no-store' }), 3000);
        if (res && res.status === 200) cache.put(url.pathname.split('/').pop(), res.clone());
        return res;
      } catch (e) {
        const hit = await cache.match(req, { ignoreSearch: true }) || await cache.match('app-config.js');
        return hit || new Response('window.APP_CONFIG=window.APP_CONFIG||{};', { headers: { 'Content-Type': 'application/javascript' } });
      }
    })());
    return;
  }

  // The app itself: open the stored page straight away (even for "/", "index.html" or a URL with ?...),
  // and refresh it in the background only when there is a connection.
  if (isAppNavigation(req, url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      const hit = await cache.match('plan-illustrator.html');
      if (hit) {
        if (!offlineLike()) event.waitUntil(timedFetch(new Request('plan-illustrator.html', { cache: 'no-cache' }), 15000).then((r) => { if (r && r.status === 200) return cache.put('plan-illustrator.html', r); }).catch(() => {}));
        return hit;
      }
      try {
        const res = await timedFetch(req, 15000);
        if (res && res.status === 200 && url.pathname.endsWith('plan-illustrator.html')) cache.put('plan-illustrator.html', res.clone());
        return res;
      }
      catch (e) { return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Plan Illustrator</title><body style="font-family:system-ui;padding:24px"><h2>Plan Illustrator</h2><p>This is the first time the app is opening on this device and there is no internet. Connect once and open the app; after that it works offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    })());
    return;
  }

  // Stale-while-revalidate for the other app files and any other same-origin GET: the stored copy is used
  // at once; it is refreshed in the background only when online, and never waits more than 15 seconds.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const refresh = () => timedFetch(req, 15000).then((res) => { if (res && res.status === 200) cache.put(req, res.clone()); return res; });
      if (cached) {
        if (!offlineLike()) event.waitUntil(refresh().catch(() => {}));
        return cached;
      }
      try { return await refresh(); }
      catch (e) { return new Response('Offline and not cached yet.', { status: 503, statusText: 'Offline' }); }
    })
  );
});

// The page can ask a freshly installed worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'PRECACHE') {
    const port = event.ports && event.ports[0];
    event.waitUntil(precache().then(() => port && port.postMessage({ ok: true }), () => port && port.postMessage({ ok: false })));
  }
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
