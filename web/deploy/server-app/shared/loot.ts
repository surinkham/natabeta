import { DROPS, DropEntry, GOLD } from "./data";

/** Roll every row independently (spec §5.14). Returns { items: itemId -> count, gold }. */
export function rollDrops(tableId: string, rng: () => number = Math.random, table: DropEntry[] = DROPS[tableId]) {
  const items: Record<string, number> = {}; let gold = 0;
  for (const r of table ?? []) if (rng() < r.chance) { const n = r.min + Math.floor(rng() * (r.max - r.min + 1)); if (r.item === GOLD) gold += n; else items[r.item] = (items[r.item] ?? 0) + n; }
  return { items, gold };
}
