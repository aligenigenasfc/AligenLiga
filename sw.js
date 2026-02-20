// ═══════════════════════════════════════════════════════
//  AlienígenasFC — Service Worker (PWA offline support)
// ═══════════════════════════════════════════════════════

const CACHE_NAME = 'alienigenasfc-v1';

// App shell files to cache for offline use
const APP_SHELL = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './firebase-config.js',
    './manifest.json',
];

// Install: cache the app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for API/Firebase, Cache-first for app shell
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // For Firebase/Google APIs: always network (Firestore handles its own offline cache)
    if (url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('firebaseapp.com')) {
        return; // Let browser handle normally
    }

    // For Google Fonts: cache-first
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    // App shell: cache-first, fallback to network
    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
                // Update cache with fresh version
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => cached); // If network fails, use cache

            return cached || fetchPromise;
        })
    );
});
