/* Protrac – Service Worker
   Macht den Tracker als App installierbar und offline nutzbar.
   Strategie „Netzwerk zuerst“: Online kommt immer die neueste Version (Updates wie gewohnt),
   offline wird die zuletzt geladene Version aus dem Zwischenspeicher verwendet.
   Daten liegen weiterhin im Browser-Speicher bzw. auf dem eigenen Server – nicht hier. */
'use strict';

const CACHE = 'protrac-app-v1';
// Grundgerüst, das beim Installieren schon für den Offline-Start abgelegt wird
const SHELL = ['./', './index.html', './styles.css', './i18n.js', './lang-en.js', './app.js', './manifest.webmanifest', './icon-180.png', './icon-512.png', './icon-maskable-512.png', './logo.png', './favicon-32.png', './favicon-64.png', './favicon.ico'];
// Nie zwischenspeichern: Server-Schnittstelle, Versions- und Neuigkeiten-Abfrage
const BYPASS = /\/(api\.php|version\.json|changelog\.json)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || BYPASS.test(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        // Ältere Fassungen derselben Datei (anderes ?v=) entfernen, damit der Speicher nicht wächst
        if (url.search) for (const k of await cache.keys()) { const ku = new URL(k.url); if (ku.pathname === url.pathname && ku.search !== url.search) await cache.delete(k); }
        await cache.put(req, res.clone());
        if (req.mode === 'navigate') await cache.put('./index.html', res.clone());
      }
      return res;
    } catch (err) {
      const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('./index.html') || await cache.match('./') : undefined);
      if (hit) return hit;
      throw err;
    }
  })());
});
