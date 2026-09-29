// App-shell + assets cache. Bump CACHE when assets change (tools/export.py prints a reminder).
const CACHE = "pawtale-v9-landing-startup";
self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/audio/")) return;   // music streams in ranges: straight from the network
  const cacheFirst = /\/assets\/|\.(glb|jpg|png|woff2?)$/.test(url.pathname);   // hashed bundles + models: immutable
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    if (hit && cacheFirst) return hit;
    try { const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res; }
    catch { return hit ?? Response.error(); }
  }));
});
// "Install the game" (ui/install.ts): download every file listed in precache.json into the cache, a few at a time,
// telling the page how far it got. Already cached files are skipped, so a second run only fetches what is new.
self.addEventListener("message", e => {
  if (e.data?.type !== "precache") return;
  const reply = m => e.source?.postMessage({ type: "precache", ...m });
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE), list = await (await fetch("precache.json", { cache: "no-store" })).json();
      const base = new URL("./", self.registration.scope), files = ["./", ...list.files];
      let done = 0; const total = files.length, queue = [...files];
      const worker = async () => { for (let f; (f = queue.shift()) !== undefined;) {
        const url = new URL(f, base).href;
        if (!(await c.match(url))) { try { const r = await fetch(url); if (r.ok) await c.put(url, r); } catch {} }
        done++; if (done % 10 === 0 || done === total) reply({ done, total, bytes: list.bytes });
      } };
      await Promise.all([worker(), worker(), worker(), worker()]);
      reply({ done: total, total, bytes: list.bytes, finished: true, version: list.version });
    } catch (err) { reply({ error: String(err) }); }
  })());
});
