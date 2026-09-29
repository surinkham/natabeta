import { describe, expect, it } from "vitest";
import { Sim, save } from "../sim";
import { SPAWNS, buildLayout, clearBoom } from "../world";
import { DROPS, MONSTERS } from "../data";

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
    for (const p of [a, b]) { p.x = m.x; p.z = m.z + 1; p.yaw = Math.PI; (sim as any).sync(p); }
    m.hp = 4;  // two hits kill it; whoever lands the second one is the killer
    const aInv = a.inv.items.length, bInv = b.inv.items.length, aG = a.gold, bG = b.gold;
    const swing = (id: string) => { sim.act(id, "SKILL_BASIC"); for (let i = 0; i < 12; i++) sim.tick(0.05); return sim.drain(); };   // the hit lands on the clip's contact frame
    const evA = swing("a");
    const evB = swing("b");
    const kills = [...evA, ...evB].filter(e => e.t === "kill"); expect(kills).toHaveLength(1); expect(m.alive).toBe(false);
    const looted = [...evA, ...evB].filter(e => e.t === "loot"); expect(looted.every(e => (e as any).pid === (kills[0] as any).pid)).toBe(true);
    const winner = (kills[0] as any).pid === "a" ? a : b, loser = winner === a ? b : a;
    expect(winner.exp).toBe(20); expect(loser.exp).toBe(0);
    expect((winner.inv.items.length - (winner === a ? aInv : bInv)) + (winner.gold - (winner === a ? aG : bG))).toBeGreaterThan(0);
    expect(loser.inv.items.length).toBe(loser === a ? aInv : bInv); expect(loser.gold).toBe(loser === a ? aG : bG);
  });
  it("wolf aggroes the nearest player outside town, bites and respawns", () => {
    const { sim, a } = setup(); const sp = SPAWNS[0]; a.x = sp.x - 2; a.z = sp.z + 2; a.DEF = 0; a.AGI = 0; (sim as any).sync(a); a.hp = a.maxHP; a.Dodge = 0;
    let bitten = false; for (let i = 0; i < 200 && !bitten; i++) { sim.tick(0.05); if (sim.drain().some(e => e.t === "dmg" && e.id === "a" && !e.miss)) bitten = true; }
    expect(bitten).toBe(true); expect(a.hp).toBeLessThan(a.maxHP);
    const m = sim.monsters[0]; m.hp = 0; (sim as any).kill(a, m); expect(m.alive).toBe(false);
    for (let i = 0; i < 220; i++) sim.tick(0.05); expect(m.alive).toBe(true); expect(m.hp).toBe(m.maxHP);
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
    sim.tradeOffer("a", { [potion.id]: 2 }, 10); sim.tradeOffer("b", {}, 30);
    sim.tradeConfirm("a"); sim.tradeOffer("b", {}, 25);   // B changes → A's confirm reset
    sim.tradeConfirm("b"); expect(sim.trades.size).toBe(2);
    sim.tradeConfirm("a"); expect(sim.trades.size).toBe(0);
    expect(a.gold).toBe(50 - 10 + 25); expect(b.gold).toBe(50 + 10 - 25);
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
    a.gold = 20; sim.learn("a", "SKILL_HEAL"); expect(a.skills).not.toContain("SKILL_HEAL");        // 20 gold < the 200 price
    a.gold = 500; sim.learn("a", "SKILL_HEAL"); sim.learn("a", "SKILL_HEAL"); expect(a.skills).toContain("SKILL_HEAL"); expect(a.gold).toBe(300);
    a.x = 30; a.z = -15; a.hp = 10; sim.act("a", "SKILL_HEAL"); expect(a.hp).toBe(10);   // outside town: no rest regen muddying the number
    for (let i = 0; i < 10; i++) sim.tick(0.05);   // the heal lands mid-cast
    expect(a.hp).toBe(10 + Math.floor(a.maxHP * 0.35)); expect(a.cd.SKILL_HEAL).toBeCloseTo(14.5, 1);
    sim.buy("a", "MOUNT_HORSE", 1); const w = a.inv.items.find(s => s.itemId === "MOUNT_HORSE")!; sim.use("a", w.id); expect(a.mounted).toBe(true);
    const run = (mounted: boolean) => { a.busy = 0; a.mounted = mounted; a.x = 30; a.z = -15; sim.input("a", 0, -1); sim.tick(1); return -15 - a.z; };
    expect(run(true)).toBeGreaterThan(run(false) * 1.7);
    a.mounted = true; a.busy = 0; sim.act("a", "SKILL_BASIC"); expect(a.mounted).toBe(false); a.busy = 0;
    const boss = sim.monsters.find(m => m.kind === "MON_ALPHA_WOLF")!; expect(boss.maxHP).toBeGreaterThan(sim.monsters[0].maxHP * 3);
    sim.input("a", 0, 0); sim.tick(1); boss.hp = 1; a.x = boss.x; a.z = boss.z + 1; a.yaw = Math.PI; a.DEX = 500; (sim as any).sync(a); a.gold = 0; sim.drain(); sim.act("a", "SKILL_BASIC");
    for (let i = 0; i < 12; i++) { a.x = boss.x; a.z = boss.z + 1; sim.tick(0.05); }
    const ev = sim.drain(); expect(ev.some(e => e.t === "notice" && e.text.includes("ปราบ"))).toBe(true); expect(a.gold).toBeGreaterThanOrEqual(120);
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
    expect(clearBoom({ x: 7.2, z: -1 }, steep, L)).toBeLessThan(1);      // stone house (7 m) is right behind
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
    for (const kind of ["MON_FOX", "MON_BOAR", "MON_DIRE_WOLF", "MON_ALPHA_WOLF"]) expect(byKind.get(kind)! > 0).toBe(true);
    const hp = (k: string) => sim.monsters.find(m => m.kind === k)!.maxHP;
    expect(hp("MON_FOX")).toBeLessThan(hp("MON_BOAR"));
    expect(hp("MON_BOAR")).toBeLessThan(hp("MON_ALPHA_WOLF"));
    for (const m of sim.monsters) { expect(m.hp).toBe(m.maxHP); expect(DROPS[MONSTERS[m.kind].dropTable]).toBeTruthy(); }
  });
  it("group members do not stack on one spot", () => {
    const sim = new Sim(undefined, seeded());
    const foxes = sim.monsters.filter(m => m.kind === "MON_FOX");
    for (let i = 1; i < foxes.length; i++) expect(Math.hypot(foxes[i].x - foxes[0].x, foxes[i].z - foxes[0].z)).toBeGreaterThan(0.5);
  });
});
