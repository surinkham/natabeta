// Cooking and hunger. Monsters drop ingredients (meat, herbs, mushrooms, berries) that go into a separate pantry — not
// the bag; food is cooked from them at a campfire (one in every town, one in every wild map, one at every mountain-pass
// peddler). Hunger runs down while playing: hungry, the body is slow to walk and to swing; starving, HP and MP stop
// coming back on their own. Eating food fills it up.
import { ITEMS, MONSTERS, NPCS } from "./data";
import { CITIES, ZONES } from "./regions";
import { SPAWN, collide, type Layout } from "./world";
import { riverPath, scenicBorders } from "./scenery";

export const HUNGER_MAX = 100;
/** Full to empty in 45 minutes of play. */
export const HUNGER_RATE = HUNGER_MAX / (45 * 60);
export const HUNGRY = 30, STARVING = 0;
/** Hungry: walking and attack speed both drop to this share. */
export const HUNGRY_SLOW = 0.55;
export const hungerState = (h: number | undefined) => (h === undefined ? "ok" : h <= STARVING ? "starving" : h <= HUNGRY ? "hungry" : "ok");

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITY: Record<Rarity, { name: string; color: string; weight: number }> = {
  common: { name: "ธรรมดา", color: "#c9c3b4", weight: 55 }, uncommon: { name: "ไม่ธรรมดา", color: "#6fd06a", weight: 27 }, rare: { name: "หายาก", color: "#5aa8ff", weight: 12 },
  epic: { name: "หายากมาก", color: "#c07aff", weight: 5 }, legendary: { name: "ตำนาน", color: "#ffb43a", weight: 1 },
};
export const INGREDIENTS: Record<string, { name: string; icon: string; desc: string; rarity?: Rarity }> = {
  ING_MEAT: { name: "เนื้อดิบ", icon: "🥩", desc: "ได้จากมอนสเตอร์ที่เป็นสัตว์ — ย่างเป็นอาหารที่กองไฟ" },
  ING_HERB: { name: "สมุนไพรป่า", icon: "🌿", desc: "ได้จากมอนสเตอร์ทั่วไป — ใส่ซุปเพิ่มพลังฟื้นฟู" },
  ING_MUSHROOM: { name: "เห็ดป่า", icon: "🍄", desc: "ได้จากมอนสเตอร์พืชและเห็ด" },
  ING_BERRY: { name: "ผลเบอร์รี่", icon: "🫐", desc: "ได้จากมอนสเตอร์ทั่วไป — หวานชื่นใจ ฟื้น MP" },
  // fish: caught at the river bank (🎣), rarer ones cook into dishes with stronger buffs
  ING_FISH_SILVER: { name: "ปลาเงิน", icon: "🐟", rarity: "common", desc: "ตกได้จากริมแม่น้ำ — ปลาทั่วไป" },
  ING_FISH_GOLD: { name: "ปลาทอง", icon: "🐠", rarity: "uncommon", desc: "ตกได้จากริมแม่น้ำ — ไม่ค่อยเจอ" },
  ING_FISH_EEL: { name: "ปลาไหลสายฟ้า", icon: "🐍", rarity: "rare", desc: "ตกได้จากริมแม่น้ำ — หายาก" },
  ING_FISH_DRAGON: { name: "ปลาคาร์ปมังกร", icon: "🐉", rarity: "epic", desc: "ตกได้จากริมแม่น้ำ — หายากมาก" },
  ING_FISH_MOON: { name: "ปลาวาฬจันทรา", icon: "🐋", rarity: "legendary", desc: "ตกได้จากริมแม่น้ำ — ระดับตำนาน" },
};
/** A dish may leave a buff for `dur` seconds: shares added to ATK/MATK, DEF, attack speed and walking speed. */
export interface MealBuff { atk?: number; def?: number; aspd?: number; move?: number; dur: number }
export interface Food { name: string; icon: string; hunger: number; heal?: number; mana?: number; needs: Record<string, number>; buff?: MealBuff; buy?: number }   // buy: sold by the grocer (no recipe)
export const FOODS: Record<string, Food> = {
  FOOD_GRILLED_MEAT: { name: "เนื้อย่าง", icon: "🍖", hunger: 35, needs: { ING_MEAT: 2 } },
  FOOD_MUSHROOM_SKEWER: { name: "เห็ดเสียบไม้ย่าง", icon: "🍢", hunger: 25, heal: 40, needs: { ING_MUSHROOM: 2 } },
  FOOD_BERRY_BOWL: { name: "ถ้วยเบอร์รี่", icon: "🍧", hunger: 20, mana: 60, needs: { ING_BERRY: 3 } },
  FOOD_HERB_STEW: { name: "ซุปสมุนไพร", icon: "🍲", hunger: 60, heal: 120, needs: { ING_MEAT: 1, ING_HERB: 2 } },
  FOOD_FEAST: { name: "สเต๊กจัดเต็ม", icon: "🥘", hunger: 100, heal: 250, mana: 80, needs: { ING_MEAT: 3, ING_HERB: 2, ING_MUSHROOM: 1 } },
  // plain fare from the grocer: fills the belly, nothing more
  FOOD_BREAD: { name: "ขนมปัง", icon: "🍞", hunger: 20, needs: {}, buy: 15 },
  FOOD_RICEBALL: { name: "ข้าวปั้น", icon: "🍙", hunger: 35, needs: {}, buy: 30 },
  FOOD_GRILLED_FISH: { name: "ปลาเงินย่างเกลือ", icon: "🍡", hunger: 30, needs: { ING_FISH_SILVER: 2 }, buff: { move: 0.1, dur: 300 } },
  FOOD_GOLD_TOMYUM: { name: "ต้มยำปลาทอง", icon: "🍜", hunger: 45, heal: 80, needs: { ING_FISH_GOLD: 1, ING_HERB: 1 }, buff: { aspd: 0.15, dur: 300 } },
  FOOD_EEL_RICE: { name: "ข้าวหน้าปลาไหลสายฟ้า", icon: "🍱", hunger: 55, needs: { ING_FISH_EEL: 1, ING_MUSHROOM: 1 }, buff: { aspd: 0.2, move: 0.15, dur: 480 } },
  FOOD_DRAGON_SASHIMI: { name: "ซาชิมิคาร์ปมังกร", icon: "🍣", hunger: 60, heal: 150, needs: { ING_FISH_DRAGON: 1, ING_HERB: 1 }, buff: { atk: 0.2, def: 0.1, dur: 600 } },
  FOOD_MOON_FEAST: { name: "สำรับปลาวาฬจันทรา", icon: "🍛", hunger: 100, heal: 300, mana: 150, needs: { ING_FISH_MOON: 1, ING_MEAT: 2 }, buff: { atk: 0.25, def: 0.15, aspd: 0.25, move: 0.2, dur: 900 } },
};
export const buffText = (b: MealBuff) => [b.atk && `ATK +${b.atk * 100}%`, b.def && `DEF +${b.def * 100}%`, b.aspd && `ASPD +${b.aspd * 100}%`, b.move && `ความเร็ว +${b.move * 100}%`].filter(Boolean).join(" · ") + ` (${Math.round(b.dur / 60)} นาที)`;
// both are items the rest of the game already knows how to show and drop; food is a Consumable that goes in the bag
const INGREDIENT_PRICE: Record<string, number> = { ING_MEAT: 12, ING_HERB: 8, ING_MUSHROOM: 10, ING_BERRY: 8 };   // the grocer's; fish only come off a line
for (const [id, d] of Object.entries(INGREDIENTS)) ITEMS[id] = { name: d.name, type: "Ingredient", maxStack: 999, sell: 0, icon: d.icon, desc: d.desc, ...(INGREDIENT_PRICE[id] ? { buy: INGREDIENT_PRICE[id] } : {}) };
for (const [id, f] of Object.entries(FOODS)) ITEMS[id] = { name: f.name, type: "Consumable", maxStack: 99, sell: 3, icon: f.icon, food: f.hunger, heal: f.heal, mana: f.mana, cooldown: 1, ...(f.buy ? { buy: f.buy } : {}),
  desc: `อิ่ม +${f.hunger}${f.heal ? ` · HP +${f.heal}` : ""}${f.mana ? ` · MP +${f.mana}` : ""}${f.buff ? ` · บัพ ${buffText(f.buff)}` : ""}${f.buy ? " — ขายที่ร้านของชำในเมือง" : ` — ทำที่กองไฟจาก ${Object.entries(f.needs).map(([k, n]) => `${INGREDIENTS[k].name} ×${n}`).join(", ")}`}` };
