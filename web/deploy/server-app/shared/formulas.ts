// Single damage/derive path (spec §2.3, §4.3). Pure: no DOM, no three, injectable RNG so tests are deterministic.
import { FORMULAS as F, ITEMS, StatMods } from "./data";

export interface Primary { STR: number; AGI: number; VIT: number; INT: number; DEX: number; LUK: number; level: number }
export interface Derived { maxHP: number; ATK: number; DEF: number; Crit: number; Dodge: number; Hit: number }
export type Unit = Primary & Partial<Derived> & { equip?: Record<string, string> };

export function equipMods(equip?: Record<string, string>): StatMods {
  const m: StatMods = {};
  for (const id of Object.values(equip ?? {})) for (const [k, v] of Object.entries(ITEMS[id]?.mods ?? {})) m[k] = (m[k] ?? 0) + v;
  return m;
}

/** Fill derived stats from primaries + equipment. Mutates and returns u. */
export function derive<T extends Unit>(u: T): T & Derived {
  const m = equipMods(u.equip);
  u.maxHP = F.HP_Base + u.VIT * F.HP_PerVIT + u.level * F.HP_PerLevel;
  u.ATK = u.STR * F.ATK_PerSTR + u.DEX * F.ATK_PerDEX + (m.ATK ?? 0);
  u.DEF = u.VIT * F.DEF_PerVIT + (m.DEF ?? 0);
  u.Crit = Math.min(F.Crit_Cap, F.Crit_Base + u.LUK * F.Crit_PerLUK + (m.Crit ?? 0));
  u.Dodge = Math.min(F.Dodge_Cap, u.AGI * F.Dodge_PerAGI);
  u.Hit = F.Hit_Base + u.DEX * F.Hit_PerDEX;
  return u as T & Derived;
}

export interface DamageResult { dmg: number; crit: boolean; miss: boolean }

/** BKDamageExecCalc. rng() in [0,1). */
export function damage(src: Derived, dst: Derived, coef: number, rng: () => number = Math.random): DamageResult {
  if (rng() * 100 > src.Hit - dst.Dodge) return { miss: true, crit: false, dmg: 0 };
  const crit = rng() * 100 < src.Crit;
  const raw = Math.max(1, src.ATK * coef - dst.DEF) * (crit ? F.Crit_Mult : 1) * (F.Dmg_VarMin + rng() * (F.Dmg_VarMax - F.Dmg_VarMin));
  return { crit, miss: false, dmg: Math.floor(raw) };
}
