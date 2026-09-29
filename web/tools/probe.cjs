// Headless probe of the running dev server: Chrome on the GPU (ANGLE/EGL — SwiftShader is ~30× slower), enter the
// offline game, run a snippet in the page and print what it returns. For measuring and checking the game without the
// in-app browser pane (a hidden pane stops requestAnimationFrame).
//   node tools/probe.cjs <snippet.js> [--noenter=1 (stay on the start page: safe against production)] [--q=low|high] [--size=1280x800] [--mobile=1] [--race=หมา] [--wait=8000] [--shot=out.png] [--url=...] [--profile=1]
// The snippet is the body of an async function; `__bk`, `__gfx` and `mod(name)` (import a loaded module by path
// fragment, e.g. mod('render/scene')) are available; whatever it returns is printed as JSON. `cdp(method, params)`
// is not available inside the page — use --shot for screenshots.
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path");
const WebSocket = require(path.join(__dirname, "../node_modules/ws"));
const args = Object.fromEntries(process.argv.slice(3).map(a => a.replace(/^--/, "").split("=")));
const snippet = fs.readFileSync(process.argv[2], "utf8"), [W, H] = (args.size ?? "1280x800").split("x").map(Number);
const port = 9300 + Math.floor(Math.random() * 90), prof = fs.mkdtempSync("/tmp/probe-");
const chrome = spawn("/usr/bin/google-chrome", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`,
  "--use-angle=gl-egl", "--enable-gpu", "--ignore-gpu-blocklist", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows", `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let t; for (let i = 0; i < 60 && !t; i++) { try { t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(250); } }
  const ws = new WebSocket(t.find(x => x.type === "page").webSocketDebuggerUrl); await new Promise(r => ws.on("open", r));
  let id = 0; const pend = new Map(), errors = [];
  ws.on("message", m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(String(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expr => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text }; return r.result?.result?.value; };
  await send("Page.enable"); await send("Runtime.enable"); await send("Page.bringToFront");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 || !!args.mobile });
  if (args.mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });   // --mobile=1: a touch phone (landscape sizes too)
  const url = args.url ?? `http://localhost:5173/?offline=1${args.q ? "&q=" + args.q : ""}`;
  await send("Page.navigate", { url }); await sleep(6000);
  if (args.profile) { await send("Profiler.enable"); await send("Profiler.setSamplingInterval", { interval: 2000 }); await send("Profiler.start"); }   // --profile=1: CPU profile of entering, top self-time printed
  if (!args.noenter) await evalJs(`(()=>{ const i=document.querySelector('#creator input'); if(!i) return; i.value='Probe'; i.dispatchEvent(new Event('input',{bubbles:true}));
    ${args.race ? `[...document.querySelectorAll('#creator button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(args.race)}))?.click();` : ""}
    document.getElementById('enter')?.click(); })()`);
  if (!args.noenter) for (let i = 0; i < 80; i++) { if (await evalJs("!!window.__bk")) break; await sleep(500); }
  await evalJs("document.getElementById('ask') && (document.getElementById('ask').hidden = true)");
  await sleep(+(args.wait ?? 8000));
  const out = await evalJs(`(async()=>{ const mod = async k => import(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes(k)).at(-1));
    const r = await (async()=>{ ${snippet} })(); return JSON.stringify(r); })()`);
  console.log(typeof out === "string" ? out : JSON.stringify(out));
  if (args.profile) {
    const prof = (await send("Profiler.stop")).result.profile, dt = {}, self = new Map(prof.nodes.map(n => [n.id, 0]));
    prof.samples.forEach((s, i) => self.set(s, self.get(s) + (prof.timeDeltas[i] ?? 0)));
    for (const n of prof.nodes) { const f = n.callFrame, k = `${f.functionName || "(anon)"} ${f.url.split("/").pop()}:${f.lineNumber + 1}`; dt[k] = (dt[k] ?? 0) + self.get(n.id) / 1000; }
    console.log(Object.entries(dt).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${Math.round(v)}ms ${k}`).join("\n"));
    {   // long busy stretches (no idle sample): what fills each one
      const byId = new Map(prof.nodes.map(n => [n.id, n])); let t = prof.startTime, st = null, acc = {};
      const flush = end => { if (st !== null && end - st > 3e6) console.log(`busy ${Math.round((end - st) / 1000)}ms: ` + Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${Math.round(v / 1000)}`).join(" | ")); st = null; acc = {}; };
      prof.samples.forEach((sid, i) => { t += prof.timeDeltas[i] ?? 0; const f = byId.get(sid).callFrame, name = f.functionName || "(anon)";
        if (name === "(idle)") { flush(t); return; } if (st === null) st = t; const k = `${name}@${f.url.split("/").pop().split("?")[0]}:${f.lineNumber + 1}`; acc[k] = (acc[k] ?? 0) + (prof.timeDeltas[i + 1] ?? 0); });
      flush(t);
    }
    if (args.profile !== "1") {   // --profile=<fn>: who calls fn (4 frames up), by self time
      const parent = new Map(); for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n);
      const by = {}; for (const n of prof.nodes) if (n.callFrame.functionName === args.profile) { let k = "", p = parent.get(n.id); for (let i = 0; i < 5 && p; i++, p = parent.get(p.id)) k += ` < ${p.callFrame.functionName || "(anon)"}:${p.callFrame.url.split("/").pop().split("?")[0]}:${p.callFrame.lineNumber + 1}`; by[k] = (by[k] ?? 0) + self.get(n.id) / 1000; }
      console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${Math.round(v)}ms${k}`).join("\n"));
    }
  }
  if (args.heap) { const h = (await send("Runtime.getHeapUsage")).result; console.log(JSON.stringify({ jsHeapMB: Math.round(h.usedSize / 1048576), jsHeapTotalMB: Math.round(h.totalSize / 1048576) })); }
  if (args.shot) { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(args.shot, Buffer.from(r.result.data, "base64")); console.log("saved", args.shot); }
  if (errors.length) console.log("page errors:", JSON.stringify(errors.slice(0, 5)));
  ws.close(); chrome.kill(); await new Promise(r => { chrome.once("exit", r); setTimeout(r, 3000); });
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}   // Chrome may still be flushing its profile
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
