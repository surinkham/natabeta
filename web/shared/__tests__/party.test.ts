import { describe, expect, it } from 'vitest';
import { Sim } from '../sim';

// Party: a kill's EXP is split among members nearby with a bonus, gold is split, drops are the party's, the leader can kick.
describe('party', () => {
  const setup = () => {
    const sim = new Sim() as any; sim.monsters.length = 0;
    const a = sim.join('a', { name: 'A', color: 1 }), b = sim.join('b', { name: 'B', color: 1 }), c = sim.join('c', { name: 'C', color: 1 });
    for (const [p, x] of [[a, 20], [b, 22], [c, 400]] as const) { p.x = x; p.z = 20; }
    sim.partyInvite('a', 'b'); sim.partyAccept('b'); sim.partyInvite('a', 'c'); sim.partyAccept('c');
    return { sim, a, b, c };
  };
  it('shares EXP among members nearby, with a bonus; a far member gets none', () => {
    const { sim, a, b, c } = setup(); for (const p of [a, b, c]) p.level = 50;   // no level-up eating the EXP
    const e0 = [a.exp, b.exp, c.exp];
    sim.shareExp(a, 100);
    const each = Math.round(100 * 1.15 / 2); expect(a.exp - e0[0]).toBe(each); expect(b.exp - e0[1]).toBe(each); expect(c.exp - e0[2]).toBe(0);   // 100 × 1.15 / 2
  });
  it("splits gold picked up, and lets a party member take a mate's drop at once", () => {
    const { sim, a, b } = setup(), g0 = [a.gold, b.gold];
    sim.drop({ x: 21, z: 20 }, 'a', '', 0, 101); const gid = sim.ground.at(-1).id; sim.ground.at(-1).x = b.x; sim.ground.at(-1).z = b.z;
    sim.pickup('b', gid);
    expect(a.gold - g0[0]).toBe(50); expect(b.gold - g0[1]).toBe(51);
  });
  it('only the leader kicks', () => {
    const { sim, a, b, c } = setup();
    sim.partyKick('b', 'c'); expect(c.party).toBe(a.party);
    sim.partyKick('a', 'c'); expect(c.party).toBe(''); expect(b.party).toBe(a.party);
  });
});
