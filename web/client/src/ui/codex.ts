// Codex window ("สารบัญ", menu): weapons, gear, items, monsters and skills, searchable. Tap an entry for its details:
// where it comes from (drops with chances, shops, recipes, the guild shop, trainers, books) or, for a monster, the
// maps it lives in and what it drops. Names in a detail link across (a monster's drop opens that item). The facts
// come from shared/codex.ts, which reads them off the game data.
import { ITEMS, MONSTERS, SKILLS, itemName, modsText } from "@shared/data";
import { codexIds, itemSources, levelText, monsterInfo, skillEffect, skillSources, type CodexTab, type Source } from "@shared/codex";
import { skillWeaponText } from "@shared/sim";
import * as THREE from "three";
import { icon } from "./icons";
import { body, createWindow, setHTML } from "./windows";

const TABS: [CodexTab, string][] = [["weapon", "⚔ อาวุธ"], ["gear", "🛡 อุปกรณ์"], ["item", "🎒 ไอเทม"], ["monster", "🐾 มอนสเตอร์"], ["skill", "✨ สกิล"]];
const KIND_ICON: Record<Source["kind"], string> = { drop: "🗡", shop: "🛒", craft: "🔨", guild: "🏰", start: "⭐", book: "📖" };
const TYPE_TH: Record<string, string> = { Material: "วัตถุดิบ", Consumable: "ของใช้", Key: "ของสำคัญ", Ammo: "กระสุน", Book: "หนังสือสกิล", Scroll: "ม้วนคัมภีร์", Weapon: "อาวุธ", Armor: "อุปกรณ์" };
const SHOW = 8;   // sources / drops listed before "อีก n"
let tab: CodexTab = "weapon", query = "", open = "";
const esc = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- monster portraits
// Each monster is drawn from the game's own model (game.ts setMonsterMaker: model, tint, realm decorations, boss
// form, idle pose) by one small renderer, one per idle moment, and kept as an image for the rest of the session.
let makeMonster: ((kind: string) => THREE.Object3D) | undefined;
export const setMonsterMaker = (f: (kind: string) => THREE.Object3D) => { makeMonster = f; };
const thumbs = new Map<string, string>(), queue: string[] = [];
let studio: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | undefined, busy = false;
function portrait(kind: string) {
  if (!makeMonster) return;
  if (!studio) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setSize(192, 192, false); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.1)); const key = new THREE.DirectionalLight(0xfff1dc, 1.8); key.position.set(1.5, 3, 2.5); scene.add(key);
    studio = { r, scene, cam: new THREE.PerspectiveCamera(30, 1, 0.1, 100) };
  }
  const { r, scene, cam } = studio, obj = makeMonster(kind); obj.rotation.y = 0.55; scene.add(obj); obj.updateMatrixWorld(true);
  const box = new THREE.Box3(); obj.traverseVisible(n => { if ((n as THREE.Mesh).isMesh && n.name !== "contact-shadow" && !n.name.startsWith("boss-aura")) box.expandByObject(n, true); });
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), d = Math.max(size.y, size.x, size.z) * 2.2;   // fills the frame with a little room, whatever the shape
  cam.position.set(c.x, c.y + size.y * 0.12, c.z + d); cam.lookAt(c); r.render(scene, cam);
  thumbs.set(kind, r.domElement.toDataURL("image/png")); scene.remove(obj);
}
/** Draw the queued portraits one per idle slice, filling the images already on screen as they come. */
function pump() {
  if (busy || !queue.length) return; busy = true;
  setTimeout(() => {
    const kind = queue.shift()!; if (!thumbs.has(kind)) try { portrait(kind); } catch (e) { console.warn("portrait", kind, e); thumbs.set(kind, ""); }
    const url = thumbs.get(kind); if (url) body("codex").querySelectorAll<HTMLImageElement>(`img[data-thumb="${kind}"]`).forEach(i => { i.src = url; i.hidden = false; });
    busy = false; pump();
  }, 30);
}
const want = (kind: string) => { if (!thumbs.has(kind) && !queue.includes(kind)) { queue.push(kind); pump(); } };
const pic = (kind: string, cls: string) => { const url = thumbs.get(kind); want(kind); return `<img class="${cls}" data-thumb="${kind}" ${url ? `src="${url}"` : "hidden"} alt="">`; };

export function setupCodex() {
  createWindow("codex", "สารบัญ", `<div class="tabs" id="cx-tabs"></div><input id="cx-q" placeholder="ค้นหาชื่อ…" autocomplete="off"><div id="cx-list"></div>`);
  const el = body("codex");
  el.addEventListener("click", e => {
    const t = e.target as HTMLElement, b = t.closest<HTMLElement>("[data-cx]"); if (!b) return;
    const [act, a, id] = b.dataset.cx!.split(":");
    if (act === "tab") { tab = a as CodexTab; open = ""; }
    if (act === "row") open = open === a ? "" : a;
    if (act === "go") { tab = a as CodexTab; open = id; query = ""; (el.querySelector("#cx-q") as HTMLInputElement).value = ""; }
    draw();
    if (act === "go") el.querySelector(`[data-cx="row:${id}"]`)?.scrollIntoView({ block: "center" });
  });
  el.querySelector("#cx-q")!.addEventListener("input", e => { query = (e.target as HTMLInputElement).value.trim().toLowerCase(); draw(); });
  draw();
}

