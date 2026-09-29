import { describe, expect, it } from "vitest";
import { BREEDS, FAIRY_ITEM, LOOT_OWNER_WINDOW, LOOT_TTL, Sim, save } from "../sim";
import { addItem } from "../inventory";
import { equip } from "../equipment";
import { SPAWNS, buildLayout, clearBoom } from "../world";
import { DROPS, MONSTERS, NIGHT_BOSSES, bossOf, nightBossOf } from "../data";

const seeded = (s = 1) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const setup = () => { const sim = new Sim(undefined, seeded()); const a = sim.join("a", { name: "A", color: 1 }), b = sim.join("b", { name: "B", color: 2 }); return { sim, a, b }; };

describe("sim", () => {
  it("joins with starter kit and derived stats", () => {
    const { a } = setup();
    expect(Object.values(a.equip)).toContain("WOODEN_SWORD"); expect(a.inv.items.some(s => s.itemId === "HP_POTION")).toBe(true); expect(a.hp).toBe(a.maxHP); expect(a.maxHP).toBeGreaterThan(0);
  });
  it("moves with input, respects collision and cooldowns", () => {
    const { sim, a } = setup(); sim.input("a", 0, -1); const z0 = a.z;
    for (let i = 0; i < 20; i++) sim.tick(0.05); expect(a.z).toBeLessThan(z0); expect(a.moving).toBe(true);
    sim.act("a", "SKILL_BASIC"); sim.act("a", "SKILL_BASIC"); expect(sim.drain().filter(e => e.t === "cast" && e.skill === "SKILL_BASIC")).toHaveLength(1);
  });
  it("two players hit the same wolf; loot goes to the killer only", () => {
    const { sim, a, b } = setup(); const m = sim.monsters[0]; a.STR = b.STR = 40; a.DEX = b.DEX = 200;
    for (const p of [a, b]) { p.x = m.x; p.z = m.z + 1; p.yaw = Math.PI; p.fairyCd = 1e9; (sim as any).sync(p); }   // fairies idle: this is about hands
    m.hp = 4;  // two hits kill it; whoever lands the second one is the killer
    const aInv = a.inv.items.length, bInv = b.inv.items.length, aG = a.gold, bG = b.gold;
    const swing = (id: string) => { sim.act(id, "SKILL_BASIC"); for (let i = 0; i < 12; i++) sim.tick(0.05); return sim.drain(); };   // the hit lands on the clip's contact frame
    const evA = swing("a");
    const evB = swing("b");
    const kills = [...evA, ...evB].filter(e => e.t === "kill"); expect(kills).toHaveLength(1); expect(m.alive).toBe(false);
    const looted = [...evA, ...evB].filter(e => e.t === "loot"); expect(looted.every(e => (e as any).pid === (kills[0] as any).pid)).toBe(true);
    const winner = (kills[0] as any).pid === "a" ? a : b, loser = winner === a ? b : a;
    expect(winner.exp).toBe(20); expect(loser.exp).toBe(0);
    // the drop is on the floor now, reserved for the killer, and nobody's bag changed yet
    expect(sim.ground.length).toBeGreaterThan(0);
    expect(sim.ground.every(g => g.owner === winner.id)).toBe(true);
    expect(a.inv.items.length).toBe(aInv); expect(b.inv.items.length).toBe(bInv); expect(a.gold).toBe(aG); expect(b.gold).toBe(bG);
    const g0 = sim.ground[0];
    loser.x = g0.x; loser.z = g0.z; sim.pickup(loser.id, g0.id);
    expect(sim.ground).toContain(g0);                                     // owner window keeps the other player out
    winner.x = g0.x; winner.z = g0.z; sim.pickup(winner.id, g0.id);
    expect(sim.ground).not.toContain(g0);
    expect(g0.gold ? winner.gold > (winner === a ? aG : bG) : winner.inv.items.length > (winner === a ? aInv : bInv)).toBe(true);
  });
  it("the loot fairy (with Faritel's Charm on) fetches your drops from afar, and others' only after the owner window", () => {
    const { sim, a } = setup(); a.x = 0; a.z = -30; (sim as any).sync(a);
    const gold0 = a.gold;
    (sim as any).drop({ x: 3, z: -30 }, "a", "", 0, 5);
    for (let i = 0; i < 40; i++) sim.tick(0.05);
    expect(a.gold).toBe(gold0); sim.ground.length = 0;            // no charm, no fairy
    addItem(a.inv, FAIRY_ITEM, 1); equip(a.inv, a.eq, a.inv.items.at(-1)!.id); (sim as any).sync(a);
    (sim as any).drop({ x: 4, z: -30 }, "a", "", 0, 9);          // mine, 4 m off: out of hand reach, in the fairy's
    (sim as any).drop({ x: -4, z: -30 }, "zz", "WOLF_FANG", 1, 0); // someone else's
    for (let i = 0; i < 40; i++) sim.tick(0.05);
    expect(a.gold).toBe(gold0 + 9);
    expect(sim.ground.map(g => g.owner)).toEqual(["zz"]);
    expect(sim.drain().some(e => e.t === "fairy" && e.id === "a")).toBe(true);
    sim.ground[0].t = LOOT_TTL - LOOT_OWNER_WINDOW - 1;             // the owner window has passed
    for (let i = 0; i < 40; i++) sim.tick(0.05);
    expect(sim.ground).toHaveLength(0); expect(a.inv.items.some(s => s.itemId === "WOLF_FANG")).toBe(true);
  });
  it("wolf aggroes the nearest player outside town, bites and respawns", () => {
    const { sim, a } = setup(); const sp = SPAWNS[0]; a.x = sp.x - 2; a.z = sp.z + 2; a.DEF = 0; a.AGI = 0; (sim as any).sync(a); a.hp = a.maxHP; a.Dodge = 0;
    let bitten = false; for (let i = 0; i < 200 && !bitten; i++) { sim.tick(0.05); if (sim.drain().some(e => e.t === "dmg" && e.id === "a" && !e.miss)) bitten = true; }
    expect(bitten).toBe(true); expect(a.hp).toBeLessThan(a.maxHP);
    const m = sim.monsters[0]; m.hp = 0; (sim as any).kill(a, m); expect(m.alive).toBe(false);
    for (let i = 0; i < 220; i++) sim.tick(0.05); expect(m.alive).toBe(true); expect(m.hp).toBe(m.maxHP);
  });
  it("a boss walking home keeps its wounds; a normal monster heals", () => {
    const { sim, a } = setup();
    const boss = sim.monsters.find(m => MONSTERS[m.kind].boss)!, wolf = sim.monsters.find(m => !MONSTERS[m.kind].boss && !MONSTERS[m.kind].night)!;
    for (const m of [boss, wolf]) {
      m.hp = Math.round(m.maxHP / 2); m.mode = "leash"; m.targetId = null; m.x = m.home.x; m.z = m.home.z;
      a.x = m.home.x + 3; a.z = m.home.z; sim.tick(0.05);   // a player close by keeps it awake
      expect(m.mode).toBe("wander");
    }
    expect(boss.hp).toBe(Math.round(boss.maxHP / 2));
    expect(wolf.hp).toBe(wolf.maxHP);
  });
  it("each realm has one night boss, out only after dusk", () => {
    const { sim } = setup();
    const lords = sim.monsters.filter(m => MONSTERS[m.kind].night && MONSTERS[m.kind].boss);
    expect(lords.map(m => m.kind).sort()).toEqual(Object.keys(NIGHT_BOSSES).map(nightBossOf).sort());
    sim.clock = () => 12; sim.tick(0.05);
    expect(lords.every(m => !m.alive)).toBe(true);                  // gone by day
    sim.clock = () => 22; for (let i = 0; i < 140; i++) sim.tick(0.05);
    expect(lords.every(m => m.alive)).toBe(true);                   // back at night, somewhere in their realm
    for (const m of lords) { const d = MONSTERS[m.kind], t = MONSTERS[bossOf(d.base!)]; expect(d.VIT).toBeGreaterThan(t.VIT); expect(d.level).toBeGreaterThan(t.level); }   // tougher than its Tyrant
  });
  it("the stat reset scroll gives every spent point back", () => {
    const { sim, a } = setup(); a.points = 12; sim.allocate("a", "STR", 7); sim.allocate("a", "VIT", 5); expect(a.points).toBe(0);
    a.gold = 5000; sim.buy("a", "STAT_RESET", 1); const s = a.inv.items.find(i => i.itemId === "STAT_RESET")!;
    sim.use("a", s.id);
    expect(a.STR).toBe(5); expect(a.VIT).toBe(5); expect(a.points).toBe(12); expect(a.inv.items.some(i => i.itemId === "STAT_RESET")).toBe(false);
  });
  it("dead player respawns in town with full hp", () => {
    const { sim, a } = setup(); a.x = 0; a.z = -30; a.hp = 0; a.alive = false; a.deadT = 3;
    for (let i = 0; i < 70; i++) sim.tick(0.05); expect(a.alive).toBe(true); expect(a.hp).toBe(a.maxHP); expect(Math.abs(a.z + 4.5)).toBeLessThan(0.01);
  });
  it("shop/craft/allocate validate on the sim", () => {
    const { sim, a } = setup(); sim.buy("a", "HP_POTION", 1000); expect(sim.drain().some(e => e.t === "msg" && e.text.includes("ซื้อไม่ได้"))).toBe(true);
    sim.allocate("a", "STR", 3); expect(a.STR).toBe(8); expect(a.points).toBe(2); sim.allocate("a", "STR", 9); expect(a.STR).toBe(8);
    const before = a.gold; sim.craft("a", "NOPE"); expect(a.gold).toBe(before);   // an unknown recipe must not charge
  });
});