export const isIngredient = (id: string) => id in INGREDIENTS;
/** Recipes the campfire shows (plain fare is bought, not cooked). */
export const RECIPE_FOODS = Object.entries(FOODS).filter(([, f]) => Object.keys(f.needs).length);
// a grocer in every town, by the campfire: ingredients for the pot and plain food
const GROCER_NAMES = ["Pim (ร้านของชำ)", "Bo (ร้านของชำ)", "Nok (ร้านของชำ)", "Tam (ร้านของชำ)", "Fai (ร้านของชำ)", "Mali (ร้านของชำ)"];
CITIES.forEach((c, i) => {
  const at: [number, number] = c.id === "pawhaven" ? [SPAWN.x + 5.8, SPAWN.z - 2.4] : [c.x + 5.8, c.z - 6.9];
  NPCS[`NPC_GROCER_${c.id}`] = { name: GROCER_NAMES[i % GROCER_NAMES.length], kind: "shop", pos: at, biome: c.id === "pawhaven" ? undefined : c.biome, species: (["cat", "mouse", "dog"] as const)[i % 3],
    stock: ["FOOD_BREAD", "FOOD_RICEBALL", ...Object.keys(INGREDIENT_PRICE)], lines: ["หิวไหม? ขนมปังกับข้าวปั้นอิ่มท้องแน่นอน", "วัตถุดิบสด ๆ เอาไปทำอาหารที่กองไฟข้าง ๆ ได้เลย"] };
});

