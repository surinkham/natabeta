// Map layout + collision, pure (no three): the server and every client build the same world from this.
import { NPCS } from "./data";

export interface Prop { name: string; x: number; z: number; ry: number; s: number; y: number }
export interface Solid { x: number; z: number; r: number; h: number }   // h = how tall it stands, for camera occlusion
export interface Wall { x1: number; z1: number; x2: number; z2: number }
export interface Layout { props: Prop[]; solids: Solid[]; walls: Wall[]; occluders: Solid[]; lightSpots: [number, number, number][] }   // occluders block the camera only, never the player (the gate arch)

export const TOWN_HALF = 11;
export const SPAWN = { x: 0, z: -4.5 };
export const SMITH = { x: 5.2, z: -4.2 };
// Where each monster type lives. Grassland (z > ZONE2_Z) holds the low levels, the Dark Forest the heavy ones.
export interface SpawnGroup { kind: string; x: number; z: number; n: number; spread?: number }
export const SPAWNS: SpawnGroup[] = [
  { kind: "MON_WOLF_001", x: -12, z: -22, n: 2 }, { kind: "MON_WOLF_001", x: 11, z: -24, n: 2 }, { kind: "MON_WOLF_001", x: 0, z: -32, n: 2 },
  { kind: "MON_FOX", x: -20, z: -18, n: 3, spread: 4 }, { kind: "MON_FOX", x: 18, z: -34, n: 3, spread: 4 },
  { kind: "MON_BOAR", x: -6, z: -40, n: 2, spread: 3 }, { kind: "MON_BOAR", x: 14, z: -44, n: 2, spread: 3 },
  { kind: "MON_WOLF_001", x: -11, z: -60, n: 2 }, { kind: "MON_WOLF_001", x: 12, z: -66, n: 2 },
  { kind: "MON_DIRE_WOLF", x: -14, z: -70, n: 3, spread: 4 }, { kind: "MON_DIRE_WOLF", x: 13, z: -78, n: 3, spread: 4 }, { kind: "MON_BOAR", x: 0, z: -56, n: 2, spread: 3 },
];
export const SPAWNERS = SPAWNS;   // legacy name used by the minimap
export const inTown = (p: { x: number; z: number }) => Math.abs(p.x) < TOWN_HALF && Math.abs(p.z) < TOWN_HALF;
export const MAP = { minX: -42, maxX: 42, minZ: -92, maxZ: 10.3 };
export const ZONE2_Z = -46;   // north of this line: Dark Forest (zone 2)
export const zoneName = (p: { x: number; z: number }) => inTown(p) ? "Pawhaven" : p.z < ZONE2_Z ? "Dark Forest" : "Wolf Grassland";
export const BOSS_SPAWN = { x: 0, z: -76 };

// rough silhouette heights (metres) — only used to decide whether the camera boom clears a prop
const HEIGHT: Record<string, number> = { SM_Wall: 3.4, SM_Gate: 5.5, SM_Tower: 8, SM_House: 4.6, SM_House_Stone: 7, SM_House_Stone2: 6, SM_Tavern: 7.5, SM_Stall: 3, SM_Well: 1.6, SM_Keep: 15, SM_Anvil: 1, SM_Barrel: 1, SM_Crate: 1, SM_Tree_Round: 6, SM_Tree_Pine: 8, SM_Rock_A: 1.5, SM_Rock_B: 1, SM_Bush: 1, SM_Torch: 2.4, SM_Banner: 3.4, SM_Lamp: 2.4 };

const RAD: Record<string, number> = { SM_House: 2.3, SM_Tree_Round: 0.45, SM_Tree_Pine: 0.35, SM_Rock_A: 0.7, SM_Rock_B: 0.45, SM_Barrel: 0.4, SM_Crate: 0.45, SM_Anvil: 0.7, SM_Lamp: 0.15, SM_Bush: 0.5,
  SM_Wall: 0, SM_Tower: 1.3, SM_Gate: 0, SM_House_Stone: 2.4, SM_House_Stone2: 2.0, SM_Tavern: 3.0, SM_Stall: 1.1, SM_Well: 1.0, SM_Banner: 0.1, SM_Torch: 0.1, SM_Bridge: 0, SM_Keep: 4.6, SM_Fence: 0, SM_Flower: 0 };
