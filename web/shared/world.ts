import { borderBend, riverPath } from "./scenery";
import { TOWNS } from "./towns";
// Map layout + collision, pure (no three): the server and every client build the same world from this.
import { KINGDOM_BOSSES, MONSTERS, NPCS, PK_BOSSES, nightBossOf, pkBossOf } from "./data";
import { CELL, CITIES, ROADS, ZONES, cityAt, edgeStyle, passLine, regionAt, roadDist, zoneAt, zoneAtCell, type Edge, type Region, type Zone } from "./regions";

export interface Prop { name: string; x: number; z: number; ry: number; s: number; y: number }
export interface Solid { x: number; z: number; r: number; h: number }   // h = how tall it stands, for camera occlusion
export interface Wall { x1: number; z1: number; x2: number; z2: number; ridge?: true; look?: Edge }   // look: what the border is drawn as (default a mountain ridge)   // ridge: a mountain foot, low hills near the road, so the camera ignores it
export interface Layout { props: Prop[]; solids: Solid[]; walls: Wall[]; occluders: Solid[]; lightSpots: [number, number, number][] }   // occluders block the camera only, never the player (the gate arch)

export const TOWN_HALF = 11;
export const SPAWN = { x: 0, z: -4.5 };
export const SMITH = { x: 5.2, z: -4.2 };
// Where each monster type lives. Grassland (z > ZONE2_Z) holds the low levels, the Dark Forest the heavy ones.
export interface SpawnGroup { kind: string; x: number; z: number; n: number; spread?: number; zone?: string }   // zone: a roaming boss, placed anew each spawn
export const SPAWNS: SpawnGroup[] = [
  { kind: "MON_WOLF_001", x: -12, z: -22, n: 2 }, { kind: "MON_WOLF_001", x: 11, z: -24, n: 2 }, { kind: "MON_WOLF_001", x: 0, z: -32, n: 2 },
  { kind: "MON_SLIME", x: -4, z: -15, n: 4, spread: 3 }, { kind: "MON_SLIME", x: 12, z: -20, n: 3, spread: 3 },
  { kind: "MON_SHROOM", x: 6, z: -17, n: 3, spread: 3 }, { kind: "MON_SHROOM", x: -8, z: -14, n: 3, spread: 3 }, { kind: "MON_SHROOM", x: 20, z: -28, n: 3, spread: 4 },
  { kind: "MON_FOX", x: -20, z: -18, n: 3, spread: 4 }, { kind: "MON_FOX", x: 18, z: -34, n: 3, spread: 4 },
  { kind: "MON_BOAR", x: -6, z: -40, n: 2, spread: 3 }, { kind: "MON_BOAR", x: 14, z: -44, n: 2, spread: 3 },
  { kind: "MON_WOLF_001", x: -11, z: -60, n: 2 }, { kind: "MON_WOLF_001", x: 12, z: -66, n: 2 },
  { kind: "MON_STUMP", x: 4, z: -84, n: 3, spread: 5 },
  { kind: "MON_BEAR", x: -22, z: -62, n: 2, spread: 4 }, { kind: "MON_BEAR", x: 22, z: -74, n: 2, spread: 4 },
  { kind: "MON_DIRE_WOLF", x: -14, z: -70, n: 3, spread: 4 }, { kind: "MON_DIRE_WOLF", x: 13, z: -78, n: 3, spread: 4 }, { kind: "MON_BOAR", x: 0, z: -56, n: 2, spread: 3 },
];
// night only (MonsterDef.night): bats over the meadow, vampire bats in the Dark Forest
SPAWNS.push({ kind: "MON_BAT", x: -16, z: -26, n: 4, spread: 5 }, { kind: "MON_BAT", x: 17, z: -22, n: 4, spread: 5 }, { kind: "MON_BAT", x: 45, z: -20, n: 3, spread: 5 }, { kind: "MON_BAT", x: -45, z: -22, n: 3, spread: 5 },
  { kind: "MON_VAMPIRE_BAT", x: -8, z: -64, n: 3, spread: 5 }, { kind: "MON_VAMPIRE_BAT", x: 18, z: -58, n: 3, spread: 5 });
for (const city of CITIES.slice(1)) {
  for (const [i, kind] of city.monsters.entries()) {
    SPAWNS.push({kind, x:city.x+[-9,10,-23,24][i%4], z:city.z+[-24,-39,-29,-22][i%4], n:4, spread:4});
    SPAWNS.push({kind, x:city.x+[11,-12,24,-25][i%4], z:city.z+[-58,-73,-65,-52][i%4], n:3, spread:4});
  }
}
// New meadow wildlife stays outside the safe town square.
for(const [i,kind] of CITIES[0].monsters.filter(k=>k.startsWith('MON_Z_')).entries())
  SPAWNS.push({kind,x:i?23:-23,z:i?-32:-24,n:3,spread:3});
