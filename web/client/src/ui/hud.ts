import { BREEDS } from "@shared/sim";
import { refreshParty } from "./party";
import * as THREE from "three";
import { MONSTERS, expToNext, itemName } from "@shared/data";
import { project } from "../render/scene";
import { game } from "./api";
import type { Npc } from "../world/npc";
import { refreshStatus } from "./status";
import { refreshInventory } from "./inventory";
import { refreshEquip, renderAvatar, renderEquipDoll } from "./equip";
import { refreshHotbar } from "./hotbar";
import { refreshMinimap } from "./minimap";
import { refreshNpc } from "./npc";
import { refreshObjective } from "./objective";
import { refreshTrade } from "./trade";
import { refreshSkills } from "./skills";
import { isOpen } from "./windows";
import { buffText, hungerState } from "@shared/cooking";
import { refreshMail } from "./mail";

const $ = (id: string) => document.getElementById(id)!;
const floats: { el: HTMLElement; pos: THREE.Vector3; t: number; crit: boolean }[] = [];
const bars = new Map<object, HTMLElement>();
let toastT: number | undefined, acc = 0;

export function floatText(pos: THREE.Vector3, text: string | number, cls: "hit" | "crit" | "miss" | "taken" | "heal") {
  const el = document.createElement("div"); el.className = "float " + cls;
  el.innerHTML = (cls === "crit" ? "<small>CRITICAL</small>" : "") + `<span class="n"><i>${text}</i><b>${text}</b></span>`;
  document.body.appendChild(el);
  floats.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.1, 0)), t: 0, crit: cls === "crit" });
}
export function toast(s: string) { const el = $("toast"); el.textContent = s; el.classList.add("on"); clearTimeout(toastT); toastT = window.setTimeout(() => el.classList.remove("on"), 2200); }
let townSig = "";
/** Death screen. `towns`: the towns reached (buttons to come back in), `home`: where the wait ends, `where`: where they fell. */
export function showDead(on: boolean, secs = 0, lost?: number, scrolls = 0, towns: { id: string; name: string }[] = [], home = "", where = "") {
  $("dead").hidden = !on; if (!on) return;
  const sig = towns.map(t => t.id).join() + "|" + home;
  if (sig !== townSig) {
    townSig = sig;
    $("dead-towns").innerHTML = towns.map(t => `<button data-town="${t.id}" class="${t.id === home ? "home" : ""}">🏠 ${t.name}${t.id === home ? " <small>(ล่าสุด)</small>" : ""}</button>`).join("");
    $("dead-home-name").textContent = towns.find(t => t.id === home)?.name ?? "เมือง";
  }
  if ($("deadwhere").textContent !== where) $("deadwhere").textContent = where;
  $("deadt").textContent = String(Math.ceil(secs)); if (lost !== undefined) $("deadloss").textContent = lost ? ` เสีย EXP ${lost} (ชุบแล้วได้คืน)` : "";
  $("dead-scrolls").textContent = String(scrolls); ($("dead-revive") as HTMLButtonElement).disabled = scrolls < 1;
}
let deadBound = false;
/** Wire the death screen's buttons once (the game API is ready by the first death). */
export function bindDead(home: (town?: string) => void, revive: () => void) {
  if (deadBound) return; deadBound = true;
  $("dead-towns").addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-town]"); if (b) home(b.dataset.town); });
  $("dead-revive").addEventListener("click", revive);
}

// Plates are keyed by the thing they label. Anything not labelled this frame (a picked-up drop, a player who left, a
// despawned monster) loses its element in sweepPlates(), otherwise its last label stays frozen on screen.
const touched = new Set<object>();
function sweepPlates() { for (const [key, el] of bars) if (!touched.has(key)) { el.remove(); bars.delete(key); } touched.clear(); }
function plate(key: object, pos: THREE.Vector3, cls: string, html: string, show: boolean) {
  touched.add(key);
  let el = bars.get(key); if (!el) { el = document.createElement("div"); el.className = cls; document.body.appendChild(el); bars.set(key, el); }
  if (!show) { el.style.display = "none"; return; }
  const [x, y, ok] = project(pos); el.style.display = ok ? "block" : "none"; el.style.left = x + "px"; el.style.top = y + "px"; if (el.innerHTML !== html) el.innerHTML = html;
}