// flame / lantern offsets (local, y up) → night point lights
const LIGHT_AT: Record<string, [number, number, number]> = { SM_Torch: [0, 2.05, 0], SM_Lamp: [0.45, 1.9, 0], SM_House_Stone: [-1.7, 1.55, 2.2], SM_House_Stone2: [-1.4, 1.55, 1.9], SM_Tavern: [-2.9, 1.6, 2.75] };

export function buildLayout(density = 1): Layout {
  const L: Layout = { props: [], solids: [], walls: [], occluders: [], lightSpots: [] };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const put = (name: string, x: number, z: number, ry = 0, s = 1, y = 0) => {
    L.props.push({ name, x, z, ry, s, y });
    if (RAD[name]) L.solids.push({ x, z, r: RAD[name] * s + 0.25, h: (HEIGHT[name] ?? 3) * s });
    const la = LIGHT_AT[name]; if (la) { const c = Math.cos(ry), sn = Math.sin(ry); L.lightSpots.push([x + (la[0] * c + la[2] * sn) * s, y + la[1] * s, z + (-la[0] * sn + la[2] * c) * s]); }
  };
  const H = TOWN_HALF;
  for (let x = -H + 2; x <= H - 2; x += 4) put("SM_Wall", x, H, 0);
  for (const x of [-9, -5.3, 5.3, 9]) put("SM_Wall", x, -H, 0);
  for (let z = -H + 2; z <= H - 2; z += 4) { put("SM_Wall", H, z, Math.PI / 2); put("SM_Wall", -H, z, Math.PI / 2); }
  for (const [x, z] of [[-H, -H], [H, -H], [-H, H], [H, H]]) put("SM_Tower", x, z, 0);
  put("SM_Gate", 0, -H, 0);
  L.occluders.push({ x: 0, z: -H, r: 2.8, h: 5.5 });   // the arch you walk under still hides the camera
  L.walls.push({ x1: -H, z1: H, x2: H, z2: H }, { x1: -H, z1: -H, x2: -2, z2: -H }, { x1: 2, z1: -H, x2: H, z2: -H }, { x1: H, z1: -H, x2: H, z2: H }, { x1: -H, z1: -H, x2: -H, z2: H });
  put("SM_Keep", 0, 27, Math.PI, 1.4);
  put("SM_Well", 0, 1.2, 0.3);   // the client draws its own fountain here; the solid is what matters
  for (const n of Object.values(NPCS)) L.solids.push({ x: n.pos[0], z: n.pos[1], r: 0.55, h: 1 });
  put("SM_Tavern", -7.0, 2.0, Math.PI / 2); put("SM_House_Stone", 7.2, 3.0, -Math.PI / 2); put("SM_House_Stone2", -7.2, -5.5, Math.PI / 2); put("SM_House_Stone2", 7.4, -1.0, -Math.PI / 2);
  put("SM_Anvil", SMITH.x + 1.2, SMITH.z - 0.6, -0.6); put("SM_Barrel", 6.2, -4.6, 0); put("SM_Barrel", 6.9, -3.9, 0.4, 0.9);
  put("SM_Stall", -4.6, -3.6, Math.PI); put("SM_Stall", -2.0, -7.6, Math.PI / 2, 0.9); put("SM_Crate", -6.6, -1.6, 0.3); put("SM_Crate", -6.0, -2.3, 0.9, 0.8);
  for (const [x, z] of [[-2.4, -9.2], [2.4, -9.2], [-2.4, 4.6], [2.4, 4.6]]) put("SM_Torch", x, z, 0);
  for (const [x, z] of [[-3.2, -6.0], [3.2, -6.0], [-9.2, 1.5], [9.2, 1.5]]) put("SM_Banner", x, z, Math.PI);
  for (const [x, z] of [[-3.4, -13.5], [3.4, -13.5], [-3.4, -16.5], [3.4, -16.5]]) put("SM_Fence", x, z, Math.PI / 2);
  const outside = (x: number, z: number, m = 1.5) => Math.abs(x) > H + m || Math.abs(z) > H + m;
  const dense = (n: number) => Math.round(n * density);
  for (let i = 0; i < 18; i++) { const a = rnd() * 6.28, r = 14 + rnd() * 3; const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 + 2; if (outside(x, z) && !(Math.abs(x) < 3 && z < 0)) put(i % 3 ? "SM_Tree_Round" : "SM_Tree_Pine", x, z, rnd() * 6.28, 0.9 + rnd() * 0.4); }
  for (let i = 0; i < 60; i++) { const x = (rnd() - 0.5) * 84, z = -14 - rnd() * 30; if (outside(x, z) && Math.abs(x) > 2.4) put(rnd() < 0.65 ? "SM_Tree_Round" : "SM_Tree_Pine", x, z, rnd() * 6.28, 0.75 + rnd() * 0.7); }
  for (let i = 0; i < 22; i++) { const x = (rnd() - 0.5) * 80, z = -12 - rnd() * 32; if (outside(x, z)) put("SM_Bush", x, z, rnd() * 6.28, 0.7 + rnd() * 0.6); }
  for (let i = 0; i < 14; i++) { const x = (rnd() - 0.5) * 76, z = -13 - rnd() * 30; if (outside(x, z)) put(rnd() < 0.5 ? "SM_Rock_A" : "SM_Rock_B", x, z, rnd() * 6.28, 0.8 + rnd() * 0.6); }
  // zone 2: dark forest — dense pines, rocks, a gap for the road, boss clearing at BOSS_SPAWN
  for (let i = 0; i < 110; i++) { const x = (rnd() - 0.5) * 84, z = ZONE2_Z - 3 - rnd() * 42; if (Math.abs(x) > 2.6 && Math.hypot(x - BOSS_SPAWN.x, z - BOSS_SPAWN.z) > 7) put("SM_Tree_Pine", x, z, rnd() * 6.28, 1.0 + rnd() * 0.8); }
  for (let i = 0; i < 18; i++) { const x = (rnd() - 0.5) * 80, z = ZONE2_Z - 4 - rnd() * 40; if (Math.abs(x) > 3 && Math.hypot(x - BOSS_SPAWN.x, z - BOSS_SPAWN.z) > 6) put(rnd() < 0.5 ? "SM_Rock_A" : "SM_Rock_B", x, z, rnd() * 6.28, 1.0 + rnd() * 0.9); }
  for (const [x, z] of [[-3.4, ZONE2_Z + 1], [3.4, ZONE2_Z + 1]]) put("SM_Torch", x, z, 0);
  for (const [x, z] of [[-6, ZONE2_Z - 0.5], [6, ZONE2_Z - 0.5]]) put("SM_Banner", x, z, 0);
  for (let i = 0; i < dense(90); i++) { const x = (rnd() - 0.5) * 80, z = 8 - rnd() * 48; if (outside(x, z, 0.5) || (Math.abs(x) < 9 && Math.abs(z) < 9 && Math.hypot(x, z - 1) > 3)) put("SM_Flower", x, z, rnd() * 6.28, 0.8 + rnd() * 0.6); }
  return L;
}

/** Push pos out of solids and wall lines, clamp to the map. Mutates and returns pos. */
export function collide(pos: { x: number; z: number }, r: number, L: Layout) {
  for (const s of L.solids) { const dx = pos.x - s.x, dz = pos.z - s.z, d = Math.hypot(dx, dz); if (d < s.r + r && d > 0) { pos.x = s.x + dx / d * (s.r + r); pos.z = s.z + dz / d * (s.r + r); } }
  for (const w of L.walls) {
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
