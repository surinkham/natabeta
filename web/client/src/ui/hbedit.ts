// "จัด Hotbar": set the hotbar by tapping — pick a slot, then a skill or item to put there; ✕ empties a slot. Works the
// same with a mouse and a finger (on the phone's skill ring a drag aims the skill, so it cannot drag one off).
import { ITEMS, SKILLS } from "@shared/data";
import { game } from "./api";
import { hotbarRef, setSlot, type Ref } from "./hotbar";
import { keyName, keyOf } from "./hotkeys";
import { icon } from "./icons";
import { GROUPS, groupOf, type Group } from "./skillpreview";
import { body, createWindow, isOpen, onWindowOpen, setHTML, toggleWindow } from "./windows";
import { weaponOf } from "@shared/sim";

let pick = 0, tab: Group | "item" | null = null;
const N = 9, same = (a: Ref | null | undefined, b: Ref) => !!a && a.kind === b.kind && a.id === b.id;

export function setupHotbarEditor() {
  createWindow("hbedit", "🎛 จัด Hotbar", `<div class="hbe-slots" id="hbe-slots"></div><div id="hbe-tabs"></div><div class="hbe-list" id="hbe-list"></div>
    <div class="hint">แตะช่องด้านบนเพื่อเลือก แล้วแตะสกิลหรือไอเทมเพื่อใส่ · ✕ = เอาออก · ใส่ของที่อยู่ช่องอื่นแล้ว = ย้ายมา</div>`);
  onWindowOpen("hbedit", refreshHotbarEditor);
  body("hbedit").addEventListener("click", e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-hbe]"); if (!t) return;
    const [act, a, b] = t.dataset.hbe!.split(":");
    if (act === "slot") pick = +a;
    if (act === "clear") setSlot(+a, null);
    if (act === "tab") tab = a as typeof tab;
    if (act === "put") {
      const ref = { kind: a, id: b } as Ref, had = [...Array(N).keys()].find(i => same(hotbarRef(i), ref));
      if (had !== undefined && had !== pick) setSlot(had, null);   // one place per skill or item
      setSlot(pick, ref); pick = [...Array(N).keys()].find(i => !hotbarRef(i)) ?? pick;   // on to the next empty slot
    }
    refreshHotbarEditor();
  });
}
/** Open it, with the slot to fill first (the first empty one when none is given). */
export function openHotbarEditor(slot?: number) {
  pick = slot ?? [...Array(N).keys()].find(i => !hotbarRef(i)) ?? 0; toggleWindow("hbedit", true); refreshHotbarEditor();
}
export function refreshHotbarEditor() {
  if (!isOpen("hbedit")) return;
  const P = game().P; tab ??= (weaponOf(P.equip) ?? "any") as Group;
  const face = (r: Ref) => r.kind === "skill" ? icon(r.id, SKILLS[r.id]?.icon ?? "") : icon(r.id, ITEMS[r.id]?.icon ?? "");
  const name = (r: Ref) => (r.kind === "skill" ? SKILLS[r.id]?.name : ITEMS[r.id]?.name) ?? r.id;
  setHTML(body("hbedit").querySelector("#hbe-slots")!, [...Array(N).keys()].map(i => { const r = hotbarRef(i);
    return `<div class="hbe-slot slot${i === pick ? " pick" : ""}" data-hbe="slot:${i}" title="${r ? name(r) : "ว่าง"}"><span class="k">${keyName(keyOf(`hb${i + 1}`))}</span>${r ? `<span class="ic">${face(r)}</span><button class="hbe-x" data-hbe="clear:${i}" title="เอาออก">✕</button>` : `<span class="plus">+</span>`}</div>`; }).join(""));
  const skills = P.skills.filter(id => SKILLS[id]);
  const items = [...new Set(P.inv.items.filter(s => ITEMS[s.itemId]?.type === "Consumable").map(s => s.itemId))];
  setHTML(body("hbedit").querySelector("#hbe-tabs")!, `<div class="tabs">${GROUPS.map(([g, l]) => `<button data-hbe="tab:${g}" class="${tab === g ? "on" : ""}">${l} (${skills.filter(id => groupOf(id) === g).length})</button>`).join("")}<button data-hbe="tab:item" class="${tab === "item" ? "on" : ""}">🧪 ไอเทม (${items.length})</button></div>`);
  const refs: Ref[] = tab === "item" ? items.map(id => ({ kind: "item", id })) : skills.filter(id => groupOf(id) === tab).map(id => ({ kind: "skill", id }));
  setHTML(body("hbedit").querySelector("#hbe-list")!, refs.map(r => { const at = [...Array(N).keys()].find(i => same(hotbarRef(i), r));
    return `<button class="hbe-src${at !== undefined ? " used" : ""}" data-hbe="put:${r.kind}:${r.id}" title="${name(r)}"><span class="ic">${face(r)}</span><small>${name(r)}</small>${at !== undefined ? `<i>${at + 1}</i>` : ""}</button>`; }).join("") || `<div class="hint">ไม่มี${tab === "item" ? "ไอเทมที่ใช้ได้ในกระเป๋า" : "สกิลในหมวดนี้"}</div>`);
}
