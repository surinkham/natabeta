// Chat panel: tabs, log, input with history and slash commands. Channels other than "system" are local until W2.
import { game } from "./api";
import { toggleWindow } from "./windows";
import { timeString } from "../render/daynight";
import { zoneName } from "@shared/world";
import { setShake } from "../fx/fx";

type Chan = "all" | "say" | "world" | "party" | "whisper" | "system";
const TABS: [Chan, string][] = [["all", "ทั้งหมด"], ["say", "คุย"], ["world", "โลก"], ["party", "ปาร์ตี้"], ["whisper", "กระซิบ"], ["system", "ระบบ"]];
let current: Chan = "all";
const log = document.getElementById("chatlog")!, input = document.getElementById("chatin") as HTMLInputElement;
const history: string[] = []; let hi = 0;
const entries: { chan: Chan; el: HTMLElement }[] = [];

export function chatLog(chan: Chan, html: string, cls = "") {
  const t = new Date(); const el = document.createElement("div"); el.className = "m " + cls;
  el.innerHTML = `<span class="t">${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}</span>${html}`;
  entries.push({ chan, el }); if (entries.length > 200) entries.shift()!.el.remove();
  el.hidden = !(current === "all" || current === chan); log.appendChild(el); log.scrollTop = log.scrollHeight;
  if (!el.hidden && !document.body.classList.contains("chat-open")) document.getElementById("chattog")?.classList.add("unread");
}
export const sys = (text: string, cls = "sys") => chatLog("system", text, cls);
export const say = (who: string, text: string, chan: Chan = "say") => chatLog(chan, `<span class="who">${who}</span>: ${text}`);

const COMMANDS: Record<string, (args: string[]) => void> = {
  time: () => sys(`เวลาในเกม ${timeString()} — 30 นาทีจริง = 1 วันในเกม (กลางคืน 19:00–05:30)`),
  help: () => sys("คำสั่ง: /time [ชม.|stop|go] · /help · /pos · /sit · /status /items /equip /skill · /w ชื่อ ข้อความ (W2) · /p ข้อความ (W2) · /roll · /auto on|off · /who · /trade ชื่อ · /mount · /where · /shake off"),
  pos: () => { const p = game().P.pos; sys(`ตำแหน่ง ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`); },
  sit: () => game().sit(),
  mount: () => game().mount(),
  shake: a => { setShake(a[0] !== "off"); sys(`สั่นกล้อง: ${a[0] !== "off" ? "เปิด" : "ปิด"}`); },
  where: () => { const P = game().P; sys(`${zoneName(P)} (${P.x.toFixed(0)}, ${(-P.z).toFixed(0)})`); },
  status: () => toggleWindow("status"), items: () => toggleWindow("inventory"), equip: () => toggleWindow("equip"), skill: () => toggleWindow("skills"),
  roll: () => say(game().P.name, `ทอยได้ ${1 + Math.floor(Math.random() * 100)}`),
  p: a => { const text = a.join(" ").trim(); if (!text) return sys("/p ข้อความ — คุยในปาร์ตี้"); if (!game().P.party) return sys("ยังไม่ได้อยู่ในปาร์ตี้"); say(game().P.name, text, "party"); game().say(text, "party"); },
  auto: a => { game().autoMode = a[0] === "off" ? "off" : "melee"; sys(`auto attack: ${game().autoMode}`); },
  w: () => sys("กระซิบ: W3"),
  // older names can repeat: /trade picks the nearest player of that name
  trade: a => { const g = game(); const m = [...g.mobs.values()].filter(m => m.kind === "player" && m.name === a.join(" ")).sort((x, y) => x.pos.distanceTo(g.P.pos) - y.pos.distanceTo(g.P.pos))[0]; if (m) g.tradeReq(m.id); else if (!a.length) toggleWindow("trade"); else sys("ไม่พบผู้เล่นชื่อนี้ใกล้ๆ"); },
  who: () => { const g = game(); sys(`ออนไลน์ ${g.online ? "✓" : "✗ (offline)"} · ผู้เล่นใกล้เคียง: ${[...g.mobs.values()].filter(m => m.kind === "player").map(m => m.name).join(", ") || "—"}`); },
};

export function setupChat() {
  // phones: the chat folds into a small 💬 button (a red dot when something new arrives); a tap opens and closes it
  const tog = Object.assign(document.createElement("button"), { id: "chattog", type: "button", className: "hud", textContent: "💬", title: "แชท" });
  tog.addEventListener("click", () => { const open = document.body.classList.toggle("chat-open"); tog.classList.remove("unread"); if (open) log.scrollTop = log.scrollHeight; });
  document.body.append(tog);
  const tabs = document.getElementById("chattabs")!;
  for (const [id, label] of TABS) { const b = document.createElement("button"); b.textContent = label; b.classList.toggle("on", id === current); b.addEventListener("click", () => { current = id; for (const x of tabs.children) x.classList.toggle("on", x === b); for (const e of entries) e.el.hidden = !(current === "all" || current === e.chan); }); tabs.appendChild(b); }
  input.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.code === "ArrowUp") { hi = Math.max(0, hi - 1); input.value = history[hi] ?? ""; e.preventDefault(); }
    if (e.code === "Escape") input.blur();
    if (e.code !== "Enter") return;
    const text = input.value.trim(); input.value = ""; input.blur(); if (!text) return;
    history.push(text); hi = history.length;
    if (text.startsWith("/")) { const [c, ...a] = text.slice(1).split(/\s+/); (COMMANDS[c] ?? (() => sys(`ไม่รู้จัก /${c}`)))(a); }
    else {
      const chan = current === "world" ? "world" : current === "party" ? "party" : "say";
      if (chan === "party" && !game().P.party) return sys("ยังไม่ได้อยู่ในปาร์ตี้ — ชวนผู้เล่นจากการคลิกที่ตัวเขา");
      say(game().P.name, text, chan); game().say(text, chan);
    }
  });
  addEventListener("keydown", e => { if (e.code === "Enter" && document.activeElement !== input && !(document.activeElement instanceof HTMLInputElement)) { input.focus(); e.preventDefault(); } });
  sys("ยินดีต้อนรับสู่ Starter Town! คลิกพื้นเพื่อเดิน คลิก wolf เพื่อตี · พิมพ์ /help ดูคำสั่ง");
}
export const chatFocused = () => document.activeElement === input;
