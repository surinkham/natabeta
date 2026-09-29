import { describe, expect, it } from 'vitest';
import { DROPS, EQUIP_VISUALS, GOLD, ITEMS, MONSTERS, NPCS, RECIPES, SKILLS } from '../data';
import { MONSTER_CHASE_SPEED, MONSTER_RETURN_SPEED, MONSTER_WANDER_SPEED, Sim, WALK } from '../sim';
import { addItem } from '../inventory';

// Content lives in JSON; these catch a typo'd id before a player finds it as a blank shop row or an uncraftable recipe.
describe('content integrity', () => {
  it('every reference points at something that exists', () => {
    for (const [id, r] of Object.entries(RECIPES)) { expect(ITEMS[r.result], id).toBeDefined(); for (const i of r.ingredients) expect(ITEMS[i.item], `${id}: ${i.item}`).toBeDefined(); }
    for (const [id, d] of Object.entries(ITEMS)) if (d.visual) expect(EQUIP_VISUALS[d.visual], id).toBeDefined();
    for (const [id, t] of Object.entries(DROPS)) for (const e of t) expect(e.item === GOLD || !!ITEMS[e.item], `${id}: ${e.item}`).toBe(true);
    for (const [id, m] of Object.entries(MONSTERS)) expect(DROPS[m.dropTable], id).toBeDefined();
    for (const [id, n] of Object.entries(NPCS)) {
      for (const s of n.stock ?? []) expect(ITEMS[s]?.buy, `${id} sells ${s}`).toBeGreaterThan(0);
      for (const r of n.recipes ?? []) expect(RECIPES[r], `${id}: ${r}`).toBeDefined();
      for (const k of n.skills ?? []) expect(SKILLS[k]?.price, `${id} teaches ${k}`).toBeGreaterThan(0);
    }
  });
  it('every realm has its own crafting material in the drops', () => {
    for (const mat of ['MOSS_HEART', 'FROST_CRYSTAL', 'DUNE_SHELL', 'MAGMA_CORE', 'VOID_SHARD']) expect(Object.values(DROPS).some(t => t.some(e => e.item === mat)), mat).toBe(true);
  });
  it('self-centred area skills land on the caster', () => {
    const sim = new Sim() as any; const p = sim.join('p', { name: 'P', color: 0 }); p.x = 30; p.z = -30; p.skills.push('SKILL_GROUND_SLAM');
    sim.drain(); sim.act('p', 'SKILL_GROUND_SLAM'); for (let t = 0; t < 12; t++) sim.tick(0.05);
    const e = sim.drain().find((e: any) => e.t === 'aoe'); expect(e).toMatchObject({ x: 30, z: -30 });
  });
});

describe('night monsters', () => {
  it('bats vanish at dawn and come back after dusk; day monsters do not care', () => {
    const sim = new Sim() as any; const bats = sim.monsters.filter((m: any) => m.kind === 'MON_BAT');
    const wolf = sim.monsters.find((m: any) => m.kind === 'MON_WOLF_001');
    expect(bats.length).toBeGreaterThan(0);
    sim.clock = () => 12; sim.tick(0.05);
    expect(bats.every((b: any) => !b.alive)).toBe(true); expect(wolf.alive).toBe(true);
    for (let t = 0; t < 200; t++) { sim.clock = () => 12; sim.tick(0.05); }            // stays gone all day
    expect(bats.some((b: any) => b.alive)).toBe(false);
    for (let t = 0; t < 200; t++) { sim.clock = () => 21; sim.tick(0.05); }            // ~10 s into the night
    expect(bats.every((b: any) => b.alive)).toBe(true);
  });
});

describe('race traits', () => {
  it('uses a slower exploration pace and every monster movement mode is slower than the player', () => {
    expect(WALK).toBe(3.3);
    expect(Math.max(MONSTER_CHASE_SPEED, MONSTER_RETURN_SPEED, MONSTER_WANDER_SPEED)).toBeLessThan(WALK);
  });
  it('dog +12% HP, cat +6 flee, mouse walks 15% faster', async () => {
    const { stepPlayer } = await import('../sim');
    const sim = new Sim() as any;
    const dog = sim.join('d', { name: 'D', color: 0, race: 'golden' }), cat = sim.join('c', { name: 'C', color: 0, race: 'siamese' }), mouse = sim.join('m', { name: 'M', color: 0, race: 'hamster' });
    expect(dog.maxHP).toBe(Math.round(cat.maxHP * 1.12)); expect(cat.Dodge - dog.Dodge).toBeCloseTo(6);
    for (const p of [dog, mouse]) { p.x = 30; p.z = -30; p.in = { mx: 1, mz: 0 }; stepPlayer(p, 1, sim.L); }
    expect(mouse.x - 30).toBeCloseTo((dog.x - 30) * 1.15, 1);
  });
});

