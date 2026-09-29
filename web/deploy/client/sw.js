// App-shell + assets cache. Bump CACHE when assets change (tools/export.py prints a reminder).
const CACHE = "bko-v2-knight-refined";
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const cacheFirst = /\/assets\/|\.(glb|jpg|png|woff2?)$/.test(url.pathname);   // hashed bundles + models: immutable
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    if (hit && cacheFirst) return hit;
    try { const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res; }
    catch { return hit ?? Response.error(); }
  }));
});
