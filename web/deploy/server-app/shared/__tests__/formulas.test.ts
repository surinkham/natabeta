import { describe, expect, it } from "vitest";
import { damage, derive } from "../formulas";

const unit = (o: Partial<any> = {}) => derive({ level: 1, STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, ...o });
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };   // deterministic rng

describe("derive (spec §4.3)", () => {
  it("L1 starter with gear: HP 155, ATK 17.5, DEF 9", () => {
    const u = unit({ equip: { weapon: "WOODEN_SWORD", chest: "STARTER_CHEST", boots: "STARTER_BOOTS" } });
    expect(u.maxHP).toBe(155); expect(u.ATK).toBe(17.5); expect(u.DEF).toBe(9); expect(u.Crit).toBe(7.5); expect(u.Hit).toBe(91);
  });
  it("Wolf Fang Sword gives ATK 30.5 and +2 crit", () => {
    const u = unit({ equip: { weapon: "WOLF_FANG_SWORD" } }); expect(u.ATK).toBe(30.5); expect(u.Crit).toBe(9.5);
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