describe("trade + save", () => {
  const near = (sim: Sim, a: any, b: any) => { a.x = b.x = 0; a.z = -4; b.z = -3; };
  it("needs a Merchant Seal and range; swaps atomically; offer change un-confirms", () => {
    const { sim, a, b } = setup(); near(sim, a, b);
    sim.tradeReq("a", "b"); expect(sim.drain().some(e => e.t === "msg" && e.text.includes("Merchant Seal"))).toBe(true);
    a.gold = b.gold = 100; sim.buy("a", "MERCHANT_SEAL", 1); sim.buy("b", "MERCHANT_SEAL", 1); sim.drain();   // fixed purses: the numbers below must not move with START_GOLD
    sim.tradeReq("a", "b"); expect(sim.drain().some(e => e.t === "tradeReq" && e.pid === "b")).toBe(true);
    sim.tradeAccept("b"); expect(sim.trades.size).toBe(2);
    const potion = a.inv.items.find(s => s.itemId === "HP_POTION")!;
    sim.tradeOffer("a", { [potion.id]: 2 }, 0); sim.tradeOffer("b", {}, 20);         // 2 potions = reference 40: 20 Gold is under the ±10% band
    sim.tradeConfirm("a"); sim.tradeConfirm("b"); expect(sim.trades.size).toBe(2);  // refused, trade stays open
    expect(sim.drain().some(e => e.t === "msg" && e.text.includes("36–44"))).toBe(true);
    sim.tradeOffer("b", {}, 38);
    sim.tradeConfirm("a"); sim.tradeOffer("b", {}, 42);   // B changes → A's confirm reset
    sim.tradeConfirm("b"); expect(sim.trades.size).toBe(2);
    sim.tradeConfirm("a"); expect(sim.trades.size).toBe(0);
    expect(a.gold).toBe(50 + 42); expect(b.gold).toBe(50 - 42);
    expect(a.inv.items.find(s => s.itemId === "HP_POTION")!.count).toBe(1); expect(b.inv.items.find(s => s.itemId === "HP_POTION")!.count).toBe(5);
    const seal = a.inv.items.find(s => s.itemId === "MERCHANT_SEAL")!; sim.tradeReq("a", "b"); sim.tradeAccept("b"); sim.tradeOffer("a", { [seal.id]: 1 }, 0);
    expect(sim.drain().filter(e => e.t === "trade").at(-1)).toMatchObject({ view: { mine: { items: [] } } });   // bound item never enters an offer
    b.z = -20; sim.tick(0.05); expect(sim.trades.size).toBe(0);                                                  // walked away → cancelled
  });
  it("save/restore round-trips a player", () => {
    const { sim, a } = setup(); a.gold = 77; a.level = 3; a.STR = 9; sim.allocate("a", "VIT", 2);
    const s = JSON.parse(JSON.stringify(save(a)));
    const sim2 = new Sim(undefined, seeded()); const p = sim2.join("x", { name: "ignored", color: 0 }, s);
    expect(p.name).toBe("A"); expect(p.gold).toBe(77); expect(p.level).toBe(3); expect(p.VIT).toBe(7); expect(p.inv.items.length).toBe(a.inv.items.length); expect(Object.values(p.equip)).toContain("WOODEN_SWORD"); expect(p.maxHP).toBe(a.maxHP);
  });

  it("W4: races, skill shop, heal, mount, boss notice", () => {
    const { sim, a } = setup(); expect(a.race).toBe("dog"); expect(sim.join("c", { name: "C", color: 1, race: "cat" }).race).toBe("cat"); expect(sim.join("d", { name: "D", color: 1, race: "bird" }).race).toBe("dog");
    sim.act("a", "SKILL_HEAL"); expect(sim.drain().some(e => e.t === "heal")).toBe(false);          // not learned
    a.gold = 20; sim.learn("a", "SKILL_HEAL"); expect(save(a).skills).not.toContain("SKILL_HEAL");   // 20 gold < the 200 price (a trial-lent skill is not saved)
    a.gold = 500; sim.learn("a", "SKILL_HEAL"); sim.learn("a", "SKILL_HEAL"); expect(save(a).skills).toContain("SKILL_HEAL"); expect(a.gold).toBe(300);
    a.x = 30; a.z = -15; a.hp = 10; sim.act("a", "SKILL_HEAL"); expect(a.hp).toBe(10);   // outside town: no rest regen muddying the number
    for (let i = 0; i < 10; i++) sim.tick(0.05);   // the heal lands mid-cast
    expect(a.hp).toBeCloseTo(10 + Math.floor(a.maxHP * 0.35) + a.HPR * 0.5, 5);   // plus half a second of VIT regen
    expect(a.cd.SKILL_HEAL).toBeCloseTo(15 * (1 - a.CDR) - 0.5, 1);   // DEX cuts skill cooldowns (CDR)
    a.gold = 3000; sim.buy("a", "MOUNT_HORSE", 1); const w = a.inv.items.find(s => s.itemId === "MOUNT_HORSE")!; sim.use("a", w.id); expect(a.mounted).toBe(true);
    const run = (mounted: boolean) => { a.busy = 0; a.mounted = mounted; a.x = 30; a.z = -15; sim.input("a", 0, -1); sim.tick(1); return -15 - a.z; };
    expect(run(true)).toBeGreaterThan(run(false) * 1.7);
    a.mounted = true; a.busy = 0; sim.act("a", "SKILL_BASIC"); expect(a.mounted).toBe(false); a.busy = 0;
    const boss = sim.monsters.find(m => m.kind === "MON_ALPHA_WOLF")!; expect(boss.maxHP).toBeGreaterThan(sim.monsters[0].maxHP * 3);
    sim.input("a", 0, 0); sim.tick(1); boss.hp = 1; a.x = boss.x; a.z = boss.z + 1; a.yaw = Math.PI; a.DEX = 500; (sim as any).sync(a); a.gold = 0; sim.drain(); sim.act("a", "SKILL_BASIC");
    for (let i = 0; i < 12; i++) { a.x = boss.x; a.z = boss.z + 1; sim.tick(0.05); }
    const ev = sim.drain(); expect(ev.some(e => e.t === "notice" && e.text.includes("ปราบ"))).toBe(true);
    const coins = sim.ground.filter(g => g.gold > 0); expect(coins.length).toBe(1); expect(coins[0].gold).toBeGreaterThanOrEqual(120);
    const s = save(a); expect(s.skills).toContain("SKILL_HEAL"); expect(s.race).toBe("dog");
  });
});

