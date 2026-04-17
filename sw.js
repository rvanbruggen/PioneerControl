/**
 * Service Worker — Pioneer Amp Control
 *
 * Strategy:
 *   - App shell (HTML/CSS/JS/icons): cache-first, update in background
 *   - sources.md: network-first, cache fallback (config may change on NAS)
 *   - Amp requests (EventHandler.asp / StatusHandler.asp): network-only, never cached
 *
 * Bump CACHE_NAME whenever the app shell changes so old caches are evicted.
 */

var CACHE_NAME = 'pioneer-amp-v0.9.6';

var APP_SHELL = [
    '/',
    '/index.html',
    '/app.js',
    '/style.css',
    '/manifest.json',
    '/icon.svg'
];

// ---- Install: pre-cache the app shell ----
self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(APP_SHELL).then(function () {
                // sources.md is optional — don't let a 404 abort the install
                return cache.add('/sources.md').catch(function () {});
            });
        }).then(function () {
            return self.skipWaiting();
        })
    );
});

// ---- Activate: remove stale caches ----
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// ---- Fetch ----
self.addEventListener('fetch', function (e) {
    var url = e.request.url;

    // Amp communication is always network-only — never serve from cache
    if (url.indexOf('EventHandler.asp') !== -1 || url.indexOf('StatusHandler.asp') !== -1) {
        return; // let the browser handle it normally
    }

    // sources.md: network-first so NAS config changes are picked up,
    // fall back to cached copy when offline
    if (url.indexOf('sources.md') !== -1) {
        e.respondWith(
            fetch(e.request)
                .then(function (response) {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(e.request, response.clone());
                        });
                    }
                    return response;
                })
                .catch(function () {
                    return caches.match(e.request);
                })
        );
        return;
    }

    // Everything else: cache-first, fetch and cache if missing
    e.respondWith(
        caches.match(e.request).then(function (cached) {
            if (cached) {
                // Serve from cache immediately; refresh in the background
                fetch(e.request).then(function (response) {
                    if (response.ok) {
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(e.request, response.clone());
                        });
                    }
                }).catch(function () {});
                return cached;
            }
            // Not in cache — fetch, cache, and return
            return fetch(e.request).then(function (response) {
                if (response.ok) {
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(e.request, response.clone());
                    });
                }
                return response;
            });
        })
    );
});
