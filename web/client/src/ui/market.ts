// Player market (Cora in Pawhaven): browse and buy other players' listings, or list your own at a price inside
// ±10% of the item's reference price. The sim validates everything; this window only shows and asks.
import { ITEMS, itemName, modsText, priceBand, refPrice } from "@shared/data";
import type { Listing } from "@shared/sim";
import { game } from "./api";
import { icon } from "./icons";
import { body, createWindow, isOpen, toggleWindow, setHTML } from "./windows";

let list: Listing[] = [], tab: "buy" | "sell" = "buy";

export function setupMarket() {
  createWindow("market", "ตลาด", "");
  const el = body("market");
  el.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]"); if (!b) return;
    const [act, arg] = b.dataset.act!.split(":"), g = game();
    if (act === "tab") { tab = arg as typeof tab; return refreshMarket(); }
    if (act === "buy") g.market("marketBuy", arg);
    if (act === "cancel") g.market("marketCancel", arg);
    if (act === "list") {
      const row = b.closest<HTMLElement>("[data-inst]")!;
      const count = +(row.querySelector<HTMLInputElement>("[name=count]")!.value), price = +(row.querySelector<HTMLInputElement>("[name=price]")!.value);
      g.market("marketList", arg, count, price);
    }
  });
}
export function openMarket() { toggleWindow("market", true); game().market("marketOpen"); refreshMarket(); }
export function onMarket(l: Listing[]) { list = l; refreshMarket(); }

function refreshMarket() {
  if (!isOpen("market")) return;
  const P = game().P, el = body("market");
  let html = `<div class="tabs"><button data-act="tab:buy" class="${tab === "buy" ? "on" : ""}">ซื้อ (${list.length})</button><button data-act="tab:sell" class="${tab === "sell" ? "on" : ""}">ขาย</button></div>`;
  if (tab === "buy") {
    html += list.length ? list.map(l => `<div class="shoprow"><span><span class="ic">${icon(l.itemId, ITEMS[l.itemId]?.icon)}</span>${itemName(l.itemId)} ×${l.count}
        <br><small>${l.price} G/ชิ้น · รวม <b>${l.price * l.count}</b> G · ผู้ขาย ${l.sellerName}${ITEMS[l.itemId]?.mods ? ` · ${modsText(l.itemId)}` : ""}</small></span>
        ${l.seller === P.id ? `<button data-act="cancel:${l.id}">ยกเลิก</button>` : `<button data-act="buy:${l.id}" ${P.gold < l.price * l.count ? "disabled" : ""}>ซื้อ</button>`}</div>`).join("")
      : `<div class="hint">ยังไม่มีใครลงขาย — ลองลงขายของคุณในแท็บ "ขาย"</div>`;
  } else {
    const items = P.inv.items.filter(s => !ITEMS[s.itemId]?.bound);
    html += `<div class="hint">ราคาต่อชิ้นต้องอยู่ใน ±10% ของราคากลาง · ลงขายได้สูงสุด 10 รายการ</div>` + items.map(s => {
      const b = priceBand(s.itemId);
      return `<div class="shoprow" data-inst="${s.id}"><span><span class="ic">${icon(s.itemId, ITEMS[s.itemId]?.icon)}</span>${itemName(s.itemId)} <small>มี ${s.count}</small>
        <br><small>ราคากลาง ${refPrice(s.itemId)} · ช่วง ${b.min}–${b.max}</small></span>
        <span><input name="count" type="number" min="1" max="${s.count}" value="${s.count}" style="width:46px"> × <input name="price" type="number" min="${b.min}" max="${b.max}" value="${refPrice(s.itemId)}" style="width:62px"> <button data-act="list:${s.id}">ลงขาย</button></span></div>`;
    }).join("") + (list.some(l => l.seller === P.id) ? `<div class="hint">รายการของคุณ:</div>` + list.filter(l => l.seller === P.id).map(l => `<div class="shoprow"><span>${itemName(l.itemId)} ×${l.count} · ${l.price} G/ชิ้น</span><button data-act="cancel:${l.id}">ยกเลิก</button></div>`).join("") : "");
  }
  setHTML(el, html);   // unchanged markup is left alone, so numbers typed into the sell rows survive
}