describe("camera boom", () => {
  const L = buildLayout();
  const boom = { x: 0, y: 7.4, z: 7.4 };
  it("stays long in the open and pulls in when a wall or house is behind the player", () => {
    expect(clearBoom({ x: 0, z: -30 }, boom, L)).toBe(1);                       // open field
    expect(clearBoom({ x: 0, z: -4 }, boom, L)).toBe(1);                        // town centre, boom points north over the gate opening
    const atWall = clearBoom({ x: 6, z: -13 }, boom, L);                        // just outside the south wall: the wall is between
    expect(atWall).toBeLessThan(1); expect(atWall).toBeGreaterThanOrEqual(0.35);
    expect(clearBoom({ x: 7.2, z: -1 }, boom, L)).toBeLessThan(1);              // stone house sits behind the player
  });
  it("ignores props that the boom passes over", () => {
    expect(clearBoom({ x: 0, z: -30 }, { x: 0, y: 40, z: 2 }, L)).toBe(1);      // nearly vertical boom clears every roof
  });
});

describe("camera boom heights", () => {
  const L = buildLayout();
  it("a tall house blocks even a steep boom, open ground never does", () => {
    const steep = { x: 0, y: 9.8, z: 1.4 };
    expect(clearBoom({ x: 8.2, z: -9.4 }, steep, L)).toBeLessThan(1);    // stone house (6 m) is right behind
    expect(clearBoom({ x: 0, z: -30 }, steep, L)).toBe(1);
    expect(clearBoom({ x: 0, z: -30 }, { x: 0, y: 7.4, z: 7.4 }, L)).toBe(1);
  });
});

