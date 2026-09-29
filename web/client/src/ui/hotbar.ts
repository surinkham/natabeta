// Hotbar F1–F9: skills or consumables, drag-drop from windows, cooldown overlay, remembered per character in this browser.
import { ITEMS, SKILLS } from "@shared/data";
import { game } from "./api";
import { attackSkill, skillFits, skillWeaponText } from "@shared/sim";
import { countOf } from "@shared/inventory";
import { icon } from "./icons";
import { keyName, keyOf } from "./hotkeys";
import { openHotbarEditor } from "./hbedit";

export type Ref = { kind: "skill"; id: string } | { kind: "item"; id: string };
const N = 9; let slots: (Ref | null)[] = Array(N).fill(null);
const el = document.getElementById("hotbar")!;
/** Each character keeps its own bar (one shared key showed the last character's skills on the next one). */
const key = () => `hotbar:${game().P.name}`;
const mouse = { x: innerWidth / 2, y: innerHeight / 2 }; let keyAim: { i: number; id: string; code: string; t0: number } | null = null;
let ghost: HTMLElement | null = null, dragging: Ref | null = null, dragEnded = false;

export function setupHotbar() {
  try { const s = JSON.parse(localStorage.getItem(key()) ?? "null"); if (Array.isArray(s) && s.length === N) slots = s; } catch {}
  if (slots.every(s => !s)) slots = [{ kind: "skill", id: "SKILL_BASIC" }, { kind: "skill", id: "SKILL_SLASH" }, { kind: "skill", id: "SKILL_DASH" }, { kind: "item", id: "HP_POTION" }, null, null, null, null, null];
  el.innerHTML = slots.map((_, i) => `<div class="slot" data-i="${i}"><span class="k">F${i + 1}</span><span class="ic" style="width:100%;height:100%"></span><span class="n"></span><span class="mp"></span><div class="cd" style="transform:scaleY(0)"></div></div>`).join("");
  el.addEventListener("click", e => { if (dragEnded) { dragEnded = false; return; } const s = (e.target as HTMLElement).closest<HTMLElement>("[data-i]"); if (s) use(+s.dataset.i!); });   // the click that ends a drag is not a use
  // the bar itself is fixed: nothing is dragged off or right-click-cleared by accident mid-fight — it is set in the
  // "จัด Hotbar" window (the 🎛 at its end, Options, or the Skills window); dropping a skill onto it still works
  el.addEventListener("contextmenu", e => e.preventDefault());
  el.insertAdjacentHTML("beforeend", `<button type="button" class="hb-edit" title="จัด Hotbar">🎛</button>`);
  el.querySelector(".hb-edit")!.addEventListener("click", e => { e.stopPropagation(); openHotbarEditor(); });
  // holding the key of an aimable skill aims it at the mouse; letting go casts it there (a quick tap aims by itself)
  addEventListener("pointermove", e => { if (e.pointerType === "mouse") { mouse.x = e.clientX; mouse.y = e.clientY; if (keyAim) game().aimAt(keyAim.id, mouse); } });
  addEventListener("keyup", e => {
    if (!keyAim || e.code !== keyAim.code) return; const k = keyAim; keyAim = null;
    if (performance.now() - k.t0 < 200) { game().aimAt(k.id, null); use(k.i); } else game().aimCast();
  });
  addEventListener("keydown", e => { const m = /^F([1-9])$/.exec(e.code); if (m && !(document.activeElement instanceof HTMLInputElement)) { e.preventDefault(); const r = slots[+m[1] - 1];
    if (r?.kind === "skill" && game().aimKind(r.id)) { if (!e.repeat && !keyAim) { keyAim = { i: +m[1] - 1, id: r.id, code: e.code, t0: performance.now() }; game().aimAt(r.id, mouse); } return; }
    use(+m[1] - 1); } });
}
/** Fire hotbar slot i (the phone's skill ring uses the same slots). */
export function use(i: number) {
  const r = slots[i]; if (!r) return;
  if (r.kind === "skill") game().act(r.id);
  else { const inst = game().P.inv.items.find(s => s.itemId === r.id); if (inst) game().useItem(inst.id); }
}
const save = () => { try { localStorage.setItem(key(), JSON.stringify(slots)); } catch {} };
const sameRef = (a: Ref | null, b: Ref) => !!a && a.kind === b.kind && a.id === b.id;
/** Put `ref` in the first empty slot (or report where it already is). Returns the slot index, or -1 when the bar is full. */
export function quickAssign(ref: Ref) {
  const have = slots.findIndex(s => sameRef(s, ref)); if (have >= 0) return have;
  const i = slots.findIndex(s => !s); if (i < 0) return -1;
  slots[i] = ref; save(); refreshHotbar(); return i;
}
export const slotOf = (ref: Ref) => slots.findIndex(s => sameRef(s, ref));
/** Nearest hotbar slot to the pointer, with a generous margin so a drop does not need pixel aim. */
/** `tight`: a slot dragged from the bar itself — just off the bar counts as off (the drop margin made a short pull
 *  snap back as a swap, so a slot seemed impossible to drag off). */
