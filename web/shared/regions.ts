import { buildRiverNetwork, riverEdgeKey } from "./river-network";
/** Single source of truth for the atlas, city travel and regional encounters. */
export type Biome = 'meadow' | 'forest' | 'snow' | 'desert' | 'volcanic' | 'shadow';
export interface Region {
  id: string; name: string; realm: string; title: string; biome: Biome;
  x: number; z: number; color: number; ground: number; field: string; levels: string;
  atlas: [number, number]; description: string; monsters: string[];
}
export const CITIES: Region[] = [
  { id:'pawhaven', name:'Pawhaven', realm:'Valoria', title:'อาณาจักรกลาง', biome:'meadow', x:0, z:0, color:0xd6ba83, ground:0x66854c, field:'Wolf Grassland', levels:'1–8', atlas:[43,46], description:'ปราสาทกลางทุ่งหญ้า ใจกลางทวีป จุดเริ่มต้นของนักผจญภัย — ป่ามืดทางเหนือ ทุ่งหญ้าทางใต้ และเส้นทางสู่ทุกอาณาจักร', monsters:['MON_SLIME','MON_SHROOM','MON_WOLF_001','MON_Z_MEADOW_1','MON_Z_MEADOW_2'] },
  { id:'mossvale', name:'Mossvale', realm:'Sylvanis', title:'อาณาจักรป่าไม้', biome:'forest', x:-360, z:-90, color:0x73bd96, ground:0x285b42, field:'Emerald Wilds', levels:'3–6', atlas:[23,31], description:'นครไม้ใต้ร่มพฤกษาโบราณ เห็ดเรืองแสงและรากไม้ปกคลุมเส้นทางสู่ป่าลึก', monsters:['MON_MOSS_SLIME','MON_MOSS_GUARDIAN','MON_Z_GROVE_1','MON_Z_GROVE_2'] },
  { id:'frostford', name:'Frostford', realm:'Frostheim', title:'อาณาจักรหิมะ', biome:'snow', x:0, z:-360, color:0xb7dcf2, ground:0xc4dce8, field:'Frostwood', levels:'5–8', atlas:[43,14], description:'ป้อมปราการน้ำแข็งกลางหิมะ สนขาวและผลึกสีฟ้าเป็นถิ่นของสัตว์เกราะน้ำแข็ง', monsters:['MON_FROST_WOLF','MON_FROST_BEAR','MON_Z_GLACIER_1','MON_Z_GLACIER_2'] },
  { id:'saharak', name:'Saharak', realm:'Saharak', title:'อาณาจักรทะเลทราย', biome:'desert', x:360, z:0, color:0xe3b567, ground:0xc99b57, field:'Sunscar Dunes', levels:'6–9', atlas:[72,39], description:'นครโดมทองท่ามกลางเนินทราย เสาหินเก่าและกระบองเพชรล้อมพื้นที่ล่าริมโอเอซิส', monsters:['MON_DUNE_SCARAB','MON_SAND_SCORPION','MON_Z_DUNE_1','MON_Z_DUNE_2'] },
  { id:'ignaroth', name:'Ignaroth', realm:'Ignaroth', title:'อาณาจักรเพลิง', biome:'volcanic', x:630, z:180, color:0xf08a4d, ground:0x3e302e, field:'Ember Rift', levels:'8–12', atlas:[87,55], description:'ป้อมหินออบซิเดียน รอยแยกลาวาและยอดหินดำ สัตว์เกราะหลอมเหลวเฝ้าเส้นทาง', monsters:['MON_EMBER_BOAR','MON_MAGMA_GOLEM','MON_Z_CINDER_1','MON_Z_CINDER_2'] },
  { id:'shadowlands', name:'Shadowlands', realm:'Shadowlands', title:'ดินแดนต้องสาป', biome:'shadow', x:540, z:-360, color:0xb48ae0, ground:0x473750, field:'Hollow Reach', levels:'10–14', atlas:[83,17], description:'ปราสาทยอดแหลมกลางดินแดนสีม่วง ต้นไม้ไร้ใบและผลึกวิญญาณปกคลุมป่าต้องสาป', monsters:['MON_DUSK_STALKER','MON_VOID_REAPER','MON_Z_ECLIPSE_1','MON_Z_ECLIPSE_2'] },
];
export const isPK = (p: { x: number; z: number }) => !!zoneAt(p).pk;
export const cityAt = (p: {x:number;z:number}) => CITIES.find(c => Math.abs(p.x-c.x)<11 && Math.abs(p.z-c.z)<11);
export const regionAt = (p: {x:number;z:number}) => CITIES.reduce((best,c)=>Math.hypot(c.x-p.x,c.z-p.z)<Math.hypot(best.x-p.x,best.z-p.z)?c:best,CITIES[0]);

