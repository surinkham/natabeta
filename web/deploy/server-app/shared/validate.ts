// Referential checks across the tables. Runs at server start and in tests (spec §3).
import { DROPS, EQUIP_VISUALS, GOLD, ITEMS, MONSTERS, RECIPES } from "./data";

export function validateData(): string[] {
  const errs: string[] = [];
  const item = (id: string, where: string) => { if (id !== GOLD && !ITEMS[id]) errs.push(`${where}: unknown item ${id}`); };
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.maxStack < 1) errs.push(`items.${id}: maxStack < 1`);
    if ((it.type === "Weapon" || it.type === "Armor") && !it.slot) errs.push(`items.${id}: equipment without slot`);
    if (it.visual && !EQUIP_VISUALS[it.visual]) errs.push(`items.${id}: unknown visual ${it.visual}`);
  }
  for (const [id, m] of Object.entries(MONSTERS)) if (!DROPS[m.dropTable]) errs.push(`monsters.${id}: unknown drop table ${m.dropTable}`);
  for (const [tid, rows] of Object.entries(DROPS)) for (const r of rows) {
    item(r.item, `drops.${tid}`);
    if (r.chance < 0 || r.chance > 1) errs.push(`drops.${tid}.${r.item}: chance out of [0,1]`);
    if (r.min < 1 || r.max < r.min) errs.push(`drops.${tid}.${r.item}: bad min/max`);
  }
  for (const [rid, r] of Object.entries(RECIPES)) {
    item(r.result, `recipes.${rid}`); r.ingredients.forEach(i => item(i.item, `recipes.${rid}`));
    if (r.gold < 0) errs.push(`recipes.${rid}: negative gold`);
  }
  return errs;
}
