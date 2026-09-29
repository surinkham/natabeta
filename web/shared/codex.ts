// The codex ("สารบัญ"): where every item, weapon, piece of gear and skill comes from, and where every monster lives
// and what it drops — worked out from the game data itself (drop tables, unique materials and blueprints, shop stock,
// recipes and the blueprints that unlock them, the guild shop, skill trainers and books, spawn groups), so it can
// never drift from what the game actually does. Pure: the client renders it (client/src/ui/codex.ts).
import { BLUEPRINT_OF, BOSS_LOOT, DROPS, LIVE_BOSSES, SKILLBOOK_CHANCE, SKILLBOOK_OF, ITEMS, MONSTERS, NPCS, RECIPES, SKILLS, UNIQUE_CHANCE, UNIQUE_OF, itemName } from "./data";
import { GUILD_SHOP } from "./guild";
import { ZONES, cityAt, zoneAt } from "./regions";
import { SLOW_MULT, STARTER_EQUIPMENT, STARTER_SKILLS } from "./sim";
import { SPAWNS } from "./world";
import { FOODS, INGREDIENTS } from "./cooking";

export type SourceKind = "drop" | "shop" | "craft" | "guild" | "start" | "book";
export interface Source { kind: SourceKind; text: string }
const pct = (c: number) => `${c >= 0.1 ? Math.round(c * 100) : +(c * 100).toFixed(1)}%`;
/** The town (or map) an NPC stands in. */
const placeOf = (pos: [number, number]) => cityAt({ x: pos[0], z: pos[1] })?.name ?? zoneAt({ x: pos[0], z: pos[1] }).name;
/** NPCs of one kind that satisfy `has`, as a list of the towns they stand in. */
const townsWith = (has: (n: (typeof NPCS)[string]) => boolean) => [...new Set(Object.values(NPCS).filter(has).map(n => placeOf(n.pos)))];

/** Every way to get an item. */
export function itemSources(id: string): Source[] {
  const out: Source[] = [], it = ITEMS[id]; if (!it) return out;
  if (INGREDIENTS[id]) return [{ kind: "drop", text: `มอนสเตอร์ทั่วไป — ${INGREDIENTS[id].desc} (เก็บแยกจากกระเป๋า)` }];
  if (FOODS[id]) return [{ kind: "craft", text: `ทำที่กองไฟ: ${Object.entries(FOODS[id].needs).map(([k, n]) => `${INGREDIENTS[k].name} ×${n}`).join(", ")}` }, ...(id === "FOOD_GRILLED_MEAT" ? [{ kind: "start" as const, text: "ตัวละครใหม่ได้ 3 ชิ้น" }] : [])];
  for (const [kind, d] of Object.entries(MONSTERS)) {
    if (d.boss && !LIVE_BOSSES.has(kind)) continue;   // a retired Tyrant: never met, its loot is on the new bosses
    for (const e of BOSS_LOOT[kind] ?? []) if (e.item === id) out.push({ kind: "drop", text: `บอส ${d.name} ${pct(e.chance)}` });
    for (const e of DROPS[d.dropTable] ?? []) if (e.item === id) out.push({ kind: "drop", text: `${d.name} ${pct(e.chance)}${e.max > 1 ? ` (${e.min}–${e.max} ชิ้น)` : ""}` });
    if (UNIQUE_OF[kind] === id) out.push({ kind: "drop", text: `${d.name} ${pct(d.boss ? UNIQUE_CHANCE.boss : UNIQUE_CHANCE.normal)} · ของเฉพาะตัว` });
    if (SKILLBOOK_OF[kind]?.includes(id)) out.push({ kind: "drop", text: `บอส ${d.name} ${pct(SKILLBOOK_CHANCE)}` });
    if (BLUEPRINT_OF[kind] === id) out.push({ kind: "drop", text: `บอส ${d.name} ${pct(UNIQUE_CHANCE.blueprint)}` });
  }
  if (it.buy) { const towns = townsWith(n => !!n.stock?.includes(id)); if (towns.length) out.push({ kind: "shop", text: `ซื้อ ${it.buy} Gold ที่ร้านใน ${towns.join(", ")}` }); }
  for (const [rid, r] of Object.entries(RECIPES)) if (r.result === id) {
    const needs = r.ingredients.map(i => `${itemName(i.item)} ×${i.count}`).join(" + ") + (r.gold ? ` + ${r.gold} Gold` : "");
    const towns = townsWith(n => !!n.recipes?.includes(rid)), unlock = Object.entries(ITEMS).find(([, x]) => x.unlocks === rid);
    const where = unlock ? `สูตรจาก ${unlock[1].name} (ช่างตีเหล็กทุกเมือง)` : towns.length ? `ช่างใน ${towns.join(", ")}` : "ช่างตีเหล็ก";
    out.push({ kind: "craft", text: `คราฟ${r.count > 1 ? ` ได้ ${r.count} ชิ้น` : ""}: ${needs} · ${where}` });
  }
  const g = GUILD_SHOP.find(e => e.item === id); if (g) out.push({ kind: "guild", text: `ร้านกิลด์ ${g.points} แต้ม${g.tier ? ` (ตลาดกิลด์ Lv ${g.tier})` : ""}` });
  if (Object.values(STARTER_EQUIPMENT).includes(id)) out.push({ kind: "start", text: "ได้ตั้งแต่เริ่มเกม" });
  return out;
}