// southern fields of every town: its first creatures, gentler than the north
for (const city of CITIES) {
  const [m1, m2] = city.monsters;
  SPAWNS.push({ kind: m1, x: city.x - 14, z: city.z + 26, n: 4, spread: 5 }, { kind: m2 ?? m1, x: city.x + 16, z: city.z + 44, n: 4, spread: 5 }, { kind: m1, x: city.x - 6, z: city.z + 66, n: 3, spread: 6 });
}
// the country between towns: each map gets its home town's tougher creatures, placed off its roads (a pass keeps
// them on its one road, the only ground there is). Deterministic, so server and clients agree.
export const ROUTE_HALF = 9;
{
  let seed = 4242; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const z of ZONES) {
    if (z.terrain === "town" || z.terrain === "hall") continue;
    const mons = z.home.monsters, pick = () => mons[Math.floor(rnd() * mons.length)];
    if (z.terrain === "pass") {
      for (const f of [0.15, 0.35, 0.55, 0.8]) {
        const t = z.axis === "ew" ? z.x0 + f * CELL : z.z0 + f * CELL, c = passLine(z, t);
        SPAWNS.push({ kind: pick(), ...(z.axis === "ew" ? { x: t, z: c } : { x: c, z: t }), n: 3, spread: 2.5 });
      }
      continue;
    }
    for (let k = 0, placed = 0; k < 80 && placed < (z.terrain === "forest" ? 7 : 6); k++) {
      const x = z.x0 + 10 + rnd() * (CELL - 20), zz = z.z0 + 10 + rnd() * (CELL - 20);
      if (roadDist({ x, z: zz }) < 7 || SPAWNS.some(s => Math.hypot(s.x - x, s.z - zz) < 13)) continue;
      SPAWNS.push({ kind: pick(), x, z: zz, n: 4, spread: 4 }); placed++;
    }
  }
}
// bosses: three per kingdom (shared/data.ts KINGDOM_BOSSES + its night lord below; Pawhaven's third is the Alpha in its
// Dark Forest clearing). A boss has no fixed lair — it appears somewhere new in its map each time (sim randomSpot), so its
// SpawnGroup only names the map. The kingdom's wild maps, farthest from town first: the night lord takes the farthest,
// the "far" day boss the next, the other day boss one halfway out — never two bosses in one map.
const wildOf = (c: Region) => ZONES.filter(z => z.home.id === c.id && z.terrain !== "town" && z.terrain !== "hall" && z.terrain !== "pass")
  .sort((a, b) => Math.hypot(b.i * CELL - c.x, b.j * CELL - c.z) - Math.hypot(a.i * CELL - c.x, a.j * CELL - c.z));
for (const b of KINGDOM_BOSSES) {
  const c = CITIES.find(c => c.id === b.city), wild = c ? wildOf(c) : []; if (!wild.length || !MONSTERS[b.id]) continue;
  const z = b.far ? wild[Math.min(1, wild.length - 1)] : wild[Math.floor(wild.length / 2)];
  SPAWNS.push({ kind: b.id, x: z.i * CELL, z: z.j * CELL, n: 1, spread: 0, zone: z.id });
}
// PK bosses: a warlord roams each free-PK map
for (const zone of Object.keys(PK_BOSSES)) { const z = ZONES.find(z => z.id === zone), kind = pkBossOf(zone); if (z && MONSTERS[kind]) SPAWNS.push({ kind, x: z.i * CELL, z: z.j * CELL, n: 1, spread: 0, zone }); }
// night bosses: each realm's lord roams the wild map of its realm farthest from its town, out only after dusk
for (const c of CITIES) {
  const kind = nightBossOf(c.id); if (!MONSTERS[kind]) continue;
  const wild = wildOf(c)[0];
  if (wild) SPAWNS.push({ kind, x: wild.i * CELL, z: wild.j * CELL, n: 1, spread: 0, zone: wild.id });
}
/** A random free spot for a roaming boss in its map: clear of solids, walls and the town square, on the road in a pass. */
export function randomSpot(L: Layout, z: Zone, rng: () => number) {
  for (let k = 0; k < 60; k++) {
    const p = { x: z.x0 + 10 + rng() * (CELL - 20), z: z.z0 + 10 + rng() * (CELL - 20) };
    if (z.terrain === "pass") { const t = z.axis === "ew" ? p.x : p.z, c = passLine(z, t) + (rng() - 0.5) * 6; if (z.axis === "ew") p.z = c; else p.x = c; }
    if (cityAt(p) || Math.hypot(p.x - z.i * CELL, p.z - z.j * CELL) < 20 && z.terrain === "town") continue;
    const q = { ...p }; collide(q, 1.2, L); if (Math.hypot(q.x - p.x, q.z - p.z) > 0.01) continue;
    if (Object.values(z.exits).some(e => Math.hypot(e!.x - p.x, e!.z - p.z) < 12)) continue;   // never camped on a gap
    return p;
  }
  return { x: z.i * CELL, z: z.j * CELL + (z.terrain === "town" ? 30 : 0) };
}
export const SPAWNERS = SPAWNS;   // legacy name used by the minimap
export const inTown = (p: { x: number; z: number }) => !!cityAt(p);
export const MAP = { minX: Math.min(...ZONES.map(z => z.x0)), maxX: Math.max(...ZONES.map(z => z.x1)), minZ: Math.min(...ZONES.map(z => z.z0)), maxZ: Math.max(...ZONES.map(z => z.z1)) };   // the grid's bounding box; borders wall off the gaps in it
export const ZONE2_Z = -46;   // north of this line: Dark Forest (zone 2)
export const zoneName = (p: { x: number; z: number }) => {
  const town = cityAt(p); if (town) return town.name;
  const zone = zoneAt(p); return zone.terrain === "town" ? zone.home.field : zone.name;   // (the guild grounds keep their own name)   // a town map outside its walls: the town's field
};
export const BOSS_SPAWN = { x: 0, z: -76 };
/** Centre of the guild grounds (the "G" map): the guild hall stands here. */
const HALL_ZONE = ZONES.find(z => z.terrain === "hall")!;
export const GUILD_HALL = { x: HALL_ZONE.i * CELL, z: HALL_ZONE.j * CELL };
/** River bridges: SM_Bridge's scale, how far it is sunk so the deck sits just over the water, its deck top and half
 *  extents (model units: it spans 4 × 2 m along its x). groundY() lifts anyone standing on one onto the deck. */
