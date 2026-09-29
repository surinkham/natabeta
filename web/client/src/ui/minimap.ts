import { scenicBorders, borderBend, riverPath } from "@shared/scenery";
import { game } from "./api";
import { MONSTERS } from "@shared/data";
import { TOWN_RADIUS, layout, solids } from "../world/world";
import * as THREE from "three";
import { CELL, CITIES, ROADS, RIVER_OUTLET, ZONES, holeStyle, passLine, zoneAt, zoneAtCell } from "@shared/regions";
import { toast } from "./hud";
import { MAP, ROUTE_HALF, zoneName } from "@shared/world";
import { daylight, timeString } from "../render/daynight";
import { campfires } from "@shared/cooking";

const MOB_DOT: Record<string, string> = { MON_WOLF_001: "#e05a4f", MON_FOX: "#ff9a3d", MON_BOAR: "#b98a5e", MON_SHROOM: "#f2d0d0", MON_SLIME: "#6fe0b0", MON_STUMP: "#6b8f3a", MON_DIRE_WOLF: "#a45bd8", MON_BEAR: "#7a5a3a", MON_ALPHA_WOLF: "#ff2d2d" };
const c = document.getElementById("mmc") as HTMLCanvasElement, g = c.getContext("2d")!;
const MAP_SEA = "#3f7fa6"; // Same ocean as the world atlas, including outside the cached image.
const SCALE = 138 / 60;   // 60 m window
// The static world (town square, road, every solid) is baked once into an offscreen image and blitted; redrawing
// hundreds of props ten times a second was pure jank after the Dark Forest tripled the prop count.
const MAP_X0 = MAP.minX - 8, MAP_Z0 = MAP.minZ - 8, MAP_W = MAP.maxX - MAP.minX + 16, MAP_H = MAP.maxZ - MAP.minZ + 16;
let base: HTMLCanvasElement | null = null;
const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
function bake() {
  const cv = document.createElement("canvas"); cv.width = MAP_W * SCALE; cv.height = MAP_H * SCALE;
  const b = cv.getContext("2d")!; const X = (x: number) => (x - MAP_X0) * SCALE, Y = (z: number) => (z - MAP_Z0) * SCALE;
  b.fillStyle = MAP_SEA; b.fillRect(0, 0, cv.width, cv.height);   // Ocean outside land; interior gaps get their mountain/lake glyphs below.
  // land: each spot takes its nearest town's ground colour, fading into the next one's (a low-res field, scaled up),
  // cut to the maps' shape with blurred edges — the grid never shows as squares. A pass is only its corridor.
  const land = document.createElement("canvas"); land.width = cv.width; land.height = cv.height; const l = land.getContext("2d")!;
  l.filter = `blur(${Math.round(4 * SCALE)}px)`; l.fillStyle = "#fff";
  for (const z of ZONES) {
    if (z.terrain !== "pass") { l.beginPath(); l.roundRect(X(z.x0 - 2), Y(z.z0 - 2), (CELL + 4) * SCALE, (CELL + 4) * SCALE, 12*SCALE); l.fill(); continue; }
    const ew = z.axis === "ew", pts: [number, number][] = [];
    for (let t = ew ? z.x0 - 4 : z.z0 - 4; t <= (ew ? z.x1 + 4 : z.z1 + 4); t += 2) { const c0 = passLine(z, t) - ROUTE_HALF - 1; pts.push(ew ? [t, c0] : [c0, t]); }
    for (let t = ew ? z.x1 + 4 : z.z1 + 4; t >= (ew ? z.x0 - 4 : z.z0 - 4); t -= 2) { const c1 = passLine(z, t) + ROUTE_HALF + 1; pts.push(ew ? [t, c1] : [c1, t]); }
    l.beginPath(); for (const [x, zz] of pts) l.lineTo(X(x), Y(zz)); l.fill();
  }
  l.filter = "none";
  const FW = Math.ceil(cv.width / 8), FH = Math.ceil(cv.height / 8), fcv = document.createElement("canvas"); fcv.width = FW; fcv.height = FH;
  const rgb = (h: number) => [h >> 16 & 255, h >> 8 & 255, h & 255];   // plain sRGB bytes (a THREE.Color would be linear: too dark)
  const fg = fcv.getContext("2d")!, img = fg.createImageData(FW, FH), towns = CITIES.map(c => ({ x: c.x, z: c.z, col: rgb(c.ground) }));
  for (let py = 0; py < FH; py++) for (let px = 0; px < FW; px++) {
    const x = MAP_X0 + (px + 0.5) * 8 / SCALE, z = MAP_Z0 + (py + 0.5) * 8 / SCALE;
    let d0 = 1e9, d1 = 1e9, c0 = towns[0], c1 = towns[0];
    for (const t of towns) { const d = Math.hypot(t.x - x, t.z - z); if (d < d0) { d1 = d0; c1 = c0; d0 = d; c0 = t; } else if (d < d1) { d1 = d; c1 = t; } }
    const t = Math.min(1, Math.max(0, (d0 / (d0 + d1) - 0.36) / 0.14)) * 0.5, shade = 0.94 + 0.1 * Math.sin(x * 0.09) * Math.sin(z * 0.11);
    img.data.set([0, 1, 2].map(i => (c0.col[i] + (c1.col[i] - c0.col[i]) * t) * shade).concat(255), (py * FW + px) * 4);
  }
  fg.putImageData(img, 0, 0);
  l.globalCompositeOperation = "source-in"; l.imageSmoothingEnabled = true; l.drawImage(fcv, 0, 0, cv.width, cv.height);
  // deep forests: a darker canopy with soft edges
  l.globalCompositeOperation = "source-atop"; l.filter = `blur(${Math.round(6 * SCALE)}px)`; l.fillStyle = "rgba(10,40,20,.45)";
  for (const z of ZONES) if (z.terrain === "forest") l.fillRect(X(z.x0 + 4), Y(z.z0 + 4), (CELL - 8) * SCALE, (CELL - 8) * SCALE);
  l.filter = "none"; b.drawImage(land, 0, 0);
  // holes in the grid: a range of mountains, drawn back to front
  let hk = 11; const hr = () => ((hk = (Math.imul(hk, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bigPeaks: [number, number, number][] = [], treeDots: [number, number, number][] = [];
  for (let i = Math.round(MAP.minX / CELL); i <= Math.round(MAP.maxX / CELL); i++) for (let j = Math.round(MAP.minZ / CELL); j <= Math.round(MAP.maxZ / CELL); j++) {
    if (zoneAtCell(i, j)) continue;
    const fill = holeStyle(i, j);
    if (fill === "lake") {
      for (const [r, c] of [[CELL * 0.46, "#c9b48a"], [CELL * 0.4, "#3f8fb0"], [CELL * 0.3, "#5aa9c8"]] as const) { b.fillStyle = c; b.beginPath(); b.ellipse(X(i * CELL), Y(j * CELL), r * SCALE, r * SCALE * 0.88, 0, 0, 6.28); b.fill(); }
      continue;
    }
    if (fill === "forest") { for (let n = 0; n < 140; n++) treeDots.push([i * CELL + (hr() - 0.5) * (CELL - 4), j * CELL + (hr() - 0.5) * (CELL - 4), 2.2 + hr() * 1.6]); continue; }
    for (let n = 0; n < 34; n++) bigPeaks.push([i * CELL + (hr() - 0.5) * CELL, j * CELL + (hr() - 0.5) * CELL, 6 + hr() * 7]);
  }
  for (const [x, z, sz] of bigPeaks.sort((a, c) => a[1] - c[1])) {
    const px = X(x), py = Y(z) + sz * SCALE * 0.5, w = sz * SCALE, h = sz * SCALE * 1.15;
    b.fillStyle = "#5e5646"; b.beginPath(); b.moveTo(px - w, py); b.lineTo(px, py - h); b.lineTo(px + w, py); b.fill();
    b.fillStyle = "#8f8570"; b.beginPath(); b.moveTo(px - w, py); b.lineTo(px, py - h); b.lineTo(px - w * 0.15, py); b.fill();
    b.fillStyle = "#eee8da"; b.beginPath(); b.moveTo(px - w * 0.28, py - h * 0.72); b.lineTo(px, py - h); b.lineTo(px + w * 0.28, py - h * 0.72); b.fill();
  }
  const tree = ([x, z, r]: [number, number, number]) => {
    b.fillStyle = "#1f4a2c"; b.beginPath(); b.arc(X(x), Y(z), r * SCALE, 0, 6.28); b.fill();
    b.fillStyle = "rgba(160,210,140,.35)"; b.beginPath(); b.arc(X(x) - r * SCALE * 0.3, Y(z) - r * SCALE * 0.3, r * SCALE * 0.45, 0, 6.28); b.fill();
  };
  for (const t of treeDots.sort((a, c) => a[1] - c[1])) tree(t);
  for (const z of ZONES) {
    if (z.pk) {   // free-PK map: red wash, hatching and a label
      b.save(); b.beginPath(); b.rect(X(z.x0), Y(z.z0), CELL * SCALE, CELL * SCALE); b.clip();
      b.fillStyle = "rgba(200,30,20,.22)"; b.fillRect(X(z.x0), Y(z.z0), CELL * SCALE, CELL * SCALE);
      b.strokeStyle = "rgba(170,20,10,.35)"; b.lineWidth = 2; for (let d = -CELL; d < CELL; d += 8) { b.beginPath(); b.moveTo(X(z.x0 + d), Y(z.z0)); b.lineTo(X(z.x0 + d + CELL), Y(z.z1)); b.stroke(); }
      b.restore();
      b.font = `bold ${Math.round(9 * SCALE)}px sans-serif`; b.textAlign = "center"; b.fillStyle = "#ffdfd6"; b.strokeStyle = "#5a0d06"; b.lineWidth = 3;
      b.strokeText("⚔ PK", X(z.i * CELL), Y(z.j * CELL)); b.fillText("⚔ PK", X(z.i * CELL), Y(z.j * CELL));
    }
  }
  // ridges (map borders, pass walls) drawn as a chain of little mountains, north first so they overlap like a drawn map
  const peaks: [number, number, number][] = [];
  let pk = 7; const prnd = () => ((pk = (Math.imul(pk, 1664525) + 1013904223) >>> 0) / 4294967296);
  const borders = scenicBorders();
  for (const w of borders) if (w.look === "river") {
    // Draw the river itself once, not both collision banks and their square end caps.
    for (const [lw, color] of [[9, "#92a18a"], [6, "#397d87"], [3.4, "#55979b"]] as const) {
      b.strokeStyle=color;b.lineWidth=lw*SCALE;b.lineCap=b.lineJoin="round";
      const path=riverPath(w);for(let i=1;i<path.length;i++){const a=path[i-1],p=path[i];b.lineWidth=(lw+a.halfWidth+p.halfWidth-6)*SCALE;b.beginPath();b.moveTo(X(a.x),Y(a.z));b.lineTo(X(p.x),Y(p.z));b.stroke();}
    }
  }
  b.strokeStyle='#397d87';b.lineWidth=6*SCALE;b.lineCap='round';b.beginPath();b.moveTo(X(RIVER_OUTLET.x),Y(RIVER_OUTLET.z));b.lineTo(X(RIVER_OUTLET.x),Y(RIVER_OUTLET.z+22));b.stroke();
  for (const w of borders) if (w.look === "forest") {
    const len=Math.hypot(w.x2-w.x1,w.z2-w.z1);
    for(let t=1;t<len;t+=2.8+prnd()*1.7)for(const o of [-1.6,1.6]) {
      const jitter=(prnd()-.5)*2.2-borderBend(t,len,w.x1,w.z1,w.gap?Math.hypot(w.gap.x-w.x1,w.gap.z-w.z1):undefined);
      tree([w.x1+(w.x2-w.x1)*t/len+(w.z2-w.z1)/len*(o+jitter),w.z1+(w.z2-w.z1)*t/len-(w.x2-w.x1)/len*(o+jitter),1.4+prnd()*1.4]);
    }
  }
  for (const w of layout.walls) if (w.ridge && (!w.look || w.look === "mountain")) {
    const len = Math.hypot(w.x2 - w.x1, w.z2 - w.z1);
    for (let t = 1.5; t < len; t += 3.2 + prnd() * 1.6) peaks.push([w.x1 + (w.x2 - w.x1) * t / len + (prnd() - 0.5) * 1.5, w.z1 + (w.z2 - w.z1) * t / len + (prnd() - 0.5) * 1.5, 2.6 + prnd() * 1.6]);
  }
  for (const [x, z, s] of peaks.sort((a, b) => a[1] - b[1])) {
    const px = X(x), py = Y(z) + s * SCALE * 0.5, w = s * SCALE, h = s * SCALE * 1.2;
    b.fillStyle = "#6e6452"; b.beginPath(); b.moveTo(px - w, py); b.lineTo(px, py - h); b.lineTo(px + w, py); b.fill();
    b.fillStyle = "#9a907a"; b.beginPath(); b.moveTo(px - w, py); b.lineTo(px, py - h); b.lineTo(px - w * 0.15, py); b.fill();
    b.fillStyle = "#eee8da"; b.beginPath(); b.moveTo(px - w * 0.28, py - h * 0.72); b.lineTo(px, py - h); b.lineTo(px + w * 0.28, py - h * 0.72); b.fill();
  }
  b.lineCap="round"; b.strokeStyle = "#c9b48a"; b.lineWidth = 2.8 * SCALE; b.lineJoin = "round";                                     // roads
  for (const segs of ROADS.values()) for (const [x1, z1, x2, z2] of segs) { b.beginPath(); b.moveTo(X(x1), Y(z1)); b.lineTo(X(x2), Y(z2)); b.stroke(); }
  for (const city of CITIES) {
    b.fillStyle = "#8a7d6b"; b.fillRect(X(city.x - TOWN_RADIUS), Y(city.z - TOWN_RADIUS), TOWN_RADIUS * 2 * SCALE, TOWN_RADIUS * 2 * SCALE);
    b.strokeStyle = "#e6d4ae"; b.lineWidth = 2; b.strokeRect(X(city.x - TOWN_RADIUS), Y(city.z - TOWN_RADIUS), TOWN_RADIUS * 2 * SCALE, TOWN_RADIUS * 2 * SCALE);
  }
  for(const p of layout.props) if(p.name==='SM_Bridge') {
    b.save();b.translate(X(p.x),Y(p.z));b.rotate(-p.ry);
    b.fillStyle='#b9a385';b.strokeStyle='#66513e';b.lineWidth=.6*SCALE;
    b.fillRect(-4.8*SCALE,-1.8*SCALE,9.6*SCALE,3.6*SCALE);
    for(const side of [-1,1]) {b.beginPath();b.moveTo(-4.8*SCALE,side*1.8*SCALE);b.lineTo(4.8*SCALE,side*1.8*SCALE);b.stroke();}b.restore();
  }
  b.fillStyle = "#263d3b"; for (const s of solids) if (s.r > 0.3) { b.beginPath(); b.arc(X(s.x), Y(s.z), Math.max(1, s.r * SCALE * 0.6), 0, 6.28); b.fill(); }
  return cv;
}
// zoom (− / +) and a bigger frame (⤢), remembered per browser
const ZOOMS = [0.35, 0.6, 1, 1.7];
let zoomI = 2, big = false;
try { const s = JSON.parse(localStorage.getItem("bk.minimap") ?? "{}"); if (s.z >= 0 && s.z < ZOOMS.length) zoomI = s.z; big = !!s.big; } catch {}
const saveView = () => { try { localStorage.setItem("bk.minimap", JSON.stringify({ z: zoomI, big })); } catch {} };
function applySize() { const size = big ? 300 : 138; c.width = c.height = size; c.style.width = c.style.height = size + "px"; document.getElementById("minimap")!.classList.toggle("big", big); }
export function setupMinimapControls() {
  const bar = document.createElement("div"); bar.className = "mm-ctl";
  bar.innerHTML = `<button data-z="-1" title="ซูมออก">−</button><button data-z="1" title="ซูมเข้า">+</button><button data-big title="ขยายกรอบ minimap">⤢</button>`;
  c.insertAdjacentElement("afterend", bar);
  bar.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button"); if (!b) return;
    if (b.dataset.z) zoomI = Math.max(0, Math.min(ZOOMS.length - 1, zoomI + +b.dataset.z));
    if (b.dataset.big !== undefined) { big = !big; applySize(); }
    saveView();
  });
  c.addEventListener("wheel", e => { e.preventDefault(); zoomI = Math.max(0, Math.min(ZOOMS.length - 1, zoomI + (e.deltaY < 0 ? 1 : -1))); saveView(); }, { passive: false });
  applySize();
  c.addEventListener("click", () => toggleZoneMap(true));
  // labelled buttons under the minimap: this map large, and the world atlas (worldmap.ts made that one)
  const row = Object.assign(document.createElement("div"), { className: "mapbtns" }), open = Object.assign(document.createElement("button"), { className: "mapbtn", textContent: "ขยายแผนที่ [N]", title: "แผนที่ของ map นี้ — แตะเพื่อเดินไป" });
  const world = c.parentElement!.querySelector(".mapbtn"); c.parentElement!.appendChild(row); row.append(open); if (world) row.append(world);
  open.addEventListener("click", () => toggleZoneMap());
  addEventListener("keydown", e => {
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
    if (e.code === "KeyN") toggleZoneMap(); if (e.code === "Escape") toggleZoneMap(false);
  });
}

// ---------------------------------------------------------------- full-screen map of the current zone
// The baked minimap image cropped to the map the player is in, scaled to fit the screen. Tap anywhere on it and the
// character walks there, round walls and trees (game().walkTo → shared/path.ts); the route is drawn until reached.
// A paper panel over the game (the game keeps running and stays visible around and through it).
const zm = Object.assign(document.createElement("div"), { id: "zonemap", className: "hud frame", hidden: true });
zm.innerHTML = `<header><b id="zm-name"></b><small>แตะจุดบนแผนที่เพื่อเดินไป · N / Esc ปิด</small><button data-close>✕</button></header><canvas id="zmc"></canvas>
  <footer><span><i style="background:#fff"></i>คุณ</span><span><i style="background:#ffe9a8"></i>NPC</span><span>🔥 กองไฟ (ทำอาหาร)</span><span><i style="background:#e05a4f"></i>มอนสเตอร์</span><span><i class="boss"></i>บอส</span><span><i style="background:#7fc8ff"></i>ผู้เล่น</span><span><i class="route"></i>เส้นทางเดิน</span></footer>`;
document.body.append(zm);
const zc = zm.querySelector("canvas")!, zg = zc.getContext("2d")!;
let view = { x0: 0, z0: 0, k: 1, ox: 0, oy: 0 };   // world → canvas: (x - x0) * k + ox
function toggleZoneMap(on = zm.hidden) {
  zm.hidden = !on; if (on) drawZoneMap();
}
zm.querySelector("[data-close]")!.addEventListener("click", () => toggleZoneMap(false));
zc.addEventListener("click", e => {
  const r = zc.getBoundingClientRect(), px = (e.clientX - r.left) * zc.width / r.width, py = (e.clientY - r.top) * zc.height / r.height;
  const x = (px - view.ox) / view.k + view.x0, z = (py - view.oy) / view.k + view.z0;
  if (!game().walkTo(x, z)) toast("ไปจุดนั้นไม่ได้"); drawZoneMap();
});
function drawZoneMap() {
  if (zm.hidden) return;
  const P = game().P, zone = zoneAt(P), W = zc.clientWidth, H = zc.clientHeight, dpr = Math.min(devicePixelRatio, 2);
  if (zc.width !== Math.round(W * dpr) || zc.height !== Math.round(H * dpr)) { zc.width = Math.round(W * dpr); zc.height = Math.round(H * dpr); }
  const x0 = zone.x0 - 3, x1 = zone.x1 + 3, z0 = zone.z0 - 3, z1 = zone.z1 + 3;
  const k = Math.min(zc.width / (x1 - x0), zc.height / (z1 - z0)), ox = (zc.width - (x1 - x0) * k) / 2, oy = (zc.height - (z1 - z0) * k) / 2;
  view = { x0, z0, k, ox, oy };
  const X = (x: number) => (x - x0) * k + ox, Y = (z: number) => (z - z0) * k + oy;
  base ??= bake();
  zg.clearRect(0, 0, zc.width, zc.height);
  zg.save(); zg.shadowColor = "rgba(60,40,15,.45)"; zg.shadowBlur = 10 * dpr; zg.fillStyle = MAP_SEA;
  zg.beginPath(); zg.roundRect(ox, oy, (x1 - x0) * k, (z1 - z0) * k, 10 * dpr); zg.fill(); zg.clip();
  zg.imageSmoothingEnabled = true;
  zg.drawImage(base, (x0 - MAP_X0) * SCALE, (z0 - MAP_Z0) * SCALE, (x1 - x0) * SCALE, (z1 - z0) * SCALE, ox, oy, (x1 - x0) * k, (z1 - z0) * k);
  zg.restore();
  zg.font = `bold ${Math.round(12 * dpr)}px sans-serif`; zg.textAlign = "center";
  for (const n of game().npcs) { zg.fillStyle = "#ffe9a8"; zg.fillRect(X(n.pos.x) - 3 * dpr, Y(n.pos.z) - 3 * dpr, 6 * dpr, 6 * dpr); zg.fillStyle = "#fff3d6"; zg.fillText(n.def.name, X(n.pos.x), Y(n.pos.z) - 6 * dpr); }
  fireMarks(zg, X, Y, 16 * dpr, x0, x1, z0, z1);   // 🔥 cook here
  for (const m of game().mobs.values()) if (m.alive && m.pos.x > x0 && m.pos.x < x1 && m.pos.z > z0 && m.pos.z < z1) {
    const boss = m.kind === "monster" && MONSTERS[(m.view as any).kind]?.boss;
    zg.fillStyle = m.kind !== "monster" ? "#7fc8ff" : boss ? "#ff3b2f" : MOB_DOT[(m.view as any).kind] ?? "#e05a4f";
    zg.beginPath(); zg.arc(X(m.pos.x), Y(m.pos.z), (boss ? 6 : 3) * dpr, 0, 6.28); zg.fill();
    if (boss) { zg.strokeStyle = "#ffd36a"; zg.lineWidth = 2 * dpr; zg.stroke(); }
  }
  const route = game().route();
  if (route.length) {
    zg.strokeStyle = "#ffd36a"; zg.lineWidth = 2.5 * dpr; zg.setLineDash([6 * dpr, 5 * dpr]);
    zg.beginPath(); zg.moveTo(X(P.pos.x), Y(P.pos.z)); for (const w of route) zg.lineTo(X(w.x), Y(w.z)); zg.stroke(); zg.setLineDash([]);
    const end = route[route.length - 1]; zg.fillStyle = "#ffd36a"; zg.beginPath(); zg.arc(X(end.x), Y(end.z), 5 * dpr, 0, 6.28); zg.fill();
  }
  const dead = game().deathAt; if (dead) deathPin(zg, X(dead.x), Y(dead.z), 18 * dpr);
  const px = X(P.pos.x), py = Y(P.pos.z);
  zg.fillStyle = "#fff"; zg.strokeStyle = "#000"; zg.lineWidth = 1.5 * dpr; zg.beginPath();
  zg.moveTo(px + Math.sin(P.yaw) * 9 * dpr, py + Math.cos(P.yaw) * 9 * dpr);
  zg.lineTo(px + Math.sin(P.yaw + 2.5) * 6 * dpr, py + Math.cos(P.yaw + 2.5) * 6 * dpr);
  zg.lineTo(px + Math.sin(P.yaw - 2.5) * 6 * dpr, py + Math.cos(P.yaw - 2.5) * 6 * dpr); zg.closePath(); zg.fill(); zg.stroke();
  document.getElementById("zm-name")!.textContent = zoneName(P);
}
/** 🔥 on every campfire (shared/cooking.ts) inside the drawn area: where food can be cooked. */
function fireMarks(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (z: number) => number, px: number, x0: number, x1: number, z0: number, z1: number) {
  ctx.font = `${Math.round(px)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const f of campfires(layout)) if (f.x > x0 && f.x < x1 && f.z > z0 && f.z < z1) ctx.fillText("🔥", X(f.x), Y(f.z));
  ctx.textBaseline = "alphabetic";
}
/** 💀 where the player last fell. On the minimap (`edge` = its size) a pin off the map sticks to the rim, pointing the way. */
function deathPin(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, edge?: number) {
  if (edge) { const m = px * 0.7; x = Math.max(m, Math.min(edge - m, x)); y = Math.max(m, Math.min(edge - m, y)); }
  ctx.font = `${Math.round(px)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("💀", x, y); ctx.textBaseline = "alphabetic";
}
export function refreshMinimap() {
  const P = game().P; const cx = P.pos.x, cz = P.pos.z, size = c.width, half = size / 2, zoom = ZOOMS[zoomI], k = SCALE * zoom;
  const X = (x: number) => half + (x - cx) * k, Y = (z: number) => half + (z - cz) * k;
  base ??= bake();
  g.fillStyle = MAP_SEA; g.fillRect(0, 0, size, size);
  g.drawImage(base, X(MAP_X0), Y(MAP_Z0), base.width * zoom, base.height * zoom);
  g.fillStyle = "#ffe9a8"; for (const n of game().npcs) g.fillRect(X(n.pos.x) - 2, Y(n.pos.z) - 2, 4, 4);
  fireMarks(g, X, Y, Math.max(10, Math.min(15, 9 + zoom * 3)), cx - half / k, cx + half / k, cz - half / k, cz + half / k);
  for (const m of game().mobs.values()) if (m.alive && !m.apart) {
    const mate = m.kind === "player" && !!P.party && (m.view as any).party === P.party;   // party members: green, bigger
    g.fillStyle = mate ? "#6fe06f" : m.kind !== "monster" ? "#7fc8ff" : MOB_DOT[(m.view as any).kind] ?? "#e05a4f";
    const r = mate ? 3.5 : (m.kind === "monster" && MONSTERS[(m.view as any).kind]?.boss ? 4 : 2.5) * Math.min(1, 0.55 + zoom * 0.45);   // smaller when zoomed out
    g.beginPath(); g.arc(X(m.pos.x), Y(m.pos.z), r, 0, 6.28); g.fill();
  }
  // towns on top of everything, at any zoom: a castle badge with the town's name
  for (const city of CITIES) {
    const x = X(city.x), y = Y(city.z); if (x < -30 || x > size + 30 || y < -30 || y > size + 30) continue;
    const r = Math.max(7, TOWN_RADIUS * k);
    g.fillStyle = "#8a7d6b"; g.strokeStyle = "#f6e7c4"; g.lineWidth = 2; g.beginPath(); g.roundRect(x - r, y - r, r * 2, r * 2, 3); g.fill(); g.stroke();
    g.fillStyle = "#fff3d6"; g.font = `bold ${Math.round(Math.min(14, r * 1.2))}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("♜", x, y + 1);
    g.font = "bold 10px sans-serif"; g.lineWidth = 3; g.strokeStyle = "#2b1d10"; g.strokeText(city.name, x, y - r - 7); g.fillText(city.name, x, y - r - 7); g.textBaseline = "alphabetic";
  }
  const dead = game().deathAt; if (dead) deathPin(g, X(dead.x), Y(dead.z), 13, size);
  g.fillStyle = "#fff"; g.beginPath(); g.arc(half, half, 3.5, 0, 6.28); g.fill();
  g.strokeStyle = "#fff"; g.beginPath(); g.moveTo(half, half); g.lineTo(half + Math.sin(P.yaw) * 8, half + Math.cos(P.yaw) * 8); g.stroke();
  document.getElementById("coords")!.textContent = `${P.pos.x.toFixed(0)}, ${(-P.pos.z).toFixed(0)} · ${daylight() > 0.5 ? "☀" : "☾"} ${timeString()}`;
  document.getElementById("mapname")!.textContent = zoneName(P);
  drawZoneMap();
}
