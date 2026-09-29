import { CITIES, ROADS, ZONES, type Biome } from "./regions";
import { TOWNS } from "./towns";
// Typed access to the JSON tables (spec §3). Balance lives in the JSON, never here.
import formulasJson from "./data/formulas.json";
import itemsJson from "./data/items.json";
import monstersJson from "./data/monsters.json";
import dropsJson from "./data/drops.json";
import recipesJson from "./data/recipes.json";
import levelsJson from "./data/levels.json";
import skillsJson from "./data/skills.json";
import visualsJson from "./data/equip_visuals.json";
import npcsJson from "./data/npcs.json";
import objectivesJson from "./data/objectives.json";

export const STAT_KEYS = ["ATK", "MATK", "DEF", "maxHP", "maxMP", "Crit", "Dodge", "Hit", "STR", "AGI", "VIT", "INT", "DEX", "LUK"] as const;
export type StatMods = Partial<Record<(typeof STAT_KEYS)[number], number>>;
export interface ItemDef { resetStats?: boolean; desc?: string; name: string; type: "Material" | "Weapon" | "Armor" | "Consumable" | "Key" | "Ammo" | "Book" | "Scroll" | "Ingredient"; food?: number; teaches?: string; unlocks?: string; rare?: boolean; weapon?: "sword" | "bow" | "staff"; bound?: boolean; maxStack: number; slot?: string; mods?: StatMods; visual?: string; sell: number; buy?: number; heal?: number; mana?: number; cooldown?: number; icon?: string }
export interface MonsterDef { base?: string; tint?: number; appearance?: string; name: string; level: number; STR: number; AGI: number; VIT: number; INT: number; DEX: number; LUK: number; exp: number; dropTable: string; aggro: number; leash: number; respawn: number; bite: { windup: number; active: number; recovery: number; reach: number }; model: string; scale: number; boss?: boolean; clips?: string; quirk?: number[]; night?: boolean; pk?: boolean; raid?: boolean; fly?: number; skills?: BossSkill[] }   // night: only out 19:00–05:30 · fly: hover height (m)   // clips: alternate clip set ("Q" = four-legged) · quirk: ear flick, tail sway, speed
/** A telegraphed monster attack: a red circle on the ground for `windup` s, then everyone still inside is hit. */
export interface BossSkill { id: string; name: string; at: "self" | "target"; radius: number; windup: number; coef: number; cooldown: number; range: number }
export interface DropEntry { item: string; chance: number; min: number; max: number }
export interface Recipe { secret?: boolean; result: string; count: number; gold: number; station: string; ingredients: { item: string; count: number }[] }
export interface SkillDef { name: string; kind: "melee" | "dash" | "heal" | "ranged" | "aoe" | "revive" | "buff"; requires?: "bow" | "staff" | "sword"; self?: boolean; mana?: number; ammo?: number; magic?: boolean; radius?: number; waves?: number; delay?: number; clip: string; fx: string; cast: number; hit: number; coef?: number; cooldown: number; range?: number; cone?: number; targets?: number; duration?: number; slow?: number; special?: boolean; style?: string; color?: string; color2?: string; buff?: { atk?: number; def?: number; aspd?: number }; speed?: number; heal?: number; price?: number; icon?: string; desc?: string }
export interface NpcDef { biome?: Biome; species?: "dog" | "cat" | "mouse"; yaw?: number; name: string; kind: "craft" | "shop" | "stylist" | "talk" | "skillshop" | "market" | "guild" | "quest"; pos: [number, number]; lines: string[]; recipes?: string[]; stock?: string[]; skills?: string[]; price?: number }
export interface Objective { id: string; text: string; done: string }
export interface EquipVisual { slot: string; mesh: string; socket?: string; tint?: string }

