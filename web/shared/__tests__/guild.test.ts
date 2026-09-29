import { describe, expect, it } from 'vitest';
import { GuildBook, capacityAt } from '../guild';

describe('guild book', () => {
  it('founds a guild for its leader; names are unique', () => {
    const b = new GuildBook(), r = b.create('u1', 'Ann', 'Paw Knights');
    expect(r.ok).toBe(true); expect(b.of('u1')?.members.u1.rank).toBe('leader');
    expect(b.create('u2', 'Bo', 'paw knights').ok).toBe(false);
  });
  it('holds 20 at first; the Hall, bought from donations, makes room for more', () => {
    const b = new GuildBook(), g = (b.create('u0', 'L', 'Big Guild') as any).guild;
    for (let i = 1; i < 20; i++) expect(b.join(g.id, `u${i}`, `m${i}`).ok).toBe(true);
    expect(b.join(g.id, 'u20', 'late').ok).toBe(false);
    b.donate('u5', 4000); expect(g.members.u5.points).toBe(400);
    expect(b.upgrade('u5', 'hall').ok).toBe(false);          // a member cannot spend the treasury
    expect(b.upgrade('u0', 'hall').ok).toBe(true); expect(b.capacity(g)).toBe(capacityAt(1));
    expect(b.join(g.id, 'u20', 'late').ok).toBe(true);
  });
  it('guild skills give every member a bonus, capped by the Training Grounds', () => {
    const b = new GuildBook(), g = (b.create('a', 'A', 'Skillful') as any).guild; b.join(g.id, 'b', 'B'); b.donate('a', 50000);
    expect(b.learn('a', 'might').ok).toBe(true); expect(b.learn('a', 'might').ok).toBe(true); expect(b.learn('a', 'might').ok).toBe(false);
    expect(b.bonus('b').atk).toBeCloseTo(0.04);
    expect(b.upgrade('a', 'training').ok).toBe(true); expect(b.learn('a', 'might').ok).toBe(true);
  });
  it('the shop spends the member\'s own points and respects the Market tier', () => {
    const b = new GuildBook(), g = (b.create('a', 'A', 'Shoppers') as any).guild; b.donate('a', 2000);
    expect(b.buy('a', 'REVIVE_SCROLL').ok).toBe(true); expect(g.members.a.points).toBe(180);
    expect(b.buy('a', 'GUILD_CAPE').ok).toBe(false);
  });
  it('a leaving leader hands over; the last one out disbands; it round-trips through JSON', () => {
    const b = new GuildBook(), g = (b.create('a', 'A', 'Relay') as any).guild; b.join(g.id, 'b', 'B'); b.donate('b', 10);
    b.leave('a'); expect(g.members.b.rank).toBe('leader');
    const c = new GuildBook(JSON.parse(JSON.stringify(b))); expect(c.of('b')?.name).toBe('Relay');
    c.leave('b'); expect(c.guilds.size).toBe(0);
  });
});
