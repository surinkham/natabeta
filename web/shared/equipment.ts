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

/** One number for "how good is this piece": its stat bonuses weighted to roughly what each is worth in a fight. */
const WEIGHT: Record<string, number> = { ATK: 1, MATK: 1, DEF: 1.2, maxHP: 0.1, maxMP: 0.05, Crit: 1.5, Dodge: 1.5, Hit: 0.6, STR: 2, AGI: 1.8, VIT: 1.8, INT: 2, DEX: 1.8, LUK: 1.2 };
export const gearScore = (id: string) => Object.entries(ITEMS[id]?.mods ?? {}).reduce((s, [k, v]) => s + (WEIGHT[k] ?? 1) * v, 0);
/** How much better `id` is than what is worn in its slot (> 0 = an upgrade), or 0 when it is not wearable or not better.
 *  A weapon counts only against a weapon of the same kind — a different kind changes the skills, not just the numbers. */
export function upgradeOver(id: string, eq: Equipment): number {
  const d = ITEMS[id]; if (!d?.slot) return 0;
  const worn = eq[d.slot]?.itemId;
  if (d.slot === "MainWeapon" && worn && ITEMS[worn]?.weapon !== d.weapon) return 0;
  return Math.max(0, gearScore(id) - (worn ? gearScore(worn) : 0));
}
