// Pure inventory (spec §5.10): stacks by item maxStack, fixed capacity, all-or-nothing add. No IDs from the outside.
import { ITEMS } from "./data";

export interface ItemInstance { id: string; itemId: string; count: number }
export interface Inventory { items: ItemInstance[]; capacity: number; nextId: number }

/** Bag slots every character has (older saves are raised to this on login). */
export const INV_SLOTS = 60;
export const createInventory = (capacity = INV_SLOTS): Inventory => ({ items: [], capacity, nextId: 1 });
export const countOf = (inv: Inventory, itemId: string) => inv.items.reduce((n, s) => n + (s.itemId === itemId ? s.count : 0), 0);
export const hasAll = (inv: Inventory, need: { item: string; count: number }[]) => need.every(n => countOf(inv, n.item) >= n.count);

/** Slots that would be used after adding `count` of itemId (stacks fill first). */
function slotsNeeded(inv: Inventory, itemId: string, count: number) {
  const max = ITEMS[itemId].maxStack;
  let room = inv.items.filter(s => s.itemId === itemId).reduce((r, s) => r + (max - s.count), 0);
  const overflow = Math.max(0, count - room);
  return Math.ceil(overflow / max);
}
export const canAdd = (inv: Inventory, itemId: string, count: number) => !!ITEMS[itemId] && count > 0 && inv.items.length + slotsNeeded(inv, itemId, count) <= inv.capacity;

/** Add all or nothing. Returns false when it does not fit. */
export function addItem(inv: Inventory, itemId: string, count: number): boolean {
  if (!canAdd(inv, itemId, count)) return false;
  const max = ITEMS[itemId].maxStack;
  for (const s of inv.items) { if (s.itemId !== itemId || count <= 0) continue; const take = Math.min(max - s.count, count); s.count += take; count -= take; }
  while (count > 0) { const take = Math.min(max, count); inv.items.push({ id: `i${inv.nextId++}`, itemId, count: take }); count -= take; }
  return true;
}

/** Remove across stacks. Returns false (and changes nothing) when there is not enough. */
export function removeItem(inv: Inventory, itemId: string, count: number): boolean {
  if (countOf(inv, itemId) < count || count <= 0) return false;
  for (let i = inv.items.length - 1; i >= 0 && count > 0; i--) {
    const s = inv.items[i]; if (s.itemId !== itemId) continue;
    const take = Math.min(s.count, count); s.count -= take; count -= take;
    if (s.count === 0) inv.items.splice(i, 1);
  }
  return true;
}
export function removeInstance(inv: Inventory, id: string): ItemInstance | undefined {
  const i = inv.items.findIndex(s => s.id === id); return i < 0 ? undefined : inv.items.splice(i, 1)[0];
}
export const find = (inv: Inventory, id: string) => inv.items.find(s => s.id === id);