export const FORMULAS = formulasJson;
export const ITEMS = itemsJson as Record<string, ItemDef>;
export const MONSTERS = monstersJson as Record<string, MonsterDef>;
// Bosses: every ordinary creature has a boss form — the same beast grown huge, darker and far stronger, with the Alpha
// Wolf's telegraphed slam and pounce. Generated here so each map can field its own (shared/world.ts puts 1–2 per map).
// All bosses (the Alpha too) return one hour after they fall.
export const BOSS_RESPAWN = 3600;
export const bossOf = (kind: string) => `BOSS_${kind}`;
for (const [kind, d] of Object.entries({ ...MONSTERS })) {
  if (d.boss) { d.respawn = BOSS_RESPAWN; d.scale = Math.max(d.scale, 2.8); d.bite = { ...d.bite, reach: Math.max(d.bite.reach, 2.6) }; continue; }
  if (d.night) continue;
  const alpha = MONSTERS.MON_ALPHA_WOLF;
  MONSTERS[bossOf(kind)] = {
    ...d, base: kind, boss: true, name: `Tyrant ${d.name}`, level: d.level + 5,
    STR: Math.round(d.STR * 1.7), VIT: Math.round(d.VIT * 4), DEX: Math.round(d.DEX * 1.3), exp: d.exp * 15,
    respawn: BOSS_RESPAWN, aggro: 9, leash: 18, scale: Math.min(4.2, Math.max(2.6, d.scale * 2.8)),   // towering over the player
    bite: { ...d.bite, reach: d.bite.reach * 2.2 }, skills: alpha.skills,
  };
}
export const DROPS = dropsJson as Record<string, DropEntry[]>;
export const RECIPES = recipesJson as Record<string, Recipe>;
export const SKILLS = skillsJson as Record<string, SkillDef>;
export const EQUIP_VISUALS = visualsJson as Record<string, EquipVisual>;
// Unique materials and divine gear. Every monster kind drops a material nothing else drops (a slime's core, a wolf's
// fang…); a boss drops its soul and, now and then, the blueprint for a divine piece of gear. The blueprint's recipe
// (at any craft NPC) takes the boss's soul plus a stack of its own beast's unique material and one of a second beast
// from the same land — divine gear is the reward for hunting a whole region. UNIQUE_OF: monster kind → material id,
// BLUEPRINT_OF: boss kind → blueprint item id.
export const UNIQUE_OF: Record<string, string> = {};
export const BLUEPRINT_OF: Record<string, string> = {};
export const UNIQUE_CHANCE = { normal: 0.06, boss: 0.45, blueprint: 0.12 };
{
  const SLOTS = ["Head", "Gloves", "Boots", "Back", "OffHand", "Chest", "MainWeapon"] as const, WEAPONS = ["sword", "bow", "staff"] as const;
  const NOUN: Record<string, string> = { Head: "Crown", Gloves: "Gauntlets", Boots: "Greaves", Back: "Warcloak", OffHand: "Aegis", Chest: "Carapace", sword: "Blade", bow: "Warbow", staff: "Scepter" };
  const BASE_VIS: Record<string, string> = { Head: "VIS_KNIGHT_HELMET", Gloves: "VIS_KNIGHT_GLOVES", Boots: "VIS_KNIGHT_BOOTS", Back: "VIS_KNIGHT_CAPE", OffHand: "VIS_KITE_SHIELD", Chest: "VIS_KNIGHT_CHEST", sword: "VIS_ALPHA_BLADE", bow: "VIS_STORM_BOW", staff: "VIS_INFERNO_STAFF" };
  const ICON: Record<string, string> = { Head: "👑", Gloves: "🧤", Boots: "🥾", Back: "🧥", OffHand: "🛡", Chest: "🦺", sword: "⚔", bow: "🏹", staff: "🪄" };
  const PART: Record<string, [string, string]> = { slime: ["Core", "💧"], wolf: ["Fang", "🦷"], alpha: ["Fang", "🦷"], shroom: ["Spore Cap", "🍄"], fox: ["Tail", "🦊"], boar: ["Tusk", "🐗"], bear: ["Claw", "🐾"], stump: ["Heartwood", "🪵"], bat: ["Wing", "🦇"] };
  const r = (v: number) => Math.max(1, Math.round(v));
  const mods = (slot: string, L: number, k: number, w?: string): StatMods => {
    const m: Record<string, number> =
      slot === "MainWeapon" ? (w === "sword" ? { ATK: 6 + 3 * L, STR: 1 + L / 4 } : w === "bow" ? { ATK: 5 + 2.6 * L, DEX: 1 + L / 3, Hit: 2 + L / 4 } : { MATK: 7 + 3.2 * L, INT: 1 + L / 3, maxMP: 10 + 3 * L })
      : slot === "Chest" ? { DEF: 3 + 1.1 * L, maxHP: 12 + 6 * L } : slot === "Head" ? { DEF: 2 + 0.6 * L, VIT: 1 + L / 4 }
      : slot === "Gloves" ? { DEF: 1 + 0.4 * L, ATK: 1 + 0.8 * L, Crit: 1 + L / 6 } : slot === "Boots" ? { DEF: 1 + 0.5 * L, AGI: 1 + L / 4, Dodge: 1 + L / 5 }
      : slot === "Back" ? { DEF: 1 + 0.4 * L, Dodge: 2 + L / 4, Crit: 1 + L / 6 } : { DEF: 4 + 1.2 * L, maxHP: 10 + 3 * L };
    m.LUK = 2 + L / 5;
    return Object.fromEntries(Object.entries(m).map(([s, v]) => [s, r(v * k)])) as StatMods;
  };
  const kinds = Object.keys(MONSTERS), bases = kinds.filter(k => !MONSTERS[k].base).sort();
  for (const kind of kinds) {   // the unique material of every kind (a boss's is its soul)
    const def = MONSTERS[kind], [part, icon] = PART[def.model] ?? ["Relic", "✨"], id = `UNQ_${kind}`;
    ITEMS[id] = def.base
      ? { name: `${def.name} Soul`, type: "Material", maxStack: 20, sell: 120 + 30 * def.level, icon: "🔥", rare: true, desc: `วิญญาณของ ${def.name} — ดรอปจากบอสตัวนี้เท่านั้น ใช้คราฟอุปกรณ์เทพ` }
      : { name: `${def.name} ${part}`, type: "Material", maxStack: 99, sell: 8 + 4 * def.level, icon, desc: `วัตถุดิบยูนิคของ ${def.name} — ใช้คราฟอุปกรณ์เทพจากใบคราฟบอส` };
    UNIQUE_OF[kind] = id;
  }
  for (const kind of kinds) {   // each boss: a divine piece, its blueprint, its recipe
    const def = MONSTERS[kind]; if (!def.base) continue;
    const base = MONSTERS[def.base], n = bases.indexOf(def.base), slot = SLOTS[n % SLOTS.length], w = slot === "MainWeapon" ? WEAPONS[n % WEAPONS.length] : undefined, look = w ?? slot;
    const gear = `DIVINE_${def.base}`, vis = `VIS_${gear}`, rcp = `RCP_${gear}`, bp = `BLUEPRINT_${def.base}`;
    const src = EQUIP_VISUALS[BASE_VIS[look]]; if (src) EQUIP_VISUALS[vis] = { ...src, tint: "#f0c463" };   // divine gear shines gold
    ITEMS[gear] = { name: `Divine ${base.name} ${NOUN[look]}`, type: w ? "Weapon" : "Armor", maxStack: 1, slot, ...(w ? { weapon: w } : {}), mods: mods(slot, def.level + 10, 2.6, w),
      visual: src ? vis : undefined, sell: 400 + 90 * def.level, icon: ICON[look], rare: true, desc: `อุปกรณ์เทพ — คราฟจากใบคราฟของ ${def.name}` };
    ITEMS[bp] = { name: `Blueprint: ${ITEMS[gear].name}`, type: "Scroll", unlocks: rcp, maxStack: 5, sell: 300, icon: "📜", rare: true, desc: `ใช้เพื่อปลดล็อกสูตรคราฟ ${ITEMS[gear].name} — ดรอปจาก ${def.name} เท่านั้น` };
    // a second beast of the same land (the realm whose creatures include this one), else the next kind in line
    const land = CITIES.map(c => c.id === "pawhaven" ? [...c.monsters, "MON_FOX", "MON_BOAR", "MON_BEAR", "MON_DIRE_WOLF", "MON_STUMP"] : c.monsters).find(l => l.includes(def.base!));
    const partner = land?.find(k => k !== def.base && MONSTERS[k]) ?? bases[(n + 1) % bases.length];
    RECIPES[rcp] = { result: gear, count: 1, gold: 500 + 60 * def.level, station: "NPC_SMITH", secret: true,
      ingredients: [{ item: `UNQ_${kind}`, count: 1 }, { item: `UNQ_${def.base}`, count: 10 }, { item: `UNQ_${partner}`, count: 5 }] };
    BLUEPRINT_OF[kind] = bp;
  }
}
// Night bosses: one lord per realm who walks only between dusk and dawn (MonsterDef.night) — bigger, harder and
// deadlier than any Tyrant, in its own moonlit colours and with its own three attacks. It pays out like a boss (three
// rolls of its beast's table) plus the soul and the blueprint the realm's Tyrant of that beast drops.
export const NIGHT_BOSSES: Record<string, { base: string; name: string; tint: number; skills: [string, string, string] }> = {
  pawhaven:    { base: "MON_WOLF_001",      name: "Moonfang, Night Alpha",     tint: 0x9fb4e6, skills: ["Lunar Howl", "Silver Pounce", "Moonfall"] },
  mossvale:    { base: "MON_MOSS_GUARDIAN", name: "Wraithwood Witch",          tint: 0x6fe0b0, skills: ["Grasping Roots", "Wraith Stomp", "Spirit Bloom"] },
  frostford:   { base: "MON_FROST_BEAR",    name: "Aurora Phoenix",           tint: 0x9ff0ff, skills: ["Polar Roar", "Glacier Leap", "Aurora Storm"] },
  saharak:     { base: "MON_SAND_SCORPION", name: "Sandwraith Djinn",        tint: 0xc9a8ff, skills: ["Venom Tide", "Dune Strike", "Starfall Sands"] },
  ignaroth:    { base: "MON_MAGMA_GOLEM",   name: "Bluefire Demon Lord",          tint: 0x6aa8ff, skills: ["Bluefire Quake", "Meteor Charge", "Inferno Eclipse"] },
  shadowlands: { base: "MON_VOID_REAPER",   name: "Eclipse Queen",         tint: 0xff5a7a, skills: ["Crimson Wail", "Reaper's Lunge", "Total Eclipse"] },
};
export const nightBossOf = (town: string) => `NIGHT_${town.toUpperCase()}`;
// PK bosses: one warlord in each free-PK map, out day and night, tougher still than a night lord — and the richest kill
// in the game (a sure blueprint, often a piece of divine gear: shared/sim.ts kill), dropped on contested ground.
export const PK_BOSSES: Record<string, { base: string; name: string; tint: number; skills: [string, string, string] }> = {
  "c7_-3":  { base: "MON_DUSK_STALKER",  name: "Bloodmoon Stalker",      tint: 0xb01e3a, skills: ["Blood Howl", "Crimson Pounce", "Red Eclipse"] },
  "c5_-1":  { base: "MON_DUNE_SCARAB",   name: "Gilded Scarab King",     tint: 0xffc23a, skills: ["Golden Quake", "Sunburst Charge", "Pharaoh's Wrath"] },
  "c8_1":   { base: "MON_EMBER_BOAR",    name: "Warlord Emberhorn",      tint: 0xff4a1a, skills: ["Magma Roar", "Molten Charge", "Cataclysm"] },
  "c-6_-1": { base: "MON_Z_GROVE_2",     name: "Thorncrown Warden",      tint: 0x3aa84a, skills: ["Thorn Burst", "Root Lunge", "Verdant Doom"] },
  "c-4_-3": { base: "MON_Z_GROVE_1",     name: "Blightbloom Matriarch",  tint: 0xd24ad0, skills: ["Spore Nova", "Blight Leap", "Plague Bloom"] },
  "c-3_2":  { base: "MON_MOSS_SLIME",    name: "Mirewood Devourer",      tint: 0x4a7a2a, skills: ["Mire Slam", "Bog Pounce", "Swamp Maw"] },
};
export const pkBossOf = (zone: string) => `PK_${zone.replace(/[^a-z0-9]/gi, "_").toUpperCase()}`;
for (const [town, n] of Object.entries(NIGHT_BOSSES)) {
  const d = MONSTERS[n.base]; if (!d) continue;
  const [self, target, nova] = n.skills, id = nightBossOf(town);
  MONSTERS[id] = {
    ...d, base: n.base, boss: true, night: true, name: n.name, tint: n.tint, level: d.level + 12,
    STR: Math.round(d.STR * 2.2), AGI: Math.round(d.AGI * 1.3), VIT: Math.round(d.VIT * 6), DEX: Math.round(d.DEX * 1.5), exp: d.exp * 30,
    respawn: 1500, aggro: 10, leash: 22, scale: Math.min(4.6, Math.max(3.2, d.scale * 3.3)), bite: { ...d.bite, reach: d.bite.reach * 2.5 },
    skills: [
      { id: "n-nova", name: nova, at: "self", radius: 8, windup: 2.4, coef: 4, cooldown: 18, range: 7 },   // the big one (tried first): run
      { id: "n-self", name: self, at: "self", radius: 5, windup: 1.5, coef: 2.6, cooldown: 8, range: 5 },
      { id: "n-leap", name: target, at: "target", radius: 3, windup: 1.1, coef: 3.2, cooldown: 7, range: 12 },
    ],
  };
  if (UNIQUE_OF[bossOf(n.base)]) UNIQUE_OF[id] = UNIQUE_OF[bossOf(n.base)];
  if (BLUEPRINT_OF[bossOf(n.base)]) BLUEPRINT_OF[id] = BLUEPRINT_OF[bossOf(n.base)];
}
for (const [zone, n] of Object.entries(PK_BOSSES)) {
  const d = MONSTERS[n.base]; if (!d) continue;
  const [nova, self, leap] = n.skills, id = pkBossOf(zone);
  MONSTERS[id] = {
    ...d, base: n.base, boss: true, pk: true, name: n.name, tint: n.tint, level: d.level + 15,
    STR: Math.round(d.STR * 2.4), AGI: Math.round(d.AGI * 1.4), VIT: Math.round(d.VIT * 7), DEX: Math.round(d.DEX * 1.6), exp: d.exp * 40,
    respawn: 1800, aggro: 11, leash: 24, scale: Math.min(4.8, Math.max(3.4, d.scale * 3.5)), bite: { ...d.bite, reach: d.bite.reach * 2.6 },
    skills: [
      { id: "p-nova", name: nova, at: "self", radius: 8.5, windup: 2.2, coef: 4.4, cooldown: 16, range: 7 },
      { id: "p-self", name: self, at: "self", radius: 5, windup: 1.4, coef: 2.8, cooldown: 8, range: 5 },
      { id: "p-leap", name: leap, at: "target", radius: 3.2, windup: 1.0, coef: 3.4, cooldown: 6, range: 12 },
    ],
  };
  if (UNIQUE_OF[bossOf(n.base)]) UNIQUE_OF[id] = UNIQUE_OF[bossOf(n.base)];
  if (BLUEPRINT_OF[bossOf(n.base)]) BLUEPRINT_OF[id] = BLUEPRINT_OF[bossOf(n.base)];
}
// ---------------------------------------------------------------- kingdom bosses
// Three bosses per kingdom — two by day and its night lord — each a creature of its own (a boss model, never a grown-up
// monster), and raid-tough: about ten players of its level for several minutes (raidHP in shared/sim.ts). They replace
// the Tyrants (grown-up monsters, one or two per map): those stay defined, so their souls, blueprints and gear keep
// their ids, but they no longer spawn — their blueprints and souls drop from the new bosses of the same kingdom
// (BOSS_LOOT). The Alpha Wolf keeps its Dark Forest clearing as Valoria's second day boss.
export interface KingdomBoss { id: string; city: string; name: string; model: string; base: string; far: boolean; skills: [string, string, string] }
export const KINGDOM_BOSSES: KingdomBoss[] = [
  { id: "BOSS_V_SCARECROW",  city: "pawhaven",    name: "Harvest Scarecrow King", model: "scarecrow",   base: "MON_SHROOM",        far: true,  skills: ["Crow Swarm", "Scythe Sweep", "Harvest Moon"] },
  { id: "BOSS_S_MOTHQUEEN",  city: "mossvale",    name: "Mothwing Queen",         model: "mothqueen",   base: "MON_Z_GROVE_1",     far: true,  skills: ["Dust Storm", "Wing Gust", "Moonlit Pollen"] },
  { id: "BOSS_S_HYDRA",      city: "mossvale",    name: "Mire Hydra",             model: "hydra",       base: "MON_MOSS_SLIME",    far: false, skills: ["Triple Bite", "Bog Lunge", "Venom Rain"] },
  { id: "BOSS_F_JARL",       city: "frostford",   name: "Frost Giant Jarl",       model: "frostjarl",   base: "MON_FROST_BEAR",    far: true,  skills: ["Axe Cleave", "Glacier Leap", "Winter's Fury"] },
  { id: "BOSS_F_DRAKE",      city: "frostford",   name: "Crystal Drake",          model: "icedrake",    base: "MON_Z_GLACIER_1",   far: false, skills: ["Frost Breath", "Crystal Dive", "Shard Storm"] },
  { id: "BOSS_D_PHARAOH",    city: "saharak",     name: "Pharaoh of the Dunes",   model: "pharaoh",     base: "MON_Z_DUNE_1",      far: true,  skills: ["Curse of Ra", "Sandstorm Step", "Tomb Collapse"] },
  { id: "BOSS_D_WYRM",       city: "saharak",     name: "Great Sand Wyrm",        model: "sandwyrm",    base: "MON_SAND_SCORPION", far: false, skills: ["Burrow Strike", "Devour", "Quicksand"] },
  { id: "BOSS_I_DRAGON",     city: "ignaroth",    name: "Magma Dragon",           model: "lavadragon",  base: "MON_EMBER_BOAR",    far: true,  skills: ["Fire Breath", "Wing Slam", "Volcanic Rain"] },
  { id: "BOSS_I_TITAN",      city: "ignaroth",    name: "Forge Titan",            model: "forgetitan",  base: "MON_MAGMA_GOLEM",   far: false, skills: ["Hammer Quake", "Anvil Drop", "Molten Forge"] },
  { id: "BOSS_N_BONEDRAGON", city: "shadowlands", name: "Bone Dragon",            model: "bonedragon",  base: "MON_Z_ECLIPSE_1",   far: true,  skills: ["Death Breath", "Bone Storm", "Grave Dive"] },
  { id: "BOSS_N_KNIGHT",     city: "shadowlands", name: "Nightmare Knight",       model: "nightknight", base: "MON_DUSK_STALKER",  far: false, skills: ["Dread Slash", "Shadow Charge", "Doom Blade"] },
];
/** Bosses that keep their id but get a body of their own. */
export const BOSS_MODEL: Record<string, string> = { MON_ALPHA_WOLF: "alphalord", NIGHT_PAWHAVEN: "moonwolf", NIGHT_MOSSVALE: "forestwitch", NIGHT_FROSTFORD: "phoenix",
  NIGHT_SAHARAK: "djinn", NIGHT_IGNAROTH: "bluedemon", NIGHT_SHADOWLANDS: "eclipsequeen" };
