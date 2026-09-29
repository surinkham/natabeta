/// <reference types="vitest" />
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { viteSingleFile } from "vite-plugin-singlefile";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

/** After a build, list every file of the game in dist/precache.json: the service worker downloads them all when the
 *  player installs the game (ui/install.ts), so the whole game is on the device before it is needed. */
const precacheList = () => ({
  name: "precache-list", apply: "build" as const,
  closeBundle() {
    const out = fileURLToPath(new URL("./dist", import.meta.url)), files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(out, p)); } };
    walk(out);
    const skip = new Set(["sw.js", "precache.json"]);
    const list = files.filter(f => !skip.has(f) && !f.endsWith(".map") && !f.startsWith("audio/")).sort();   // music streams when played, never pre-downloaded
    // The service worker serves models and pictures cache-first under one cache name, and their file names never change
    // (SM_Dragon.glb stays SM_Dragon.glb): name the cache after a hash of those files, so a remade model reaches every
    // player on the next visit. Vite's own bundles carry a hash in their names already and are left out of it.
    const h = createHash("sha1");
    for (const f of list) if (!/-[\w-]{8}\.(js|css)$/.test(f)) h.update(f).update(readFileSync(join(out, f)));
    const version = h.digest("hex").slice(0, 10), sw = join(out, "sw.js");
    writeFileSync(sw, readFileSync(sw, "utf8").replace(/const CACHE = "[^"]*";/, `const CACHE = "pawtale-${version}";`));
    writeFileSync(join(out, "precache.json"), JSON.stringify({ version, files: list, bytes: list.reduce((n, f) => n + statSync(join(out, f)).size, 0) }));
  },
});

export default defineConfig({
  root: "client",
  // Keep environment settings beside package.json even though Vite serves client/ as its root.
  envDir: "..",
  base: process.env.BASE_PATH ?? "/",   // BASE_PATH=/bko/ when the game lives in a subfolder of a domain
  plugins: process.env.SINGLE ? [viteSingleFile()] : [precacheList()],
  publicDir: "public",
  resolve: { alias: { "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  server: { fs: { allow: [".."] }, port: 5173 },
  build: { outDir: "../dist", emptyOutDir: true },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["shared/**/*.test.ts", "server/**/*.test.ts", "client/**/*.test.ts"] },
});
