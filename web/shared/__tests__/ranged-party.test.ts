import { describe, expect, it } from 'vitest';
import { expToNext } from '../data';
import { PARTY_MAX, Sim, attackSkill } from '../sim';
import { derive } from '../formulas';
import { countOf } from '../inventory';

// a fresh sim with one player standing in an empty field and every monster parked far away
function arena() {
  pinned.length = 0;
  const sim = new Sim(); const p = sim.join('p', { name: 'P', color: 0 });
  for (const m of sim.monsters) { m.x = 500; m.z = -80; m.home = { x: 500, z: -80 }; }
  p.x = 30; p.z = -30; p.yaw = 0; p.gold = 5000;          // yaw 0 faces +z
  return { sim, p };
}
// Hit is pinned high: the tests are about reach and area, not the 9% miss roll
const give = (sim: Sim, p: any, item: string) => { sim.buy('p', item, 1); const inst = p.inv.items.find((s: any) => s.itemId === item); sim.equipInst('p', inst.id); p.Hit = 1000; };
// monsters would aggro and walk; pin the ones a test placed so geometry stays what the test says
const pinned: [any, number, number][] = [];
const run = (sim: Sim, s: number) => { for (let t = 0; t < s / 0.05; t++) { sim.tick(0.05); for (const [m, x, z] of pinned) { m.x = x; m.z = z; } } };
const mob = (sim: Sim, i: number, x: number, z: number) => { const m = sim.monsters[i]; m.x = x; m.z = z; m.home = { x, z }; m.hp = m.maxHP = 5000; m.Dodge = 0; pinned.push([m, x, z]); return m; };

describe('ranged weapons', () => {
  it('bow shoots from range, spends one arrow per shot, refuses without arrows', () => {
    const { sim, p } = arena(); give(sim, p, 'HUNTER_BOW'); expect(attackSkill(p.equip)).toBe('SKILL_SHOOT');
    const m = mob(sim, 0, 30, -23.5);                     // 6.5 m ahead: far outside sword reach, inside the 7 m bow
    sim.act('p', 'SKILL_BASIC'); run(sim, 1.5); expect(m.hp).toBe(5000);   // no arrows → nothing
    sim.buy('p', 'ARROW', 10); expect(countOf(p.inv, 'ARROW')).toBe(10);
    sim.act('p', 'SKILL_BASIC'); run(sim, 1.5);
    expect(countOf(p.inv, 'ARROW')).toBe(9); expect(m.hp).toBeLessThan(5000);
  });
  it('staff blue fire uses MATK and splashes neighbours of the target', () => {
    const { sim, p } = arena(); give(sim, p, 'APPRENTICE_STAFF'); expect(p.MATK).toBeGreaterThan(p.ATK);
    const a = mob(sim, 0, 30, -25), b = mob(sim, 1, 30.8, -25), far = mob(sim, 2, 34, -25);   // staff reach 6 m
    sim.act('p', 'SKILL_BASIC'); run(sim, 2);
    expect(a.hp).toBeLessThan(5000); expect(b.hp).toBeLessThan(5000); expect(far.hp).toBe(5000);
  });
  it('arrow rain needs a bow and six arrows and hits everything in the circle', () => {
    const { sim, p } = arena(); p.skills.push('SKILL_ARROW_RAIN');
    const ms = [mob(sim, 0, 30, -25), mob(sim, 1, 31.5, -25), mob(sim, 2, 29, -24)];
    sim.act('p', 'SKILL_ARROW_RAIN'); run(sim, 3); expect(ms.every(m => m.hp === 5000)).toBe(true);   // sword in hand
    give(sim, p, 'HUNTER_BOW'); sim.buy('p', 'ARROW', 6);
    sim.act('p', 'SKILL_ARROW_RAIN'); run(sim, 3);
    expect(ms.every(m => m.hp < 5000)).toBe(true); expect(countOf(p.inv, 'ARROW')).toBe(0);
  });
  it('meteor lands after its delay as magic damage in a wide circle', () => {
    const { sim, p } = arena(); p.skills.push('SKILL_METEOR'); give(sim, p, 'APPRENTICE_STAFF');
    const ms = [mob(sim, 0, 30, -25), mob(sim, 1, 32, -25)];
    sim.act('p', 'SKILL_METEOR'); run(sim, 0.8); expect(ms[0].hp).toBe(5000);
    run(sim, 2); expect(ms.every(m => m.hp < 5000)).toBe(true);
  });
});

