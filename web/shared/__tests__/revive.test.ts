import { describe, expect, it } from 'vitest';
import { Sim, save } from '../sim';
import { addItem } from '../inventory';

// Death: wait where you fell — go home, read a revive scroll, or be raised by Resurrection; reviving returns lost EXP.
describe('revive', () => {
  const fallen = () => {
    const sim = new Sim() as any; sim.monsters.length = 0;
    const p = sim.join('p', { name: 'P', color: 1 }); p.level = 5; p.exp = 100; p.x = 30; p.z = 30;
    sim.hurt(p, 1e6, 'test'); return { sim, p };
  };
  it('waits where it fell instead of going home at once', () => {
    const { sim, p } = fallen(); for (let i = 0; i < 100; i++) sim.tick(0.05);
    expect(p.alive).toBe(false); expect(p.x).toBe(30);
  });
  it('a revive scroll stands you up in place with the lost EXP back; none, nothing happens', () => {
    const { sim, p } = fallen(); sim.reviveSelf('p'); expect(p.alive).toBe(false);
    addItem(p.inv, 'REVIVE_SCROLL', 1); sim.reviveSelf('p');
    expect(p.alive).toBe(true); expect(p.x).toBe(30); expect(p.exp).toBe(100); expect(p.hp).toBeGreaterThan(0);
  });
  it('Resurrection raises the nearest fallen player; going home works too', () => {
    const { sim, p } = fallen(); const h = sim.join('h', { name: 'H', color: 1 }); h.x = 31; h.z = 30; h.skills.push('SKILL_REVIVE'); h.mp = 999;
    sim.act('h', 'SKILL_REVIVE'); for (let i = 0; i < 30; i++) sim.tick(0.05);
    expect(p.alive).toBe(true); expect(p.exp).toBe(100);
    const q = fallen(); q.sim.respawnTown('p'); q.sim.tick(0.05); expect(q.p.alive).toBe(true); expect(q.p.x).not.toBe(30);
  });
  it("towns walked into become checkpoints: the fallen pick one they reached, else go to the last one", () => {
    const sim = new Sim(); const p = sim.join("a", { name: "Walker", color: 0 });
    sim.tick(0.05); expect(p.towns).toEqual(["pawhaven"]);
    p.x = 0; p.z = -364.5; sim.tick(0.05); expect(p.towns).toContain("frostford"); expect(p.home).toBe("frostford");
    const die = () => { p.x = 30; p.z = 60; (sim as any).hurt(p, 1e7, "test"); expect(p.alive).toBe(false); };
    die(); sim.respawnTown("a", "saharak"); sim.tick(0.05);                      // never reached: the last town instead
    expect(p.alive).toBe(true); expect(Math.hypot(p.x - 0, p.z + 360)).toBeLessThan(8);
    die(); sim.respawnTown("a", "pawhaven"); sim.tick(0.05); expect(Math.hypot(p.x, p.z + 4.5)).toBeLessThan(1);
    const saved = save(p); expect(saved.towns).toEqual(expect.arrayContaining(["pawhaven", "frostford"])); expect(saved.home).toBe("pawhaven");
  });
});