export const BRIDGE = { s: 2.4, y: -0.465 * 2.4 + 0.12, deck: 0.62, halfLen: 2, halfWidth: 1 };
/** Height of the ground under p: 0 everywhere except on a bridge deck, with a ramp at each end. */
export function groundY(p: { x: number; z: number }, L: Layout) {
  for (const b of bridgesOf(L)) {
    const dx = p.x - b.x, dz = p.z - b.z, c = Math.cos(b.ry), s = Math.sin(b.ry);
    const lx = (dx * c - dz * s) / BRIDGE.s, lz = (dx * s + dz * c) / BRIDGE.s;   // into the model's frame
    if (Math.abs(lx) > BRIDGE.halfLen || Math.abs(lz) > BRIDGE.halfWidth) continue;
    const top = BRIDGE.deck * BRIDGE.s + BRIDGE.y, ramp = Math.min(1, (BRIDGE.halfLen - Math.abs(lx)) * BRIDGE.s / 1.4);
    return Math.max(0, top * ramp);
  }
  return 0;
}
const bridgeCache = new WeakMap<Layout, Prop[]>();
const bridgesOf = (L: Layout) => { let b = bridgeCache.get(L); if (!b) bridgeCache.set(L, b = L.props.filter(p => p.name === "SM_Bridge")); return b; };

// rough silhouette heights (metres) — only used to decide whether the camera boom clears a prop
const HEIGHT: Record<string, number> = { SM_Wall: 3.4, SM_Gate: 5.5, SM_Tower: 8, SM_House: 4.6, SM_House_Stone: 7, SM_House_Stone2: 6, SM_Tavern: 7.5, SM_Stall: 3, SM_Well: 1.6, SM_Keep: 15, SM_Anvil: 1, SM_Barrel: 1, SM_Crate: 1, SM_Tree_Round: 6, SM_Tree_Pine: 8, SM_Rock_A: 1.5, SM_Rock_B: 1, SM_Bush: 1, SM_Torch: 2.4, SM_Banner: 3.4, SM_Lamp: 2.4 };

const RAD: Record<string, number> = { SM_House: 2.3, SM_Tree_Round: 0.45, SM_Tree_Pine: 0.35, SM_Rock_A: 0.7, SM_Rock_B: 0.45, SM_Barrel: 0.4, SM_Crate: 0.45, SM_Anvil: 0.7, SM_Lamp: 0.15, SM_Bush: 0.5,
  SM_Wall: 0, SM_Tower: 1.3, SM_Gate: 0, SM_House_Stone: 2.4, SM_House_Stone2: 2.0, SM_Tavern: 3.0, SM_Stall: 1.1, SM_Well: 1.0, SM_Banner: 0.1, SM_Torch: 0.1, SM_Bridge: 0, SM_Keep: 4.6, SM_Fence: 0, SM_Flower: 0 };
// flame / lantern offsets (local, y up) → night point lights
const LIGHT_AT: Record<string, [number, number, number]> = { SM_Torch: [0, 2.05, 0], SM_Lamp: [0.45, 1.9, 0], SM_House_Stone: [-1.7, 1.55, 2.2], SM_House_Stone2: [-1.4, 1.55, 1.9], SM_Tavern: [-2.9, 1.6, 2.75] };

