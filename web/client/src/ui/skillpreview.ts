// Skill preview (ตัวอย่างสกิล): every skill in the game, grouped by the weapon it needs, with what it does (damage,
// reach, state it leaves) and a ▶ that plays its real animation and effect round your own character — nothing is spent
// and nothing is hit, it is only shown (GameApi.previewSkill). Opened from the Skills window or the codex.
import { SKILLS } from "@shared/data";
import { skillEffect, skillFrom } from "@shared/codex";
import { skillWeaponText } from "@shared/sim";
import { game } from "./api";
import { icon } from "./icons";
import { body, createWindow, isOpen, setHTML, toggleWindow } from "./windows";

export type Group = "sword" | "bow" | "staff" | "any";
let group: Group = "sword";
export const GROUPS: [Group, string][] = [["sword", "🗡 ดาบ"], ["bow", "🏹 ธนู"], ["staff", "🪄 คทา"], ["any", "✨ ทุกอาวุธ"]];   // boss-tome specials sit with their weapon
const inGroup = (id: string, g: Group) => { const S = SKILLS[id]; if (id === "SKILL_BASIC" || id === "SKILL_PUNCH") return false;
  return g === "any" ? !S.requires : S.requires === g; };
/** The tab a skill sits under in the Skills and Auto windows (the basic attack and punch: every weapon). */
export const groupOf = (id: string): Group => GROUPS.find(([g]) => inGroup(id, g))?.[0] ?? "any";
/** A row of weapon tabs; `attr` names the data attribute the owning window listens for. */
export const groupTabs = (on: Group, attr: string, count?: (g: Group) => number) => `<div class="tabs">${GROUPS.map(([g, l]) => `<button ${attr}="${g}" class="${g === on ? "on" : ""}">${l}${count ? ` (${count(g)})` : ""}</button>`).join("")}</div>`;

export function setupSkillPreview() {
  createWindow("skillpv", "ตัวอย่างสกิล", `<div id="spv-body"></div>`);
  const el = body("skillpv");
  el.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-spv]"); if (!b) return;
    const [act, arg] = b.dataset.spv!.split(":");
    if (act === "tab") { group = arg as Group; el.scrollTop = 0; draw(); }
    if (act === "play") { game().previewSkill(arg); if (document.body.classList.contains("touch")) toggleWindow("skillpv", false); }   // a phone: the window covers the screen, close it to watch
  });
  document.addEventListener("click", e => {
    const t = e.target as HTMLElement; if (t.closest("[data-open-skillpv]")) openSkillPreview();
    const p = t.closest<HTMLElement>("[data-skill-play]"); if (p) game().previewSkill(p.dataset.skillPlay!);   // the codex's ▶
  });
}
export function openSkillPreview(focus?: string) {
  if (focus && SKILLS[focus]) group = (GROUPS.map(g => g[0]).find(g => inGroup(focus, g)) ?? group);
  toggleWindow("skillpv", true);
  // docked to the right edge: the effects play round the character in the middle of the screen, which must stay in view
  const w = body("skillpv").closest<HTMLElement>(".win"); if (w && !document.body.classList.contains("touch")) { w.style.transform = "none"; w.style.left = Math.max(0, innerWidth - w.offsetWidth - 150) + "px"; w.style.top = "70px"; }
  draw();
}
function draw() {
  if (!isOpen("skillpv")) return;
  const ids = Object.keys(SKILLS).filter(id => inGroup(id, group));
  setHTML(body("skillpv").querySelector("#spv-body")!,
    `<div class="tabs">${GROUPS.map(([g, l]) => `<button data-spv="tab:${g}" class="${g === group ? "on" : ""}">${l}</button>`).join("")}</div>`
    + ids.map(id => { const S = SKILLS[id], from = skillFrom(id);
      return `<div class="shoprow spv-row"><span><span class="ic">${icon(id, S.icon ?? "")}</span><b>${S.name}</b> <small>${skillWeaponText(id)} · คูลดาวน์ ${S.cooldown} วิ${S.mana ? ` · MP ${S.mana}` : ""}</small>
        <br><small class="cx-fx">${skillEffect(id)}</small>${S.desc ? `<br><small>${S.desc}</small>` : ""}${from ? `<br><small>📜 ${from}</small>` : ""}</span>
        <span><button data-spv="play:${id}" title="ดูเอฟเฟกต์รอบตัวละคร">▶ ดู</button></span></div>`; }).join("")
    + `<div class="hint">▶ เล่นท่าและเอฟเฟกต์ของสกิลรอบตัวคุณ — ไม่เสีย MP ไม่ติดคูลดาวน์ ไม่โดนใคร</div>`);
}
