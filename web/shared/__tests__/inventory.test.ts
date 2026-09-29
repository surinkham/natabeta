import { describe, expect, it } from "vitest";
import { addItem, canAdd, countOf, createInventory, removeItem } from "../inventory";

describe("inventory (spec §5.10)", () => {
  it("stacks to maxStack 99: 60 + 60 → 99 + 21", () => {
    const inv = createInventory(30);
    expect(addItem(inv, "WOLF_FANG", 60)).toBe(true); expect(addItem(inv, "WOLF_FANG", 60)).toBe(true);
    expect(inv.items.map(s => s.count)).toEqual([99, 21]); expect(countOf(inv, "WOLF_FANG")).toBe(120);
  });
  it("removes across stacks: 120 - 100 → 20", () => {
    const inv = createInventory(30); addItem(inv, "WOLF_FANG", 120);
    expect(removeItem(inv, "WOLF_FANG", 100)).toBe(true); expect(countOf(inv, "WOLF_FANG")).toBe(20); expect(inv.items.length).toBe(1);
  });
  it("refuses to remove more than owned, untouched", () => {
    const inv = createInventory(30); addItem(inv, "WOLF_FANG", 5);
    expect(removeItem(inv, "WOLF_FANG", 6)).toBe(false); expect(countOf(inv, "WOLF_FANG")).toBe(5);
  });
  it("add beyond capacity fails all-or-nothing", () => {
    const inv = createInventory(2); addItem(inv, "WOLF_FANG", 99); addItem(inv, "WOLF_HIDE", 1);
    expect(canAdd(inv, "IRON_ORE", 1)).toBe(false); expect(addItem(inv, "IRON_ORE", 1)).toBe(false); expect(inv.items.length).toBe(2);
    expect(addItem(inv, "WOLF_FANG", 1)).toBe(false);          // stack full and no slot
    expect(addItem(inv, "WOLF_HIDE", 5)).toBe(true);           // fits in the existing stack
  });
  it("equipment never stacks", () => {
    const inv = createInventory(30); addItem(inv, "WOODEN_SWORD", 1); addItem(inv, "WOODEN_SWORD", 1);
    expect(inv.items.length).toBe(2);
  });
});
