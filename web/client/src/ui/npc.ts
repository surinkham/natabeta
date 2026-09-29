import { droppedBy } from "@shared/codex";
import { ask, askCount } from "./ask";
import { upgradeOver } from "@shared/equipment";
import { openGuild } from "./guild";
// NPC dialog window: talk lines + kind-specific panel (craft / shop / stylist).
import { speak } from "../audio/audio";
import { openMarket } from "./market";
import { ITEMS, RECIPES, itemName, modsText } from "@shared/data";
import { canCraft } from "@shared/crafting";
import { countOf } from "@shared/inventory";
import { game } from "./api";
import { body, createWindow, toggleWindow, setHTML } from "./windows";
import { sys } from "./chat";
import type { Npc } from "../world/npc";
import { icon } from "./icons";
import { skillRow } from "./skills";
import { MONSTERS, SKILLS } from "@shared/data";
import { QUESTS_PER_DAY, boardFor, logFor, questDay, type QuestLog } from "@shared/quests";
import { monsterInfo } from "@shared/codex";

let current: Npc | null = null;
// craft NPCs get tabs: recipes split by what they make, plus the shop counter if they also sell
type Tab = "weapon" | "armor" | "misc" | "shop";
const TABS: [Tab, string][] = [["weapon", "⚔ อาวุธ"], ["armor", "🛡 ชุดเกราะ"], ["misc", "🧪 ของใช้"], ["shop", "🪙 ร้านค้า"]];
let tab: Tab = "weapon";
// a shop counter has two sides: the stock to buy, and the bag laid out like the bag window to sell from
let shopMode: "buy" | "sell" = "buy", sellStack = false, sellKind: "item" | "gear" = "item";   // sell side: items (materials, potions…) or gear
const GEAR = new Set(["Weapon", "Armor", "Accessory"]);
const sellable = (id: string) => { const d = ITEMS[id]; return !!d && d.sell > 0 && !d.bound; };
const tabOf = (recipeId: string): Tab => { const t = ITEMS[RECIPES[recipeId].result]?.type; return t === "Weapon" ? "weapon" : t === "Armor" ? "armor" : "misc"; };
const have = (ok: boolean, text: string) => `<span class="${ok ? "ok" : "no"}">${text}</span>`;
const COLORS = [0, 0xe8963a, 0xf2d9b0, 0x6b4a2b, 0x222222, 0xc9c9c9, 0x9a5b8f];

export function setupNpc() {
  createWindow("npc", "NPC", "");
  body("npc").addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]"); if (!b || !current) return;
    const g = game(); const [act, arg] = b.dataset.act!.split(":");
    if (act === "craft") g.craft(arg);
    if (act === "buy") g.buy(arg, +b.dataset.n!);
    if (act === "sell") g.sell(arg, +b.dataset.n!);
    if (act === "color") g.restyle(+arg);
    if (act === "learn") g.learn(arg);
    if (act === "qtake") g.quest("questAccept", arg);
    if (act === "qdone") g.quest("questTurnIn", arg);
    if (act === "qdrop") void ask("ทิ้งเควสนี้?", "จำนวนที่รับวันนี้ไม่คืน", "ทิ้งเควส").then(ok => { if (ok) g.quest("questAbandon", arg); });
    if (act === "close") toggleWindow("npc", false);
    if (act === "tab") { tab = arg as Tab; body("npc").scrollTop = 0; }
    if (act === "mode") { shopMode = arg as typeof shopMode; body("npc").scrollTop = 0; }
    if (act === "stack") sellStack = !sellStack;
    if (act === "sellkind") sellKind = arg as typeof sellKind;
    if (act === "sellslot") {
      const d = ITEMS[arg], have = countOf(g.P.inv, arg), n = sellStack ? have : 1;
      // several in the stack (and not "sell the whole stack"): ask how many
      if (have > 1 && !sellStack) void askCount(`ขาย ${d.name} กี่ชิ้น?`, have, k => `${k} ชิ้น · ได้ ${(d.sell * k).toLocaleString()} Gold`, "ขาย").then(k => { if (k > 0) g.sell(arg, k); refreshNpc(); });
      // gear is rarely sold on purpose: ask first
      else if (n > 0 && !GEAR.has(d.type)) g.sell(arg, n);
      else if (n > 0) void ask(`ขาย ${d.name}${n > 1 ? ` ×${n}` : ""}?`, `ได้ ${d.sell * n} Gold`, "ขาย").then(ok => { if (ok) g.sell(arg, n); });
    }
    refreshNpc();
  });
}
export function openNpc(n: Npc) {
  if (n.def.kind === "quest") { current = n; refreshNpc(); toggleWindow("npc", true); return; }   // a board: no voice
  if (n.def.kind === "guild") { speak(n.def.lines[0], n.def.species ?? "dog"); return openGuild(); } if (n.def.kind === "market") { speak(n.def.lines[0], n.def.species ?? "cat"); return openMarket(); } if (current !== n) { tab = "weapon"; shopMode = "buy"; } current = n; refreshNpc(); toggleWindow("npc", true); speak(n.def.lines[n.line % n.def.lines.length], n.def.species ?? (/mouse|หนู|Mira/i.test(n.def.name) ? "mouse" : /cat|แมว|Mei|Stylist|ช่างแต่ง/i.test(n.def.name) ? "cat" : "dog")); }
