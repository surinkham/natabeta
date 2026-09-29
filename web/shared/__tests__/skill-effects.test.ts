import { describe, expect, it } from "vitest";
import { Sim, attackSkill, SLOW_MULT } from "../sim";
import { SKILLS } from "../data";

const arena = () => { const sim = new Sim() as any; sim.monsters.length = 0; const p = sim.join("p", { name: "P", color: 1 }); p.x = 30; p.z = -15; return { sim, p }; };

describe("skill effects", () => {
  it("Frost Nova slows what it hits for its `slow` seconds", () => {
    const { sim, p } = arena();
    const m = (new Sim() as any).monsters.find((x: any) => !x.boss && x.alive); m.x = p.x + 1; m.z = p.z; m.home = { x: m.x, z: m.z }; m.hp = m.maxHP = 99999; sim.monsters.push(m);
    p.skills.push("SKILL_FROST_NOVA"); p.equip.MainWeapon = "APPRENTICE_STAFF"; p.mp = 99; sim.act("p", "SKILL_FROST_NOVA");
    for (let i = 0; i < 10; i++) sim.tick(0.05);
    expect(m.slowT).toBeGreaterThan(0);
  });
  it("a slowed monster walks at SLOW_MULT", () => {
    const { sim } = arena(); const m = (new Sim() as any).monsters[0]; m.x = 30; m.z = -15; m.slowT = 2;
    (sim as any).stepTo(m, { x: 40, z: -15 }, 2, 1); expect(m.x - 30).toBeCloseTo(2 * SLOW_MULT, 1);
  });
  it("War Cry buffs ATK and DEF for its duration, then wears off", () => {
    const { sim, p } = arena(); const atk = p.ATK, def = p.DEF;
    p.skills.push("SKILL_WAR_CRY"); p.mp = 99; sim.act("p", "SKILL_WAR_CRY");
    for (let i = 0; i < 10; i++) sim.tick(0.05);
    expect(p.ATK).toBe(Math.round(atk * 1.2)); expect(p.DEF).toBe(Math.round(def * 1.15));
    for (let i = 0; i < 25; i++) sim.tick(1);
    expect(p.buff).toBeUndefined(); expect(p.ATK).toBe(atk);
  });
  it("out of arrows, out of MP or bare-handed: a bonk; no weapon = no sword skills", async () => {
    const { skillFits } = await import("../sim");
    const { p } = arena(); p.equip = { MainWeapon: "HUNTER_BOW" }; p.inv.items = p.inv.items.filter((s: any) => s.itemId !== "ARROW");
    expect(attackSkill(p.equip)).toBe("SKILL_SHOOT"); expect(attackSkill(p.equip, p.inv)).toBe("SKILL_PUNCH");
    expect(attackSkill({ MainWeapon: "APPRENTICE_STAFF" }, p.inv, 10)).toBe("SKILL_BOLT"); expect(attackSkill({ MainWeapon: "APPRENTICE_STAFF" }, p.inv, 1)).toBe("SKILL_PUNCH");
    expect(attackSkill({})).toBe("SKILL_PUNCH"); expect(skillFits("SKILL_SLASH", {})).toBe(false); expect(attackSkill({ MainWeapon: "WOODEN_SWORD" })).toBe("SKILL_BASIC");
  });
});

describe("raid bosses", () => {
  it("take about ten players of their level four minutes", async () => {
    const { raidHP, playerDps } = await import("../sim");
    for (const L of [8, 30, 60, 99]) expect(raidHP(L) / playerDps(L)).toBeCloseTo(10 * 240, 0);
    const { Sim: S } = await import("../sim"); const { KINGDOM_BOSSES: K } = await import("../data");
    const sim = new S() as any, m = sim.monsters.find((x: any) => x.kind === K[0].id); expect(m.maxHP).toBe(raidHP(m.level));
  });
});