// ---------------------------------------------------------------- fishing: at a river bank, a few seconds' wait, a fish of random rarity
export const FISH_REACH = 3;   // metres from the water's edge
export const FISH_TIME: [number, number] = [3, 6];
let riverPts: { x: number; z: number; halfWidth: number }[] | undefined;
export const nearWater = (p: { x: number; z: number }) => (riverPts ??= scenicBorders().filter(b => b.look === "river").flatMap(b => riverPath(b)))
  .some(q => Math.hypot(q.x - p.x, q.z - p.z) - q.halfWidth <= FISH_REACH);
const FISH_IDS = Object.keys(INGREDIENTS).filter(k => INGREDIENTS[k].rarity);
/** A fish by rarity weight; LUK makes the rare ones a little likelier (each point +1% on non-common weights). */
export function rollFish(rng: () => number, luk = 0) {
  const w = FISH_IDS.map(id => { const r = INGREDIENTS[id].rarity!; return RARITY[r].weight * (r === "common" ? 1 : 1 + luk / 100); });
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FISH_IDS.length; i++) if ((x -= w[i]) < 0) return FISH_IDS[i];
  return FISH_IDS[0];
}

/** What a kill may drop for the pot: meat from beasts, mushrooms from fungi and plants, herbs and berries from most. */
const PLANTS = new Set(["shroom", "sporetoad", "treant", "stump", "bloomsprite", "slime"]);
export function ingredientRolls(kind: string, rng: () => number): Record<string, number> {
  const d = MONSTERS[kind]; if (!d) return {};
  const plant = PLANTS.has(d.model), times = d.boss ? 3 : 1, out: Record<string, number> = {};
  const roll = (id: string, chance: number) => { for (let i = 0; i < times; i++) if (rng() < chance) out[id] = (out[id] ?? 0) + 1; };
  roll("ING_MEAT", plant ? 0.05 : 0.4); roll("ING_MUSHROOM", plant ? 0.45 : 0.08); roll("ING_HERB", plant ? 0.3 : 0.18); roll("ING_BERRY", 0.18);
  return out;
}

/** Campfires: one by each town's gate square and one in every other map (wild maps, passes, the guild grounds) —
 *  every map has one. Also drawn on the minimap and the zone map (🔥). */
export const CAMPFIRE_R = 3.5;
let fires: { x: number; z: number }[] | undefined;
export function campfires(L: Layout) {
  if (fires) return fires;
  const out: { x: number; z: number }[] = [];
  for (const c of CITIES) { const at = c.id === "pawhaven" ? { x: SPAWN.x + 3.2, z: SPAWN.z - 2 } : { x: c.x + 3.2, z: c.z - 6.5 }; collide(at, 0.9, L); out.push(at); }
  const inside = (z: { x0: number; x1: number; z0: number; z1: number }, p: { x: number; z: number }) => p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1;
  for (const z of ZONES) { if (out.some(f => inside(z, f))) continue; const at = { x: (z.x0 + z.x1) / 2 + 2, z: (z.z0 + z.z1) / 2 + 2 }; collide(at, 0.9, L); out.push(at); }   // any map still without one
  return (fires = out);
}
/** `slack`: the server allows a little more — a client with fewer trees (low quality) may place a fire a step apart. */
export const nearCampfire = (p: { x: number; z: number }, L: Layout, slack = 0) => campfires(L).some(f => Math.hypot(f.x - p.x, f.z - p.z) <= CAMPFIRE_R + slack);
