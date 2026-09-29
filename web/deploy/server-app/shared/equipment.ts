// Pure equip/unequip between inventory instances and slots (spec §5.11): an item lives in exactly one place.
import { ITEMS } from "./data";
import { Inventory, ItemInstance, addItem, canAdd, removeInstance } from "./inventory";

export type Equipment = Record<string, ItemInstance | undefined>;   // slot -> instance

export function equip(inv: Inventory, eq: Equipment, instanceId: string): string | undefined {
  const inst = inv.items.find(s => s.id === instanceId); if (!inst) return "ไม่มีไอเทมนี้";
  const def = ITEMS[inst.itemId]; if (!def?.slot) return "สวมใส่ไม่ได้";
  const prev = eq[def.slot];
  removeInstance(inv, instanceId);
  if (prev && !canAdd(inv, prev.itemId, prev.count)) { inv.items.push(inst); return "กระเป๋าเต็ม"; }   // put it back, refuse
  eq[def.slot] = inst;
  if (prev) inv.items.push(prev);   // swap keeps the previous instance id
  return undefined;
}

export function unequip(inv: Inventory, eq: Equipment, slot: string): string | undefined {
  const inst = eq[slot]; if (!inst) return "ช่องว่าง";
  if (inv.items.length >= inv.capacity) return "กระเป๋าเต็ม";
  eq[slot] = undefined; inv.items.push(inst); return undefined;
}

export const equippedIds = (eq: Equipment): Record<string, string> =>
  Object.fromEntries(Object.entries(eq).filter(([, v]) => v).map(([k, v]) => [k, v!.itemId]));