export function buildLayout(density = 1): Layout {
  const L: Layout = { props: [], solids: [], walls: [], occluders: [], lightSpots: [] };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const SCATTER = new Set(["SM_Tree_Round", "SM_Tree_Pine", "SM_Bush", "SM_Rock_A", "SM_Rock_B"]);
  const put = (name: string, x: number, z: number, ry = 0, s = 1, y = 0) => {
    if (SCATTER.has(name) && !cityAt({ x, z }) && roadDist({ x, z }) < 3.2) return;   // keep every road clear of trees and rocks
    L.props.push({ name, x, z, ry, s, y });
    if (RAD[name]) L.solids.push({ x, z, r: RAD[name] * s + 0.25, h: (HEIGHT[name] ?? 3) * s });
    const la = LIGHT_AT[name]; if (la) { const c = Math.cos(ry), sn = Math.sin(ry); L.lightSpots.push([x + (la[0] * c + la[2] * sn) * s, y + la[1] * s, z + (-la[0] * sn + la[2] * c) * s]); }
  };
  const H = TOWN_HALF;
  // four gates: every wall leaves a 4 m gap in the middle (N and S roads, the E–W royal road)
  for (const x of [-9, -5.3, 5.3, 9]) { put("SM_Wall", x, H, 0); put("SM_Wall", x, -H, 0); }
  // side walls leave a gap at |z| < 2 on both flanks: the realm road runs straight through every town
  for (const z of [-9, -5.3, 5.3, 9]) { put("SM_Wall", H, z, Math.PI / 2); put("SM_Wall", -H, z, Math.PI / 2); }
  put("SM_Gate", H, 0, Math.PI / 2); put("SM_Gate", -H, 0, Math.PI / 2);
  L.occluders.push({ x: H, z: 0, r: 2.8, h: 5.5 }, { x: -H, z: 0, r: 2.8, h: 5.5 });
  for (const [x, z] of [[-H, -H], [H, -H], [-H, H], [H, H]]) put("SM_Tower", x, z, 0);
  put("SM_Gate", 0, -H, 0); put("SM_Gate", 0, H, 0);
  L.occluders.push({ x: 0, z: -H, r: 2.8, h: 5.5 }, { x: 0, z: H, r: 2.8, h: 5.5 });   // the arch you walk under still hides the camera
  L.walls.push({ x1: -H, z1: H, x2: -2, z2: H }, { x1: 2, z1: H, x2: H, z2: H }, { x1: -H, z1: -H, x2: -2, z2: -H }, { x1: 2, z1: -H, x2: H, z2: -H },
    { x1: H, z1: -H, x2: H, z2: -2 }, { x1: H, z1: 2, x2: H, z2: H }, { x1: -H, z1: -H, x2: -H, z2: -2 }, { x1: -H, z1: 2, x2: -H, z2: H });
  // (the old keep that stood in the southern fields at (-30, 30) is gone: a 21 m block in open ground the follow camera
  // ended up inside of — the view went solid; the guild grounds keep their hall)
  put("SM_Well", 0, 1.2, 0.3);   // the client draws its own fountain here; the solid is what matters
  for (const n of Object.values(NPCS)) L.solids.push({ x: n.pos[0], z: n.pos[1], r: 0.55, h: 1 });
  // buildings keep clear of the east–west road (|z| < 2) that runs gate to gate
  put("SM_Tavern", -7.8, 6.8, Math.PI / 2); put("SM_House_Stone", 7.6, 6.6, -Math.PI / 2); put("SM_House_Stone2", -7.2, -5.5, Math.PI / 2); put("SM_House_Stone2", 8.2, -8.2, -Math.PI / 2);
  put("SM_Anvil", SMITH.x + 1.2, SMITH.z - 0.6, -0.6); put("SM_Barrel", 6.2, -4.6, 0); put("SM_Barrel", 6.9, -3.9, 0.4, 0.9);
  put("SM_Stall", -4.6, -3.6, Math.PI); put("SM_Stall", -2.0, -7.6, Math.PI / 2, 0.9); put("SM_Crate", -6.6, -1.6, 0.3); put("SM_Crate", -6.0, -2.3, 0.9, 0.8);
  for (const [x, z] of [[-2.4, -9.2], [2.4, -9.2], [-2.4, 4.6], [2.4, 4.6]]) put("SM_Torch", x, z, 0);
  for (const [x, z] of [[-3.2, -6.0], [3.2, -6.0], [-9.2, 2.6], [9.2, 2.6]]) put("SM_Banner", x, z, Math.PI);
  for (const [x, z] of [[-3.4, -13.5], [3.4, -13.5], [-3.4, -16.5], [3.4, -16.5]]) put("SM_Fence", x, z, Math.PI / 2);
  const outside = (x: number, z: number, m = 1.5) => Math.abs(x) > H + m || Math.abs(z) > H + m;
  const dense = (n: number) => Math.round(n * density);
  for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, r = 14 + rnd() * 3; const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 + 2; if (outside(x, z) && Math.abs(x) >= 3 && Math.abs(z) > 3.2) put(i % 3 ? "SM_Tree_Round" : "SM_Tree_Pine", x, z, rnd() * 6.28, 0.9 + rnd() * 0.4); }
  for (let i = 0; i < 60; i++) { const x = (rnd() - 0.5) * 84, z = -14 - rnd() * 30; if (outside(x, z) && Math.abs(x) > 2.4) put(rnd() < 0.65 ? "SM_Tree_Round" : "SM_Tree_Pine", x, z, rnd() * 6.28, 0.75 + rnd() * 0.7); }
  for (let i = 0; i < 22; i++) { const x = (rnd() - 0.5) * 80, z = -12 - rnd() * 32; if (outside(x, z)) put("SM_Bush", x, z, rnd() * 6.28, 0.7 + rnd() * 0.6); }
  for (let i = 0; i < 14; i++) { const x = (rnd() - 0.5) * 76, z = -13 - rnd() * 30; if (outside(x, z)) put(rnd() < 0.5 ? "SM_Rock_A" : "SM_Rock_B", x, z, rnd() * 6.28, 0.8 + rnd() * 0.6); }
  // zone 2: dark forest — dense pines, rocks, a gap for the road, boss clearing at BOSS_SPAWN
  for (let i = 0; i < 110; i++) { const x = (rnd() - 0.5) * 84, z = ZONE2_Z - 3 - rnd() * 42; if (Math.abs(x) > 2.6 && Math.hypot(x - BOSS_SPAWN.x, z - BOSS_SPAWN.z) > 7) put("SM_Tree_Pine", x, z, rnd() * 6.28, 1.0 + rnd() * 0.8); }
  for (let i = 0; i < 18; i++) { const x = (rnd() - 0.5) * 80, z = ZONE2_Z - 4 - rnd() * 40; if (Math.abs(x) > 3 && Math.hypot(x - BOSS_SPAWN.x, z - BOSS_SPAWN.z) > 6) put(rnd() < 0.5 ? "SM_Rock_A" : "SM_Rock_B", x, z, rnd() * 6.28, 1.0 + rnd() * 0.9); }
  for (const [x, z] of [[-3.4, ZONE2_Z + 1], [3.4, ZONE2_Z + 1]]) put("SM_Torch", x, z, 0);
  for (const [x, z] of [[-6, ZONE2_Z - 0.5], [6, ZONE2_Z - 0.5]]) put("SM_Banner", x, z, 0);
  // flowers scale with the quality density, so they draw from their own RNG: otherwise a low-quality client would
  // shift every random solid placed after them and disagree with the server about where trees stand
  let fseed = 99; const frnd = () => (fseed = (fseed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < dense(90); i++) { const x = (frnd() - 0.5) * 80, z = 8 - frnd() * 48; if (outside(x, z, 0.5) || (Math.abs(x) < 9 && Math.abs(z) < 9 && Math.hypot(x, z - 1) > 3)) put("SM_Flower", x, z, frnd() * 6.28, 0.8 + frnd() * 0.6); }
  // Pawhaven's southern fields (the keep stands at (-30, 30))
  for (let i = 0; i < 50; i++) {
    const x = (rnd() - 0.5) * 84, z = 14 + rnd() * 74;
    if (Math.abs(x) > 3.5 && Math.hypot(x + 30, z - 30) > 9 && !SPAWNS.some(s => Math.hypot(s.x - x, s.z - z) < 7)) put(rnd() < 0.7 ? "SM_Tree_Round" : "SM_Tree_Pine", x, z, rnd() * 6.28, 0.8 + rnd() * 0.6);
  }
  for (const city of CITIES.slice(1)) {
    const cx = city.x, cz = city.z;
    for (const x of [-9, -5, 5, 9]) put("SM_Wall", cx+x, cz-H);
    for (const x of [-9, -5, 5, 9]) put("SM_Wall", cx+x, cz+H);
    for (const z of [-9, -5.3, 5.3, 9]) for (const side of [-1, 1]) put("SM_Wall", cx+side*H, cz+z, Math.PI/2);
    for (const side of [-1, 1]) { put("SM_Gate", cx+side*H, cz, Math.PI/2); L.occluders.push({ x: cx+side*H, z: cz, r: 2.8, h: 5.5 }); }
    for (const x of [-H, H]) for (const z of [-H, H]) put("SM_Tower", cx+x, cz+z);
    put("SM_Gate", cx, cz-H); put("SM_Gate", cx, cz+H);
    L.occluders.push({ x: cx, z: cz-H, r: 2.8, h: 5.5 }, { x: cx, z: cz+H, r: 2.8, h: 5.5 });
    L.walls.push({ x1: cx-H, z1: cz+H, x2: cx-2, z2: cz+H }, { x1: cx+2, z1: cz+H, x2: cx+H, z2: cz+H }, { x1: cx-H, z1: cz-H, x2: cx-2, z2: cz-H }, { x1: cx+2, z1: cz-H, x2: cx+H, z2: cz-H },
      { x1: cx-H, z1: cz-H, x2: cx-H, z2: cz-2 }, { x1: cx-H, z1: cz+2, x2: cx-H, z2: cz+H }, { x1: cx+H, z1: cz-H, x2: cx+H, z2: cz-2 }, { x1: cx+H, z1: cz+2, x2: cx+H, z2: cz+H });
    for(const b of TOWNS[city.biome]!.buildings) put(b.name,cx+b.x,city.z+b.z,b.ry,b.s);
    for (const x of [-2.8, 2.8]) put("SM_Torch", cx+x, cz-9);
    for (const x of [-2.8, 2.8]) put("SM_Torch", cx+x, cz+9);
    for (let i = 0; i < 40; i++) {   // southern fields
      const x = cx+(rnd()-0.5)*70, z = cz+16+rnd()*70;
      if (Math.abs(x-cx) > 4 && !SPAWNS.some(s => Math.hypot(s.x-x,s.z-z) < 8)) put(city.biome === "forest" ? "SM_Tree_Round" : city.biome === "snow" ? "SM_Tree_Pine" : "SM_Rock_A", x, z, rnd()*6.28, 0.8+rnd()*0.5);
    }
    for (let i = 0; i < 65; i++) {
      const x = cx+(rnd()-0.5)*62, z = cz-16-rnd()*70;
      if (Math.abs(x-cx) > 4 && !SPAWNS.some(s => Math.hypot(s.x-x,s.z-z) < 8)) put(city.biome === "forest" ? "SM_Tree_Round" : city.biome === "snow" ? "SM_Tree_Pine" : "SM_Rock_A", x, z, rnd()*6.28, 0.8+rnd()*0.5);
    }
  }
  for (const city of CITIES.slice(1)) {
    L.solids.push({x:city.x,z:city.z+4,r:1.45,h:5});   // landmark, moved off the east–west road
    for (let i=0;i<14;i++) {
      const x=city.x+(i%2 ? 1 : -1)*(16+(i%3)*5),z=city.z-19-i*4.5;
      L.solids.push({x,z,r:0.9,h:3.4});
    }
  }
  // Mossvale's ancient grove uses its own deterministic sequence so added trees do not
  // move other realms' props. Keep the four gates, roads, residents and encounter clearings open.
  {
    const city=CITIES.find(c=>c.id==='mossvale')!;
    const plant=(x:number,z:number,i:number,scale:number)=>put(i%2?'SM_Tree_Pine':'SM_Tree_Round',city.x+x,city.z+z,i*2.399,scale);
    for(const [i,[x,z]] of [[-9,-8],[-5,-8],[5,-8],[9,-8],[-9,8],[-5,8],[5,8],[9,8],[-9,-1.8],[9,2.2]].entries())plant(x,z,i,.82);
    let groveSeed=9281;const groveRandom=()=>((groveSeed=Math.imul(groveSeed,1664525)+1013904223>>>0)/4294967296);
    for(let i=0;i<360;i++){
      const x=city.x+(groveRandom()-.5)*80,z=city.z+(groveRandom()-.5)*80;
      if(Math.abs(x-city.x)<14&&Math.abs(z-city.z)<14)continue;
      if(roadDist({x,z})<5||SPAWNS.some(p=>Math.hypot(p.x-x,p.z-z)<(p.spread??4)+2))continue;
      if(L.solids.some(p=>Math.hypot(p.x-x,p.z-z)<p.r+1.8))continue;
      plant(x-city.x,z-city.z,i,1+groveRandom()*.45);
    }
  }
  // the guild grounds: a keep for the hall, banners, torches, a well and flower beds round a paved yard
  {
    const { x: hx, z: hz } = GUILD_HALL;
    put("SM_Keep", hx, hz - 12, 0, 1.6); put("SM_Tavern", hx - 16, hz - 2, Math.PI / 2); put("SM_House_Stone", hx + 16, hz - 2, -Math.PI / 2);
    for (const s of [-1, 1]) { put("SM_Banner", hx + s * 6, hz - 3); put("SM_Torch", hx + s * 4, hz + 4); put("SM_Torch", hx + s * 4, hz + 12); put("SM_Stall", hx + s * 10, hz + 10, s * Math.PI / 2, 0.9); }
    put("SM_Well", hx, hz + 18, 0.3);
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = 26 + rnd() * 14; put(rnd() < 0.6 ? "SM_Tree_Round" : "SM_Tree_Pine", hx + Math.cos(a) * r, hz + Math.sin(a) * r, rnd() * 6.28, 0.9 + rnd() * 0.5); }
    for (let i = 0; i < 30; i++) put("SM_Flower", hx + (rnd() - 0.5) * 30, hz + 20 + rnd() * 10, rnd() * 6.28);
  }
  // map borders: a ridge (wall; the client draws the peaks) along every border, open only where a road crosses. Each
  // shared border is walled once (by the map west / north of it); outer sides with no map beyond are closed whole.
  const R = ROUTE_HALF;
  // A ridge is one wall line. A river or a belt of woods is a band: a wall along each side (so nobody wades in or walks
  // through the trees) closed at both ends of the gap — a river's gap is just the bridge's width, and the road
  // crosses on the bridge (SM_Bridge spans 4 × 2 m along its x; scaled and sunk so its deck sits just over the water).
  const BAND = { river: 3.2, forest: 3 };
  const border = (look: Edge, x1: number, z1: number, x2: number, z2: number, gap?: { x: number; z: number }) => {
    const v = x1 === x2, half = look === "river" ? BRIDGE.s * 0.85 : R;   // the walkable half-width of the crossing
    if(look==='river'){
      const path=riverPath({x1,z1,x2,z2,look,gap}),g=gap?Math.hypot(gap.x-x1,gap.z-z1):undefined;
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i];
        if(g!==undefined&&Math.abs((a.t+b.t)/2-g)<half)continue;
        for(const side of [-1,1])L.walls.push({x1:a.x+a.nx*(a.halfWidth+.2)*side,z1:a.z+a.nz*(a.halfWidth+.2)*side,x2:b.x+b.nx*(b.halfWidth+.2)*side,z2:b.z+b.nz*(b.halfWidth+.2)*side,ridge:true,look});
      }
      if(gap){
        for(const d of [-half,half]){
          const a=path.find(p=>Math.abs(p.t-(g!+d))<.001)!;
          L.walls.push({x1:a.x+a.nx*3.2,z1:a.z+a.nz*3.2,x2:a.x-a.nx*3.2,z2:a.z-a.nz*3.2,ridge:true,look});
        }
        put('SM_Bridge',gap.x,gap.z,v?0:Math.PI/2,BRIDGE.s,BRIDGE.y);
      }
      return;
    }
    const seg = (a0: number, a1: number, o: number) => v ? { x1: x1 + o, z1: a0, x2: x1 + o, z2: a1, ridge: true as const, look } : { x1: a0, z1: z1 + o, x2: a1, z2: z1 + o, ridge: true as const, look };
    const [a0, a1] = v ? [z1, z2] : [x1, x2], g = gap ? (v ? gap.z : gap.x) : 0;
    const spans: [number, number][] = gap ? [[a0, g - half], [g + half, a1]] : [[a0, a1]];
    const offs = look === "mountain" ? [0] : [-BAND[look], BAND[look]];
    for (const [s0, s1] of spans) for (const o of offs) {
      if(look==='mountain') { L.walls.push(seg(s0,s1,o));continue; }
      const count=Math.max(1,Math.ceil((s1-s0)/6));
      for(let i=0;i<count;i++) {
        const a=s0+(s1-s0)*i/count,b=s0+(s1-s0)*(i+1)/count;
        const da=borderBend(a-a0,a1-a0,x1,z1,gap?g-a0:undefined),db=borderBend(b-a0,a1-a0,x1,z1,gap?g-a0:undefined);
        const wall=seg(a,b,o);if(v){wall.x1-=da;wall.x2-=db;}else{wall.z1+=da;wall.z2+=db;}L.walls.push(wall);
      }
    }
    if (gap && look !== "mountain") for (const at of [g - half, g + half])   // caps: the band cannot be entered from the gap
      L.walls.push(v ? { x1: x1 - BAND[look], z1: at, x2: x1 + BAND[look], z2: at, ridge: true, look } : { x1: at, z1: z1 - BAND[look], x2: at, z2: z1 + BAND[look], ridge: true, look });

  };
  for (const z of ZONES) {
    border(edgeStyle(z.i, z.j, "w"), z.x0, z.z0, z.x0, z.z1, z.exits.w); border(edgeStyle(z.i, z.j, "n"), z.x0, z.z0, z.x1, z.z0, z.exits.n);
    if (!zoneAtCell(z.i + 1, z.j)) border(edgeStyle(z.i, z.j, "e"), z.x1, z.z0, z.x1, z.z1);
    if (!zoneAtCell(z.i, z.j + 1)) border(edgeStyle(z.i, z.j, "s"), z.x0, z.z1, z.x1, z.z1);
  }
  const tree = (x: number) => { const b = regionAt({ x, z: 0 }).biome; return b === "snow" || b === "shadow" ? "SM_Tree_Pine" : b === "desert" || b === "volcanic" ? "SM_Rock_A" : rnd() < 0.6 ? "SM_Tree_Round" : "SM_Tree_Pine"; };
  // open country and deep forest: trees (fixed counts — these are solids, server and client must agree) off the roads
  for (const z of ZONES) if (z.terrain === "field" || z.terrain === "forest") {
    const forest = z.terrain === "forest";
    for (let i = 0; i < (forest ? 150 : 90); i++) {
      const x = z.x0 + 4 + rnd() * (CELL - 8), zz = z.z0 + 4 + rnd() * (CELL - 8);
      if (SPAWNS.some(s => !s.zone && Math.hypot(s.x - x, s.z - zz) < 6)) continue;
      put(forest ? "SM_Tree_Pine" : tree(x), x, zz, rnd() * 6.28, (forest ? 1 : 0.8) + rnd() * 0.6);
    }
    for (let i = 0; i < 16; i++) put(rnd() < 0.5 ? "SM_Rock_B" : "SM_Bush", z.x0 + rnd() * CELL, z.z0 + rnd() * CELL, rnd() * 6.28, 0.8 + rnd() * 0.7);
  }
  // passes: ridges R either side of the road, following its bends, verge trees and a rest camp by the road
  for (const z of ZONES) if (z.terrain === "pass") {
    const ew = z.axis === "ew", segs = ROADS.get(z.id) ?? [];
    const ts = [...new Set(segs.flatMap(([x1, z1, x2, z2]) => (ew ? [x1, x2] : [z1, z2])))].sort((a, b) => a - b);
    const at = (t: number, off: number) => (ew ? { x: t, z: passLine(z, t) + off } : { x: passLine(z, t) + off, z: t });
    for (let i = 1; i < ts.length; i++) for (const s of [-1, 1]) { const a = at(ts[i - 1], s * R), b = at(ts[i], s * R); L.walls.push({ x1: a.x, z1: a.z, x2: b.x, z2: b.z, ridge: true }); }
    for (let i = 0; i < 26; i++) {
      // an east–west pass keeps its trees on the north verge: one on the camera side would hide the player
      const t = (ew ? z.x0 : z.z0) + 4 + rnd() * (CELL - 8), side = ew ? -1 : rnd() < 0.5 ? -1 : 1;
      const p = at(t, side * (6.2 + rnd() * 2.2)); put(tree(p.x), p.x, p.z, rnd() * 6.28, 0.7 + rnd() * 0.4);
    }
    for (let i = 0; i < 14; i++) { const p = at((ew ? z.x0 : z.z0) + rnd() * CELL, (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 3.5)); put(rnd() < 0.5 ? "SM_Rock_B" : "SM_Bush", p.x, p.z, rnd() * 6.28, 0.7 + rnd() * 0.6); }
    const c = at((ew ? z.i : z.j) * CELL, -5.6);   // rest camp: torches, crates, a banner, just off the road
    put("SM_Torch", c.x - 2.5, c.z); put("SM_Torch", c.x + 2.5, c.z); put("SM_Banner", c.x, c.z - (ew ? 2.4 : 0));
    put("SM_Crate", c.x - 1.2, c.z - 1.4, 0.4); put("SM_Barrel", c.x + 1.4, c.z - 1.4);
  }
  return L;
}