const kingdomLevel = (city: string) => Math.min(MAX_ZONE_LV, Math.max(1, ...ZONES.filter(z => z.home.id === city).map(z => z.level)));
const MAX_ZONE_LV = 99;
for (const b of KINGDOM_BOSSES) {
  const d = MONSTERS[b.base]; if (!d) continue;
  const L = Math.max(d.level + 8, kingdomLevel(b.city) - (b.far ? 0 : 6)), up = L - d.level, [self, target, nova] = b.skills;
  MONSTERS[b.id] = {
    ...d, base: b.base, boss: true, raid: true, name: b.name, model: b.model, tint: undefined, appearance: undefined, clips: undefined, level: L,
    STR: Math.round((d.STR + up * 2.6) * 1.5), AGI: Math.round(d.AGI + up * 0.9), VIT: Math.round((d.VIT + up * 5.8) * 2), INT: Math.round(d.INT + up * 0.6), DEX: Math.round((d.DEX + up * 1.2) * 1.3), LUK: Math.round(d.LUK + up * 0.4),
    exp: d.exp * 40, respawn: 2400, aggro: 11, leash: 24, scale: 3.4, bite: { ...d.bite, reach: Math.max(2.6, d.bite.reach * 2.6) },
    skills: [
      { id: "k-nova", name: nova, at: "self", radius: 8.5, windup: 2.4, coef: 4.2, cooldown: 16, range: 7 },
      { id: "k-self", name: self, at: "self", radius: 5, windup: 1.4, coef: 2.8, cooldown: 8, range: 5 },
      { id: "k-leap", name: target, at: "target", radius: 3.2, windup: 1.1, coef: 3.4, cooldown: 7, range: 12 },
    ],
  };
}
for (const [k, m] of Object.entries(BOSS_MODEL)) if (MONSTERS[k]) Object.assign(MONSTERS[k], { model: m, tint: undefined, appearance: undefined, clips: k === "MON_ALPHA_WOLF" ? "Q" : undefined });   // the Alpha lord still runs on four legs
/** Bodies with no walking legs on the shared skeleton (a snake's coil, a wyrm, a scorpion whose "arms" are pincers):
 *  clip set "S" plays the ordinary clips without the leg tracks, so the coil and the insect legs never stride. */