function slotAt(x: number, y: number, tight = false) {
  const bar = el.getBoundingClientRect(), m = tight ? 6 : 30; if (y < bar.top - (tight ? 6 : 60) || y > bar.bottom + m || x < bar.left - m || x > bar.right + m) return -1;
  let best = -1, bd = Infinity;
  [...el.querySelectorAll(".slot")].forEach((c, i) => { const r = c.getBoundingClientRect(), d = Math.abs(x - (r.left + r.width / 2)); if (d < bd) { bd = d; best = i; } });
  return best;
}
/** True for the click that ends a drag (so a drop is not also a tap). */
export const justDragged = () => dragEnded;
/** Other drop slots (auto-battle presets) carry data-dropslot; a drop there fires "slotdrop" on that element, and a
 *  drag that began on one (opts.origin) and ends nowhere fires "slotdragout" on its origin. detail: { ref, origin }. */
const dropSlotAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-dropslot]") ?? null;
/** Press on a skill/item: nothing happens until the pointer moves 5 px (so clicks stay clicks). Then a ghost with icon
 *  and name follows the pointer, every hotbar slot lights up, and the nearest one is marked. Drop on a slot assigns
 *  (swapping when the drag started on the bar); dragging a bar slot off the bar clears it. */
export function startDrag(e: PointerEvent, ref: Ref, iconHtml: string, opts: { from?: number; label?: string; origin?: HTMLElement } = {}) {
  if (e.button !== 0) return;
  e.preventDefault();   // no text selection sweeping across the window while dragging
  const sx = e.clientX, sy = e.clientY; let live = false, over = -1, slot: HTMLElement | null = null;
  const label = opts.label ?? (ref.kind === "skill" ? SKILLS[ref.id]?.name : ITEMS[ref.id]?.name) ?? "";
  const mv = (ev: PointerEvent) => {
    if (!live) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      live = true; dragging = ref; document.body.classList.add("hb-dragging");
      ghost = document.createElement("div"); ghost.className = "hb-ghost"; ghost.innerHTML = `<span class="ic">${iconHtml}</span><b>${label}</b>`; document.body.appendChild(ghost);
    }
    ghost!.style.left = ev.clientX + 14 + "px"; ghost!.style.top = ev.clientY - 18 + "px";
    slot?.classList.remove("drop"); slot = dropSlotAt(ev.clientX, ev.clientY); slot?.classList.add("drop");
    over = slot ? -1 : slotAt(ev.clientX, ev.clientY, opts.from !== undefined);
    [...el.children].forEach((c, i) => c.classList.toggle("drop", i === over));
  };
  const up = () => {
    removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
    if (!live) return;
    dragEnded = true; setTimeout(() => { dragEnded = false; }, 0);
    ghost?.remove(); ghost = null; document.body.classList.remove("hb-dragging"); for (const c of el.children) c.classList.remove("drop");
    slot?.classList.remove("drop");
    const detail = { ref, origin: opts.origin ?? null };
    if (slot) { slot.dispatchEvent(new CustomEvent("slotdrop", { detail, bubbles: true })); dragging = null; return; }
    if (opts.origin) { if (over < 0) opts.origin.dispatchEvent(new CustomEvent("slotdragout", { detail, bubbles: true })); else { slots[over] = ref; save(); refreshHotbar(); } dragging = null; return; }
    if (over >= 0) {
      if (opts.from !== undefined) [slots[over], slots[opts.from]] = [slots[opts.from], slots[over]];   // rearrange on the bar
      else { const dup = slots.findIndex(s => sameRef(s, ref)); if (dup >= 0 && dup !== over) slots[dup] = slots[over]; slots[over] = ref; }
    } else if (opts.from !== undefined) slots[opts.from] = null;                                    // dragged off the bar
    dragging = null; save(); refreshHotbar();
  };
  addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
}
/** Skill ids on the hotbar, left to right (auto battle fires them in this order). */
export const hotbarSkills = () => slots.flatMap(s => (s?.kind === "skill" ? [s.id] : []));
/** Runs after every hotbar refresh (the phone's skill ring mirrors the slots). */
export let afterRefresh: (() => void) | undefined;
export const setAfterRefresh = (f: () => void) => { afterRefresh = f; };
export const hotbarSlot = (i: number) => el.children[i] as HTMLElement | undefined;
export const hotbarRef = (i: number) => slots[i];
/** Empty slot i (right-click on the bar; a long press on the phone's skill ring). */
export function clearSlot(i: number) { slots[i] = null; save(); refreshHotbar(); }
export function setSlot(i: number, ref: Ref | null) { slots[i] = ref; save(); refreshHotbar(); }
export function refreshHotbar() {
  const P = game().P, g = game();
  slots.forEach((r, i) => {
    const s = el.children[i] as HTMLElement; const ic = s.querySelector<HTMLElement>(".ic")!, n = s.querySelector(".n")!, cd = s.querySelector<HTMLElement>(".cd")!, mp = s.querySelector(".mp")!;
    mp.textContent = ""; s.classList.remove("nomp", "noweapon"); s.querySelector(".k")!.textContent = keyName(keyOf(`hb${i + 1}`));   // the key bound in Hotkeys
    if (!r) { ic.innerHTML = ""; delete ic.dataset.id; n.textContent = ""; cd.style.transform = "scaleY(0)"; return; }   // forget the id too, or the same item put back would never be redrawn
    if (r.kind === "skill") {
      // the attack slot shows what the weapon in hand actually does (sword swing, bow shot, blue fire) and its cost
      const id = r.id === "SKILL_BASIC" ? attackSkill(P.equip, P.inv, P.mp) : r.id, d = SKILLS[id];
      if (ic.dataset.id !== id) { ic.innerHTML = icon(id, d.icon); ic.dataset.id = id; }
      n.textContent = ""; s.style.opacity = P.skills?.includes(r.id) ? "1" : ".4"; cd.style.transform = `scaleY(${Math.min(1, (P.cd[r.id] ?? 0) / (d.cooldown * (r.id === "SKILL_BASIC" ? 1 / (P.ASPD ?? 1) : 1 - (P.CDR ?? 0))))})`;
      if (d.mana) { mp.textContent = String(d.mana); s.classList.toggle("nomp", P.mp < d.mana); }
      const fits = skillFits(id, P.equip); s.classList.toggle("noweapon", !fits);   // greyed while the weapon in hand cannot use it
      s.title = `${d.name}${d.mana ? ` · MP ${d.mana}` : ""}${d.ammo ? ` · ลูกธนู ${d.ammo}` : ""} · ${skillWeaponText(id)}${fits ? "" : " (อาวุธที่ถือใช้ไม่ได้)"}`;
    }
    else { const d = ITEMS[r.id]; const c = countOf(P.inv, r.id); if (ic.dataset.id !== r.id) { ic.innerHTML = icon(r.id, d.icon); ic.dataset.id = r.id; } n.textContent = String(c); s.style.opacity = c ? "1" : ".4"; cd.style.transform = `scaleY(${Math.min(1, (P.itemCd ?? 0) / (d.cooldown ?? 1))})`; }
  });
  afterRefresh?.();
}
