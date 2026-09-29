import { upgradeOver } from "@shared/equipment";
import { droppedBy } from "@shared/codex";
// Inventory (tabs item / equip / etc) + Equip window. Click = use/equip, drag = hotbar. Data from shared/inventory + equipment.
import { ITEMS, ItemDef, modsText } from "@shared/data";
import { game } from "./api";
import { body, createWindow, setHTML } from "./windows";
import { startDrag } from "./hotbar";
import { sys } from "./chat";
import { icon } from "./icons";
import { offerFromBag } from "./trade";

type Tab = "item" | "food" | "equip" | "etc" | "pantry";   // pantry: cooking ingredients, kept apart from the bag (shared/cooking.ts)
let tab: Tab = "item";
// item: things you use (potions, skill tomes, blueprints) · equip: gear · etc: materials, keys, arrows
const inTab = (d: ItemDef, t: Tab) => t === "food" ? !!d.food : t === "item" ? ["Consumable", "Book", "Scroll"].includes(d.type) && !d.food : t === "equip" ? d.type === "Weapon" || d.type === "Armor" : ["Material", "Key", "Ammo"].includes(d.type);   // dishes have their own tab

export function setupInventory() {
  createWindow("inventory", "Inventory", `<div class="tabs"><button data-tab="item" class="on">item</button><button data-tab="food">🍱 อาหาร</button><button data-tab="equip">equip</button><button data-tab="etc">etc</button><button data-tab="pantry">🧺 วัตถุดิบ</button></div>
    <div class="grid" id="inv-grid"></div><div class="row" style="color:#7a5a3a;margin-top:6px"><span id="inv-cap">0 / 30</span><b id="inv-gold">Gold 0</b></div>
    <div class="hint">คลิก = ใช้/สวม · ลากลง hotbar</div>`);
  body("inventory").addEventListener("click", e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]"); if (t) { tab = t.dataset.tab as Tab; for (const x of body("inventory").querySelectorAll("[data-tab]")) x.classList.toggle("on", x === t); return; }
    const s = (e.target as HTMLElement).closest<HTMLElement>("[data-inst]"); if (!s) return;
    if (!offerFromBag(s.dataset.inst!)) game().useItem(s.dataset.inst!);
  });
  body("inventory").addEventListener("pointerdown", e => { const s = (e.target as HTMLElement).closest<HTMLElement>("[data-inst]"); if (s && s.dataset.kind === "item") startDrag(e as PointerEvent, { kind: "item", id: s.dataset.item! }, icon(s.dataset.item!)); });
}
export function refreshInventory() {
  const P = game().P;
  if (tab === "pantry") {   // the ingredients live outside the bag: counts only, cooked into food at a campfire
    const pan = Object.entries(P.pantry ?? {}).filter(([, n]) => n > 0);
    setHTML(document.getElementById("inv-grid")!, pan.map(([id, n]) => `<div class="slot" title="${ITEMS[id]?.name ?? id} — ${ITEMS[id]?.desc ?? ""}"><span class="ic">${icon(id, ITEMS[id]?.icon)}</span><span class="n">${n}</span></div>`).join("")
      || `<div class="hint" style="grid-column:1/-1">ยังไม่มีวัตถุดิบ — ล่ามอนสเตอร์แล้วนำไปทำอาหารที่กองไฟ 🔥</div>`);
    document.getElementById("inv-cap")!.textContent = "ไม่กินช่องกระเป๋า"; document.getElementById("inv-gold")!.textContent = `Gold ${P.gold}`; return;
  }
  const items = P.inv.items.filter(s => inTab(ITEMS[s.itemId], tab));
  setHTML(document.getElementById("inv-grid")!, items.map(s => { const d = ITEMS[s.itemId]; return `<div class="slot" data-inst="${s.id}" data-item="${s.itemId}" data-kind="${d.type === "Consumable" ? "item" : "gear"}" title="${d.name}${d.heal ? ` — ฟื้น ${d.heal} HP` : ""}${d.mods ? " — " + modsText(s.itemId) : ""}${d.desc ? "\n" + d.desc : ""}${droppedBy(s.itemId) ? "\n" + droppedBy(s.itemId) : ""}">${icon(s.itemId, d.icon)}${s.count > 1 ? `<span class="n">${s.count}</span>` : ""}${upgradeOver(s.itemId, P.eq) > 0 ? `<span class="up" title="ดีกว่าของที่ใส่อยู่">▲</span>` : ""}</div>`; }).join("")
    + `<div class="slot" style="opacity:.35"></div>`.repeat(Math.max(0, P.inv.capacity - P.inv.items.length)));   // every free slot of the bag
  document.getElementById("inv-cap")!.textContent = `${P.inv.items.length} / ${P.inv.capacity}`; document.getElementById("inv-gold")!.textContent = `Gold ${P.gold}`;
}