describe('boss telegraphs', () => {
  it('the alpha warns with a red circle, then hits only whoever is still inside', () => {
    const run = (leave: boolean) => {
      const sim = new Sim() as any; const boss = sim.monsters.find((m: any) => m.kind === 'MON_ALPHA_WOLF');
      for (const m of sim.monsters) if (m !== boss) { m.x = m.home.x = 300; m.z = m.home.z = -90; }   // only the boss near the player
      const p = sim.join('p', { name: 'P', color: 0 }); p.maxHP = p.hp = 100000;
      boss.x = 0; boss.z = -76; p.x = 0; p.z = -73.5; boss.targetId = 'p'; boss.skillCd = { pounce: 99 };   // force the self-centred howl
      sim.drain(); let tele: any; const hp0 = p.hp;
      for (let t = 0; t < 60 && !tele; t++) { sim.tick(0.05); tele = sim.drain().find((e: any) => e.t === 'telegraph'); p.hp = hp0; }
      expect(tele).toMatchObject({ name: 'Earthshaker Howl', radius: 4.2 });
      if (leave) { p.x = 0; p.z = -76 + 8; }                                   // step out of the circle during the windup
      let slam: any; for (let t = 0; t < 40 && !slam; t++) { sim.tick(0.05); slam = sim.drain().find((e: any) => e.t === 'slam'); if (leave) { p.z = -68; } }
      expect(slam).toBeDefined();
      return hp0 - p.hp;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(0);
  });
});

describe('GM character', () => {
  it('"admin" is maxed only where GM is allowed', () => {
    const on = new Sim(); on.allowGM = true; const gm = on.join('a', { name: 'Admin', color: 0 });
    expect(gm).toMatchObject({ level: 999, STR: 9999, INT: 9999, gold: 9999999 });
    expect(gm.skills).toContain('SKILL_METEOR'); expect(gm.hp).toBe(gm.maxHP);
    const off = new Sim().join('b', { name: 'admin', color: 0 });
    expect(off.level).toBe(1); expect(off.gold).toBeLessThan(1000);
  });
});

describe('boss rarities', () => {
  it('tomes teach their skill, blueprints unlock a secret recipe the smith otherwise refuses', () => {
    const sim = new Sim() as any; const p = sim.join('p', { name: 'P', color: 0 }); p.gold = 99999;
    addItem(p.inv, 'SKILLBOOK_LIGHTNING', 1); sim.use('p', p.inv.items.find((s: any) => s.itemId === 'SKILLBOOK_LIGHTNING').id);
    expect(p.skills).toContain('SKILL_LIGHTNING');
    for (const [i, n] of [['ALPHA_FANG', 3], ['WOLF_FANG', 15], ['IRON_ORE', 10]] as const) addItem(p.inv, i, n);
    sim.craft('p', 'RCP_ALPHA_FANG_BLADE'); expect(p.inv.items.some((s: any) => s.itemId === 'ALPHA_FANG_BLADE')).toBe(false);
    addItem(p.inv, 'SCROLL_ALPHA_BLADE', 1); sim.use('p', p.inv.items.find((s: any) => s.itemId === 'SCROLL_ALPHA_BLADE').id);
    sim.craft('p', 'RCP_ALPHA_FANG_BLADE'); expect(p.inv.items.some((s: any) => s.itemId === 'ALPHA_FANG_BLADE')).toBe(true);
  });
  it('rare drops are rare: every boss-only item drops at 5% or less', () => {
    for (const t of Object.values(DROPS)) for (const e of t) if (ITEMS[e.item]?.rare) expect(e.chance).toBeLessThanOrEqual(0.05);
  });
});

describe('player market', () => {
  it('lists only within ±10% of the reference price, pays the seller, holds proceeds for the absent', async () => {
    const { priceBand, refPrice } = await import('../data');
    const sim = new Sim() as any; const a = sim.join('a', { name: 'Ann', color: 0 }), b = sim.join('b', { name: 'Bob', color: 0 }); b.gold = 10000;
    addItem(a.inv, 'WOLF_FANG', 10); const inst = a.inv.items.find((s: any) => s.itemId === 'WOLF_FANG').id;
    const band = priceBand('WOLF_FANG'); expect(band.min).toBe(Math.ceil(refPrice('WOLF_FANG') * 0.9));
    sim.marketList('a', inst, 5, band.max + 1); expect(sim.market).toHaveLength(0);          // too dear
    sim.marketList('a', inst, 5, band.min - 1); expect(sim.market).toHaveLength(0);          // too cheap
    sim.marketList('a', inst, 5, band.max); expect(sim.market).toHaveLength(1);
    const gold0 = a.gold; sim.marketBuy('b', sim.market[0].id);
    expect(a.gold).toBe(gold0 + 5 * band.max); expect(b.inv.items.some((s: any) => s.itemId === 'WOLF_FANG' && s.count === 5)).toBe(true);
    sim.marketList('a', inst, 5, band.min); sim.leave('a');
    sim.marketBuy('b', sim.market[0].id);                                                     // Ann is offline
    const back = sim.join('a2', { name: 'Ann', color: 0 }, (await import('../sim')).save(a)); expect(back.gold).toBe(a.gold + 5 * band.min);
  });
  it('a player sharing a seller\'s name gets neither the listings nor the sale gold, and the market survives a restart', async () => {
    const { save } = await import('../sim'), { priceBand } = await import('../data');
    const sim = new Sim() as any; const a = sim.join('a', { name: 'Twin', color: 0 }), b = sim.join('b', { name: 'Buyer', color: 0 }); b.gold = 10000;
    addItem(a.inv, 'WOLF_FANG', 10); const inst = a.inv.items.find((s: any) => s.itemId === 'WOLF_FANG').id, band = priceBand('WOLF_FANG');
    sim.marketList('a', inst, 3, band.min); sim.marketList('a', inst, 2, band.min); sim.leave('a');   // the seller drops out (a crash)
    sim.marketBuy('b', sim.market[0].id);                                                            // sold while away
    const twin = sim.join('t', { name: 'Twin', color: 0 }), gold = twin.gold;                         // another account, same name
    expect(twin.gold).toBe(gold); expect(sim.market[0].seller).not.toBe('t');
    sim.marketCancel('t', sim.market[0].id); expect(sim.market).toHaveLength(1);                     // cannot take the listing back
    // restart: a fresh sim loads the saved market; the real seller comes back to the gold and the listing
    const fresh = new Sim() as any; fresh.loadMarket(JSON.parse(JSON.stringify(sim.marketState())));
    const back = fresh.join('a2', { name: 'Twin', color: 0 }, save(a));
    expect(back.gold).toBe(a.gold + 3 * band.min); expect(fresh.market[0].seller).toBe('a2');
    fresh.marketCancel('a2', fresh.market[0].id); expect(back.inv.items.some((s: any) => s.itemId === 'WOLF_FANG' && s.count >= 2)).toBe(true);
  });
});

describe('mount', () => {
  it('a double-click on the whistle does not mount and instantly dismount', () => {
    const sim = new Sim() as any; const p = sim.join('p', { name: 'P', color: 0 }); p.gold = 5000; sim.buy('p', 'MOUNT_HORSE', 1);
    const w = p.inv.items.find((s: any) => s.itemId === 'MOUNT_HORSE').id;
    sim.use('p', w); sim.use('p', w); expect(p.mounted).toBe(true);
    for (let t = 0; t < 25; t++) sim.tick(0.05); sim.use('p', w); expect(p.mounted).toBe(false);
  });
});

describe('breed alias', () => {
  it('the retired chihuahua joins as a shiba, from the creator or from an old save', async () => {
    const { save } = await import('../sim'), { priceBand } = await import('../data');
    const sim = new Sim(); expect(sim.join('a', { name: 'A', color: 0, race: 'chihuahua' }).race).toBe('shiba');
    const old = save(sim.join('b', { name: 'B', color: 0, race: 'golden' })); old.race = 'chihuahua';
    expect(new Sim().join('b', { name: 'B', color: 0 }, old).race).toBe('shiba');
  });
});
