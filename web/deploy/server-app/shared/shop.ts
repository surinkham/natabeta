// NPC shop: buy uses ITEMS.buy, sell uses ITEMS.sell (GDD §15 Gold). Returns gold left or -1 (inventory untouched).
import { ITEMS } from "./data";
import { Inventory, addItem, removeItem } from "./inventory";

export function buy(inv: Inventory, gold: number, itemId: string, count: number): number {
  const d = ITEMS[itemId]; if (!d?.buy || count < 1) return -1;
  const cost = d.buy * count; if (gold < cost) return -1;
  if (!addItem(inv, itemId, count)) return -1;
  return gold - cost;
}
export function sell(inv: Inventory, gold: number, itemId: string, count: number): number {
  const d = ITEMS[itemId]; if (!d || count < 1) return -1;
  if (!removeItem(inv, itemId, count)) return -1;
  return gold + d.sell * count;
}