describe("monster roster", () => {
  it("spawns every group with its own kind, stats scale with level, and drops resolve", () => {
    const sim = new Sim(undefined, seeded());
    const byKind = new Map<string, number>();
    for (const m of sim.monsters) byKind.set(m.kind, (byKind.get(m.kind) ?? 0) + 1);
    expect(byKind.get("MON_WOLF_001")).toBe(SPAWNS.filter(s => s.kind === "MON_WOLF_001").reduce((n, s) => n + s.n, 0));
    for (const kind of ["MON_SLIME", "MON_FOX", "MON_BOAR", "MON_SHROOM", "MON_BEAR", "MON_DIRE_WOLF", "MON_STUMP", "MON_ALPHA_WOLF"]) expect(byKind.get(kind)! > 0).toBe(true);
    const hp = (k: string) => sim.monsters.find(m => m.kind === k)!.maxHP;
    expect(hp("MON_SLIME")).toBeLessThan(hp("MON_SHROOM"));
    expect(hp("MON_SHROOM")).toBeLessThan(hp("MON_BOAR"));
    expect(hp("MON_FOX")).toBeLessThan(hp("MON_BOAR"));
    expect(hp("MON_BOAR")).toBeLessThan(hp("MON_BEAR"));
    expect(hp("MON_BOAR")).toBeLessThan(hp("MON_ALPHA_WOLF"));
    for (const m of sim.monsters) { expect(m.hp).toBe(m.maxHP); expect(DROPS[MONSTERS[m.kind].dropTable]).toBeTruthy(); }
  });
  it("group members do not stack on one spot", () => {
    const sim = new Sim(undefined, seeded());
    const foxes = sim.monsters.filter(m => m.kind === "MON_FOX");
    for (let i = 1; i < foxes.length; i++) expect(Math.hypot(foxes[i].x - foxes[0].x, foxes[i].z - foxes[0].z)).toBeGreaterThan(0.5);
  });
});

