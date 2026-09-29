import { borderBend, riverPath } from "../scenery";
import { describe, expect, it } from 'vitest';
import { Sim, stepPlayer } from '../sim';
import { CELL, CITIES, DIRS, ZONES, edgeStyle, passLine, zoneAt, type Dir } from '../regions';
import { ROUTE_HALF, SPAWNS, buildLayout, collide, groundY, inTown, zoneName } from '../world';
import { KINGDOM_BOSSES, MONSTERS, nightBossOf } from '../data';

import { findPath } from '../path';

// Walk a path the way the client does (straight at each waypoint, sliding on collisions); returns where we end up.
const walk = (L: ReturnType<typeof buildLayout>, p: { x: number; z: number }, path: { x: number; z: number }[]) => {
  for (const w of path) for (let t = 0; t < 3000 && Math.hypot(w.x - p.x, w.z - p.z) > 0.15; t++) {
    const d = Math.hypot(w.x - p.x, w.z - p.z), s = Math.min(0.1, d); p.x += (w.x - p.x) / d * s; p.z += (w.z - p.z) / d * s; collide(p, 0.35, L);
  }
  return p;
};
/** Map-to-map route (breadth-first over open borders). */
const route = (from: string, to: string) => {
  const prev = new Map<string, string>([[from, '']]), q = [from];
  while (q.length) { const id = q.shift()!; if (id === to) break; for (const e of Object.values(ZONES.find(z => z.id === id)!.exits)) if (!prev.has(e!.to)) { prev.set(e!.to, id); q.push(e!.to); } }
  const out: string[] = []; for (let id = to; id; id = prev.get(id)!) out.unshift(id); return out;
};