// ---------------------------------------------------------------- zones ("maps")
// The world is a grid of CELL×CELL maps. The towns stand in a row (every 4th column of row 0) and the country around
// them — fields, forests, mountain passes — spreads north and south too, so every town has exits on all four sides and
// there are several ways (loops, detours) between neighbouring towns. The client streams the map the player is in and
// its eight neighbours. Where two maps touch, a ridge closes the border except for a gap where a road crosses; a
// border with nothing beyond it is closed all the way.
//
// Legend: T town · . open country · F deep forest · - pass running east–west · | pass running north–south ·
// G the guild grounds (no road in or out: the guild stewards take members there and back)
// A pass only opens toward the two ends of its road; every other map opens to every map next to it.
export const CELL = 90, TOWN_ZONE_HALF = CELL / 2;
const GRID_I0 = -6, GRID_J0 = -5;
const GRID = [
  //  i = -6 … 9 (column 6 is i = 0, Pawhaven); towns sit where the painted atlas puts them
  "     ...   ...  ", // j = -5
  "    ..T.--..T.  ", // j = -4
  "  .. .|.  . ..  ", // j = -3
  " ..F..|.. ..|.  ", // j = -2
  "..T.-.F.. ...   ", // j = -1
  " ... .T.-.T..   ", // j = 0
  "  ...... ..-... ", // j = 1
  "   .  ..  ...T. ", // j = 2
  "G     .     ... ", // j = 3
];
export type Dir = "n" | "e" | "s" | "w";
export const DIRS: Record<Dir, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export interface Zone {
  id: string; name: string; kind: "town" | "route"; i: number; j: number; x0: number; x1: number; z0: number; z1: number;
  terrain: "town" | "field" | "forest" | "pass" | "hall";
  /** for a pass: which way its road runs */
  axis?: "ew" | "ns";
  /** the town whose look and creatures this map takes (the nearest one by x) */
  home: Region;
  /** open borders: where the road crosses into the neighbouring map (a point on the shared border) */
  exits: Partial<Record<Dir, { to: string; x: number; z: number }>>;
  /** free-PK map: players can attack each other here (party mates excepted) */
  pk?: boolean;
  /** monster level here: grows with the number of maps between this one and Pawhaven, up to MAX_ZONE_LEVEL */
  level: number;
}
const PASS_NAMES = ["Whispering Glade", "Frostbite Pass", "Thawing Steppe", "Cinder Flats", "Ashen Veil", "Gale Notch", "Howling Gorge", "Amber Gulch", "Serpent Ridge", "Mistveil Pass", "Crow's Stair", "Thornback Cut"];
const COMPASS = (di: number, dj: number) => (dj < 0 ? "North" : dj > 0 ? "South" : "") + (di > 0 ? (dj ? "east" : "East") : di < 0 ? (dj ? "west" : "West") : "");
const zoneId = (i: number, j: number) => CITIES.find(c => c.x === i * CELL && c.z === j * CELL)?.id ?? `c${i}_${j}`;
const cellAt = (i: number, j: number) => GRID[j - GRID_J0]?.[i - GRID_I0] ?? " ";
const opens = (ch: string, d: Dir) => ch !== " " && ch !== "G" && (ch === "-" ? d === "e" || d === "w" : ch === "|" ? d === "n" || d === "s" : true);
// deterministic jitter per border / cell, so server and client agree on every gap and bend
const hash = (a: number, b: number, c = 0) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761) >>> 0; h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; };
let passN = 0;
export const ZONES: Zone[] = [];
for (let j = GRID_J0; j < GRID_J0 + GRID.length; j++) for (let i = GRID_I0; i < GRID_I0 + GRID[0].length; i++) {
  const ch = cellAt(i, j); if (ch === " ") continue;
  const cx = i * CELL, cz = j * CELL, home = CITIES.reduce((b, c) => (Math.hypot(c.x - cx, c.z - cz) < Math.hypot(b.x - cx, b.z - cz) ? c : b), CITIES[0]);
  const hc = Math.round(home.x / CELL), hr = Math.round(home.z / CELL), town = ch === "T";
  const terrain = town ? "town" : ch === "G" ? "hall" : ch === "F" ? "forest" : ch === "-" || ch === "|" ? "pass" : "field";
  const name = town ? home.name : terrain === "hall" ? "Guild Grounds" : terrain === "pass" ? PASS_NAMES[passN++ % PASS_NAMES.length] : i === 0 && j === -1 ? "Dark Forest" : `${home.name} ${COMPASS(i - hc, j - hr)}${terrain === "forest" ? " Woods" : " Wilds"}`;
  ZONES.push({ id: zoneId(i, j), name, kind: town ? "town" : "route", i, j, x0: cx - CELL / 2, x1: cx + CELL / 2, z0: cz - CELL / 2, z1: cz + CELL / 2,
    terrain, axis: ch === "-" ? "ew" : ch === "|" ? "ns" : undefined, home, exits: {}, level: 1 });
}
const byCell = new Map(ZONES.map(z => [`${z.i},${z.j}`, z]));
export const zoneAtCell = (i: number, j: number) => byCell.get(`${i},${j}`);
// open a gap on every border both maps allow; a town's road leaves by its gate, so its gaps sit near the middle,
// anything else crosses somewhere along the border (never the same spot twice)
for (const z of ZONES) for (const d of ["e", "s"] as Dir[]) {
  const [di, dj] = DIRS[d], n = zoneAtCell(z.i + di, z.j + dj);
  if (!n || !opens(cellAt(z.i, z.j), d) || !opens(cellAt(n.i, n.j), d === "e" ? "w" : "n")) continue;
  const spread = z.terrain === "town" || n.terrain === "town" ? 10 : 26, off = (hash(z.i, z.j, d === "e" ? 1 : 2) * 2 - 1) * spread;
  const g = d === "e" ? { x: z.x1, z: z.j * CELL + off } : { x: z.i * CELL + off, z: z.z1 };
  z.exits[d] = { to: n.id, ...g }; n.exits[d === "e" ? "w" : "n"] = { to: z.id, ...g };
}
// Danger rises with distance: a map's monster level is set by how many maps lie between it and Pawhaven on the
// shortest walk, from Lv 1–2 around the starting town to Lv 99 in the farthest wilds.
export const MAX_ZONE_LEVEL = 99;
{
  const d = new Map<string, number>([["pawhaven", 0]]), q = ["pawhaven"];
  while (q.length) { const id = q.shift()!; for (const e of Object.values(ZONES.find(z => z.id === id)!.exits)) if (!d.has(e!.to)) { d.set(e!.to, d.get(id)! + 1); q.push(e!.to); } }
  const far = Math.max(...d.values());
  for (const z of ZONES) z.level = Math.max(1, Math.round(1 + (MAX_ZONE_LEVEL - 1) * Math.pow((d.get(z.id) ?? far) / far, 1.15)));
  // each realm's level band, from the maps around it
  for (const c of CITIES) { const ls = ZONES.filter(z => z.home.id === c.id).map(z => z.level); c.levels = `${Math.min(...ls)}–${Math.max(...ls)}`; }
}
/** Free-PK maps, marked on every map and announced on entry: three stretches of the eastern wilds and three in the west
 *  (dead-end maps there, so nobody has to cross one on the way somewhere). Each has its PK boss (shared/data.ts). */