export const SLITHER_MODELS = new Set(["cobra", "sandwyrm"]);
for (const d of Object.values(MONSTERS)) if (SLITHER_MODELS.has(d.model)) d.clips = "S";
/** Models rebuilt standing on four legs (work/blender/quad_chibi.py): the skeleton's rest pose is already four-legged,
 *  so they play the ordinary clips (arms and legs swing as a trot), not the pitched-over "Q" set. */
export const QUAD_REST_MODELS = new Set(["wolf", "alpha", "fox", "boar", "bear", "hedgehog", "snowlynx", "shadowpanther", "jackal", "mossstag", "mammoth", "lavarhino", "tortoise", "salamander", "sporetoad", "scarab", "scorpion", "alphalord", "moonwolf"]);
for (const d of Object.values(MONSTERS)) if (QUAD_REST_MODELS.has(d.model)) d.clips = undefined;
/** Every boss that is out in the world: the kingdom bosses, the Alpha, the night lords and the PK warlords. */
export const LIVE_BOSSES = new Set([...KINGDOM_BOSSES.map(b => b.id), "MON_ALPHA_WOLF", ...Object.keys(NIGHT_BOSSES).map(nightBossOf), ...Object.keys(PK_BOSSES).map(pkBossOf)].filter(k => MONSTERS[k]));
for (const k of LIVE_BOSSES) MONSTERS[k].raid = true;
/** What a kingdom's retired Tyrants dropped (their blueprint and their soul), now on its new day bosses, alternating. */
export const BOSS_LOOT: Record<string, { item: string; chance: number }[]> = {};
for (const city of CITIES) {
  const day = KINGDOM_BOSSES.filter(b => b.city === city.id).map(b => b.id).concat(city.id === "pawhaven" ? ["MON_ALPHA_WOLF"] : []);
  const pool = city.id === "pawhaven" ? [...city.monsters, "MON_FOX", "MON_BOAR", "MON_BEAR", "MON_DIRE_WOLF", "MON_STUMP"] : city.monsters;
  pool.map(bossOf).filter(t => MONSTERS[t]).forEach((t, i) => {
    const to = day[i % day.length]; if (!to) return;
    (BOSS_LOOT[to] ??= []).push(...[BLUEPRINT_OF[t] && { item: BLUEPRINT_OF[t], chance: UNIQUE_CHANCE.blueprint }, UNIQUE_OF[t] && { item: UNIQUE_OF[t], chance: UNIQUE_CHANCE.boss }].filter(Boolean) as { item: string; chance: number }[]);
  });
}