/** Every frame: overlays; every 100 ms: windows/panels that read game state. */
export function updateHud(dt: number) {
  const g = game(), P = g.P;
  $("pname").textContent = P.name; $("lvl").textContent = String(P.level); $("pbreed").textContent = BREEDS[P.race]?.name ?? "";
  ($("hpbar") as HTMLElement).style.width = (P.hp / P.maxHP! * 100) + "%"; $("hp").textContent = `${Math.ceil(P.hp)} / ${P.maxHP}`;
  ($("mpbar") as HTMLElement).style.width = (P.mp / P.maxMP * 100) + "%"; $("mp").textContent = `${Math.floor(P.mp)} / ${P.maxMP}`;
  { const h = P.hunger ?? 100, st = hungerState(h); ($("foodbar") as HTMLElement).style.width = h + "%"; $("food").textContent = `${Math.ceil(h)}%`; const bar = $("foodbar").parentElement!; bar.classList.toggle("hungry", st === "hungry"); bar.classList.toggle("starving", st === "starving"); }   // shared/cooking.ts
  { const m = P.meal, el = $("mealbuff"); el.hidden = !(m && m.t > 0); if (m && m.t > 0) el.textContent = `🍲 ${buffText({ ...m, dur: 0 }).replace(/ \(.*\)$/, "")} · ${Math.floor(m.t / 60)}:${String(Math.floor(m.t % 60)).padStart(2, "0")}`; }   // a dish's buff and its time left
  ($("expbar") as HTMLElement).style.width = (P.exp / expToNext(P.level) * 100) + "%"; $("exp").textContent = `${P.exp} / ${expToNext(P.level)}`;
  $("portrait").title = `EXP ${P.exp} / ${expToNext(P.level)}`;
  $("gold").textContent = String(P.gold);
  for (const [id, sk] of [["atk", "SKILL_BASIC"], ["slash", "SKILL_SLASH"], ["dash", "SKILL_DASH"]]) $(id).classList.toggle("cd", (P.cd[sk] ?? 0) > 0);
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.pos.y += dt * (f.t < 0.15 ? 2.4 : 0.7); const [x, y, ok] = project(f.pos);
    const life = f.crit ? 1.35 : 1.1, pop = f.t < 0.12 ? 0.4 + f.t / 0.12 * (f.crit ? 1.2 : 0.9) : Math.max(1, (f.crit ? 1.6 : 1.3) - (f.t - 0.12) * 3);   // overshoot, settle
    f.el.style.left = x + "px"; f.el.style.top = y + "px"; f.el.style.transform = `translate(-50%, -100%) scale(${pop.toFixed(3)})`;
    f.el.style.opacity = String(ok ? Math.min(1, (life - f.t) / 0.35) : 0);
    if (f.t > life) { f.el.remove(); floats.splice(i, 1); }
  }
  for (const d of g.drops()) {
    const label = d.gold ? `${d.gold} Gold` : `${itemName(d.itemId)}${d.count > 1 ? " ×" + d.count : ""}`;
    plate(d, new THREE.Vector3(d.x, 0.55, d.z), "nameplate loot", label, Math.hypot(d.x - P.pos.x, d.z - P.pos.z) < 14);
  }
  for (const m of g.mobs.values()) {
    const targeted = g.target === m;
    if (m.kind === "monster") {
      // every monster in reach wears its name, level and HP bar above its head (the HP numbers only on the target);
      // a boss is seen from further and carries the BOSS tag
      const top = (m as any).plateY ?? 1.5 * (m.obj.scale.x || 1);
      const boss = !!MONSTERS[(m.view as any).kind]?.boss;
      plate(m.view, m.pos.clone().add(new THREE.Vector3(0, top, 0)), boss ? "nameplate mob boss" : "nameplate mob",
        `${boss ? `<b class="boss-tag">BOSS</b>` : ""}${m.name} <small>Lv ${m.level}</small><i><b style="width:${Math.max(0, m.hp / m.maxHP) * 100}%"></b></i>${targeted || boss ? `<small>${Math.max(0, Math.ceil(m.hp))} / ${m.maxHP}</small>` : ""}`,
        m.alive && (targeted || m.pos.distanceTo(P.pos) < (boss ? 45 : 16)));
    } else plate(m, m.pos.clone().add(new THREE.Vector3(0, 1.45, 0)), "nameplate pc", `${(m.view as any).guild ? `<small class="gtag">«${(m.view as any).guild}»</small>` : ""}${m.name} <small>Lv ${m.level}</small><i><b style="width:${m.hp / m.maxHP * 100}%"></b></i>`, !(m as any).apart && m.pos.distanceTo(P.pos) < 20);
  }
  for (const n of g.npcs as Npc[]) plate(n, n.pos.clone().add(new THREE.Vector3(0, 1.45, 0)), "nameplate npc", `💬 ${n.def.name}`, n.pos.distanceTo(P.pos) < 16);
  sweepPlates();
  renderEquipDoll(); renderAvatar(dt);
  acc += dt; if (acc < 0.1) return; acc = 0;
  refreshHotbar(); refreshMinimap(); refreshObjective(); refreshParty(); refreshMail();
  // a red dot on "status" (and on the phone's folded menu button) while there are stat points to spend
  for (const el of document.querySelectorAll("#menu [data-win=status], #menutog")) el.classList.toggle("alert", P.points > 0);
  if (isOpen("status")) refreshStatus(); if (isOpen("inventory")) refreshInventory(); if (isOpen("equip")) refreshEquip(); if (isOpen("npc")) refreshNpc(); if (isOpen("trade")) refreshTrade(); refreshSkills();
  if (isOpen("players")) {
    const rows = [[P.name + " (คุณ)", P.level], ...[...g.mobs.values()].filter(m => m.kind === "player").map(m => [m.name, m.level] as const)];
    document.getElementById("pl-list")!.innerHTML = rows.map(([n, l]) => `<div class="shoprow"><span>${n}</span><small>Lv ${l}</small></div>`).join("")
      + `<div class="hint">${g.online ? "ออนไลน์ · คลิกตัวละครในฉากเพื่อขอแลกของ" : "ออฟไลน์ — ไม่มีผู้เล่นอื่น"}</div>`;
  }
}