export function refreshNpc() {
  if (!current || document.getElementById("win-npc")!.hidden) return;
  const P = game().P, d = current.def; let html = `<div class="npcline"><b>${d.name}</b><br>${d.lines[current.line % d.lines.length]}</div>`;
  const craft = d.kind === "craft";
  if (craft) {
    const all = [...d.recipes!, ...(P.recipes ?? [])];
    html += `<div class="tabs npc-tabs">${TABS.filter(([t]) => t !== "shop" || d.stock).map(([t, label]) => `<button data-act="tab:${t}" class="${tab === t ? "on" : ""}">${label} <small>${t === "shop" ? d.stock!.length : all.filter(id => tabOf(id) === t).length}</small></button>`).join("")}</div>`;
    if (tab !== "shop") html += all.filter(id => tabOf(id) === tab).map(id => {
      const r = RECIPES[id], it = ITEMS[r.result], c = canCraft(P.inv, P.gold, r);
      return `<div class="shoprow${c.ok ? " can" : ""}"><span><span class="ic">${icon(r.result, it?.icon)}</span><b>${itemName(r.result)}</b>${r.count > 1 ? ` ×${r.count}` : ""}${r.secret ? ` <em class="tag">สูตรลับ</em>` : ""}
        ${it?.mods ? `<br><small class="mods">${modsText(r.result)}</small>` : ""}
        <br><small>${r.ingredients.map(i => have(countOf(P.inv, i.item) >= i.count, `${itemName(i.item)} ${countOf(P.inv, i.item)}/${i.count}`)).join(" · ")} · ${have(P.gold >= r.gold, `💰 ${r.gold}`)}</small></span>
        <button data-act="craft:${id}" ${c.ok ? "" : "disabled"} title="${c.reason ?? ""}">Craft</button></div>`;
    }).join("") || `<div class="hint">ยังไม่มีสูตรในหมวดนี้</div>`;
  }
  if (d.stock && (!craft || tab === "shop")) {
    html += `<div class="tabs shop-mode"><button data-act="mode:buy" class="${shopMode === "buy" ? "on" : ""}">🛒 ซื้อ</button><button data-act="mode:sell" class="${shopMode === "sell" ? "on" : ""}">💰 ขาย</button><span class="gold">💰 ${P.gold.toLocaleString()}</span></div>`;
    if (shopMode === "buy") html += d.stock.map(id => { const it = ITEMS[id]; return `<div class="shoprow"><span><span class="ic">${icon(id, it.icon)}</span>${it.name}${upgradeOver(id, P.eq) > 0 ? ` <b class="up-tag">▲ ดีกว่าที่ใส่</b>` : ""} <small>${it.buy} Gold · มี ${it.type === "Ingredient" ? `${P.pantry?.[id] ?? 0} (วัตถุดิบ)` : countOf(P.inv, id)}</small>${it.mods ? `<br><small class="mods">${modsText(id)}</small>` : ""}${it.desc ? `<br><small>${it.desc}</small>` : ""}${droppedBy(id) ? `<br><small class="cx-fx">${droppedBy(id)}</small>` : ""}</span><span><button data-act="buy:${id}" data-n="1" ${P.gold < it.buy ? "disabled" : ""}>ซื้อ 1</button> <button data-act="buy:${id}" data-n="10" ${P.gold < it.buy * 10 ? "disabled" : ""}>10</button>${it.type === "Ammo" ? ` <button data-act="buy:${id}" data-n="100">100</button>` : ""}</span></div>`; }).join("");
    else {
      const all = P.inv.items.filter(s => sellable(s.itemId)), isGear = (id: string) => GEAR.has(ITEMS[id].type), nGear = all.filter(s => isGear(s.itemId)).length;
      const stacks = all.filter(s => isGear(s.itemId) === (sellKind === "gear")), total = stacks.reduce((g, s) => g + ITEMS[s.itemId].sell * s.count, 0);
      html += `<div class="tabs sell-kind"><button data-act="sellkind:item" class="${sellKind === "item" ? "on" : ""}">🧪 ไอเทม <small>${all.length - nGear}</small></button><button data-act="sellkind:gear" class="${sellKind === "gear" ? "on" : ""}">🛡 อุปกรณ์ <small>${nGear}</small></button></div>`
        + `<div class="sell-bar"><label><input type="checkbox" data-act="stack" ${sellStack ? "checked" : ""}> ขายทั้งกอง</label><small>แตะช่องเพื่อขาย${sellStack ? "ทั้งกอง" : "ทีละชิ้น"} · อาวุธ/ชุดจะถามก่อน</small></div>`
        + (stacks.length ? `<div class="grid sell-grid">${stacks.map(s => { const it = ITEMS[s.itemId]; return `<div class="slot" data-act="sellslot:${s.itemId}" title="${it.name} — ขายชิ้นละ ${it.sell} Gold${it.mods ? " — " + modsText(s.itemId) : ""}${droppedBy(s.itemId) ? "\n" + droppedBy(s.itemId) : ""}">${icon(s.itemId, it.icon)}${s.count > 1 ? `<span class="n">${s.count}</span>` : ""}<span class="price">${it.sell}</span></div>`; }).join("")}</div>
          <div class="hint">ขาย${sellKind === "gear" ? "อุปกรณ์" : "ไอเทม"}ทั้งหมดได้ ${total.toLocaleString()} Gold</div>` : `<div class="hint">ไม่มี${sellKind === "gear" ? "อุปกรณ์" : "ไอเทม"}ที่ขายได้</div>`);
    }
  }
  if (d.kind === "quest") html += questBoard(P as unknown as { level: number; quests?: QuestLog });
  if (d.kind === "skillshop") html += d.skills!.map(id => skillRow(id, (P.skills ?? []).includes(id), SKILLS[id].price)).join("") + `<div class="hint">มี ${P.gold} Gold</div>`;
  if (d.kind === "stylist") html += `<div class="btns">${COLORS.map(c => `<button data-act="color:${c}" title="${c ? "" : "สีตามพันธุ์"}" style="background:${c ? "#" + c.toString(16).padStart(6, "0") : "conic-gradient(#db9a47 0 33%, #757a8a 0 66%, #f2e6cc 0)"};width:28px;height:28px;border-radius:50%"></button>`).join("")}</div><div class="hint">ครั้งละ ${d.price} Gold (มี ${P.gold})</div>`;
  html += `<div class="btns"><button data-act="close">ปิด</button></div>`;
  setHTML(body("npc"), html);   // the HUD refreshes 10×/s: don't rebuild (and jump) when nothing changed
  document.querySelector("#win-npc header span")!.textContent = d.name;
}
export const currentNpc = () => current;

