// Single damage/derive path (spec §2.3, §4.3). Pure: no DOM, no three, injectable RNG so tests are deterministic.
import { FORMULAS as F, ITEMS, RACE_TRAITS, StatMods, speciesOf } from "./data";

export interface Primary { STR: number; AGI: number; VIT: number; INT: number; DEX: number; LUK: number; level: number }
export interface Derived { maxHP: number; maxMP: number; ATK: number; MATK: number; DEF: number; Crit: number; Dodge: number; Hit: number; ASPD: number; CDR: number; HPR: number; MPR: number }
export type Unit = Primary & Partial<Derived> & { equip?: Record<string, string>; race?: string };

export function equipMods(equip?: Record<string, string>): StatMods {
  const m: StatMods = {};
  for (const id of Object.values(equip ?? {})) for (const [k, v] of Object.entries(ITEMS[id]?.mods ?? {})) m[k] = (m[k] ?? 0) + v;
  return m;
}

/** Fill derived stats from primaries + equipment. Mutates and returns u. */
export function derive<T extends Unit>(u: T): T & Derived {
  const m = equipMods(u.equip), g = (k: keyof typeof m) => m[k] ?? 0;
  // gear primaries count everywhere a primary does, without touching the allocated base stats
  const STR = u.STR + g("STR"), AGI = u.AGI + g("AGI"), VIT = u.VIT + g("VIT"), INT = u.INT + g("INT"), DEX = u.DEX + g("DEX"), LUK = u.LUK + g("LUK");
  const trait = u.race ? RACE_TRAITS[speciesOf(u.race)] : undefined;   // monsters have no race
  u.maxHP = Math.round((F.HP_Base + VIT * F.HP_PerVIT + u.level * F.HP_PerLevel + g("maxHP")) * (trait?.hpMult ?? 1));
  u.maxMP = F.MP_Base + INT * F.MP_PerINT + u.level * F.MP_PerLevel + g("maxMP");
  u.ATK = STR * F.ATK_PerSTR + DEX * F.ATK_PerDEX + g("ATK");
  u.MATK = INT * F.MATK_PerINT + g("MATK");
  u.DEF = VIT * F.DEF_PerVIT + g("DEF");
  u.Crit = Math.min(F.Crit_Cap, F.Crit_Base + LUK * F.Crit_PerLUK + g("Crit"));
  u.Dodge = Math.min(F.Dodge_Cap + (trait?.dodge ?? 0), AGI * F.Dodge_PerAGI + g("Dodge") + (trait?.dodge ?? 0));
  // attack speed: a multiplier on the basic attack's rate (cooldown, swing and clip), 1 + 1% per AGI up to ×2
  u.ASPD = Math.min(F.AtkSpeed_Cap, 1 + AGI * F.AtkSpeed_PerAGI);
  // cooldown reduction for skills (not the basic attack): 0.4% per DEX, at most 40%
  u.CDR = Math.min(F.CDR_Cap, DEX * F.CDR_PerDEX);
  // natural regeneration per second, anywhere: VIT for HP, INT for MP (town and sitting multiply it in the sim)
  u.HPR = VIT * F.HP_Regen_PerVIT;
  u.MPR = F.MP_Regen_Base + INT * F.MP_Regen_PerINT;
  u.Hit = F.Hit_Base + DEX * F.Hit_PerDEX + g("Hit");
  return u as T & Derived;
}

export interface DamageResult { dmg: number; crit: boolean; miss: boolean }

/** BKDamageExecCalc. rng() in [0,1). */
/** `magic`: spells hit with MATK and only half of the target's DEF applies. */
export function damage(src: Derived, dst: Derived, coef: number, rng: () => number = Math.random, magic = false): DamageResult {
  if (rng() * 100 > src.Hit - dst.Dodge) return { miss: true, crit: false, dmg: 0 };
  const crit = rng() * 100 < src.Crit;
  const atk = magic ? src.MATK : src.ATK, def = magic ? dst.DEF * F.Magic_DEF_Mult : dst.DEF;
  const raw = Math.max(1, atk * coef - def) * (crit ? F.Crit_Mult : 1) * (F.Dmg_VarMin + rng() * (F.Dmg_VarMax - F.Dmg_VarMin));
  return { crit, miss: false, dmg: Math.floor(raw) };
}