// Special skills (skills.json `special`): taught only by a tome (คัมภีร์) a boss drops — never sold. Each tome goes to
// two bosses, spread over the bosses by level so every land's bosses carry a few. SKILLBOOK_OF: boss kind → tome ids.
export const SKILLBOOK_OF: Record<string, string[]> = {};
export const SKILLBOOK_CHANCE = 0.05;
export const tomeOf = (skill: string) => "TOME_" + skill.replace(/^SKILL_/, "");
{
  const bosses = [...LIVE_BOSSES].sort((a, b) => MONSTERS[a].level - MONSTERS[b].level || a.localeCompare(b));
  Object.keys(SKILLS).filter(k => SKILLS[k].special).forEach((sid, i) => {
    const id = tomeOf(sid), S = SKILLS[sid];
    ITEMS[id] = { name: `คัมภีร์: ${S.name}`, type: "Book", teaches: sid, maxStack: 5, sell: 900, icon: "📕", rare: true, desc: `ใช้เพื่อเรียนสกิลพิเศษ ${S.name} (${S.requires === "sword" ? "ดาบ" : S.requires === "bow" ? "ธนู" : "ไม้เท้า"}) — ไม่มีขาย ดรอปจากบอสเท่านั้น` };
    for (const b of new Set([bosses[(i * 3) % bosses.length], bosses[(i * 3 + 17) % bosses.length]])) (SKILLBOOK_OF[b] ??= []).push(id);
  });
}
export const LEVELS = levelsJson;
export const NPCS = {...npcsJson} as unknown as Record<string, NpcDef>;
const npcTemplate = {shop:'NPC_TOOL',craft:'NPC_SMITH',skillshop:'NPC_SKILL',stylist:'NPC_STYLIST',talk:'NPC_VILLAGER1'};
for(const city of CITIES.slice(1)) for(const resident of TOWNS[city.biome]!.residents) {
  const template=NPCS[npcTemplate[resident.role]];
  NPCS[`NPC_${city.id}_${resident.role}`]={...template,name:resident.name,pos:[city.x+resident.x,city.z+resident.z],biome:city.biome,species:resident.species,yaw:resident.yaw,
    lines:[`ยินดีต้อนรับสู่ ${city.realm} — ${city.description}`, ...template.lines.filter(line=>!line.includes('Bram')&&!line.includes('Mei')&&!line.includes('ตะวันออก'))]};
}
// every other town gets a guild keeper too: the guild grounds have no road in, a keeper in town takes members there
const KEEPER_AT: Record<string, [number, number]> = { mossvale: [-2.5, 6], frostford: [-4, 7.5], saharak: [-4, 7.5], ignaroth: [-4, 7.5], shadowlands: [4, 7.5] };
for (const city of CITIES.slice(1)) { const at = KEEPER_AT[city.id]; if (at) NPCS[`NPC_${city.id}_guild`] = { ...NPCS.NPC_GUILD, name: "ผู้ดูแลกิลด์", pos: [city.x + at[0], city.z + at[1]], biome: city.biome, species: "dog" }; }
// Roadside peddlers: one at the road through each mountain pass between kingdoms — potions and arrows for the journey
// (a hunter who ran dry halfway should not have to walk back to town). A few steps off the road, so nobody walks into them.
const PEDDLER_NAMES = ["Tomo (พ่อค้าเร่)", "Ruma (พ่อค้าเร่)", "Pip (แม่ค้าเร่)", "Kobi (พ่อค้าเร่)", "Nala (แม่ค้าเร่)", "Juno (พ่อค้าเร่)", "Mimi (แม่ค้าเร่)", "Taro (พ่อค้าเร่)"];
ZONES.filter(z => z.terrain === "pass").forEach((z, i) => {
  const seg = ROADS.get(z.id)?.[Math.floor((ROADS.get(z.id)!.length - 1) / 2)]; if (!seg) return;
  const [x1, z1, x2, z2] = seg, mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, l = Math.hypot(x2 - x1, z2 - z1) || 1, off = 3.2;
  NPCS[`NPC_PEDDLER_${z.id.replace(/[^a-z0-9]/gi, "_")}`] = { name: PEDDLER_NAMES[i % PEDDLER_NAMES.length], kind: "shop", pos: [mx - (z2 - z1) / l * off, mz + (x2 - x1) / l * off],
    biome: z.home.biome, species: (["dog", "cat", "mouse"] as const)[i % 3], stock: ["HP_POTION", "HI_POTION", "MANA_POTION", "ARROW"],
    lines: ["ยาและลูกธนูสำหรับเดินทาง — ซื้อก่อนข้ามเขานะ", "ทางข้างหน้าอันตราย เตรียมยาให้พร้อม"] };
});
// ---------------------------------------------------------------- races
export type Species = "dog" | "cat" | "mouse";
/** Three breeds per race. Purely visual: `size` scales the rig (dogs biggest, mice smallest), `coat` is the baked fur
 *  colour the stylist's tint is measured against. "dog"/"cat"/"mouse" stay valid for older saves (the knight rigs). */