// The world is a grid of maps: every town opens on all four sides, the country between towns has several ways
// through, borders are ridges except where a road crosses, and a pass is walkable only along its road.
describe('world travel', () => {
  it('walks from each town to the next, map by map through the border gaps', () => {
    const L = buildLayout(), order = [...CITIES].sort((a, b) => a.x - b.x);
    for (let i = 0; i + 1 < order.length; i++) {
      const maps = route(order[i].id, order[i + 1].id); expect(maps.length, `${order[i].id}→${order[i + 1].id}`).toBeGreaterThan(3);
      const p = { x: order[i].x, z: order[i].z + 4 };
      for (let k = 0; k + 1 < maps.length; k++) {
        const z = ZONES.find(z => z.id === maps[k])!, [d, g] = Object.entries(z.exits).find(([, e]) => e!.to === maps[k + 1])! as [Dir, { x: number; z: number }];
        const [di, dj] = DIRS[d], path = findPath(L, p, { x: g.x - di * 1.5, z: g.z - dj * 1.5 }, z);
        expect(path, `no way across ${z.id}`).not.toBeNull();
        walk(L, p, [...path!, { x: g.x + di * 3, z: g.z + dj * 3 }]);   // step through the gap into the next map
        expect(zoneAt(p).id, `stuck in ${z.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(maps[k + 1]);
      }
    }
  });
  it('every town opens to a neighbouring map on all four sides, and there is more than one way between towns', () => {
    for (const c of CITIES) expect(Object.keys(ZONES.find(z => z.id === c.id)!.exits).sort(), c.id).toEqual(['e', 'n', 's', 'w']);
    // cut the direct road between Pawhaven and Frostford's neighbours: a detour still exists
    expect(ZONES.filter(z => z.terrain === 'pass').length).toBeGreaterThan(4);
    expect(new Set(ZONES.map(z => z.j)).size).toBeGreaterThan(3);   // maps north and south of the town row, not a strip
  });
  it('borders are ridges except at a road gap, and a pass is walkable only along its road', () => {
    const L = buildLayout();
    for (const z of ZONES) {
      // walking across the west border away from any gap is blocked
      const g = z.exits.w, zz = g ? (g.z > z.j * CELL ? z.z0 + 8 : z.z1 - 8) : z.j * CELL;
      const look=edgeStyle(z.i,z.j,'w');
      const path=look==='river'?riverPath({x1:z.x0,z1:z.z0,x2:z.x0,z2:z.z1,look,gap:g}):[];
      const boundaryAt=(at:number)=>{
        if(look!=='river')return z.x0-(look==='mountain'?0:borderBend(at-z.z0,CELL,z.x0,z.z0,g?g.z-z.z0:undefined));
        const i=path.findIndex((p,i)=>i>0&&p.z>=at),a=path[Math.max(0,i-1)],b=path[i<0?path.length-1:i];
        return a.x+(b.x-a.x)*(at-a.z)/(b.z-a.z||1);
      };
      const q = { x: boundaryAt(zz) + 6, z: zz }; for (let i = 0; i < 50; i++) { q.x -= 0.3; collide(q, 0.35, L); }
      expect(q.x, `${z.id} west border`).toBeGreaterThan(boundaryAt(q.z));
      if (g) { const t = { x: g.x, z: g.z }; expect(collide({ ...t }, 0.35, L), `${z.id} west gap`).toEqual(t); }
      if (z.terrain !== 'pass') continue;
      const mid = (z.axis === 'ew' ? z.i : z.j) * CELL, c = passLine(z, mid);
      for (const s of [-1, 1]) {
        const p = z.axis === 'ew' ? { x: mid, z: c + s * (ROUTE_HALF - 3) } : { x: c + s * (ROUTE_HALF - 3), z: mid };
        for (let i = 0; i < 40; i++) { if (z.axis === 'ew') p.z += s * 0.3; else p.x += s * 0.3; collide(p, 0.35, L); }
        expect(Math.abs(z.axis === 'ew' ? p.z - passLine(z, p.x) : p.x - passLine(z, p.z)), `${z.id} side ${s}`).toBeLessThan(ROUTE_HALF);   // the road bends: measure at where the walker ended up
      }
    }
  });
  it('rivers and woods are bands you cannot enter; a river is crossed only on its bridge, standing on the deck', () => {
    const L = buildLayout();
    for (const z of ZONES) {
      const g = z.exits.w; if (!g || edgeStyle(z.i, z.j, 'w') !== 'river') continue;
      const wade = { x: g.x + 5, z: g.z + 6 }; for (let i = 0; i < 40; i++) { wade.x -= 0.3; collide(wade, 0.35, L); }
      expect(wade.x, `${z.id}: waded into the river`).toBeGreaterThan(g.x + 3.5);
      const walk = { x: g.x + 5, z: g.z }; let top = 0;
      for (let i = 0; i < 40; i++) { walk.x -= 0.3; collide(walk, 0.35, L); top = Math.max(top, groundY(walk, L)); }
      expect(walk.x, `${z.id}: bridge blocked`).toBeLessThan(g.x - 3.5); expect(top).toBeGreaterThan(0.2);
      return;
    }
    throw new Error('no river crossing found');
  });
  it('bosses: three per kingdom (two by day + the night lord), each in a map of its own, roaming its map', () => {
    for (const c of CITIES) {
      const day = SPAWNS.filter(s => KINGDOM_BOSSES.some(b => b.id === s.kind && b.city === c.id)), night = SPAWNS.filter(s => s.kind === nightBossOf(c.id));
      expect(day.length + night.length + (c.id === 'pawhaven' ? 1 : 0), c.id).toBe(3);   // Pawhaven's third is the Alpha in its clearing
      const maps = [...day, ...night].map(s => s.zone); expect(new Set(maps).size, c.id).toBe(maps.length);
    }
    expect(SPAWNS.some(s => s.kind.startsWith('BOSS_MON_'))).toBe(false);   // the Tyrants are retired
    const sim = new Sim(), bosses = sim.monsters.filter(m => m.roam && KINGDOM_BOSSES.some(b => b.id === m.kind));
    expect(bosses.length).toBe(KINGDOM_BOSSES.length);
    for (const m of bosses) { expect(MONSTERS[m.kind].raid).toBe(true); expect(zoneAt(m).id, m.kind).toBe(m.roam); }
    const b = bosses[0]; b.alive = false; b.dead = 0.01; sim.tick(0.05);
    expect(b.alive).toBe(true); expect(zoneAt(b).id).toBe(b.roam);
  });
  it('every town has four open gates (N, E, S, W) with walls beside them', () => {
    const L = buildLayout();
    for (const city of CITIES) for (const [gx, gz, wx, wz] of [[0, -11, 5, -11], [0, 11, 5, 11], [11, 0, 11, 6], [-11, 0, -11, 6]]) {
      const gate = { x: city.x + gx, z: city.z + gz }; expect(collide({ ...gate }, 0.35, L), `${city.id} gate ${gx},${gz}`).toEqual(gate);
      const wall = { x: city.x + wx, z: city.z + wz }; expect(collide({ ...wall }, 0.35, L)).not.toEqual(wall);
    }
  });
  it('towns sit mid-map: there are fields (and monsters) south of every town too', () => {
    const sim = new Sim();
    for (const city of CITIES) expect(sim.monsters.some(m => Math.abs(m.home.x - city.x) < 40 && m.home.z > city.z + 15), city.id).toBe(true);
  });
  it('side gates are open, the wall beside them still blocks', () => {
    const L = buildLayout();
    for (const city of CITIES) for (const side of [-1, 1]) {
      const gate = { x: city.x + side * 11, z: city.z }; expect(collide({ ...gate }, 0.35, L)).toEqual(gate);
      const wall = { x: city.x + side * 11, z: city.z + 6 }; expect(collide({ ...wall }, 0.35, L)).not.toEqual(wall);
    }
  });
  it('never moves a dead player', () => {
    const sim = new Sim(); const p = sim.join('a', { name: 'A', color: 1 });
    p.in = { mx: 1, mz: 0 }; p.alive = false; const before = { x: p.x, z: p.z }; stepPlayer(p, 1, sim.L);
    expect({ x: p.x, z: p.z }).toEqual(before);
  });
  it('allows walking through each north gate but blocks walking through its walls', () => {
    const L = buildLayout();
    for (const city of CITIES) {
      const gate = { x: city.x, z: city.z - 11 }; expect(collide({ ...gate }, 0.35, L)).toEqual(gate);
      const wall = { x: city.x + 5, z: city.z - 11 }; expect(collide({ ...wall }, 0.35, L)).not.toEqual(wall);
      expect(inTown({ x: city.x, z: city.z })).toBe(true);
      expect(inTown({ x: city.x, z: city.z - 15 })).toBe(false);
    }
  });
  it('spawns regional monster variants outside safe towns', () => {
    const sim = new Sim();
    for (const city of CITIES.slice(1)) {
      const mobs = sim.monsters.filter(m => Math.hypot(m.home.x - city.x, m.home.z - city.z) < 80);
      expect(mobs.length).toBeGreaterThanOrEqual(10);
      for (const m of mobs) { expect(inTown(m)).toBe(false); expect(m.hp).toBeGreaterThan(0); }
      expect(mobs.some(m => !CITIES[0].monsters.includes(m.kind))).toBe(true);   // the kingdom's own beasts, not the home meadow's
    }
  });
});

describe('layout determinism', () => {
  it('solids do not depend on the client quality density (server builds at density 1)', () => {
    expect(JSON.stringify(buildLayout(0.4).solids)).toBe(JSON.stringify(buildLayout(1).solids));
  });
});
