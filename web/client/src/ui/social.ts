// Friends and rankings (the Players window's two buttons). Every rule lives in the sim (shared/friends.ts, Sim.ranking);
// these windows show the last view it sent and ask. Adding a friend: click their character → "เพิ่มเพื่อน".
import type { FriendView, RankRow } from "@shared/sim";
import type { GuildSummary } from "@shared/guild";
import { BREEDS } from "@shared/data";
import { ask } from "./ask";
import { game } from "./api";
import { sys } from "./chat";
import { body, createWindow, isOpen, setHTML, toggleWindow } from "./windows";

let friends: FriendView = { friends: [], pending: [] }, ranks: { players: RankRow[]; guilds: GuildSummary[] } = { players: [], guilds: [] }, rankTab: "players" | "guilds" = "players";
const esc = (s: string) => s.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);

export function setupSocial() {
  createWindow("friends", "เพื่อน", `<div id="fr-body"></div>`);
  createWindow("ranking", "แรงกิ้ง", `<div id="rk-body"></div>`);
  body("friends").addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-fr]"); if (!b) return; const [act, uid] = b.dataset.fr!.split(":"), g = game();
    if (act === "accept") g.social("friendAccept", uid);
    if (act === "decline") g.social("friendDecline", uid);
    if (act === "remove") void ask("ลบเพื่อนคนนี้?", "", "ลบเพื่อน").then(ok => { if (ok) g.social("friendRemove", uid); });
  });
  body("ranking").addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-rk]"); if (!b) return; rankTab = b.dataset.rk as typeof rankTab; drawRanking(); });
  document.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-social]"); if (!b) return;
    if (b.dataset.social === "friends") openFriends(); else openRanking();
  });
  addEventListener("keydown", e => { if (e.code === "KeyO" && !(document.activeElement instanceof HTMLInputElement)) openFriends(); });
}
export function openFriends() { toggleWindow("friends", true); drawFriends(); game().social("friendList"); }
export function openRanking() { toggleWindow("ranking", true); drawRanking(); game().social("ranking"); }
export function onFriends(v: FriendView) { friends = v; drawFriends(); }
export function onRanking(players: RankRow[], guilds: GuildSummary[]) { ranks = { players, guilds }; drawRanking(); }
export function onFriendRequest(from: string, name: string) {
  sys(`🤝 ${name} ขอเป็นเพื่อน`, "lvl");
  void ask(`${name} ขอเป็นเพื่อน`, "รับเป็นเพื่อนไหม?", "รับเป็นเพื่อน", "ไม่ล่ะ").then(ok => game().social(ok ? "friendAccept" : "friendDecline", from));
}

function drawFriends() {
  if (!isOpen("friends")) return;
  const on = friends.friends.filter(f => f.online).length;
  setHTML(body("friends").querySelector("#fr-body")!, `${friends.pending.length ? `<h4>📨 คำขอเป็นเพื่อน</h4>${friends.pending.map(p => `<div class="shoprow"><span>${esc(p.name)}</span><span><button data-fr="accept:${p.uid}">รับ</button> <button class="ghost" data-fr="decline:${p.uid}">ไม่รับ</button></span></div>`).join("")}` : ""}
    <h4>👥 เพื่อน ${friends.friends.length} คน · ออนไลน์ ${on}</h4>
    ${friends.friends.map(f => `<div class="shoprow"><span><b style="color:${f.online ? "#2f9a3a" : "#9a8a70"}">●</b> ${esc(f.name)}${f.online ? ` <small>${f.channel ? `ช่อง ${f.channel}` : "ออนไลน์"}</small>` : ` <small>ออฟไลน์</small>`}</span><span><button class="ghost" data-fr="remove:${f.uid}" title="ลบเพื่อน">✕</button></span></div>`).join("") || `<div class="hint">ยังไม่มีเพื่อน</div>`}
    <div class="hint">เพิ่มเพื่อน: คลิกตัวละครผู้เล่นคนอื่น → "เพิ่มเพื่อน" · ปุ่ม O เปิดหน้านี้</div>`);
}
function drawRanking() {
  if (!isOpen("ranking")) return;
  const tabs = `<div class="tabs"><button data-rk="players" class="${rankTab === "players" ? "on" : ""}">🏆 ผู้เล่น (เลเวล)</button><button data-rk="guilds" class="${rankTab === "guilds" ? "on" : ""}">🏰 กิลด์</button></div>`;
  const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
  const rows = rankTab === "players"
    ? ranks.players.map((r, i) => `<div class="shoprow"><span>${medal(i)} <b>${esc(r.name)}</b> <small>${BREEDS[r.race]?.name ?? r.race}${r.guild ? ` · «${esc(r.guild)}»` : ""}</small></span><span><b>Lv ${r.level}</b></span></div>`).join("")
    : ranks.guilds.map((g, i) => `<div class="shoprow"><span>${medal(i)} <b>${esc(g.name)}</b> <small>หัวหน้า ${esc(g.leader)} · หอกิลด์ Lv ${g.hall}</small></span><span><b>${g.members}</b>/${g.capacity} คน</span></div>`).join("");
  setHTML(body("ranking").querySelector("#rk-body")!, tabs + (rows || `<div class="hint">กำลังโหลด…</div>`) + `<div class="hint">อันดับผู้เล่นทั้งเซิร์ฟเวอร์ อัปเดตทุก 5 นาที</div>`);
}