// Spatial hash of a layout's solids and walls (HASH m buckets), built on first use: thousands of trees and hundreds of
// ridge segments are only tested where the body actually stands.
const HASH = 8;
const hashCache = new WeakMap<Layout, { solids: Map<number, Solid[]>; walls: Map<number, Wall[]> }>();
const hkey = (i: number, j: number) => (i + 5000) * 10000 + (j + 5000);
function hashOf(L: Layout) {
  let h = hashCache.get(L); if (h) return h;
  h = { solids: new Map(), walls: new Map() };
  const add = <T>(m: Map<number, T[]>, v: T, x0: number, z0: number, x1: number, z1: number) => {
    for (let i = Math.floor(x0 / HASH); i <= Math.floor(x1 / HASH); i++) for (let j = Math.floor(z0 / HASH); j <= Math.floor(z1 / HASH); j++) { const k = hkey(i, j); (m.get(k) ?? m.set(k, []).get(k)!).push(v); }
  };
  const M = 2;   // margin: the biggest body radius plus the wall band
  for (const s of L.solids) add(h.solids, s, s.x - s.r - M, s.z - s.r - M, s.x + s.r + M, s.z + s.r + M);
  for (const w of L.walls) {
    if (w.x1 === w.x2 || w.z1 === w.z2) { add(h.walls, w, Math.min(w.x1, w.x2) - M, Math.min(w.z1, w.z2) - M, Math.max(w.x1, w.x2) + M, Math.max(w.z1, w.z2) + M); continue; }
    const n = Math.ceil(Math.hypot(w.x2 - w.x1, w.z2 - w.z1) / HASH) + 1;   // slanted: bucket along the line, not its box
    for (let k = 0; k <= n; k++) { const x = w.x1 + (w.x2 - w.x1) * k / n, z = w.z1 + (w.z2 - w.z1) * k / n; add(h.walls, w, x - M - HASH / 2, z - M - HASH / 2, x + M + HASH / 2, z + M + HASH / 2); }
  }
  for (const m of [h.solids, h.walls] as Map<number, unknown[]>[]) for (const [k, v] of m) m.set(k, [...new Set(v)]);
  hashCache.set(L, h); return h;
}
const NONE: never[] = [];

