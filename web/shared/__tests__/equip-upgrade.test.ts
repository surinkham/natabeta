import { expect, it } from "vitest";
import { upgradeOver } from "../equipment";

it("a stronger piece for a worn slot is an upgrade; another weapon kind is not compared", () => {
  const eq: any = { MainWeapon: { id: "i1", itemId: "WOODEN_SWORD", count: 1 } };
  expect(upgradeOver("WOLF_FANG_SWORD", eq)).toBeGreaterThan(0);   // ATK 18 + Crit + STR over ATK 5
  expect(upgradeOver("WOODEN_SWORD", { MainWeapon: { id: "i2", itemId: "WOLF_FANG_SWORD", count: 1 } } as any)).toBe(0);
  expect(upgradeOver("HUNTER_BOW", eq)).toBe(0);                    // a bow against a sword: not an upgrade, a change of style
  expect(upgradeOver("KNIGHT_HELMET", {})).toBeGreaterThan(0);     // an empty slot: anything wearable helps
  expect(upgradeOver("HP_POTION", eq)).toBe(0);
});