const nameOf = (id: string) => (tab === "monster" ? MONSTERS[id]?.name : tab === "skill" ? SKILLS[id]?.name : ITEMS[id]?.name) ?? id;
const tabOfItem = (id: string): CodexTab => (ITEMS[id]?.type === "Weapon" ? "weapon" : ITEMS[id]?.type === "Armor" ? "gear" : "item");
const link = (id: string) => `<a data-cx="go:${tabOfItem(id)}:${id}">${esc(itemName(id))}</a>`;
const list = (lines: string[]) => lines.slice(0, SHOW).map(l => `<li>${l}</li>`).join("") + (lines.length > SHOW ? `<li class="more">…และอีก ${lines.length - SHOW} แหล่ง</li>` : "");

function draw() {
  const el = body("codex");
  setHTML(el.querySelector("#cx-tabs")!, TABS.map(([t, l]) => `<button data-cx="tab:${t}" class="${t === tab ? "on" : ""}">${l}</button>`).join(""));
  const ids = codexIds(tab).filter(id => !query || nameOf(id).toLowerCase().includes(query) || id.toLowerCase().includes(query));
  setHTML(el.querySelector("#cx-list")!, ids.map(id => row(id)).join("") || `<div class="hint">ไม่พบ</div>`);
}

function row(id: string) {
  let ic = "", sub = "";
  if (tab === "monster") { const d = MONSTERS[id]; ic = pic(id, "cx-thumb") + `<span class="cx-emoji">${d.boss ? "👑" : "🐾"}</span>`; sub = `${levelText(id)}${d.boss ? " · BOSS" : ""}`; }
  else if (tab === "skill") { const d = SKILLS[id]; ic = icon(id, (d as { icon?: string }).icon); sub = `${d.requires ? `🗡 ${skillWeaponText(id)}เท่านั้น` : "✔ ใช้ได้ทุกอาวุธ"} · ${d.mana ? `MP ${d.mana} · ` : ""}คูลดาวน์ ${d.cooldown} วิ${d.special ? " · สกิลพิเศษ (คัมภีร์จากบอส)" : ""}`; }
  else { const d = ITEMS[id]; ic = icon(id, d.icon); sub = [TYPE_TH[d.type] ?? d.type, d.mods ? modsText(id) : ""].filter(Boolean).join(" · "); }
  return `<div class="cx-row${open === id ? " open" : ""}"><div class="cx-head" data-cx="row:${id}"><span class="ic">${ic}</span><span><b>${esc(nameOf(id))}</b><br><small>${esc(sub)}</small>${tab === "skill" && skillEffect(id) ? `<br><small class="cx-fx">${esc(skillEffect(id))}</small>` : ""}</span></div>${open === id ? `<div class="cx-body">${detail(id)}</div>` : ""}</div>`;
}

function detail(id: string) {
  if (tab === "monster") {
    const m = monsterInfo(id);
    return `${pic(id, "cx-big")}<div>EXP ${m.exp} · เกิดใหม่ทุก ${m.respawn >= 60 ? `${Math.round(m.respawn / 60)} นาที` : `${m.respawn} วิ`}${m.boss ? " · บอส: เกิดตรงจุดสุ่มในแผนที่" : ""}</div>
      <h4>📍 พบได้ที่</h4><ul>${m.zones.length ? list(m.zones.map(esc)) : "<li>ยังไม่พบในแผนที่</li>"}</ul>
      <h4>🎁 ดรอป</h4><ul>${list(m.drops.map(d => `${d.item === "GOLD" ? "Gold" : link(d.item)} <small>${d.text}</small>`))}</ul>`;
  }
  const sources = tab === "skill" ? skillSources(id) : itemSources(id);
  const d = tab === "skill" ? null : ITEMS[id];
  const facts = d ? [d.desc, d.heal ? `ฟื้น HP ${d.heal}` : "", d.mana ? `ฟื้น MP ${d.mana}` : "", d.buy ? `ราคาซื้อ ${d.buy}` : "", d.sell ? `ขายได้ ${d.sell}` : "", d.teaches ? `สอนสกิล ${SKILLS[d.teaches]?.name ?? d.teaches}` : ""].filter(Boolean)
    : [(() => { const s = SKILLS[id]; return [s.requires ? `ต้องใช้${{ bow: "ธนู", staff: "คทา", sword: "ดาบ" }[s.requires]}` : "", s.range ? `ระยะ ${s.range} m` : "", s.radius ? `วงกว้าง ${s.radius} m` : ""].filter(Boolean).join(" · "); })()].filter(Boolean);
  return `${tab === "skill" ? `<div><button data-skill-play="${id}">▶ ดูตัวอย่างสกิล</button></div>` : ""}${facts.length ? `<div>${facts.map(f => esc(String(f))).join(" · ")}</div>` : ""}
    <h4>${tab === "skill" ? "📚 เรียนได้จาก" : "🧭 หาได้จาก"}</h4><ul>${sources.length ? list(sources.map(s => `${KIND_ICON[s.kind]} ${esc(s.text)}`)) : "<li>—</li>"}</ul>`;
}