/** Push pos out of solids and wall lines, clamp to the map. Mutates and returns pos. */
export function collide(pos: { x: number; z: number }, r: number, L: Layout) {
  const H = hashOf(L), k = hkey(Math.floor(pos.x / HASH), Math.floor(pos.z / HASH));
  for (const s of H.solids.get(k) ?? NONE) { const dx = pos.x - s.x, dz = pos.z - s.z, d = Math.hypot(dx, dz); if (d < s.r + r && d > 0) { pos.x = s.x + dx / d * (s.r + r); pos.z = s.z + dz / d * (s.r + r); } }
  for (const w of H.walls.get(k) ?? NONE) {
    if (w.x1 !== w.x2 && w.z1 !== w.z2) {   // a slanted ridge (a bend in a pass): push out along the normal
      const dx = w.x2 - w.x1, dz = w.z2 - w.z1, len2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((pos.x - w.x1) * dx + (pos.z - w.z1) * dz) / len2));
      const cx = w.x1 + dx * t, cz = w.z1 + dz * t, ox = pos.x - cx, oz = pos.z - cz, d = Math.hypot(ox, oz), min = 0.6 + r;
      if (d < min && d > 1e-6) { pos.x = cx + ox / d * min; pos.z = cz + oz / d * min; }
      continue;
    }
    if (w.z1 === w.z2) { if (Math.abs(pos.z - w.z1) < 0.6 + r && pos.x >= Math.min(w.x1, w.x2) - r && pos.x <= Math.max(w.x1, w.x2) + r) pos.z = w.z1 + Math.sign(pos.z - w.z1 || 1) * (0.6 + r); }
    else if (Math.abs(pos.x - w.x1) < 0.6 + r && pos.z >= Math.min(w.z1, w.z2) - r && pos.z <= Math.max(w.z1, w.z2) + r) pos.x = w.x1 + Math.sign(pos.x - w.x1 || 1) * (0.6 + r);
  }
  pos.x = Math.max(MAP.minX, Math.min(MAP.maxX, pos.x)); pos.z = Math.max(MAP.minZ, Math.min(MAP.maxZ, pos.z));
  return pos;
}