export const BREEDS: Record<string, { species: Species; name: string; size: number; coat: number }> = {
  golden: { species: "dog", name: "โกลเด้น", size: 1.1, coat: 0xdb9a47 }, shiba: { species: "dog", name: "ชิบะ", size: 1.0, coat: 0xed8029 }, husky: { species: "dog", name: "ฮัสกี้", size: 1.08, coat: 0x757a8a },
  persian: { species: "cat", name: "เปอร์เซีย", size: 0.88, coat: 0xf2e6cc }, siamese: { species: "cat", name: "วิเชียรมาศ", size: 0.85, coat: 0xf2e6cc }, fold: { species: "cat", name: "สก็อตติช โฟลด์", size: 0.82, coat: 0x9ea3b0 },
  hamster: { species: "mouse", name: "แฮมสเตอร์", size: 0.66, coat: 0xe69e4d }, dumbo: { species: "mouse", name: "ดัมโบ้", size: 0.72, coat: 0xf5f5f2 }, whitemouse: { species: "mouse", name: "หนูขาว", size: 0.68, coat: 0xf5f5f2 },
  dog: { species: "dog", name: "ชิบะอัศวิน", size: 1, coat: 0xe8963a }, cat: { species: "cat", name: "แมว", size: 0.85, coat: 0xe8963a }, mouse: { species: "mouse", name: "หนู", size: 0.7, coat: 0xe8963a },
};
/** One passive per species, always on: dogs are sturdy, cats slippery, mice quick. Applied in derive() / stepPlayer(). */
export const RACE_TRAITS: Record<Species, { name: string; desc: string; hpMult?: number; dodge?: number; speedMult?: number }> = {
  dog: { name: "ใจสู้ (Stalwart)", desc: "HP สูงสุด +12%", hpMult: 1.12 },
  cat: { name: "เก้าชีวิต (Nine Lives)", desc: "หลบหลีก (Flee) +6", dodge: 6 },
  mouse: { name: "ฝีเท้าไว (Quickstep)", desc: "เดินเร็วขึ้น 15%", speedMult: 1.15 },
};
/** Breeds that were retired: old saves and remembered creator picks land on their replacement. */
export const BREED_ALIAS: Record<string, string> = { chihuahua: "shiba" };
export const speciesOf = (race?: string): Species => BREEDS[race ?? ""]?.species ?? "dog";
// ---------------------------------------------------------------- mounts
/** Rideable animals: the whistle item that calls them, model, size, saddle height (model units), speed multiplier,
 *  and for flyers the hover height. Their GLBs carry "Gallop" (moving) and "Idle" clips. */
