// WorldPulse service worker: app shell cached for speed, data network-first
// with the last copy as an offline fallback. Nothing is sent anywhere.
const SHELL = 'wp-shell-v2'
const DATA = 'wp-data-v1'
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon-192.png']))) })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.includes('/data/')) {
    e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(DATA).then((c) => c.put(e.request, copy)) } return r })
      .catch(() => caches.match(e.request).then((r) => r || new Response('{"error":"offline"}', { status: 503, headers: { 'content-type': 'application/json' } }))))
    return
  }
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); return r })))
    return
  }
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); return r }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))))
})