export const PK_ZONES = new Set(["c7_-3", "c8_1", "c5_-1", "c-6_-1", "c-4_-3", "c-3_2"]);
for (const z of ZONES) if (PK_ZONES.has(z.id)) { z.pk = true; z.name = `⚔ ${z.name}`; }
export const zoneAt = (p: { x: number; z: number }) => {
  const i = Math.round(p.x / CELL), j = Math.round(p.z / CELL);
  return zoneAtCell(i, j) ?? ZONES.reduce((b, z) => (Math.hypot(z.i * CELL - p.x, z.j * CELL - p.z) < Math.hypot(b.i * CELL - p.x, b.j * CELL - p.z) ? z : b), ZONES[0]);
};

// ---------------------------------------------------------------- borders and holes
// What closes a border between two maps (and a map's edge where nothing lies beyond) is not always a ridge: some are
// rivers (crossed by a bridge where the road goes over) and some are thick woods. Holes in the grid are likewise a
// mountain massif, a lake or a forest. Chosen per border / hole from its cells, so everyone sees the same world; the
// desert and the volcanic lands keep to rock, the snow has fewer woods.
export type Edge = "mountain" | "river" | "forest";
export type Hole = "mountain" | "lake" | "forest";
const biomeNear = (i: number, j: number) => CITIES.reduce((b, c) => (Math.hypot(c.x - i * CELL, c.z - j * CELL) < Math.hypot(b.x - i * CELL, b.z - j * CELL) ? c : b), CITIES[0]).biome;
const watershed=buildRiverNetwork(ZONES,CITIES,CELL);
export const RIVER_OUTLET=watershed.outlet;
/** The look of the border on side `d` of cell (i, j) — the same from either side. */
export function edgeStyle(i: number, j: number, d: Dir): Edge {
  if(watershed.edges.has(riverEdgeKey(i,j,d)))return "river";
  const [di, dj] = DIRS[d], a = [i, j], b = [i + di, j + dj], [p, q] = a[0] * 100 + a[1] < b[0] * 100 + b[1] ? [a, b] : [b, a];
  const h = hash(p[0] * 31 + q[0], p[1] * 17 + q[1], 9), bio = biomeNear((i + i + di) / 2, (j + j + dj) / 2);
  if (bio === "desert" || bio === "volcanic") return "mountain";
  return h < (bio === "snow" ? .65 : .48) ? "mountain" : "forest";
}
/** What fills a hole in the grid at (i, j). */
export function holeStyle(i: number, j: number): Hole {
  const h = hash(i, j, 12), bio = biomeNear(i, j);
  if (bio === "desert" || bio === "volcanic") return "mountain";
  return h < 0.45 ? "mountain" : h < 0.72 ? "forest" : "lake";
}

