// Phone skill ring (body.touch): instead of the hotbar strip, the hotbar's nine slots sit five at a time on two arcs
// around the attack button, like a mobile action game. "ชุด n/2" turns the ring to the next five. An empty slot is a
// "+" that opens the Skills window (its "ใส่ hotbar" button fills the slot); a potion button sits above the ring.
// The slots are the hotbar's own: the ring copies their look after every hotbar refresh and fires them through it.
import { ITEMS } from "@shared/data";
import { countOf } from "@shared/inventory";
import { game } from "./api";
import { hotbarRef, hotbarSlot, setAfterRefresh, use } from "./hotbar";
import { icon } from "./icons";
import { toggleWindow } from "./windows";
import { openHotbarEditor } from "./hbedit";

const PER = 5, PAGES = 2, SLOTS = 9;   // 2 pages × 5 = 10 places for the 9 hotbar slots: the last is hidden
let page = 0;
try { page = Math.min(PAGES - 1, Math.max(0, +(localStorage.getItem("bk.ringpage") ?? 0) || 0)); } catch {}

export function setupSkillRing() {
  const box = document.getElementById("btns")!;
  const ring = Object.assign(document.createElement("div"), { id: "ring" });
  ring.innerHTML = Array.from({ length: PER }, (_, j) => `<button type="button" class="rs slot" data-j="${j}"></button>`).join("");
  const pot = Object.assign(document.createElement("button"), { id: "potb", type: "button", className: "rs slot" });
  const turn = Object.assign(document.createElement("button"), { id: "ringpage", type: "button" });
  const edit = Object.assign(document.createElement("button"), { id: "ringedit", type: "button", className: "rs slot", title: "จัด Hotbar", textContent: "✎" });
  edit.addEventListener("click", () => openHotbarEditor(page * PER));
  box.append(ring, pot, turn, edit);
  // a tap fires the slot when the finger lifts
  // an aimable skill dragged off its button is aimed instead (the pull sets direction and distance); let go = cast,
  // dragged back onto the button = cancel
  let held: { j: number; timer: number; cleared: boolean; x: number; y: number; aiming?: string } | null = null;
  ring.addEventListener("pointerdown", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-j]"); if (!b) return; e.preventDefault();
    const j = +b.dataset.j!; b.classList.add("down");
    held = { j, cleared: false, x: e.clientX, y: e.clientY, timer: 0 };   // no hold-to-clear: the ring is set in "จัด Hotbar" (✎)
  });
  addEventListener("pointermove", e => {
    if (!held || held.cleared) return; const r = hotbarRef(page * PER + held.j), dx = e.clientX - held.x, dy = e.clientY - held.y, far = Math.hypot(dx, dy) > 18;
    if (!held.aiming && (!far || r?.kind !== "skill" || !game().aimKind(r.id))) return;
    if (!held.aiming) { held.aiming = r!.id; clearTimeout(held.timer); }
    game().aimAt(held.aiming, far ? { dx, dy } : null);
  });
  const lift = (fire: boolean) => (e: PointerEvent) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLElement>("#ring [data-j]") : null; ring.querySelectorAll(".down").forEach(x => x.classList.remove("down"));
    if (!held) return; clearTimeout(held.timer); const h = held; held = null;
    if (h.aiming) { if (fire) game().aimCast(); else game().aimAt(h.aiming, null); return; }   // aimed: cast where it points (a cancelled aim is already cleared)
    if (!fire || h.cleared || !b || +b.dataset.j! !== h.j) return;
    const i = page * PER + h.j; if (hotbarRef(i)) use(i); else openHotbarEditor(i);   // an empty slot: choose what goes in it
  };
  // on window: a finger that slides off the slot and lifts elsewhere still ends the press (and does not fire)
  addEventListener("pointerup", lift(true)); addEventListener("pointercancel", lift(false));
  ring.addEventListener("contextmenu", e => e.preventDefault());   // a long press is ours, not the browser's menu
  pot.addEventListener("pointerdown", e => { e.preventDefault(); const it = potion(); if (it) { const inst = game().P.inv.items.find(s => s.itemId === it); if (inst) game().useItem(inst.id); } });
  turn.addEventListener("pointerdown", e => {
    e.preventDefault(); page = (page + 1) % PAGES; try { localStorage.setItem("bk.ringpage", String(page)); } catch {}
    ring.classList.remove("spin"); void ring.offsetWidth; ring.classList.add("spin"); refreshRing();   // the ring turns to the next set
  });
  setAfterRefresh(refreshRing); refreshRing();
}

/** The healing potion the button drinks: the first one on the hotbar, else the first one in the bag. */
function potion() {
  const P = game().P, heals = (id: string) => !!ITEMS[id]?.heal && countOf(P.inv, id) > 0;
  for (let i = 0; i < 9; i++) { const r = hotbarRef(i); if (r?.kind === "item" && heals(r.id)) return r.id; }
  return P.inv.items.find(s => ITEMS[s.itemId]?.type === "Consumable" && heals(s.itemId))?.itemId;
}

function refreshRing() {
  const ring = document.getElementById("ring"); if (!ring) return;
  ring.querySelectorAll<HTMLElement>("[data-j]").forEach(b => {
    const i = page * PER + +b.dataset.j!, src = hotbarSlot(i); b.hidden = i >= SLOTS; if (b.hidden) return;
    if (!hotbarRef(i) || !src) { if (b.dataset.sig !== "+") { b.innerHTML = `<span class="plus">+</span>`; b.dataset.sig = "+"; } b.style.opacity = ""; b.className = "rs slot empty"; return; }
    // same icon, cooldown sweep, MP cost and count as the hotbar slot (only rebuilt when the slot's markup changed)
    if (b.dataset.sig !== src.innerHTML) { b.innerHTML = src.innerHTML; b.dataset.sig = src.innerHTML; }
    b.style.opacity = src.style.opacity; b.className = "rs slot" + (src.classList.contains("nomp") ? " nomp" : "") + (src.classList.contains("noweapon") ? " noweapon" : ""); b.title = src.title;
  });
  const pot = document.getElementById("potb")!, id = potion();
  const sig = id ? `${id}:${countOf(game().P.inv, id)}` : "";
  if (pot.dataset.sig !== sig) { pot.dataset.sig = sig; pot.innerHTML = id ? `<span class="ic">${icon(id, ITEMS[id].icon)}</span><span class="n">${countOf(game().P.inv, id)}</span>` : `<span class="plus">🧪</span>`; }
  pot.style.opacity = id ? "1" : ".45";
  document.getElementById("ringpage")!.innerHTML = `ชุด <b>${page + 1}</b>/${PAGES}`;
}
