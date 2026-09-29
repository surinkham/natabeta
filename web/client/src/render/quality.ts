// Quality preset (spec §4.1 mobile budget). Auto: coarse pointer / small screen / few cores → low. Override with ?q=low|high.
export interface Quality { name: "low" | "high"; pixelRatio: number; shadowMap: number; msaa: number; density: number; anisotropy: number }
const PRESETS: Record<Quality["name"], Quality> = {
  // msaa 2, not 4: samples multiply the HalfFloat target's memory traffic, and the outline pass already smooths edges
  high: { name: "high", pixelRatio: Math.min(devicePixelRatio, 1.5), shadowMap: 2048, msaa: 2, density: 1.0, anisotropy: 8 },   // >1.5 costs 2× the pixels for little on a 2.5D view
  low:  { name: "low",  pixelRatio: 1,                             shadowMap: 1024, msaa: 0, density: 0.5, anisotropy: 1 },
};
/** The two graphics modes as the player sees them in Options. */
export const QUALITY_LABEL: Record<Quality["name"], string> = { high: "สวย", low: "ลื่น" };
function detect(): Quality["name"] {
  const q = new URLSearchParams(location.search).get("q");
  if (q === "low" || q === "high") return q;
  try { const s = localStorage.getItem("bk.quality"); if (s === "low" || s === "high") return s; } catch {}   // the player's own choice
  const coarse = matchMedia("(pointer: coarse)").matches, small = Math.min(innerWidth, innerHeight) < 600, cores = navigator.hardwareConcurrency ?? 8;
  return coarse || small || cores <= 4 ? "low" : "high";
}
export const Q: Quality = PRESETS[detect()];
/** Switch mode (Options): remembered for this browser; the world is rebuilt for it, so the page reloads. */
export function setQuality(name: Quality["name"]) {
  try { localStorage.setItem("bk.quality", name); } catch {}
  const u = new URL(location.href); u.searchParams.delete("q"); location.href = u.toString();
}
