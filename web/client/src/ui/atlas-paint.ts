import { scenicBorders, borderBend, riverPath } from "@shared/scenery";
// The world atlas, painted from the real map grid (shared/regions.ts), so it always matches the world you walk: sea
// around the continent, every map as land in its realm's colours, mountains where there is no map, forests and the
// real roads, each map's name, free-PK maps hatched red, bosses marked with a crown.
import { CELL, CITIES, ROADS, RIVER_OUTLET, ZONES, holeStyle, regionAt, zoneAtCell, type Biome } from "@shared/regions";
import { MAP } from "@shared/world";

export const ATLAS_PAD = 60;   // metres of sea around the land
export const ATLAS = { x0: MAP.minX - ATLAS_PAD, z0: MAP.minZ - ATLAS_PAD, w: MAP.maxX - MAP.minX + ATLAS_PAD * 2, h: MAP.maxZ - MAP.minZ + ATLAS_PAD * 2 };
const LAND: Record<Biome, [string, string]> = {
  meadow: ["#7fae5a", "#5d8f43"], forest: ["#3f7a4a", "#2b5a36"], snow: ["#e6eef4", "#b9ccd9"],
  desert: ["#e2bf7a", "#c79a55"], volcanic: ["#5a4642", "#3a2c29"], shadow: ["#6d5a86", "#4b3b61"],
};
const PEAK: Record<Biome, [string, string, string]> = {   // lit side, shade side, cap
  meadow: ["#a39e8c", "#6e6a5c", "#f2f0e6"], forest: ["#7d8a6e", "#4f5b45", "#dfe6d2"], snow: ["#c7d3de", "#8595a6", "#ffffff"],
  desert: ["#d19a5c", "#9c6a38", "#f0cf95"], volcanic: ["#4a3a36", "#2a1f1d", "#ff7a2a"], shadow: ["#7b6892", "#4d3f63", "#d8c6f0"],
};
const TREE: Record<Biome, string> = { meadow: "#2f6a3a", forest: "#1f4a2c", snow: "#3d6a5a", desert: "#6f8a3c", volcanic: "#2c2220", shadow: "#3b2d52" };
const biomeAt = (i: number, j: number) => regionAt({ x: i * CELL, z: j * CELL }).biome;

/** The part of the atlas on screen: its centre (world metres) and zoom (1 = the whole continent). */
export interface AtlasView { cx: number; cz: number; zoom: number }
export const fullView = (): AtlasView => ({ cx: ATLAS.x0 + ATLAS.w / 2, cz: ATLAS.z0 + ATLAS.h / 2, zoom: 1 });
/** Keep a view inside the atlas; returns its top-left corner and size in world metres. */
export function viewBox(v: AtlasView) {
  const w = ATLAS.w / v.zoom, h = ATLAS.h / v.zoom;
  v.cx = Math.max(ATLAS.x0 + w / 2, Math.min(ATLAS.x0 + ATLAS.w - w / 2, v.cx)); v.cz = Math.max(ATLAS.z0 + h / 2, Math.min(ATLAS.z0 + ATLAS.h - h / 2, v.cz));
  return { x0: v.cx - w / 2, z0: v.cz - h / 2, w, h };
}
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

