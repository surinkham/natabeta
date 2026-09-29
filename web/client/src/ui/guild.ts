import { ask } from "./ask";
// Guild window (G, the menu, or the guild stewards): found a guild, or run yours — members and ranks, donations into
// the treasury, buildings, guild skills, the points shop — and the way to the guild grounds. Every rule lives in the
// sim (shared/guild.ts); the window shows the last view the sim sent and asks.
import { BUILDINGS, GUILD_COST, GUILD_SHOP, GUILD_SKILLS, POINTS_PER_GOLD, capacityAt, skillCap, type BuildingId, type GuildSkillId } from "@shared/guild";
import { ITEMS, itemName } from "@shared/data";
import { zoneAt } from "@shared/regions";
import type { GuildView } from "@shared/sim";
import type { GuildSummary } from "@shared/guild";
import { game } from "./api";
import { sys } from "./chat";
import { icon } from "./icons";
import { body, createWindow, isOpen, setHTML, toggleWindow } from "./windows";

let finder: GuildSummary[] | null = null, finderQ = "", finderAsked = 0;
let view: GuildView | null = null, tab: "members" | "build" | "skills" | "shop" = "members", prompt: HTMLElement;
const RANK = { leader: "👑 หัวหน้า", officer: "⭐ รองหัวหน้า", member: "สมาชิก" };

export function setupGuild() {
  createWindow("guild", "กิลด์", `<div id="gd-body"></div>`);
  const el = body("guild");
  el.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-g]"); if (!b) return;
    const [act, arg, arg2] = b.dataset.g!.split(":"), g = game();
    if (act === "tab") { tab = arg as typeof tab; return refreshGuild(); }
    if (act === "create") { const n = (el.querySelector("#gd-name") as HTMLInputElement).value.trim(); if (n) g.guild("guildCreate", n); }
    if (act === "donate") { const n = Math.floor(+(el.querySelector("#gd-gold") as HTMLInputElement).value); if (n > 0) g.guild("guildDonate", n); }
    if (act === "leave") void ask("ออกจากกิลด์?", "", "ออกจากกิลด์").then(ok => { if (ok) g.guild("guildLeave"); });
    if (act === "kick") void ask("เชิญสมาชิกคนนี้ออก?", "", "เชิญออก").then(ok => { if (ok) g.guild("guildKick", arg); });
    if (act === "rank") g.guild("guildPromote", arg, arg2);
    if (act === "up") g.guild("guildUpgrade", arg);
    if (act === "learn") g.guild("guildLearn", arg);
    if (act === "buy") g.guild("guildBuy", arg);
    if (act === "enter") g.guild("guildEnter");
    if (act === "apply") g.guild("guildApply", arg);
    if (act === "approve") g.guild("guildApprove", arg);
    if (act === "reject") g.guild("guildReject", arg);
    if (act === "find") { finderQ = (el.querySelector("#gd-find") as HTMLInputElement).value; g.guild("guildList", finderQ); }
    if (act === "exit") g.guild("guildExit");
  });
  prompt = Object.assign(document.createElement("div"), { id: "gdinvite", className: "hud frame", hidden: true });
  document.body.append(prompt);
  prompt.addEventListener("click", e => { const a = (e.target as HTMLElement).dataset.act; if (!a) return; if (a === "yes") game().guild("guildAccept"); prompt.hidden = true; });
  addEventListener("keydown", e => { if (e.code === "KeyG" && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) { toggleWindow("guild"); refreshGuild(); } });
  refreshGuild();
}
export function onGuildView(v: GuildView | null) { view = v; refreshGuild(); }
export function onGuildList(list: GuildSummary[]) { finder = list; refreshGuild(); }
export function onGuildRequest(_from: string, name: string, guild: string) {
  prompt.innerHTML = `<b>${name}</b> ชวนเข้ากิลด์ <b>${guild}</b><div><button data-act="yes">เข้าร่วม</button><button data-act="no">ไม่ล่ะ</button></div>`;
  prompt.hidden = false; sys(`${name} ชวนคุณเข้ากิลด์ ${guild}`, "lvl");
}
export const openGuild = () => { toggleWindow("guild", true); refreshGuild(); };