// ---------------------------------------------------------------- roads
// Each map's roads run from its hub (a town's gates, or a point off the map's centre) to every open border gap, with
// a bend on the way, so no road is a straight line and no two maps look alike. A pass is one road from end to end.
export type Seg = [number, number, number, number];
export const ROADS = new Map<string, Seg[]>();   // zone id → its road segments
const APPROACH = 12;   // metres of straight road square to a border gap (a bridge spans ±4.8 m of it)
for (const z of ZONES) {
  const cx = z.i * CELL, cz = z.j * CELL, segs: Seg[] = [];
  const hub = z.terrain === "town" ? { x: cx, z: cz } : { x: cx + (hash(z.i, z.j, 3) - 0.5) * 30, z: cz + (hash(z.i, z.j, 4) - 0.5) * 30 };
  const line = (pts: { x: number; z: number }[]) => { for (let k = 1; k < pts.length; k++) segs.push([pts[k - 1].x, pts[k - 1].z, pts[k].x, pts[k].z]); };
  const bend = (a: { x: number; z: number }, b: { x: number; z: number }, k: number) => {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z) || 1, j = (hash(z.i, z.j, k) - 0.5) * Math.min(18, len * 0.4);
    return { x: mx - (b.z - a.z) / len * j, z: mz + (b.x - a.x) / len * j };
  };
  // every road meets its border gap square on, so it runs straight onto a bridge (or through a gate)
  const approach = (d: Dir, g: { x: number; z: number }) => ({ x: g.x - DIRS[d][0] * APPROACH, z: g.z - DIRS[d][1] * APPROACH });
  if (z.terrain === "pass") {   // gap → bend → hub → bend → gap, monotonic along its axis so the ridges can follow it
    const [da, db]: Dir[] = z.axis === "ew" ? ["w", "e"] : ["n", "s"], a = z.exits[da], b = z.exits[db];
    if (a && b) { const a2 = approach(da, a), b2 = approach(db, b), q1 = bend(a2, hub, 5), q2 = bend(hub, b2, 6); line(z.axis === "ew" ? [a, a2, q1, hub, q2, b2, b].sort((p, q) => p.x - q.x) : [a, a2, q1, hub, q2, b2, b].sort((p, q) => p.z - q.z)); }
  } else for (const [d, g] of Object.entries(z.exits) as [Dir, { x: number; z: number }][]) {
    const [di, dj] = DIRS[d], from = z.terrain === "town" ? { x: cx + di * 12.5, z: cz + dj * 12.5 } : hub;   // a town's road starts at its gate
    const g2 = approach(d, g); line([from, bend(from, g2, 7 + "nesw".indexOf(d)), g2, g]);
  }
  ROADS.set(z.id, segs);
}
/** Distance from p to the nearest road of its map (and the maps around it). */
export function roadDist(p: { x: number; z: number }) {
  const z = zoneAt(p); let best = Infinity;
  for (const id of [z.id, ...Object.values(z.exits).map(e => e!.to)]) for (const [x1, z1, x2, z2] of ROADS.get(id) ?? []) {
    const dx = x2 - x1, dz = z2 - z1, t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.z - z1) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(p.x - x1 - dx * t, p.z - z1 - dz * t));
  }
  return best;
}
/** A pass's road centre line: for "ew", z at x; for "ns", x at z (piecewise linear through its segments). */
export function passLine(z: Zone, t: number) {
  const segs = ROADS.get(z.id) ?? [];
  for (const [x1, z1, x2, z2] of segs) {
    const [a, b, va, vb] = z.axis === "ew" ? [x1, x2, z1, z2] : [z1, z2, x1, x2];
    if (t >= a && t <= b) return b === a ? va : va + (vb - va) * (t - a) / (b - a);
  }
  return z.axis === "ew" ? z.j * CELL : z.i * CELL;
}
