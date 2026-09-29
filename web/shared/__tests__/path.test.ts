import { describe, expect, it } from 'vitest';
import { findPath } from '../path';
import { buildLayout, collide } from '../world';
import { zoneAt } from '../regions';

// Walk the waypoints the way the client does (straight at each, sliding on collisions) and see where we end up.
const walk = (L: ReturnType<typeof buildLayout>, from: { x: number; z: number }, path: { x: number; z: number }[]) => {
  const p = { ...from };
  for (const w of path) for (let t = 0; t < 2000 && Math.hypot(w.x - p.x, w.z - p.z) > 0.15; t++) {
    const d = Math.hypot(w.x - p.x, w.z - p.z), s = Math.min(0.1, d); p.x += (w.x - p.x) / d * s; p.z += (w.z - p.z) / d * s; collide(p, 0.35, L);
  }
  return p;
};

describe('click-to-walk path', () => {
  it('leaves the walled square through a gate to reach the field beyond the wall', () => {
    const L = buildLayout(), from = { x: -3, z: 6 }, to = { x: -3, z: -30 }, z = zoneAt(from);
    const path = findPath(L, from, to, z)!;
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(1);                       // not a straight line through the wall
    const end = walk(L, from, path); expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThan(1);
  });
  it('clicking a blocked spot walks to the nearest free one', () => {
    const L = buildLayout(), s = L.solids.find(s => s.r > 0.8 && s.r < 2 && Math.abs(s.x) < 40 && Math.abs(s.z) > 20 && Math.abs(s.z) < 40)!, z = zoneAt(s);
    const path = findPath(L, { x: 0, z: 0 }, { x: s.x, z: s.z }, z)!;
    expect(path).not.toBeNull(); const last = path[path.length - 1];
    expect(Math.hypot(last.x - s.x, last.z - s.z)).toBeLessThan(s.r + 3);
  });
  it("a click on the fountain stops at its edge on the walker's side, never round the far side", () => {
    const L = buildLayout(), well = { x: 0, z: 1.2 }, zone = zoneAt(well);
    for (const from of [{ x: 0, z: 6 }, { x: 0, z: -4 }, { x: 5, z: 1.2 }, { x: -5, z: 1.2 }]) {
      const end = findPath(L, from, well, zone)!.at(-1)!;
      expect(Math.hypot(end.x - from.x, end.z - from.z), JSON.stringify(from)).toBeLessThan(Math.hypot(well.x - from.x, well.z - from.z));
    }
  });
});
