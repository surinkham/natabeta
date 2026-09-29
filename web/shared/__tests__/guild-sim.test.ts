import { describe, expect, it } from 'vitest';
import { Sim } from '../sim';
import { GUILD_HALL, buildLayout, collide } from '../world';
import { NPCS } from '../data';
import { cityAt, zoneAt } from '../regions';

describe('guilds in the sim', () => {
  const two = () => {
    const sim = new Sim() as any; sim.monsters.length = 0;
    const a = sim.join('a', { name: 'Ann', color: 1 }), b = sim.join('b', { name: 'Bo', color: 1 }); a.gold = 60000; b.gold = 500;
    return { sim, a, b };
  };
  it('costs 1000 gold to found; invite, accept; donations raise skills that lift every member', () => {
    const { sim, a, b } = two();
    sim.guildCreate('b', 'Poor'); expect(b.guildName ?? '').toBe('');
    sim.guildCreate('a', 'Paw Knights'); expect(a.gold).toBe(59000); expect(a.guildName).toBe('Paw Knights');
    sim.guildInvite('a', 'b'); sim.guildAccept('b'); expect(b.guildName).toBe('Paw Knights');
    const hp0 = b.maxHP; sim.guildDonate('a', 50000); sim.guildLearn('a', 'fortitude');
    expect(b.maxHP).toBeGreaterThan(hp0); expect(sim.guildsDirty).toBe(true);
  });
  it('the guild grounds: only members, only through a town\'s guild keeper, and back out to that town', () => {
    const { sim, a, b } = two(); sim.guildCreate('a', 'Grounds');
    const by = (p: any, id: string) => { p.x = NPCS[id].pos[0]; p.z = NPCS[id].pos[1] - 1.5; };
    a.x = 30; a.z = -30; sim.guildEnter('a'); expect(zoneAt(a).terrain).not.toBe('hall');   // out in the wilds: no way in
    by(b, 'NPC_GUILD'); sim.guildEnter('b'); expect(zoneAt(b).terrain).not.toBe('hall');    // not a member
    by(a, 'NPC_frostford_guild'); sim.guildEnter('a'); expect(zoneAt(a).terrain).toBe('hall');
    sim.guildExit('a'); expect(cityAt(a)?.id).toBe('frostford');                             // home the way it came
  });
  it('the stewards stand where you can reach them', () => {
    const L = buildLayout();
    for (const id of Object.keys(NPCS).filter(k => NPCS[k].kind === 'guild' || NPCS[k].kind === 'quest')) { const [x, z] = NPCS[id].pos, p = { x, z: z - 1.4 }; collide(p, 0.35, L); expect(Math.hypot(p.x - x, p.z - z + 1.4), id).toBeLessThan(0.05); }
    expect(zoneAt({ x: NPCS.NPC_GUILD_HALL.pos[0], z: NPCS.NPC_GUILD_HALL.pos[1] }).terrain).toBe('hall'); void GUILD_HALL;
  });
});