export interface MountDef { name: string; item: string; model: string; scale: number; saddle: number; speed: number; fly?: number }
export const MOUNTS: Record<string, MountDef> = {
  horse: { name: "ม้า", item: "MOUNT_HORSE", model: "SM_Horse", scale: 1.35, saddle: 0.645, speed: 1.8 },
  dragon: { name: "มังกร", item: "MOUNT_DRAGON", model: "SM_Dragon", scale: 1.25, saddle: 0.70, speed: 2.4, fly: 1.3 },
};
export const mountOfItem = (itemId: string) => Object.keys(MOUNTS).find(k => MOUNTS[k].item === itemId);
export const OBJECTIVES = objectivesJson as Objective[];

export const GOLD = "GOLD";   // currency, not an item (GDD §15) — drop tables may still name it
export const MAX_LEVEL = LEVELS.maxLevel;
export const STAT_POINTS_PER_LEVEL = LEVELS.statPointsPerLevel;
export const START_GOLD = LEVELS.startGold;   // testing convenience: raise it here, not in code
export const expToNext = (level: number) => Math.round(50 * level * (1 + level / 12));   // keep in sync with levels.json "expToNext"
const STAT_LABEL: Record<string, string> = { ATK: "ATK", MATK: "MATK", DEF: "DEF", maxHP: "HP", maxMP: "MP", Crit: "Crit%", Dodge: "Flee", Hit: "Hit", STR: "STR", AGI: "AGI", VIT: "VIT", INT: "INT", DEX: "DEX", LUK: "LUK" };
/** "ATK +18 · STR +2" — what wearing the item adds (shown in bag, shop, equip window). */
export const modsText = (id: string) => Object.entries(ITEMS[id]?.mods ?? {}).map(([k, v]) => `${STAT_LABEL[k] ?? k} ${v >= 0 ? "+" : ""}${v}`).join(" · ");
/** Reference ("central") price per unit: the shop price, else three times what a shop pays. Player listings must stay within ±10%. */
export const refPrice = (id: string) => Math.max(1, ITEMS[id]?.buy ?? (ITEMS[id]?.sell ?? 0) * 3);
export const MARKET_BAND = 0.1;
export const priceBand = (id: string) => ({ min: Math.max(1, Math.ceil(refPrice(id) * (1 - MARKET_BAND))), max: Math.floor(refPrice(id) * (1 + MARKET_BAND)) });
export const itemName = (id: string) => (id === GOLD ? "Gold" : ITEMS[id]?.name ?? id);
