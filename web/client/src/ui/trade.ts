import { tradeGoldBand } from "@shared/sim";
// Player trade window (W3): request → accept → both offer (click bag items while this window is open, type gold) → both confirm.
// The server owns the trade; this window only mirrors the last TradeView it was sent and forwards intents.
import { ITEMS, itemName } from "@shared/data";
import type { TradeView } from "@shared/sim";
import { game } from "./api";
import { body, createWindow, isOpen, toggleWindow, setHTML } from "./windows";
import { icon } from "./icons";
import { sys } from "./chat";

let view: TradeView | null = null, req: { from: string; name: string } | null = null;
const draft = { items: {} as Record<string, number>, gold: 0 };

export function setupTrade() {
  createWindow("trade", "Trade", "");
  body("trade").addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]"); if (!b) return; const g = game(); const [act, arg] = b.dataset.act!.split(":");
    if (act === "accept" && req) { g.tradeAccept(); req = null; }
    if (act === "decline") { req = null; toggleWindow("trade", false); }
    if (act === "remove") { delete draft.items[arg]; send(); }
    if (act === "confirm") g.tradeConfirm();
    if (act === "cancel") g.tradeCancel();
    refreshTrade();
  });
  body("trade").addEventListener("change", e => { const t = e.target as HTMLInputElement; if (t.id === "tr-gold") { draft.gold = Math.max(0, Math.floor(+t.value || 0)); send(); } });
}
const send = () => game().tradeOffer(draft.items, draft.gold);

/** Inventory click while trading adds the whole stack to the offer (click again in the window to remove). */
export function offerFromBag(instId: string): boolean {
  if (!view || !isOpen("trade")) return false;
  const s = game().P.inv.items.find(i => i.id === instId); if (!s) return true; if (ITEMS[s.itemId].bound) { sys("ไอเทมนี้แลกไม่ได้"); return true; }
  draft.items[instId] = s.count; send(); return true;
}
export function onTradeRequest(from: string, name: string) { req = { from, name }; toggleWindow("trade", true); refreshTrade(); sys(`${name} ขอแลกของ — เปิดหน้าต่าง Trade เพื่อตอบรับ`, "lvl"); }
export function onTradeView(v: TradeView | null) {
  view = v; if (v) { req = null; toggleWindow("trade", true); } else { draft.items = {}; draft.gold = 0; if (isOpen("trade") && !req) toggleWindow("trade", false); }
  refreshTrade();
}
const side = (s: TradeView["mine"], mine: boolean) => `<div class="grid">${s.items.map(i => `<div class="slot" title="${itemName(i.itemId)}" ${mine ? `data-act="remove:${i.inst}"` : ""}>${icon(i.itemId, ITEMS[i.itemId]?.icon)}${i.count > 1 ? `<span class="n">${i.count}</span>` : ""}</div>`).join("")}${`<div class="slot" style="opacity:.35"></div>`.repeat(Math.max(0, 6 - s.items.length))}</div>
  <div class="row"><span>Gold</span>${mine ? `<input id="tr-gold" type="number" min="0" value="${s.gold}" style="width:80px">` : `<b>${s.gold}</b>`}</div>${mine && view ? goldHint(view.theirValue) : ""}<div class="hint">${s.ok ? "✅ ยืนยันแล้ว" : "⏳ ยังไม่ยืนยัน"}</div>`;
const goldHint = (v: number) => { const b = tradeGoldBand(v); return `<div class="hint">${v ? `ราคากลางของที่ได้ ${v} → ใส่ Gold ได้ ${b.min}–${b.max}` : "ใส่ Gold ได้เมื่ออีกฝ่ายเสนอของ"}</div>`; };
export function refreshTrade() {
  if (!isOpen("trade")) return; let html = "";
  if (req) html = `<div class="npcline"><b>${req.name}</b> ขอแลกของกับคุณ</div><div class="btns"><button data-act="accept">ตกลง</button><button data-act="decline">ปฏิเสธ</button></div>`;
  else if (view) html = `<div class="npcline">แลกของกับ <b>${view.withName}</b> — คลิกไอเทมในกระเป๋าเพื่อเสนอ</div><div class="row" style="gap:12px;align-items:flex-start"><div><b>ของฉัน</b>${side(view.mine, true)}</div><div><b>ของ ${view.withName}</b>${side(view.theirs, false)}</div></div>
    <div class="btns"><button data-act="confirm" ${view.mine.ok ? "disabled" : ""}>ยืนยัน</button><button data-act="cancel">ยกเลิก</button></div><div class="hint">ทั้งสองฝ่ายต้องยืนยัน · เปลี่ยนข้อเสนอ = ยืนยันใหม่</div>`;
  else html = `<div class="hint">คลิกผู้เล่นคนอื่น หรือพิมพ์ /trade ชื่อ เพื่อขอแลกของ (ต้องมี Merchant Seal ทั้งคู่)</div>`;
  setHTML(body("trade"), html);
}