/** One line for a tooltip: the monsters (and bosses) that drop an item, e.g. "ได้จาก: Forest Wolf 30% · บอส Tyrant 5%".
 *  Empty when nothing drops it. Cached: tooltips are rebuilt many times a second while a window is open. */
const fromCache = new Map<string, string>();
export const droppedBy = (id: string) => {
  let t = fromCache.get(id);
  if (t === undefined) { const d = itemSources(id).filter(s => s.kind === "drop").map(s => s.text); t = d.length ? `ได้จาก: ${d.slice(0, 4).join(" · ")}${d.length > 4 ? ` และอีก ${d.length - 4}` : ""}` : ""; fromCache.set(id, t); }
  return t;
};

/** A skill taught by a book: which book, and the monsters/bosses that drop it (cached, as droppedBy). */
const bookCache = new Map<string, string>();
export const skillFrom = (id: string) => {
  let t = bookCache.get(id);
  if (t === undefined) { const b = skillSources(id).find(s => s.kind === "book"); t = b ? `ได้จาก${b.text}` : ""; bookCache.set(id, t); }
  return t;
};

/** The levels a monster is actually met at: its maps' levels (±1, never below its own, at most 99) — the same rule as
 *  Sim.spawnMonster, so a Shadowlands beast reads Lv 80–99 and not the Lv 20 of its base stats. Cached. */
const lvCache = new Map<string, [number, number]>();
export function levelRange(kind: string): [number, number] {
  let r = lvCache.get(kind); if (r) return r;
  const d = MONSTERS[kind], lv = SPAWNS.filter(s => s.kind === kind).map(s => (s.zone ? ZONES.find(z => z.id === s.zone) : zoneAt(s))?.level ?? d.level);
  r = lv.length ? [Math.min(99, Math.max(d.level, Math.min(...lv) - 1)), Math.min(99, Math.max(d.level, Math.max(...lv) + 1))] : [d.level, d.level];
  lvCache.set(kind, r); return r;
}
export const levelText = (kind: string) => { const [a, b] = levelRange(kind); return a === b ? `Lv ${a}` : `Lv ${a}–${b}`; };

/** Where a monster lives (map names, each once) and everything it can drop. */
export function monsterInfo(kind: string) {
  const d = MONSTERS[kind];
  const zones = [...new Set(SPAWNS.filter(s => s.kind === kind).map(s => s.zone ? ZONES.find(z => z.id === s.zone)?.name : zoneAt(s).name).filter(Boolean) as string[])];
  const drops = (DROPS[d.dropTable] ?? []).map(e => ({ item: e.item, text: pct(e.chance) }));
  if (UNIQUE_OF[kind]) drops.push({ item: UNIQUE_OF[kind], text: `${pct(d.boss ? UNIQUE_CHANCE.boss : UNIQUE_CHANCE.normal)} · เฉพาะตัว` });
  for (const e of BOSS_LOOT[kind] ?? []) drops.push({ item: e.item, text: `${pct(e.chance)} · ${ITEMS[e.item]?.type === "Scroll" ? "พิมพ์เขียว" : "วิญญาณ"}` });
  for (const t of SKILLBOOK_OF[kind] ?? []) drops.push({ item: t, text: `${pct(SKILLBOOK_CHANCE)} · คัมภีร์สกิล` });
  if (BLUEPRINT_OF[kind]) drops.push({ item: BLUEPRINT_OF[kind], text: `${pct(UNIQUE_CHANCE.blueprint)} · พิมพ์เขียว` });
  if (kind === "MON_ALPHA_WOLF") zones.push("Dark Forest");
  return { zones: [...new Set(zones)], drops, boss: !!d.boss, level: d.level, respawn: d.respawn, exp: d.exp };
}

