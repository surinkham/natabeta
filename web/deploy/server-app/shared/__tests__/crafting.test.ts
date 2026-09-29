import { describe, expect, it } from "vitest";
import { canCraft, craft } from "../crafting";
import { RECIPES } from "../data";
import { addItem, countOf, createInventory } from "../inventory";

const R = RECIPES.RCP_WOLF_FANG_SWORD;
const stocked = (fang = 10, ore = 5) => { const inv = createInventory(30); addItem(inv, "WOLF_FANG", fang); addItem(inv, "IRON_ORE", ore); return inv; };

describe("crafting (spec §5.13)", () => {
  it("everything present → ok, consumes and adds the sword", () => {
    const inv = stocked(); expect(canCraft(inv, 50, R).ok).toBe(true);
    expect(craft(inv, 50, "RCP_WOLF_FANG_SWORD")).toBe(0);
    expect(countOf(inv, "WOLF_FANG")).toBe(0); expect(countOf(inv, "IRON_ORE")).toBe(0); expect(countOf(inv, "WOLF_FANG_SWORD")).toBe(1);
  });
  it("one ingredient short → reason names it, nothing consumed", () => {
    const inv = stocked(9); const c = canCraft(inv, 50, R);
    expect(c.ok).toBe(false); expect(c.reason).toContain("Wolf Fang"); expect(craft(inv, 50, "RCP_WOLF_FANG_SWORD")).toBe(-1); expect(countOf(inv, "WOLF_FANG")).toBe(9);
  });
  it("gold short → refused", () => { expect(canCraft(stocked(), 49, R).ok).toBe(false); });
  it("full bag but ingredients free a slot → ok", () => {
    const inv = createInventory(2); addItem(inv, "WOLF_FANG", 10); addItem(inv, "IRON_ORE", 5);
    expect(canCraft(inv, 50, R).ok).toBe(true);
  });
  it("full bag and ingredients do not free a slot → refused", () => {
    const inv = createInventory(3); addItem(inv, "WOLF_FANG", 20); addItem(inv, "IRON_ORE", 9); addItem(inv, "WOLF_HIDE", 1);
    expect(canCraft(inv, 50, R).ok).toBe(false);
  });
});