describe("monster clip sets", () => {
  it("animals rebuilt on four legs play the default clips (the Alpha lord too); legless bodies S", () => {
    for (const kind of ["MON_WOLF_001", "MON_FOX", "MON_BOAR", "MON_BEAR", "MON_DIRE_WOLF", "MON_Z_GLACIER_2"]) expect(MONSTERS[kind].clips).toBeUndefined();   // the rest pose is four-legged already
    expect(MONSTERS.MON_ALPHA_WOLF.clips).toBeUndefined(); expect(MONSTERS.MON_Z_DUNE_2.clips).toBe("S");
    for (const kind of ["MON_SLIME", "MON_SHROOM", "MON_STUMP"]) expect(MONSTERS[kind].clips).toBeUndefined();
  });
});

describe("ground loot", () => {
  const seededSim = () => { const sim = new Sim(undefined, seeded()); const a = sim.join("a", { name: "A", color: 1 }); return { sim, a }; };
  it("needs range, frees up after the owner window, and expires", () => {
    const { sim, a } = seededSim();
    (sim as any).drop({ x: 5, z: -20 }, "a", "WOLF_FANG", 2, 0);
    const g = sim.ground[0];
    a.x = 20; a.z = -20; sim.drain();
    sim.pickup("a", g.id); expect(sim.ground).toContain(g);                     // too far
    expect(sim.drain().some(e => e.t === "msg" && e.text.includes("ไกล"))).toBe(true);
    a.x = g.x; a.z = g.z; sim.pickup("a", g.id);
    expect(sim.ground).not.toContain(g);
    expect(a.inv.items.find(s => s.itemId === "WOLF_FANG")?.count).toBe(2);
    const ev = sim.drain();
    expect(ev.some(e => e.t === "anim" && e.clip === "Pick")).toBe(true);        // the crouch everyone can see
    (sim as any).drop({ x: 0, z: -20 }, "someone-else", "IRON_ORE", 1, 0);
    const g2 = sim.ground[0]; a.x = g2.x; a.z = g2.z;
    sim.pickup("a", g2.id); expect(sim.ground).toContain(g2);                    // still reserved
    g2.t = LOOT_TTL - LOOT_OWNER_WINDOW - 1;
    sim.pickup("a", g2.id); expect(sim.ground).not.toContain(g2);                // window passed: free for all
    (sim as any).drop({ x: 0, z: -20 }, "a", "IRON_ORE", 1, 0);
    for (let i = 0; i < LOOT_TTL + 1; i++) sim.tick(1);
    expect(sim.ground.length).toBe(0);                                          // rots away
  });
  it("a full bag leaves the stack on the floor", () => {
    const { sim, a } = seededSim();
    a.inv.capacity = a.inv.items.length;
    (sim as any).drop({ x: 0, z: -20 }, "a", "IRON_ORE", 1, 0);
    const g = sim.ground[0]; a.x = g.x; a.z = g.z; sim.drain();
    sim.pickup("a", g.id);
    expect(sim.ground).toContain(g);
    expect(sim.drain().some(e => e.t === "msg" && e.text.includes("กระเป๋าเต็ม"))).toBe(true);
  });
});