/** What a skill does, in one line from its data: damage (% of ATK or MATK, waves), reach, how many it hits and the
 *  state it leaves (slow, buff, heal) — e.g. "⚔ 150% MATK · รัศมี 2.6 ม. · ❄ ติดสถานะช้าลง 55% 3 วิ". */
export function skillEffect(id: string): string {
  const S = SKILLS[id]; if (!S) return "";
  const pc = (x: number) => `${Math.round(x * 100)}%`, out: string[] = [];
  if (S.coef) out.push(`⚔ ${pc(S.coef)} ${S.magic ? "MATK" : "ATK"}${(S.waves ?? 1) > 1 ? ` × ${S.waves} ระลอก` : ""}`);
  if (S.kind === "heal") out.push(`💚 ฟื้น HP ${pc(S.heal ?? 0)} ${S.radius ? `ทั้งปาร์ตี้ในรัศมี ${S.radius} ม.` : "ตัวเอง"}`);
  if (S.kind === "revive") out.push(`✨ ชุบชีวิตเพื่อนที่ล้มในระยะ ${S.range ?? 4} ม. (HP 40%)`);
  if (S.kind === "dash") out.push(`💨 พุ่งไปข้างหน้า ${S.duration ?? 0} วิ`);
  if (S.kind === "buff" && S.buff) {
    const b = S.buff, parts = [b.atk ? `ATK/MATK +${pc(b.atk)}` : "", b.def ? `DEF +${pc(b.def)}` : "", b.aspd ? `ความเร็วโจมตี +${pc(b.aspd)}` : ""].filter(Boolean);
    out.push(`📯 บัพ ${parts.join(", ")} ${S.duration} วิ${S.radius ? ` (ตัวเอง + ปาร์ตี้ในรัศมี ${S.radius} ม.)` : ""}`);
  }
  if (S.coef) {
    if (S.radius) out.push(`${S.self ? "รอบตัว" : "วงกว้าง"} ${S.radius} ม.${S.range ? ` · ระยะ ${S.range} ม.` : ""}`);
    else if (S.range) out.push(`${S.kind === "ranged" ? "ระยะยิง" : "ระยะ"} ${S.range} ม.${(S.cone ?? 0) >= 360 ? " รอบตัว" : ""}`);
    if ((S.targets ?? 1) > 1 && (S.targets ?? 1) < 99) out.push(`สูงสุด ${S.targets} ตัว`);
    else if ((S.targets ?? 1) >= 99) out.push("ทุกตัวในวง");
  }
  if (S.slow) out.push(`❄ ติดสถานะช้าลง ${Math.round((1 - SLOW_MULT) * 100)}% ${S.slow} วิ`);
  if (S.ammo) out.push(`🏹 ใช้ลูกธนู ${S.ammo} ดอก`);
  return out.join(" · ");
}

/** How a skill is learned. */
export function skillSources(id: string): Source[] {
  const out: Source[] = [];
  if (STARTER_SKILLS.includes(id)) out.push({ kind: "start", text: "มีตั้งแต่เริ่มเกม" });
  const towns = townsWith(n => n.kind === "skillshop" && !!n.skills?.includes(id)), price = (SKILLS[id] as { price?: number }).price;
  if (towns.length) out.push({ kind: "shop", text: `เรียนที่ครูสกิล${price ? ` ${price} Gold` : ""} ใน ${towns.join(", ")}` });
  for (const [bid, b] of Object.entries(ITEMS)) if (b.teaches === id) {
    const from = itemSources(bid).slice(0, 3).map(s => s.text).join(" / ");
    out.push({ kind: "book", text: `หนังสือ ${b.name}${from ? ` — ${from}` : ""}` });
  }
  return out;
}

export type CodexTab = "weapon" | "gear" | "item" | "monster" | "skill";
/** What each tab lists (ids, in data order). */
export function codexIds(tab: CodexTab): string[] {
  if (tab === "monster") return Object.keys(MONSTERS).filter(k => !MONSTERS[k].boss || LIVE_BOSSES.has(k)).sort((a, b) => levelRange(a)[0] - levelRange(b)[0] || levelRange(a)[1] - levelRange(b)[1] || +!!MONSTERS[a].boss - +!!MONSTERS[b].boss);   // by the level it is met at; beasts before bosses
  if (tab === "skill") return Object.keys(SKILLS).filter(id => id !== "SKILL_BASIC" && id !== "SKILL_PUNCH");
  return Object.keys(ITEMS).filter(id => { const t = ITEMS[id].type; return tab === "weapon" ? t === "Weapon" : tab === "gear" ? t === "Armor" : t !== "Weapon" && t !== "Armor"; });
}