// Camera occlusion. The 2.5D boom sits 7.4 m up and 7.4 m back, so standing just inside the town wall (or beside the
// keep) buries the camera in geometry. Ray-testing the scene is out — the props are instanced trees with thousands of
// triangles each — so the boom is checked against the same collision data the player walks on.
const OCCLUDER_R = 1.0;        // only props this wide are worth moving the camera for (houses, towers, walls)
const WALL_H = 3.4;
const WALL_HALF = 0.7;

const blockerCache = new WeakMap<Layout, Solid[]>();
/** Props wide enough to be worth moving the camera for, plus the camera-only occluders. Cached per layout. */
function blockers(L: Layout) {
  let list = blockerCache.get(L);
  if (!list) { list = [...L.solids.filter(s => s.r >= OCCLUDER_R), ...L.occluders]; blockerCache.set(L, list); }
  return list;
}

/** Fraction of the boom that stays clear of tall props: 1 = nothing in the way, 0.5 = pulled right in. */
export function clearBoom(from: { x: number; z: number }, offset: { x: number; y: number; z: number }, L: Layout, fromY = 1.0, minT = 0.5): number {
  let t = 1;
  const dx = offset.x, dz = offset.z, len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return 1;
  const clears = (h: number) => (offset.y > 0 ? Math.min(1, (h - fromY) / offset.y) : 1);   // boom is above h past this point
  for (const s of blockers(L)) {
    const limit = clears(s.h);
    if (limit <= 0) continue;
    const ox = s.x - from.x, oz = s.z - from.z;
    const proj = (ox * dx + oz * dz) / len2;
    const near = Math.max(0, Math.min(proj, limit));                    // nearest point of the blocked stretch
    const cx = from.x + dx * near - s.x, cz = from.z + dz * near - s.z;
    if (cx * cx + cz * cz > s.r * s.r) continue;                        // that stretch stays outside the prop
    const perp2 = (() => { const px = from.x + dx * proj - s.x, pz = from.z + dz * proj - s.z; return px * px + pz * pz; })();
    const half = Math.sqrt(Math.max(0, s.r * s.r - perp2)) / Math.sqrt(len2);
    t = Math.min(t, proj - half - 0.15);
  }
  const wallLimit = clears(WALL_H);
  for (const w of L.walls) {
    if (wallLimit <= 0) break;
    if (w.ridge) continue;
    // walls are axis-aligned bands; find where the boom crosses the band, if at all
    const vertical = w.x1 === w.x2;
    const denom = vertical ? dx : dz;
    if (Math.abs(denom) < 1e-6) continue;
    const cross = ((vertical ? w.x1 - from.x : w.z1 - from.z) + Math.sign(denom) * -WALL_HALF) / denom;
    if (cross <= 0 || cross > wallLimit + 0.2) continue;
    const hitX = from.x + dx * cross, hitZ = from.z + dz * cross;
    const [lo, hi] = vertical ? [Math.min(w.z1, w.z2), Math.max(w.z1, w.z2)] : [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)];
    const along = vertical ? hitZ : hitX;
    if (along < lo - 0.3 || along > hi + 0.3) continue;                 // passes through the gate opening
    t = Math.min(t, cross - 0.1);
  }
  return Math.max(minT, Math.min(1, t));
}
