// `npm run server` locally, or DirectAdmin's Node.js Selector (app.js → this file) in production.
//
// Passenger hands the app a PORT that can be a unix socket path, and mounts it under a URL prefix
// (e.g. game.appkhun.com/ws) while still passing that prefix through in req.url. Colyseus expects to
// own the root, so the prefix is stripped before its handlers see the request.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MapRoom } from "./room";
import { accountId, characterSummaries, linkCharacters, markDelete, openStore } from "./store";
import { loginAccount } from "./auth";

const port = process.env.PORT ?? 2567;
const base = (process.env.BKO_BASE_PATH ?? "").replace(/\/$/, "");   // "" when the app owns the root

const http = createServer();
if (base) {
  const strip = (req: { url?: string }) => { if (req.url === base) req.url = "/"; else if (req.url?.startsWith(base + "/")) req.url = req.url.slice(base.length); };
  http.prependListener("request", strip);
  http.prependListener("upgrade", strip);
}

// one store (one connection pool) for every channel
const store = MapRoom.store ??= openStore();
// The title screen asks for the account's three character slots before joining a world room.
http.on("request", (req, res) => {
  if (req.method !== "POST" || req.url !== "/characters") return;
  let raw = ""; req.on("data", c => { if (raw.length < 8192) raw += c; });
  req.on("end", async () => {
    try {
      const b = JSON.parse(raw || "{}"), token = typeof b.token === "string" ? b.token.slice(0, 256) : "", google = typeof b.google === "string" ? b.google.slice(0, 4096) : "";
      const acc = await loginAccount(token, google); if (!acc) { res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "login required" })); return; }
      if (google && b.link && token.length >= 8) await linkCharacters(store, accountId(token), acc);
      // delete a character in three days (it can be taken back until then), or take the request back
      if (b.action === "delete" || b.action === "undelete") { if (MapRoom.online.get(acc)) { res.writeHead(409, { "content-type": "application/json" }).end(JSON.stringify({ error: "ออกจากเกมก่อนแล้วค่อยลบตัวละคร" })); return; } await markDelete(store, acc, Number(b.slot), b.action === "undelete"); }
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ characters: await characterSummaries(store, acc, s => MapRoom.forget(s)) }));
    } catch { res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "bad request" })); }
  });
});
// POST /perf: the clients' frame-time reports (client/src/perf.ts) go to the log — `journalctl -u beastkingdom | grep PERF`.
// Capped at 4 KB and one report per 10 s per address, so nobody can flood the log through it.
const perfSeen = new Map<string, number>();
http.on("request", (req, res) => {
  if (req.method !== "POST" || req.url !== "/perf") return;
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(), now = Date.now();
  let body = ""; req.on("data", c => { if (body.length < 4096) body += c; });
  req.on("end", () => {
    res.writeHead(204).end();
    if (now - (perfSeen.get(ip) ?? 0) < 10_000 || body.length >= 4096) return;
    perfSeen.set(ip, now); if (perfSeen.size > 5000) perfSeen.clear();
    try { console.log("PERF", JSON.stringify(JSON.parse(body))); } catch {}
  });
});

// BKO_STATIC lets one process serve the built client too (demo tunnels, a single-container deploy).
// Production on shared hosting does not use it: Apache serves the files and only /ws reaches Node.
const staticRoot = process.env.BKO_STATIC;
if (staticRoot) {
  const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".glb": "model/gltf-binary", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
  http.on("request", (req, res) => {
    if (res.headersSent || req.url?.startsWith("/matchmake") || req.url === "/perf" || req.url === "/characters") return;
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let file = join(staticRoot, normalize(path).replace(/^(\.\.(\/|\\|$))+/, ""));
    try { if (statSync(file).isDirectory()) file = join(file, "index.html"); } catch { file = join(staticRoot, "index.html"); }
    try { statSync(file); } catch { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  });
}

const server = new Server({ transport: new WebSocketTransport({ server: http }) });
server.define("map", MapRoom).filterBy(["channel"]);   // one room per channel: a whole world copy, MAX_PER_CHANNEL players
server.listen(Number.isNaN(Number(port)) ? (port as any) : Number(port))
  .then(() => console.log(`BKO server listening on ${port}${base ? " under " + base : ""}`));
