import { setHTML } from "./windows";
// Party (up to 5): the member list on the left edge, the menu you get by clicking another player, and the invite prompt.
// Membership lives in the sim; every player view carries its party id, so the list is just "views with my party id".
import { PARTY_MAX } from "@shared/sim";
import { game } from "./api";
import { sys } from "./chat";
import "./party.css";

let panel: HTMLElement, menu: HTMLElement, prompt: HTMLElement, invite: { from: string; name: string } | null = null, rulesOpen = false;
const EXP_TH = { share: "แบ่งเท่ากัน", each: "ใครฆ่าได้คนนั้น" }, LOOT_TH = { party: "ของส่วนกลาง", own: "ของคนฆ่า", random: "สุ่มเจ้าของ" };

export function setupParty() {
  panel = Object.assign(document.createElement("div"), { id: "party", className: "hud frame", hidden: true });
  menu = Object.assign(document.createElement("div"), { id: "pmenu", className: "hud frame", hidden: true });
  prompt = Object.assign(document.createElement("div"), { id: "pinvite", className: "hud frame", hidden: true });
  document.body.append(panel, menu, prompt);
  panel.addEventListener("click", e => {
    const b = e.target as HTMLElement;
    if (b.dataset.act === "leave") game().partyLeave();
    if (b.dataset.act === "kick" && b.dataset.id) game().partyKick(b.dataset.id);
    if (b.dataset.act === "rules") { rulesOpen = !rulesOpen; refreshParty(); }
    const set = b.closest<HTMLElement>("[data-rule]"); if (set) { const r = { ...(game().P.partyRule ?? { exp: "share", loot: "party" }), [set.dataset.rule!]: set.dataset.v! }; game().partyRules(r.exp, r.loot); }
  });
  menu.addEventListener("click", e => {
    const act = (e.target as HTMLElement).dataset.act, id = menu.dataset.id!; menu.hidden = true;
    if (act === "party") game().partyInvite(id); if (act === "trade") game().tradeReq(id); if (act === "guild") game().guild("guildInvite", id); if (act === "friend") game().social("friendAdd", id);
  });
  prompt.addEventListener("click", e => {
    const act = (e.target as HTMLElement).dataset.act; if (!act) return;
    if (act === "yes") game().partyAccept(); prompt.hidden = true; invite = null;
  });
  addEventListener("pointerdown", e => { if (!menu.hidden && !menu.contains(e.target as Node)) menu.hidden = true; }, true);
}

/** Clicked another player: choose between inviting and trading. */
export function openPlayerMenu(id: string, name: string, x: number, y: number) {
  const g = game(), mine = g.P.party && [...g.mobs.values()].some(m => m.id === id && (m.view as any).party === g.P.party);
  menu.dataset.id = id;
  menu.innerHTML = `<b>${name}</b><button data-act="party" ${mine ? "disabled" : ""}>${mine ? "อยู่ปาร์ตี้เดียวกัน" : "ชวนเข้าปาร์ตี้"}</button><button data-act="trade">ขอแลกของ</button><button data-act="guild">ชวนเข้ากิลด์</button><button data-act="friend">เพิ่มเพื่อน</button>`;
  menu.style.left = Math.min(innerWidth - 170, x + 12) + "px"; menu.style.top = Math.min(innerHeight - 120, y) + "px"; menu.hidden = false;
}

export function onPartyRequest(from: string, name: string) {
  invite = { from, name };
  prompt.innerHTML = `<b>${name}</b> ชวนเข้าปาร์ตี้<div><button data-act="yes">เข้าร่วม</button><button data-act="no">ไม่ล่ะ</button></div>`;
  prompt.hidden = false; sys(`${name} ชวนคุณเข้าปาร์ตี้`, "lvl");
}

/** 10 Hz from the HUD: me first, then everyone sharing my party id. */
export function refreshParty() {
  const g = game(), P = g.P;
  if (!P.party) { panel.hidden = true; return; }
  const others = [...g.mobs.values()].filter(m => m.kind === "player" && (m.view as any).party === P.party);
  // far = beyond the 40 m in which a kill's EXP and a pile of gold are shared (the sim's PARTY_SHARE_R)
  const rows = [{ id: P.id, name: P.name, level: P.level, hp: P.hp, maxHP: P.maxHP, alive: P.alive, far: false }, ...others.map(m => ({ id: m.id, name: m.name, level: m.level, hp: m.view.hp, maxHP: m.view.maxHP, alive: m.view.alive, far: m.pos.distanceTo(P.pos) > 40 }))];
  const lead = P.party === P.id, rule = P.partyRule ?? { exp: "share", loot: "party" };
  const seg = (k: "exp" | "loot", opts: Record<string, string>) => `<div class="pr-seg">${Object.entries(opts).map(([v, l]) => `<button data-rule="${k}" data-v="${v}" class="${(rule as any)[k] === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const html = `<header><span class="pt-title">🐾 ปาร์ตี้</span><small>${rows.length}/${PARTY_MAX}</small>${lead ? `<button data-act="rules" class="pt-gear${rulesOpen ? " on" : ""}" title="ตั้งค่าการแบ่ง">⚙</button>` : ""}<button data-act="leave" title="ออกจากปาร์ตี้">ออก</button></header>`
    + `<div class="pr-chips"><span>EXP: ${EXP_TH[rule.exp]}</span><span>ของ: ${LOOT_TH[rule.loot]}</span></div>`
    + (lead && rulesOpen ? `<div class="pr-set"><small>แบ่ง EXP</small>${seg("exp", EXP_TH)}<small>แบ่งของ</small>${seg("loot", LOOT_TH)}</div>` : "")
    + rows.map(r => { const pct = Math.max(0, Math.min(1, r.hp / r.maxHP)) * 100;
      return `<div class="pm${r.id === P.id ? " me" : ""}${r.alive ? "" : " dead"}"><span class="pm-name">${r.id === P.party ? "👑 " : ""}${r.name}</span><small class="pm-lv">Lv ${r.level}${r.far ? " · ไกล" : ""}</small>${lead && r.id !== P.id ? `<button data-act="kick" data-id="${r.id}" title="เชิญออกจากปาร์ตี้">✕</button>` : ""}<i><b class="${pct < 30 ? "low" : ""}" style="width:${pct}%"></b><em>${r.alive ? `${Math.max(0, Math.round(r.hp))}/${r.maxHP}` : "หมดสติ"}</em></i></div>`; }).join("");
  setHTML(panel, html);
  panel.hidden = false;
}
