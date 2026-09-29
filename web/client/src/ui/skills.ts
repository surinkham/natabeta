import { skillEffect, skillFrom } from "@shared/codex";
// Skills window: what the player knows (drag onto the hotbar) and, at the trainer, what is still for sale.
import { SKILLS } from "@shared/data";
import { skillFits, skillWeaponText, weaponOf } from "@shared/sim";
import { game } from "./api";
import { body, createWindow, isOpen, onWindowOpen, setHTML } from "./windows";
import { quickAssign, slotOf, startDrag } from "./hotbar";
import { sys } from "./chat";
import { icon } from "./icons";
import { groupOf, groupTabs, type Group } from "./skillpreview";
let group: Group | null = null;   // the open weapon tab; first open: the weapon in hand

export function setupSkills() {
  createWindow("skills", "สกิล", `<div class="btns"><button data-open-skillpv>🎬 ตัวอย่างสกิลทั้งหมด</button></div><div id="sk-list"></div><div class="hint">กด "+ hotbar" เพื่อใส่ช่องว่าง · จัดลำดับ/เอาออกที่แท็บ 🎛 Hotbar · ชุดสกิลของ Auto ที่แท็บ 🤖 Auto</div>`);
  body("skills").addEventListener("pointerdown", e => {
    if ((e.target as HTMLElement).closest("button")) return;
    const s = (e.target as HTMLElement).closest<HTMLElement>("[data-skill]"); if (!s) return;
    startDrag(e as PointerEvent, { kind: "skill", id: s.dataset.skill! }, s.querySelector(".ic")!.innerHTML);
  });
  body("skills").addEventListener("click", e => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-skg]"); if (t) { group = t.dataset.skg as Group; refreshSkills(); } });
  onWindowOpen("skills", refreshSkills);
  body("skills").addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-hb]"); if (!b) return;
    const i = quickAssign({ kind: "skill", id: b.dataset.hb! });
    sys(i < 0 ? "hotbar เต็ม — ลากทับช่องที่ต้องการ หรือคลิกขวาที่ช่องเพื่อลบ" : `${SKILLS[b.dataset.hb!].name} อยู่ที่ F${i + 1}`); refreshSkills();
  });
}
export const skillRow = (id: string, known: boolean, price?: number) => {
  const d = SKILLS[id], fits = skillFits(id, game().P.equip);   // the wrong weapon in hand: the row greys out and says why
  const need = `<small class="req${fits ? "" : " bad"}">${d.requires ? "🗡" : "✔"} ${skillWeaponText(id)}${fits ? "" : " — อาวุธที่ถือใช้ไม่ได้"}</small>`;
  return `<div class="shoprow${fits ? "" : " off"}" ${known ? `data-skill="${id}"` : ""}><span><span class="ic">${icon(id, d.icon)}</span>${d.name}<br>${need}<br><small>${d.desc ?? ""} · คูลดาวน์ ${d.cooldown}s</small>${skillEffect(id) ? `<br><small class="cx-fx">${skillEffect(id)}</small>` : ""}${skillFrom(id) ? `<br><small class="from">📜 ${skillFrom(id)}</small>` : ""}</span>${
    known ? (slotOf({ kind: "skill", id }) >= 0 ? `<small class="hb-at">F${slotOf({ kind: "skill", id }) + 1}</small>` : `<button data-hb="${id}" title="ใส่ช่องว่างถัดไปใน hotbar">+ hotbar</button>`)
      : `<button data-act="learn:${id}">เรียน ${price} G</button>`}</div>`;
};
export function refreshSkills() {
  if (!isOpen("skills")) return;
  const P = game().P;
  const known = (P.skills ?? []).filter(id => SKILLS[id]);
  group ??= (weaponOf(P.equip) ?? "any") as Group;
  const html = groupTabs(group, "data-skg", g => known.filter(id => groupOf(id) === g).length) + known.filter(id => groupOf(id) === group).map(id => skillRow(id, true)).join("");
  const el = document.getElementById("sk-list")!; setHTML(el, html);
}
