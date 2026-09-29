// Pure craft (spec §5.13). Server-only in W2; the client calls it directly until then.
import { RECIPES, Recipe, itemName } from "./data";
import { Inventory, addItem, canAdd, countOf, hasAll, removeItem } from "./inventory";

export interface CraftCheck { ok: boolean; reason?: string }

export function canCraft(inv: Inventory, gold: number, recipe: Recipe): CraftCheck {
  if (!hasAll(inv, recipe.ingredients)) {
    const miss = recipe.ingredients.find(i => countOf(inv, i.item) < i.count)!;
    return { ok: false, reason: `ต้องการ ${itemName(miss.item)} ${countOf(inv, miss.item)}/${miss.count}` };
  }
  if (gold < recipe.gold) return { ok: false, reason: `Gold ไม่พอ ${gold}/${recipe.gold}` };
  // simulate consumption before checking room for the result — consuming may free a slot
  const sim: Inventory = { ...inv, items: inv.items.map(s => ({ ...s })) };
  for (const i of recipe.ingredients) removeItem(sim, i.item, i.count);
  if (!canAdd(sim, recipe.result, recipe.count)) return { ok: false, reason: "กระเป๋าเต็ม" };
  return { ok: true };
}

/** Atomic: returns the gold left, or -1 when the craft is refused (inventory untouched). */
export function craft(inv: Inventory, gold: number, recipeId: string): number {
  const recipe = RECIPES[recipeId]; if (!recipe) return -1;
  if (!canCraft(inv, gold, recipe).ok) return -1;
  for (const i of recipe.ingredients) removeItem(inv, i.item, i.count);
  addItem(inv, recipe.result, recipe.count);
  return gold - recipe.gold;
}
