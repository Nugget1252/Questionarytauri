/* =========================================================================
 * Questionary Offline App-Shell Service Worker
 * Precaches local code, vendor libraries, fonts, icons, and SQLite DB.
 * Caches accessed PDFs and supports offline fallback on Web / PWA.
 * ========================================================================= */

const CACHE_SHELL = 'questionary-shell-v240';
const CACHE_DOCS = 'questionary-docs-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './pdfviewer.html',
  './manifest.json',
  './questionary.db',
  './database.db',
  './css/styles.css',
  './css/features.css',
  './css/enhanced-features.css',
  './css/vendor/pdf_viewer.min.css',
  './css/vendor/fontawesome/css/all.min.css',
  './css/vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './css/vendor/fontawesome/webfonts/fa-regular-400.woff2',
  './css/vendor/fontawesome/webfonts/fa-brands-400.woff2',
  './fonts/fonts.css',
  './fonts/font_0_rP2Wp2ywxg089UriCZaSExdy3sGt9zz86GPwyKK58VXh.woff2',
  './fonts/font_1_rP2Wp2ywxg089UriCZaSExdy3sGt9zz86GPwyKy58Q.woff2',
  './fonts/font_2_rP2Hp2ywxg089UriCZ2IHSeH.woff2',
  './fonts/font_3_rP2Hp2ywxg089UriCZOIHQ.woff2',
  './fonts/font_4_tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx3cwhsk.woff2',
  './fonts/font_5_tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxTcwhsk.woff2',
  './fonts/font_6_tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxPcwhsk.woff2',
  './fonts/font_7_tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx_cwhsk.woff2',
  './fonts/font_8_tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx7cwhsk.woff2',
  './fonts/font_9_tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2',
  './fonts/font_10_LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko70yyygA.woff2',
  './fonts/font_11_LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko50yyygA.woff2',
  './fonts/font_12_LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko40yyygA.woff2',
  './fonts/font_13_LDIoaomQNQcsA88c7O9yZ4KMCoOg4Ko20yw.woff2',
  './js/offlineEngine.js',
  './js/hotUpdater.js',
  './js/contentUpdater.js',
  './js/downloadManager.js',
  './js/features.js',
  './js/accessibility.js',
  './js/enhancedFlashcards.js',
  './js/enhancedNotes.js',
  './js/studyRoom.js',
  './js/studyRoomEnhanced.js',
  './js/notifications.js',
  './js/app.js',
  './js/peerjs-patched.js',
  './js/sql-wasm.js',
  './js/sql-wasm.wasm',
  './js/vendor/purify.min.js',
  './js/vendor/marked.min.js',
  './js/vendor/mammoth.browser.min.js',
  './js/vendor/pdf.min.mjs',
  './js/vendor/pdf.worker.min.mjs',
  './assets/logo.png',
  './assets/icons/192x192.png',
  './assets/icons/512x512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/pwa-maskable-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            const req = new Request(url, { cache: 'reload' });
            const res = await fetch(req);
            if (res && res.ok) {
              await cache.put(url, res);
            }
          } catch (e) {
            // Skip missing optional asset without aborting full SW install
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== CACHE_SHELL && k !== CACHE_DOCS)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data.type === 'GET_CACHE_STATUS') {
    Promise.all([
      caches.open(CACHE_SHELL).then((c) => c.keys()),
      caches.open(CACHE_DOCS).then((c) => c.keys())
    ]).then(([shellKeys, docKeys]) => {
      const payload = {
        shellCount: shellKeys.length,
        docsCount: docKeys.length,
        expectedShellCount: PRECACHE_URLS.length,
        version: CACHE_SHELL
      };
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(payload);
      }
    }).catch(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ shellCount: 0, docsCount: 0, expectedShellCount: PRECACHE_URLS.length });
      }
    });
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never serve stale cache for API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'Offline', offline: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Document PDFs: Cache-first + background cache write when online
  if (url.pathname.startsWith('/documents/') || url.pathname.startsWith('/documentshd/')) {
    event.respondWith(
      caches.open(CACHE_DOCS).then(async (cache) => {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const networkRes = await fetch(req);
          if (networkRes && networkRes.ok && networkRes.status === 200) {
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        } catch (err) {
          return new Response('Offline: Document has not been cached yet.', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        }
      })
    );
    return;
  }

  // Database (.db), HTML, JS, CSS: Network-first with offline cache fallback
  const isDynamicAppAsset =
    req.mode === 'navigate' ||
    url.pathname === '/' ||
    /\.(db|html|js|mjs|css|wasm|json)$/i.test(url.pathname);

  if (isDynamicAppAsset) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(async (cache) => {
        try {
          const freshRes = await fetch(req);
          if (freshRes && freshRes.ok && freshRes.status === 200) {
            cache.put(url.pathname === '/' ? './index.html' : req, freshRes.clone());
            return freshRes;
          }
        } catch (err) {}

        const cached = await cache.match(req, { ignoreSearch: true }) || await cache.match(url.pathname);
        if (cached) return cached;

        if (req.mode === 'navigate') {
          const fallback = await cache.match('./index.html', { ignoreSearch: true });
          if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Static fonts & icons: Cache-first with online fallback
  event.respondWith(
    caches.open(CACHE_SHELL).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true }) || await cache.match(url.pathname);
      if (cached) return cached;

      try {
        const networkRes = await fetch(req);
        if (networkRes && networkRes.ok && networkRes.status === 200) {
          cache.put(req, networkRes.clone());
        }
        return networkRes;
      } catch (err) {
        return new Response('Offline', { status: 503 });
      }
    })
  );
});
