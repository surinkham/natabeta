import { describe, expect, it } from 'vitest';
import { Sim } from '../sim';
import { ZONES } from '../regions';
import { SPAWNS } from '../world';
import { MONSTERS } from '../data';

// Free-PK maps: players can hit each other there (not a party mate), nowhere else.
describe('free PK', () => {
  const duel = (at: { x: number; z: number }, party = false) => {
    const sim = new Sim(); sim.monsters.length = 0;   // nothing else to hit
    const a = sim.join('a', { name: 'A', color: 1 }), b = sim.join('b', { name: 'B', color: 1 });
    a.x = at.x; a.z = at.z; b.x = at.x; b.z = at.z + 1; a.yaw = 0; if (party) a.party = b.party = 'p1';
    const hp = b.hp;
    for (let t = 0; t < 40; t++) { sim.act('a', 'SKILL_BASIC', 0); sim.tick(0.05); }
    return hp - b.hp;
  };
  it('a PK warlord always leaves a blueprint on the ground for its killer', () => {
    const sim = new Sim() as any, p = sim.join('k', { name: 'K', color: 1 });
    for (const m of sim.monsters.filter((m: any) => MONSTERS[m.kind].pk)) {
      sim.ground.length = 0; p.x = m.x; p.z = m.z; sim.kill(p, m);
      expect(sim.ground.some((g: any) => g.itemId.startsWith('BLUEPRINT_') && g.owner === 'k'), m.kind).toBe(true);
    }
  });
  it('six maps are marked PK — three east, three west — each with its warlord', () => {
    const pk = ZONES.filter(z => z.pk); expect(pk.length).toBe(6);
    expect(pk.filter(z => z.x0 < 0).length).toBe(3);
    for (const z of pk) expect(SPAWNS.filter(s => s.zone === z.id && MONSTERS[s.kind].pk).length, z.id).toBe(1);
  });
  it('players hurt each other in a PK map, not elsewhere, never a party mate', () => {
    const pk = ZONES.find(z => z.pk)!, safe = ZONES.find(z => z.terrain === 'field' && !z.pk)!;
    const spot = (z: typeof pk) => ({ x: z.i * 90 + 20, z: z.j * 90 + 20 });
    expect(duel(spot(pk))).toBeGreaterThan(0);
    expect(duel(spot(safe))).toBe(0);
    expect(duel(spot(pk), true)).toBe(0);
  });
});
