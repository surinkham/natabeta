// Hitch probe: "it stutters" on a player's device cannot be seen from here, so the game measures it. Each frame is cut
// into phases (perfMark); a frame whose interval is over HITCH_MS records where its time went — JS work by phase, and
// the rest ("outside": GPU, garbage collection, network decoding, the browser). Every 30 s a summary goes to the server
// (POST /perf), which writes it to its log. Performance numbers only: no names, no account.
import { Q } from "./render/quality";
import { drawn, gpuMs, renderScale, shadowsOn } from "./render/scene";

const HITCH_MS = 50;
let frameStart = 0, last = 0, prevStart = 0;
const phases = new Map<string, number>();
const intervals: number[] = [], works: number[] = [], hitches: { at: number; gap: number; work: number; top: string }[] = [];
let longTasks = 0;
try { new PerformanceObserver(l => { longTasks += l.getEntries().length; }).observe({ type: "longtask", buffered: false }); } catch {}

export function perfStart() { frameStart = last = performance.now(); phases.clear(); }
export function perfMark(name: string) { const n = performance.now(); phases.set(name, (phases.get(name) ?? 0) + n - last); last = n; }
/** End of frame: keep the interval since the previous frame, and the breakdown if it was a hitch. */
export function perfEnd() {
  const gap = prevStart ? frameStart - prevStart : 0; prevStart = frameStart;
  if (!gap || document.hidden) return;
  intervals.push(gap); works.push(last - frameStart);
  if (gap > HITCH_MS) {
    const work = last - frameStart, top = [...phases].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(" ");
    if (hitches.length < 40) hitches.push({ at: Math.round(performance.now() / 1000), gap: Math.round(gap), work: Math.round(work), top });
  }
}

/** Send the last 30 s to the server (online only), with what the frame was doing when it hitched. */
export function startPerfReports(url: string, context: () => Record<string, unknown>) {
  setInterval(() => {
    if (intervals.length < 30) return;
    const s = intervals.slice().sort((a, b) => a - b), q = (p: number) => Math.round(s[Math.floor(s.length * p)]);
    const w = works.slice().sort((a, b) => a - b);
    const body = JSON.stringify({ fps: Math.round(1000 / q(0.5)), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: Math.round(s[s.length - 1]), frames: s.length,
      workP50: +w[w.length >> 1].toFixed(1), workP95: +w[Math.floor(w.length * 0.95)].toFixed(1), gpuMs: +gpuMs().toFixed(1), scale: renderScale(),
      calls: drawn.calls, tris: drawn.tris, shadows: shadowsOn(),
      hitches: hitches.length, longTasks, worst: hitches.sort((a, b) => b.gap - a.gap).slice(0, 8), quality: Q.name, dpr: devicePixelRatio,
      screen: `${innerWidth}x${innerHeight}`, mobile: matchMedia("(pointer: coarse)").matches, ...context() }).slice(0, 4000);
    intervals.length = 0; works.length = 0; hitches.length = 0; longTasks = 0;
    fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
  }, 30000);
}