describe("monster toughness", () => {
  it("regular monsters fall in a handful of basic hits, the boss still takes a while", () => {
    const sim = new Sim(undefined, seeded()); const a = sim.join("a", { name: "A", color: 1 });
    const hit = Math.max(1, a.ATK! - 0);   // a fresh level-1 character's basic swing before defence
    const swings = (kind: string) => { const m = sim.monsters.find(x => x.kind === kind)!; return Math.ceil(m.maxHP / Math.max(1, hit - m.DEF)); };
    expect(swings("MON_SLIME")).toBeLessThanOrEqual(10);
    expect(swings("MON_WOLF_001")).toBeLessThanOrEqual(10);
    expect(swings("MON_ALPHA_WOLF")).toBeGreaterThan(swings("MON_WOLF_001") * 3);
  });
});

describe("breeds", () => {
  it("three breeds per race, dogs bigger than cats bigger than mice", () => {
    const of = (sp: string) => Object.entries(BREEDS).filter(([id, b]) => b.species === sp && id !== sp).map(([, b]) => b.size);
    for (const sp of ["dog", "cat", "mouse"]) expect(of(sp)).toHaveLength(3);
    expect(Math.min(...of("dog"))).toBeGreaterThan(Math.max(...of("cat")));
    expect(Math.min(...of("cat"))).toBeGreaterThan(Math.max(...of("mouse")));
  });
  it("join keeps a valid breed, falls back to dog otherwise, and the creator's pick beats the save", () => {
    const sim = new Sim();
    expect(sim.join("a", { name: "A", color: 0, race: "husky" }).race).toBe("husky");
    expect(sim.join("b", { name: "B", color: 0, race: "dragon" }).race).toBe("dog");
    const saved = save(sim.join("c", { name: "C", color: 0, race: "hamster" }));
    expect(new Sim().join("c", { name: "C", color: 0, race: "persian" }, saved).race).toBe("persian");
  });
  it("a returning player comes back where they left; a spot off the map sends them to town", () => {
    const sim = new Sim(); const p = sim.join("a", { name: "Back", color: 0 }); p.x = 30; p.z = 60;   // out in the fields
    const saved = save(p); sim.leave("a");
    const q = sim.join("a2", { name: "Back", color: 0 }, saved); expect(Math.hypot(q.x - 30, q.z - 60)).toBeLessThan(1.5);
    const r = sim.join("a3", { name: "Lost", color: 0 }, { ...saved, x: 99999, z: 99999 }); expect(Math.hypot(r.x, r.z)).toBeLessThan(15);
  });
});