describe('gear stats', () => {
  it('primary mods on gear feed the derived stats', () => {
    const base = derive({ STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, level: 1, equip: {} });
    const geared = derive({ STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, level: 1, equip: { MainWeapon: 'WOLF_FANG_SWORD', Chest: 'KNIGHT_CHEST', Boots: 'KNIGHT_BOOTS' } });
    expect(geared.ATK).toBe(base.ATK + 18 + 2 * 2);        // +18 ATK, +2 STR × 2
    expect(geared.maxHP).toBe(base.maxHP + 30);
    expect(geared.Dodge).toBeGreaterThan(base.Dodge);       // +2 AGI from the greaves
  });
});

describe('party', () => {
  it('invite/accept up to five, healing circle only reaches party members in range', () => {
    const sim = new Sim(); const ps = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => sim.join(id, { name: id.toUpperCase(), color: 0 }));
    for (const id of ['b', 'c', 'd', 'e', 'f']) { sim.partyInvite('a', id); sim.partyAccept(id); }
    expect(sim.parties.get(ps[0].party)).toHaveLength(PARTY_MAX); expect(ps[5].party).toBe('');
    for (const q of ps) { q.x = 0; q.z = 0; q.hp = 10; }
    ps[1].x = 20;                                           // party member out of range
    ps[0].skills.push('SKILL_HEAL_CIRCLE'); sim.act('a', 'SKILL_HEAL_CIRCLE'); for (let t = 0; t < 20; t++) sim.tick(0.05);
    const healed = (q: any) => q.hp >= 10 + Math.floor(q.maxHP * 0.25);   // town regen adds a little to everyone
    expect(healed(ps[0])).toBe(true); expect(healed(ps[2])).toBe(true);
    expect(healed(ps[1])).toBe(false); expect(healed(ps[5])).toBe(false);  // too far / not in the party
    sim.partyLeave('a'); expect(ps[0].party).toBe(''); expect(ps[1].party).toBe('b');
    expect(sim.parties.get('b')).toHaveLength(4);
  });
});

describe('death penalty', () => {
  it('dying costs 1% of the level EXP bar, never below zero', () => {
    const sim = new Sim() as any; const m = sim.monsters[0];
    const p = sim.join('p', { name: 'P', color: 0 }); p.level = 5; p.exp = 100; p.Dodge = 0;
    for (let i = 0; i < 50 && p.alive; i++) { p.hp = 1; sim.bite(m, p); }             // bite until one lands
    expect(p.alive).toBe(false); expect(p.exp).toBe(100 - Math.ceil(expToNext(5) * 0.01));
    const q = sim.join('q', { name: 'Q', color: 0 }); q.exp = 0; q.Dodge = 0;
    for (let i = 0; i < 50 && q.alive; i++) { q.hp = 1; sim.bite(m, q); }
    expect(q.alive).toBe(false); expect(q.exp).toBe(0);
  });
});

describe('soft lock facing', () => {
  it('an attack carries the facing the client turned to, so a locked target behind you is still hit', () => {
    const { sim, p } = arena(); give(sim, p, 'HUNTER_BOW'); sim.buy('p', 'ARROW', 5);
    const m = mob(sim, 0, 30, -35);                         // 5 m BEHIND the player (p faces +z)
    sim.act('p', 'SKILL_BASIC'); run(sim, 1.2); expect(m.hp).toBe(5000);                      // facing away: nothing in the cone
    sim.act('p', 'SKILL_BASIC', Math.PI); run(sim, 1.2); expect(m.hp).toBeLessThan(5000);     // turned to the lock
  });
});