export function paintAtlas(cv: HTMLCanvasElement, bosses: Map<string, number>, view: AtlasView = fullView()) {
  const vb = viewBox(view), W = cv.width, H = cv.height, k = W / vb.w, g = cv.getContext("2d")!;
  const X = (x: number) => (x - vb.x0) * k, Y = (z: number) => (z - vb.z0) * k;
  let seed = 1337; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  // sea, with little wave strokes
  const sea = g.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, "#5f9fc0"); sea.addColorStop(1, "#3f7fa6");
  g.fillStyle = sea; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = Math.max(1, k * 1.2);
  for (let n = 0; n < 220; n++) { const x = rnd() * W, y = rnd() * H, s = (6 + rnd() * 8) * k; g.beginPath(); g.arc(x, y, s, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  // the continent: every map, and every hole between maps (mountains), is land with a ragged coast
  const i0 = Math.round(MAP.minX / CELL), i1 = Math.round(MAP.maxX / CELL), j0 = Math.round(MAP.minZ / CELL), j1 = Math.round(MAP.maxZ / CELL);
  const land = (i: number, j: number) => !!zoneAtCell(i, j) || [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => zoneAtCell(i + a, j + b)).length >= 2;
  const coast = (grow: number, fill: string, c = g) => {
    c.fillStyle = fill; seed = 99;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (!land(i, j)) continue;
      for (let n = 0; n < 7; n++) { const a = rnd() * 6.28, r = CELL * (0.35 + rnd() * 0.25) + grow; c.beginPath(); c.ellipse(X(i * CELL + Math.cos(a) * CELL * 0.3), Y(j * CELL + Math.sin(a) * CELL * 0.3), r * k, r * k * 0.9, rnd() * 3, 0, 6.28); c.fill(); }
    }
  };
  coast(26, "#d9c795");   // sandy shore; the land itself is laid over it below
  // the land takes its nearest town's colours, blended smoothly into the next town's across the halfway line (the same
  // rule as the ground in game), painted as a low-res field and scaled up so it stays soft — no square map edges
  const fw = Math.ceil(W / 4), fh = Math.ceil(H / 4), field = document.createElement("canvas"); field.width = fw; field.height = fh;
  const fg = field.getContext("2d")!, img = fg.createImageData(fw, fh), cols = CITIES.map(c => ({ x: c.x, z: c.z, a: hex(LAND[c.biome][0]), b: hex(LAND[c.biome][1]) }));
  for (let py = 0; py < fh; py++) for (let px = 0; px < fw; px++) {
    const x = vb.x0 + (px + 0.5) * 4 / k, z = vb.z0 + (py + 0.5) * 4 / k;
    let d0 = 1e9, d1 = 1e9, c0 = cols[0], c1 = cols[0];
    for (const c of cols) { const d = Math.hypot(c.x - x, c.z - z); if (d < d0) { d1 = d0; c1 = c0; d0 = d; c0 = c; } else if (d < d1) { d1 = d; c1 = c; } }
    const t = Math.min(1, Math.max(0, (d0 / (d0 + d1) - 0.36) / 0.14)) * 0.5, n = Math.sin(x * 0.11) * Math.sin(z * 0.13) * 0.5 + Math.sin(x * 0.031 + z * 0.027) * 0.5;
    const mixc = (a: number[], b: number[], u: number) => a.map((v, i) => v + (b[i] - v) * u), base = mixc(c0.a, c1.a, t), dark = mixc(c0.b, c1.b, t), v = mixc(base, dark, Math.max(0, n) * 0.55);
    img.data.set([v[0], v[1], v[2], 255], (py * fw + px) * 4);
  }
  fg.putImageData(img, 0, 0);
  const landCv = document.createElement("canvas"); landCv.width = W; landCv.height = H; const lg = landCv.getContext("2d")!;
  coast(14, "#000", lg); lg.globalCompositeOperation = "source-in"; lg.imageSmoothingEnabled = true; lg.drawImage(field, 0, 0, W, H);
  g.drawImage(landCv, 0, 0); rnd(); seed = 4242;   // glyphs below draw from their own sequence
  const mountain = (x: number, z: number, s: number, b: Biome) => {
    const [lit, shade, cap] = PEAK[b], px = X(x), py = Y(z), w = s * k, h = s * k * 1.15;
    g.fillStyle = shade; g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px + w, py); g.fill();
    g.fillStyle = lit; g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px - w * 0.1, py); g.fill();
    g.fillStyle = cap; g.beginPath(); g.moveTo(px - w * 0.3, py - h * 0.7); g.lineTo(px, py - h); g.lineTo(px + w * 0.3, py - h * 0.7); g.lineTo(px + w * 0.05, py - h * 0.62); g.fill();
    g.strokeStyle = "rgba(40,28,18,.45)"; g.lineWidth = Math.max(1, k * 0.8); g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px + w, py); g.stroke();
  };
  const tree = (x: number, z: number, s: number, dark: string) => {
    g.fillStyle = "#5a3a1e"; g.fillRect(X(x) - k * 0.6, Y(z) - k * s * 0.2, k * 1.2, k * s * 0.5);
    g.fillStyle = dark; g.beginPath(); g.arc(X(x), Y(z) - k * s * 0.55, k * s * 0.6, 0, 6.28); g.fill();
    g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.arc(X(x) - k * s * 0.2, Y(z) - k * s * 0.75, k * s * 0.25, 0, 6.28); g.fill();
  };
  const nearRoad = (id: string, x: number, z: number, r: number) => (ROADS.get(id) ?? []).some(([x1, z1, x2, z2]) => {
    const dx = x2 - x1, dz = z2 - z1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - x1 - dx * t, z - z1 - dz * t) < r;
  });
  // painted back to front (north first) so glyphs overlap like a hand-drawn map
  const glyphs: { z: number; draw: () => void }[] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    if (!land(i, j)) continue;
    const zone = zoneAtCell(i, j), b = biomeAt(i, j), cx = i * CELL, cz = j * CELL;
    const spot = () => [cx + (rnd() - 0.5) * CELL * 0.9, cz + (rnd() - 0.5) * CELL * 0.9] as const;
    if (!zone) {   // a hole in the grid: a lake, a thick wood or a massif (shared holeStyle, as in the game)
      const fill = holeStyle(i, j);
      if (fill === "lake") glyphs.push({ z: cz - CELL, draw: () => { for (const [r, c] of [[0.44, "#d9c795"], [0.38, "#3f8fb0"], [0.28, "#5aa9c8"]] as const) { g.fillStyle = c; g.beginPath(); g.ellipse(X(cx), Y(cz), CELL * r * k, CELL * r * k * 0.86, 0, 0, 6.28); g.fill(); } } });
      else if (fill === "forest") for (let n = 0; n < 34; n++) { const [x, z] = spot(), s = 5 + rnd() * 3; glyphs.push({ z, draw: () => tree(x, z, s, "#1f4a2c") }); }
      else for (let n = 0; n < 11; n++) { const [x, z] = spot(), s = 10 + rnd() * 12; glyphs.push({ z, draw: () => mountain(x, z, s, b) }); }
      continue;
    }
    if (zone.terrain === "pass") {
      for (let n = 0; n < 10; n++) { const [x, z] = spot(); if (nearRoad(zone.id, x, z, 16)) continue; const s = 8 + rnd() * 8; glyphs.push({ z, draw: () => mountain(x, z, s, b) }); }
    } else if (zone.terrain !== "town") {
      const n = zone.terrain === "forest" ? 26 : b === "forest" ? 14 : b === "meadow" ? 8 : 5, dark = zone.terrain === "forest" ? "#1f4a2c" : TREE[b];
      for (let t = 0; t < n; t++) { const [x, z] = spot(); if (nearRoad(zone.id, x, z, 6)) continue; const s = 4 + rnd() * 3; glyphs.push({ z, draw: () => tree(x, z, s, dark) }); }
      if (b === "volcanic") for (let t = 0; t < 5; t++) { const [x, z] = spot(); glyphs.push({ z, draw: () => { g.fillStyle = "#ff6a1e"; g.beginPath(); g.ellipse(X(x), Y(z), 5 * k, 2.2 * k, 0, 0, 6.28); g.fill(); } }); }
    }
  }
  glyphs.sort((a, b) => a.z - b.z).forEach(o => o.draw());
  // The very same connected watershed and bends used by the scene, collision and minimap.
  const rivers=scenicBorders().filter(b=>b.look==='river');
  g.lineCap=g.lineJoin='round';
  for(const [width,color] of [[10,'#aac2ac'],[6,'#327c91'],[2.5,'#76bfd0']] as const) {
    g.strokeStyle=color;g.lineWidth=Math.max(width===6?1.5:1,width*k);
    g.beginPath();
    for(const b of rivers){
      const path=riverPath(b);
      for(let i=1;i<path.length;i++){
        const a=path[i-1],p=path[i];g.lineWidth=Math.max(width===6?1.5:1,(width+(a.halfWidth+p.halfWidth-6))*k);
        g.beginPath();g.moveTo(X(a.x),Y(a.z));g.lineTo(X(p.x),Y(p.z));g.stroke();
      }
    }
    g.lineWidth=Math.max(1,width*k);g.beginPath();g.moveTo(X(RIVER_OUTLET.x),Y(RIVER_OUTLET.z));g.lineTo(X(RIVER_OUTLET.x),Y(RIVER_OUTLET.z+22));
    g.stroke();
  }
  g.lineCap = g.lineJoin = "round";   // roads under the glyphs' feet
  for (const [w, c] of [[6, "rgba(70,45,20,.55)"], [3.6, "#ecd9a8"]] as const) {
    g.strokeStyle = c; g.lineWidth = w * k;
    for (const segs of ROADS.values()) for (const [x1, z1, x2, z2] of segs) { g.beginPath(); g.moveTo(X(x1), Y(z1)); g.lineTo(X(x2), Y(z2)); g.stroke(); }
  }
  for(const b of rivers)if(b.gap){
    g.save();g.translate(X(b.gap.x),Y(b.gap.z));if(b.x1!==b.x2)g.rotate(Math.PI/2);
    g.fillStyle='#d7c49d';g.strokeStyle='#69553a';g.lineWidth=Math.max(.7,k*.8);
    const halfLength=Math.max(3.5,4.8*k),halfWidth=Math.max(1.4,2*k);
    g.fillRect(-halfLength,-halfWidth,halfLength*2,halfWidth*2);
    for(const side of [-1,1]){g.beginPath();g.moveTo(-halfLength,side*halfWidth);g.lineTo(halfLength,side*halfWidth);g.stroke();}g.restore();
  }
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const z of ZONES) {
    if (z.pk) {
      g.save(); g.beginPath(); g.rect(X(z.x0), Y(z.z0), CELL * k, CELL * k); g.clip();
      g.fillStyle = "rgba(190,25,15,.25)"; g.fillRect(X(z.x0), Y(z.z0), CELL * k, CELL * k);
      g.strokeStyle = "rgba(150,15,8,.5)"; g.lineWidth = Math.max(1, k * 1.4);
      for (let d = -CELL; d < CELL; d += 10) { g.beginPath(); g.moveTo(X(z.x0 + d), Y(z.z0)); g.lineTo(X(z.x0 + d + CELL), Y(z.z1)); g.stroke(); }
      g.restore();
    }
    if (z.terrain === "town") continue;   // towns get their castle pin (DOM) instead
    // the full name if it fits the map's width, else without the town's name (the pin says whose land it is), else smaller
    const room = CELL * k * 0.94, full = (z.pk ? "⚔ " : "") + z.name.replace(/^⚔ /, "").replace(/ Wilds$/, "");
    let label = full, fs = Math.max(9, Math.round(k * 7));
    const fit = () => { g.font = `600 ${fs}px "Mitr", sans-serif`; return g.measureText(label).width <= room; };
    if (!fit()) { label = (z.pk ? "⚔ " : "") + full.replace(/^⚔ /, "").replace(`${z.home.name} `, ""); while (!fit() && fs > 7) fs--; }
    g.lineWidth = Math.max(2, fs * 0.3); g.strokeStyle = "rgba(255,248,230,.92)"; g.fillStyle = z.pk ? "#8a0f07" : "#3b2a16";
    g.strokeText(label, X(z.i * CELL), Y(z.j * CELL) + CELL * k * 0.36); g.fillText(label, X(z.i * CELL), Y(z.j * CELL) + CELL * k * 0.36);
  }
  for (const [id, n] of bosses) {
    const z = ZONES.find(z => z.id === id); if (!z || !n) continue;
    const x = X(z.x1) - 10 * k, y = Y(z.z0) + 10 * k, r = 6 * k;
    g.fillStyle = "#a3140a"; g.strokeStyle = "#ffd36a"; g.lineWidth = Math.max(1, k); g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); g.stroke();
    g.fillStyle = "#ffd36a"; g.font = `bold ${Math.round(r * 1.3)}px sans-serif`; g.fillText("♛", x, y + 0.5);
  }
  g.strokeStyle = "rgba(60,38,18,.55)"; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, H - 3);
}
/** Percent position on the atlas for a world point. */
export const atlasPct = (x: number, z: number, view: AtlasView = fullView()) => { const vb = viewBox(view); return [((x - vb.x0) / vb.w) * 100, ((z - vb.z0) / vb.h) * 100] as const; };
