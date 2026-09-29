import { describe, expect, it } from "vitest";
import { damage, derive } from "../formulas";

const unit = (o: Partial<any> = {}) => derive({ level: 1, STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, ...o });
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };   // deterministic rng

describe("derive (spec §4.3)", () => {
  it("L1 starter with gear: HP 165 (chest +10), ATK 17.5, DEF 9, boots AGI +1", () => {
    const u = unit({ equip: { weapon: "WOODEN_SWORD", chest: "STARTER_CHEST", boots: "STARTER_BOOTS" } });
    expect(u.maxHP).toBe(165); expect(u.ATK).toBe(17.5); expect(u.DEF).toBe(9); expect(u.Crit).toBe(7.5); expect(u.Hit).toBe(91);
    expect(u.Dodge).toBeCloseTo(6 * 0.3);
  });
  it("Wolf Fang Sword gives ATK 34.5 (+18, STR +2) and +2 crit", () => {
    const u = unit({ equip: { weapon: "WOLF_FANG_SWORD" } }); expect(u.ATK).toBe(34.5); expect(u.Crit).toBe(9.5);
  });
  it("caps crit and dodge", () => { const u = unit({ LUK: 1000, AGI: 1000 }); expect(u.Crit).toBe(50); expect(u.Dodge).toBe(30); });
});

describe("damage (BKDamageExecCalc)", () => {
  const src = { ATK: 20, Crit: 0, Hit: 100, DEF: 0, Dodge: 0, maxHP: 1 } as any;
  const dst = (DEF: number) => ({ ATK: 0, Crit: 0, Hit: 0, DEF, Dodge: 0, maxHP: 1 } as any);
  it("ATK 20 coef 1 vs DEF 5, no crit, no variance → 15", () => {
    // rng: hit roll 0 (hits), crit roll 0.99 (no crit since Crit=0), variance 0.5 → factor 1.0
    expect(damage(src, dst(5), 1, seq(0, 0.99, 0.5))).toEqual({ crit: false, miss: false, dmg: 15 });
  });
  it("DEF above ATK still deals 1", () => { expect(damage(src, dst(99), 1, seq(0, 0.99, 0.5)).dmg).toBe(1); });
  it("crit multiplies by 1.5", () => { expect(damage({ ...src, Crit: 100 }, dst(5), 1, seq(0, 0, 0.5)).dmg).toBe(22); });   // floor(22.5)
  it("misses when the hit roll beats Hit-Dodge", () => { expect(damage({ ...src, Hit: 50 }, dst(0), 1, seq(0.99)).miss).toBe(true); });
  it("coef scales the attack", () => { expect(damage(src, dst(5), 1.6, seq(0, 0.99, 0.5)).dmg).toBe(27); });
});

describe("attack speed (AGI)", () => {
  it("1% per AGI, capped at ×2", () => { expect(unit({ AGI: 5 }).ASPD).toBeCloseTo(1.05); expect(unit({ AGI: 300 }).ASPD).toBe(2); });
  it("a quicker basic attack: shorter cooldown and lock, the cast event carries the rate", async () => {
    const { Sim } = await import("../sim"); const sim = new Sim() as any; sim.monsters.length = 0;
    const cd = (AGI: number) => { const p = sim.join("p" + AGI, { name: "A" + AGI, color: 1 }); p.AGI = AGI; sim.sync(p); sim.act(p.id, "SKILL_BASIC"); return [p.cd.SKILL_BASIC, p.busy]; };
    const [slow, fast] = [cd(5), cd(55)];
    expect(fast[0]).toBeLessThan(slow[0]); expect(fast[1]).toBeLessThan(slow[1]); expect(slow[0] / fast[0]).toBeCloseTo(1.55 / 1.05);
  });
});

describe("cooldown reduction (DEX)", () => {
  it("0.4% per DEX, capped at 40%; skills only, not the basic attack", async () => {
    expect(unit({ DEX: 50 }).CDR).toBeCloseTo(0.2); expect(unit({ DEX: 500 }).CDR).toBe(0.4);
    const { Sim } = await import("../sim"); const { SKILLS } = await import("../data"); const sim = new Sim() as any; sim.monsters.length = 0;
    const p = sim.join("d", { name: "Dex", color: 1 }); p.DEX = 55; p.skills.push("SKILL_HEAL"); sim.sync(p);
    sim.act(p.id, "SKILL_HEAL"); expect(p.cd.SKILL_HEAL).toBeCloseTo(SKILLS.SKILL_HEAL.cooldown * (1 - 0.22));
  });
});
