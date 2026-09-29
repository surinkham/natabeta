import { describe, expect, it } from "vitest";
import { equip, unequip, equippedIds } from "../equipment";
import { buy, sell } from "../shop";
import { allocate } from "../progression";
import { addItem, countOf, createInventory } from "../inventory";
import { validateData } from "../validate";

describe("equipment", () => {
  it("equip moves the instance out of the bag; unequip puts it back", () => {
    const inv = createInventory(30); addItem(inv, "WOODEN_SWORD", 1); const id = inv.items[0].id; const eq = {};
    expect(equip(inv, eq, id)).toBeUndefined(); expect(inv.items.length).toBe(0); expect(equippedIds(eq)).toEqual({ MainWeapon: "WOODEN_SWORD" });
    expect(unequip(inv, eq, "MainWeapon")).toBeUndefined(); expect(inv.items[0].id).toBe(id);
  });
  it("swap keeps both instances, refuses when the bag is full", () => {
    const inv = createInventory(1); addItem(inv, "WOODEN_SWORD", 1); const eq: any = {}; equip(inv, eq, inv.items[0].id);
    addItem(inv, "WOLF_FANG_SWORD", 1); expect(equip(inv, eq, inv.items[0].id)).toBeUndefined(); expect(eq.MainWeapon.itemId).toBe("WOLF_FANG_SWORD"); expect(countOf(inv, "WOODEN_SWORD")).toBe(1);
    addItem(inv, "WOLF_FANG", 1); expect(inv.items.length).toBe(1);
    const inv2 = createInventory(1); addItem(inv2, "WOLF_FANG_SWORD", 1); const eq2: any = { MainWeapon: { id: "x", itemId: "WOODEN_SWORD", count: 1 } };
    // bag has 1 slot holding the new sword; after taking it out there is room for the old one → ok
    expect(equip(inv2, eq2, inv2.items[0].id)).toBeUndefined();
  });
  it("materials cannot be equipped", () => { const inv = createInventory(5); addItem(inv, "WOLF_FANG", 1); expect(equip(inv, {}, inv.items[0].id)).toBe("สวมใส่ไม่ได้"); });
});
describe("shop", () => {
  it("buy/sell move gold and items", () => {
    const inv = createInventory(5); expect(buy(inv, 100, "HP_POTION", 3)).toBe(40); expect(countOf(inv, "HP_POTION")).toBe(3);
    expect(buy(inv, 10, "HP_POTION", 1)).toBe(-1); expect(sell(inv, 40, "HP_POTION", 2)).toBe(50); expect(sell(inv, 0, "HP_POTION", 5)).toBe(-1);
    expect(buy(inv, 999, "WOLF_FANG", 1)).toBe(-1);   // not for sale
  });
});
describe("allocate", () => {
  it("spends points only on primaries, never negative", () => {
    const u = { STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, points: 3 };
    expect(allocate(u, "STR", 2)).toBe(true); expect(u.STR).toBe(7); expect(u.points).toBe(1);
    expect(allocate(u, "STR", 2)).toBe(false); expect(allocate(u, "HP", 1 as any)).toBe(false); expect(allocate(u, "AGI", 0)).toBe(false);
  });
});
it("data still validates", () => expect(validateData()).toEqual([]));