function refreshGuild() {
  if (!isOpen("guild")) return;
  const P = game().P, el = body("guild").querySelector("#gd-body")!, inHall = zoneAt(P).terrain === "hall";
  const travel = view ? `<button class="gd-go" data-g="${inHall ? "exit" : "enter"}">${inHall ? "🏠 กลับเมือง" : "🏰 ไปลานกิลด์"}</button>` : "";
  if (!view) {
    setHTML(el, `<div class="npcline">ยังไม่มีกิลด์ — ก่อตั้งเองได้ด้วย <b>${GUILD_COST.toLocaleString()} Gold</b> หรือให้หัวหน้ากิลด์คลิกตัวคุณแล้วชวนเข้า<br>
      <small>เริ่มรับสมาชิก ${capacityAt(0)} คน · บริจาคเข้าคลังเพื่ออัปหอกิลด์รับคนเพิ่ม อัปลานฝึก/สกิลกิลด์ และตลาดกิลด์</small></div>
      <div class="gd-create"><input id="gd-name" maxlength="16" placeholder="ชื่อกิลด์ (3–16 ตัว)"><button data-g="create" ${P.gold < GUILD_COST ? "disabled" : ""}>ก่อตั้ง (${GUILD_COST} G)</button></div>`
      + `<h4>🔎 หากิลด์เพื่อสมัคร</h4><div class="gd-create"><input id="gd-find" maxlength="16" placeholder="ค้นหาชื่อกิลด์" value="${finderQ.replace(/"/g, "&quot;")}"><button data-g="find">ค้นหา</button></div>`
      + (finder ? finder.map(f => `<div class="shoprow"><span><b>🏰 ${f.name}</b> <small>หัวหน้า ${f.leader} · หอกิลด์ Lv ${f.hall}</small></span><span><b>${f.members}</b>/${f.capacity} คน ${f.applied ? `<small>ส่งใบสมัครแล้ว</small>` : `<button data-g="apply:${f.id}" ${f.members >= f.capacity ? "disabled" : ""}>สมัคร</button>`}</span></div>`).join("") || `<div class="hint">ไม่พบกิลด์</div>` : `<div class="hint">กำลังโหลดรายชื่อกิลด์…</div>`));
    if (!finder && performance.now() - finderAsked > 3000) { finderAsked = performance.now(); game().guild("guildList", finderQ); }   // first look: ask for the list
    return;
  }
  const me = view.members.find(m => m.uid === view!.me)!, boss = me.rank !== "member", lead = me.rank === "leader";
  let html = `<div class="gd-head"><b>🏰 ${view.name}</b><small>สมาชิก ${view.members.length}/${view.capacity} · คลัง <b>${view.funds.toLocaleString()}</b> G · แต้มของคุณ <b>${me.points}</b></small>${travel}</div>
    <div class="tabs">${([["members", "สมาชิก"], ["build", "สิ่งก่อสร้าง"], ["skills", "สกิลกิลด์"], ["shop", "ร้านกิลด์"]] as const).map(([t, l]) => `<button data-g="tab:${t}" class="${tab === t ? "on" : ""}">${l}</button>`).join("")}</div>`;
  if (tab === "members") {
    if (view.apps?.length) html += `<h4>📨 ใบสมัคร (${view.apps.length})</h4>` + view.apps.map(a => `<div class="shoprow"><span><b>${a.name}</b> <small>Lv ${a.level}</small></span><span><button data-g="approve:${a.uid}">รับ</button> <button class="ghost" data-g="reject:${a.uid}">ปฏิเสธ</button></span></div>`).join("");
    html += `<div class="gd-donate">บริจาค <input id="gd-gold" type="number" min="1" max="${P.gold}" value="${Math.min(P.gold, 100)}"> Gold <button data-g="donate">บริจาค</button><small>(10 G = 1 แต้มกิลด์)</small></div>`
      + view.members.map(m => `<div class="shoprow"><span>${m.online ? "🟢" : "⚪"} <b>${m.name}</b> <small>${RANK[m.rank]} · บริจาค ${m.contrib.toLocaleString()}</small></span><span>
        ${lead && m.uid !== me.uid ? `<button data-g="rank:${m.uid}:${m.rank === "officer" ? "member" : "officer"}">${m.rank === "officer" ? "ปลด" : "ตั้งรอง"}</button>` : ""}
        ${m.uid !== me.uid && (lead || (me.rank === "officer" && m.rank === "member")) ? `<button data-g="kick:${m.uid}">เชิญออก</button>` : ""}</span></div>`).join("")
      + `<div class="btns"><button data-g="leave">ออกจากกิลด์</button></div>`;
  }
  if (tab === "build") html += (Object.keys(BUILDINGS) as BuildingId[]).map(b => {
    const B = BUILDINGS[b], lvl = view!.buildings[b], max = lvl >= B.max, cost = max ? 0 : B.cost(lvl);
    return `<div class="shoprow"><span><b>${B.name}</b> Lv ${lvl}/${B.max}<br><small>ตอนนี้: ${B.desc(lvl)}${max ? "" : ` · ถัดไป: ${B.desc(lvl + 1)}`}</small></span>
      ${max ? "<small>สูงสุด</small>" : `<button data-g="up:${b}" ${!boss || view!.funds < cost ? "disabled" : ""}>อัป ${cost.toLocaleString()} G</button>`}</div>`;
  }).join("") + `<div class="hint">ใช้เงินจากคลังกิลด์ · หัวหน้า/รองหัวหน้าเป็นคนอัป</div>`;
  if (tab === "skills") {
    const cap = skillCap(view.buildings.training);
    html += (Object.keys(GUILD_SKILLS) as GuildSkillId[]).map(s => {
      const S = GUILD_SKILLS[s], lvl = view!.skills[s], cost = S.cost(lvl);
      return `<div class="shoprow"><span>${S.icon} <b>${S.name}</b> Lv ${lvl}/${cap}<br><small>+${S.per * lvl}% ${S.desc} ให้สมาชิกทุกคน${lvl < cap ? ` · ถัดไป +${S.per * (lvl + 1)}%` : ""}</small></span>
        ${lvl >= cap ? "<small>อัปลานฝึกก่อน</small>" : `<button data-g="learn:${s}" ${!boss || view!.funds < cost ? "disabled" : ""}>อัป ${cost.toLocaleString()} G</button>`}</div>`;
    }).join("");
  }
  if (tab === "shop") html += GUILD_SHOP.map(e => {
    const it = ITEMS[e.item], locked = e.tier > view!.buildings.market;
    return `<div class="shoprow"><span><span class="ic">${icon(e.item, it?.icon)}</span>${itemName(e.item)}<br><small>${locked ? `🔒 ตลาดกิลด์ Lv ${e.tier}` : it?.desc ?? ""}</small></span>
      <button data-g="buy:${e.item}" ${locked || me.points < e.points ? "disabled" : ""}>${e.points} แต้ม</button></div>`;
  }).join("") + `<div class="hint">แต้มกิลด์ได้จากการบริจาค (${1 / POINTS_PER_GOLD} G = 1 แต้ม)</div>`;
  setHTML(el, html);
}
setInterval(refreshGuild, 1000);   // online dots and the travel button follow the player