// ---------------------------------------------------------------- the guild quest board (shared/quests.ts)
const where = new Map<string, string>();   // monster kind -> the first map it lives in (for the notice)
const whereOf = (kind: string) => where.get(kind) ?? (where.set(kind, monsterInfo(kind).zones[0] ?? ""), where.get(kind)!);
function questBoard(P: { level: number; quests?: QuestLog }) {
  const day = questDay(), log = logFor(P.quests, day), board = boardFor(day, P.level), full = log.taken >= QUESTS_PER_DAY || log.active.length >= QUESTS_PER_DAY;
  const row = (kind: string, need: number, gold: number, right: string, sub = "") => { const m = MONSTERS[kind];
    return `<div class="shoprow"><span><b>ล่า ${m?.name ?? kind} ×${need}</b> <small>Lv ${m?.level ?? "?"}</small><br><small>📍 ${whereOf(kind) || "—"} · 💰 ${gold.toLocaleString()} Gold</small>${sub}</span>${right}</div>`; };
  let h = `<div class="hint">รับวันนี้ <b>${log.taken}/${QUESTS_PER_DAY}</b> · ถืออยู่ ${log.active.length}/${QUESTS_PER_DAY} · เริ่มนับใหม่เที่ยงคืน</div>`;
  h += `<h4>📜 เควสที่รับไว้</h4>` + (log.active.map(q => {
    const done = q.have >= q.need;
    return row(q.kind, q.need, q.gold, done ? `<button data-act="qdone:${q.id}">ส่งเควส</button>` : `<button data-act="qdrop:${q.id}" class="ghost">ทิ้ง</button>`,
      `<br><small class="${done ? "ok" : ""}">${done ? "✅ ครบแล้ว — ส่งได้เลย" : `ล่าแล้ว ${q.have}/${q.need}`}</small>`);
  }).join("") || `<div class="hint">ยังไม่มีเควส — เลือกงานจากกระดานด้านล่าง</div>`);
  const open = board.filter(q => !log.active.some(a => a.id === q.id));
  h += `<h4>🗒 งานบนกระดานวันนี้</h4>` + (open.map(q => row(q.kind, q.need, q.gold, `<button data-act="qtake:${q.id}" ${full ? "disabled" : ""}>รับเควส</button>`)).join("") || `<div class="hint">รับงานของวันนี้ไปหมดแล้ว</div>`);
  return h;
}
