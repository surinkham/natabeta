import { PRIMARY } from "@shared/progression";
import { SKILLS } from "@shared/data";
import { derive, equipMods } from "@shared/formulas";
import { BREEDS, RACE_TRAITS, attackSkill, moveSpeed, speciesOf } from "@shared/sim";
import { game } from "./api";
import { body, createWindow, setHTML } from "./windows";

const LABEL: Record<string, string> = { STR: "Str", AGI: "Agi", VIT: "Vit", INT: "Int", DEX: "Dex", LUK: "Luk" };

export function setupStatus() {
  createWindow("status", "Status", `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px">
    <table id="st-prim"></table><table id="st-der"></table></div>
    <div class="hint" id="st-trait"></div>
    <div class="btns" id="st-confirm" hidden><button data-st="ok"></button><button data-st="cancel" class="ghost">ยกเลิก</button></div>
    <div class="hint">+ คลิก 1 · Shift 10 · Ctrl ทั้งหมด — แล้วกด “ยืนยัน” (ยังไม่เสียแต้มจนกว่าจะยืนยัน)</div>`);
  body("status").addEventListener("click", e => {
    const P = game().P, st = (e.target as HTMLElement).closest<HTMLElement>("[data-st]")?.dataset.st;
    if (st === "ok") { for (const [k, n] of Object.entries(pending)) if (n > 0) game().allocate(k, n); pending = {}; return refreshStatus(); }
    if (st === "cancel") { pending = {}; return refreshStatus(); }
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-attr]"); if (!b) return;
    const left = P.points - spent(), n = Math.min(e.ctrlKey ? left : e.shiftKey ? 10 : 1, left); if (n <= 0) return;
    pending[b.dataset.attr!] = (pending[b.dataset.attr!] ?? 0) + n; refreshStatus();
  });
}
// points are only planned here ("+" adds to the plan, the values show old → new) and spent on "ยืนยัน", so a stray tap
// cannot waste them
let pending: Record<string, number> = {};
const spent = () => Object.values(pending).reduce((a, b) => a + b, 0);
export function refreshStatus() {
  const P = game().P;
  if (spent() > P.points) pending = {};   // the points went elsewhere (a reset scroll, another window): drop the plan
  const plan = spent(), conf = document.getElementById("st-confirm")!;
  conf.hidden = !plan; if (plan) conf.querySelector("[data-st=ok]")!.textContent = `ยืนยัน (ใช้ ${plan} แต้ม)`;
  const gear = equipMods(P.equip) as Record<string, number>;   // gear bonus shown next to the allocated value
  const left = P.points - plan;
  setHTML(document.getElementById("st-prim")!, PRIMARY.map(k => { const add = pending[k] ?? 0, v = (P as any)[k];
    return `<tr><td>${LABEL[k]}</td><td class="v">${add ? `${v} → <b style="color:#2f7d3a">${v + add}</b>` : v}${gear[k] ? ` <small style="color:#2f7d3a">+${gear[k]}</small>` : ""}</td><td><button class="plus" data-attr="${k}" ${left > 0 ? "" : "disabled"}>+</button></td></tr>`; }).join("")
    + `<tr><td colspan="2"><b style="color:#b0361f">Points</b></td><td class="v">${left}${plan ? ` <small>/ ${P.points}</small>` : ""}</td></tr>`);
  // the planned points preview here too: each derived stat shows old → new. The change is worked out on bare copies
  // (derive) and added to what P shows, so bonuses applied after derive (the guild's) stay in the shown value.
  const rows = (u: any): [string, number, string][] => [["Atk", u.ATK, ""], ["Matk", u.MATK, ""], ["Def", u.DEF, ""], ["MaxHP", u.maxHP, ""], ["Hit", u.Hit, ""], ["Flee", u.Dodge, ""], ["Crit", u.Crit, "%"],
    ["Aspd", u.ASPD / SKILLS[attackSkill(P.equip, P.inv, P.mp)].cooldown, ""], ["CDR", u.CDR * 100, "%"], ["HP/วิ", u.HPR, ""], ["MP/วิ", u.MPR, ""]];   // VIT / INT regeneration   // CDR: skill cooldowns cut by DEX   // attacks per second, AGI included
  const bare = (add: Record<string, number>) => { const u: any = { level: P.level, equip: P.equip, race: P.race }; for (const k of PRIMARY) u[k] = (P as any)[k] + (add[k] ?? 0); return rows(derive(u)); };
  const now = rows(P), was = bare({}), will = bare(pending), fmt = (v: number) => String(+v.toFixed(v % 1 ? 2 : 0));
  document.getElementById("st-der")!.innerHTML = now.map(([k, v, unit], i) => { const d = will[i][1] - was[i][1];
    return `<tr><td>${k}</td><td class="v">${Math.abs(d) > 1e-6 ? `${fmt(v)}${unit} → <b style="color:#2f7d3a">${fmt(v + d)}${unit}</b>` : fmt(v) + unit}</td></tr>`; }).join("")
    + `<tr><td>Move</td><td class="v">${moveSpeed(P).toFixed(2)} m/s${P.mounted ? " 🐴" : ""}</td></tr>`;
  const b = BREEDS[P.race], t = RACE_TRAITS[speciesOf(P.race)];
  document.getElementById("st-trait")!.innerHTML = `<b>${b?.name ?? P.race}</b> · ติดตัว: <b>${t.name}</b> — ${t.desc}`;
}
