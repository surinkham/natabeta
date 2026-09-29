// `npm run server` locally, or DirectAdmin's Node.js Selector (app.js → this file) in production.
//
// Passenger hands the app a PORT that can be a unix socket path, and mounts it under a URL prefix
// (e.g. game.appkhun.com/ws) while still passing that prefix through in req.url. Colyseus expects to
// own the root, so the prefix is stripped before its handlers see the request.
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MapRoom } from "./room";

const port = process.env.PORT ?? 2567;
const base = (process.env.BKO_BASE_PATH ?? "").replace(/\/$/, "");   // "" when the app owns the root

const http = createServer();
if (base) {
  const strip = (req: { url?: string }) => { if (req.url === base) req.url = "/"; else if (req.url?.startsWith(base + "/")) req.url = req.url.slice(base.length); };
  http.prependListener("request", strip);
  http.prependListener("upgrade", strip);
}

const server = new Server({ transport: new WebSocketTransport({ server: http }) });
server.define("map", MapRoom);
server.listen(Number.isNaN(Number(port)) ? (port as any) : Number(port))
  .then(() => console.log(`BKO server listening on ${port}${base ? " under " + base : ""}`));
