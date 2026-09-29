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

export type StatMods = Partial<Record<"ATK" | "DEF" | "Crit", number>>;
export interface ItemDef { desc?: string; name: string; type: "Material" | "Weapon" | "Armor" | "Consumable" | "Key"; bound?: boolean; maxStack: number; slot?: string; mods?: StatMods; visual?: string; sell: number; buy?: number; heal?: number; cooldown?: number; icon?: string }
export interface MonsterDef { name: string; level: number; STR: number; AGI: number; VIT: number; INT: number; DEX: number; LUK: number; exp: number; dropTable: string; aggro: number; leash: number; respawn: number; bite: { windup: number; active: number; recovery: number; reach: number }; model: string; scale: number; boss?: boolean }
export interface DropEntry { item: string; chance: number; min: number; max: number }
export interface Recipe { result: string; count: number; gold: number; station: string; ingredients: { item: string; count: number }[] }
export interface SkillDef { name: string; kind: "melee" | "dash" | "heal"; clip: string; fx: string; cast: number; hit: number; coef?: number; cooldown: number; range?: number; cone?: number; targets?: number; duration?: number; speed?: number; heal?: number; price?: number; icon?: string; desc?: string }
export interface NpcDef { name: string; kind: "craft" | "shop" | "stylist" | "talk" | "skillshop"; pos: [number, number]; lines: string[]; recipes?: string[]; stock?: string[]; skills?: string[]; price?: number }
export interface Objective { id: string; text: string; done: string }
export interface EquipVisual { slot: string; mesh: string; socket?: string; tint?: string }

export const FORMULAS = formulasJson;
export const ITEMS = itemsJson as Record<string, ItemDef>;
export const MONSTERS = monstersJson as Record<string, MonsterDef>;
export const DROPS = dropsJson as Record<string, DropEntry[]>;
export const RECIPES = recipesJson as Record<string, Recipe>;
export const SKILLS = skillsJson as Record<string, SkillDef>;
export const EQUIP_VISUALS = visualsJson as Record<string, EquipVisual>;
export const LEVELS = levelsJson;
export const NPCS = npcsJson as unknown as Record<string, NpcDef>;
export const OBJECTIVES = objectivesJson as Objective[];

export const GOLD = "GOLD";   // currency, not an item (GDD §15) — drop tables may still name it
export const MAX_LEVEL = LEVELS.maxLevel;
export const STAT_POINTS_PER_LEVEL = LEVELS.statPointsPerLevel;
export const START_GOLD = LEVELS.startGold;   // testing convenience: raise it here, not in code
export const expToNext = (level: number) => 50 * level;   // keep in sync with levels.json "expToNext"
export const itemName = (id: string) => (id === GOLD ? "Gold" : ITEMS[id]?.name ?? id);
