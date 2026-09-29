// Auto battle: the client plays for you with the same commands a player sends (no server rule to bypass) — hunt the
// nearest monster, fire the skills of the active preset as they come off cooldown, swing in between, and drink a potion
// when HP or MP falls under the set %, picking the smallest potion that covers what was actually lost.
import { ITEMS, SKILLS } from "@shared/data";
import { attackSkill, skillFits, weaponOf } from "@shared/sim";
import { groupOf, groupTabs, type Group } from "./skillpreview";
import { game } from "./api";
import { justDragged, startDrag, type Ref } from "./hotbar";
import { icon } from "./icons";
import { body, createWindow, isOpen, onWindowOpen, setHTML, toggleWindow } from "./windows";

// Skill presets: three sets of PRESET_N slots, fired left to right. Auto never reads the hotbar; an empty preset swings only.
const PRESET_N = 15;
const blank = () => Array<string | null>(PRESET_N).fill(null);
/** The furthest auto looks for monsters (m), measured from where auto was switched on. */
const RANGE_MAX = 10;
/** Until when (performance.now ms) the range ring shows on the ground: set while the range slider moves. */
export const ringShow = { until: 0 };
export const AUTO = { on: false, skills: true, lootItems: false, lootGold: false, hp: 45, mp: 25, range: 8, stay: false, preset: 0, presets: [blank(), blank(), blank()] };   // loot*: walk over and pick up drops between kills
try { Object.assign(AUTO, JSON.parse(localStorage.getItem("bk.auto") ?? "{}"), { on: false, lootItems: false, lootGold: false }); } catch {}   // auto never loots: drops are picked up by hand
AUTO.range = Math.min(RANGE_MAX, AUTO.range);   // older saves could reach 24 m: auto ran off after far monsters
// older saves held plain id lists: pad (or trim) each to PRESET_N slots
AUTO.presets = [0, 1, 2].map(n => { const p = Array.isArray(AUTO.presets?.[n]) ? AUTO.presets[n] : []; return Array.from({ length: PRESET_N }, (_, i) => (typeof p[i] === "string" ? p[i] : null)); });
const save = () => { try { localStorage.setItem("bk.auto", JSON.stringify(AUTO)); } catch {} };

export function setupAuto() {
  createWindow("auto", "Auto", `<table>
    <tr><td>ใช้สกิล</td><td class="v"><input type="checkbox" name="skills"></td><td></td></tr>
    <tr><td>ตีอยู่กับที่ (ไม่เดิน)</td><td class="v"><input type="checkbox" name="stay"></td><td><small>ตีเฉพาะมอนที่เข้ามาถึงระยะอาวุธ</small></td></tr>
    <tr><td>กินยา HP เมื่อต่ำกว่า</td><td class="v"><input type="range" name="hp" min="0" max="95" step="5" style="width:100px"></td><td><b data-v="hp"></b></td></tr>
    <tr><td>กินยา MP เมื่อต่ำกว่า</td><td class="v"><input type="range" name="mp" min="0" max="95" step="5" style="width:100px"></td><td><b data-v="mp"></b></td></tr>
    <tr><td>ระยะหามอน</td><td class="v"><input type="range" name="range" min="4" max="${RANGE_MAX}" step="1" style="width:100px"></td><td><b data-v="range"></b></td></tr></table>
    <div class="tabs" id="au-tabs"></div>
    <div class="au-row"><button data-scroll="-1">◀</button><div class="au-slots" id="au-strip"></div><button data-scroll="1">▶</button></div><div id="au-list"></div>
    <div class="hint">ชุดสกิลที่ Auto ใช้ (แยกจาก Hotbar) · แตะสกิลด้านล่าง = ใส่ช่องถัดไป · แตะช่อง = เอาออก · ใช้จากซ้ายไปขวา · ชุดว่าง = ตีธรรมดาอย่างเดียว<br>ระยะหามอน: วงบนพื้นรอบตัว — auto ตีมอนในวงนี้ เดินเข้าไปถึงระยะของอาวุธเอง · 0% = ไม่กินยา · เดินเอง/คลิกเดิน = auto ย้ายตามไป · ปุ่ม Z เปิด/ปิด</div>`);
  const el = body("auto");
  const draw = () => {
    drawPresets(el);
    for (const i of el.querySelectorAll<HTMLInputElement>("input[name]")) { const k = i.name as keyof typeof AUTO; if (i.type === "checkbox") i.checked = !!AUTO[k]; else i.value = String(AUTO[k]); }
    for (const b of el.querySelectorAll<HTMLElement>("[data-v]")) { const k = b.dataset.v as "hp" | "mp" | "range"; b.textContent = k === "range" ? `${AUTO[k]} m` : AUTO[k] ? `${AUTO[k]}%` : "ปิด"; }
    btn.classList.toggle("on", AUTO.on); toggle.textContent = AUTO.on ? "AUTO ●" : "AUTO"; cycle.textContent = `ชุด ${AUTO.preset + 1}`;
  };
  // setHTML holds off while the pointer is down inside the window; redraw once the click has finished
  const redraw = () => setTimeout(draw);
  el.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-scroll]"); if (b) el.querySelector("#au-strip")!.scrollBy({ left: +b.dataset.scroll! * 48 * 4, behavior: "smooth" }); });
  el.addEventListener("click", e => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-aug]"); if (t) { auGroup = t.dataset.aug as Group; redraw(); } });
  el.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-au]"); if (!b) return;
    if (justDragged()) return;
    const [act, arg] = b.dataset.au!.split(":"), list = AUTO.presets[AUTO.preset];
    if (act === "tab") AUTO.preset = +arg;
    if (act === "clear") list[+arg] = null;                                                         // tap a filled slot: remove
    if (act === "add" && !list.includes(arg)) { const i = list.indexOf(null); if (i >= 0) list[i] = arg; }   // tap a skill: first free slot
    save(); redraw();
  });
  el.addEventListener("input", e => {
    const i = e.target as HTMLInputElement;
    if (i.type === "checkbox") (AUTO as any)[i.name] = i.checked; else if (i.name in AUTO) (AUTO as any)[i.name] = +i.value;
    if (i.name === "range" || i.name === "stay") ringShow.until = performance.now() + 2500;
    save(); draw();
  });
  // drag: from the skill list or the hotbar onto a slot, between slots (swap), or off a slot (remove)
  el.addEventListener("pointerdown", e => {
    const s = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]"); if (!s) return;
    const origin = s.dataset.dropslot !== undefined ? s : undefined;
    startDrag(e, { kind: "skill", id: s.dataset.drag! }, s.querySelector(".ic")?.innerHTML ?? "", { origin });
  });
  el.addEventListener("slotdrop", e => {
    const { ref, origin } = (e as CustomEvent<{ ref: Ref; origin: HTMLElement | null }>).detail, to = +(e.target as HTMLElement).dataset.dropslot!;
    const list = AUTO.presets[AUTO.preset], S = SKILLS[ref.id];
    if (ref.kind !== "skill" || !S || S.kind === "dash") return;
    const from = origin ? +origin.dataset.dropslot! : list.indexOf(ref.id);
    if (from >= 0) list[from] = list[to];   // swap with (or move out of) the slot it came from
    list[to] = ref.id; save(); redraw();
  });
  el.addEventListener("slotdragout", e => { AUTO.presets[AUTO.preset][+(e.target as HTMLElement).dataset.dropslot!] = null; save(); redraw(); });
  const btn = Object.assign(document.createElement("div"), { id: "autobtn", className: "hud dark", innerHTML: `<button>AUTO</button><button title="สลับชุดสกิล auto">1</button><button title="ตั้งค่า auto">⚙</button>` });
  document.body.append(btn);
  const [toggle, cycle, gear] = btn.querySelectorAll("button");
  cycle.addEventListener("click", () => { AUTO.preset = (AUTO.preset + 1) % 3; save(); draw(); });
  toggle.addEventListener("click", () => setAuto(!AUTO.on));
  gear.addEventListener("click", () => toggleWindow("auto")); onWindowOpen("auto", draw);
  addEventListener("keydown", e => { if (e.code === "KeyZ" && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) setAuto(!AUTO.on); });
  setAuto = on => { AUTO.on = on; draw(); };
  draw();
}
export let setAuto: (on: boolean) => void = on => { AUTO.on = on; };

/** Skills a preset may hold: every learned skill except dash (the basic attack included, so it can be ordered too). */
const usable = () => game().P.skills.filter(id => SKILLS[id] && SKILLS[id].kind !== "dash");
/** The basic attack shows as what the weapon in hand does (sword swing, bow shot, …). */
const shown = (id: string) => (id === "SKILL_BASIC" ? attackSkill(game().P.equip, game().P.inv, game().P.mp) : id);
let auGroup: Group | null = null;   // the weapon tab of the skill list under the slots
function drawPresets(el: HTMLElement) {
  if (!isOpen("auto")) return;
  const list = AUTO.presets[AUTO.preset], n = (p: (string | null)[]) => p.filter(Boolean).length;
  setHTML(el.querySelector("#au-tabs")!, [0, 1, 2].map(k => `<button data-au="tab:${k}" class="${k === AUTO.preset ? "on" : ""}">ชุด ${k + 1} (${n(AUTO.presets[k])})</button>`).join(""));
  const slots = list.map((id, i) => {
    const S = id ? SKILLS[shown(id)] : null;
    return `<div class="au-slot slot" data-dropslot="${i}" ${id ? `data-drag="${id}" data-au="clear:${i}" title="${S?.name ?? ""}"` : ""}><span class="k">${i + 1}</span><span class="ic">${S ? icon(shown(id!), S.icon) : ""}</span>${S?.mana ? `<span class="mp">${S.mana}</span>` : ""}</div>`;
  }).join("");
  auGroup ??= (weaponOf(game().P.equip) ?? "any") as Group;
  const src = usable().filter(id => groupOf(id) === auGroup).map(id => { const S = SKILLS[shown(id)]; return `<div class="au-src${list.includes(id) ? " used" : ""}" data-drag="${id}" data-au="add:${id}" title="${S.name}"><span class="ic">${icon(shown(id), S.icon)}</span><small>${id === "SKILL_BASIC" ? "โจมตีปกติ" : S.name}</small></div>`; }).join("");
  // the slot strip scrolls sideways; ◀ ▶ step it by a few slots (kept outside setHTML so the scroll position survives)
  setHTML(el.querySelector("#au-strip")!, slots);
  setHTML(el.querySelector("#au-list")!, groupTabs(auGroup, "data-aug", g => usable().filter(id => groupOf(id) === g).length) + `<div class="au-srcs">${src || `<div class="hint">ยังไม่มีสกิล — เรียนจากหนังสือสกิลก่อน</div>`}</div>`);
}

let potCd = 0;
/** Drink when under the threshold: the smallest potion that refills what is missing, else the biggest one carried. */
export function autoPotion(dt: number) {
  potCd -= dt; if (potCd > 0) return;
  const g = game(), P = g.P; if (!P.alive) return;
  for (const [stat, max, pct, key] of [[P.hp, P.maxHP, AUTO.hp, "heal"], [P.mp, P.maxMP, AUTO.mp, "mana"]] as const) {
    if (!pct || stat / max * 100 >= pct) continue;
    const lost = max - stat, have = P.inv.items.filter(s => ITEMS[s.itemId]?.type === "Consumable" && ITEMS[s.itemId][key]);
    if (!have.length) continue;
    have.sort((a, b) => ITEMS[a.itemId][key]! - ITEMS[b.itemId][key]!);
    const pick = have.find(s => ITEMS[s.itemId][key]! >= lost) ?? have[have.length - 1];
    g.useItem(pick.id); potCd = Math.max(1, ITEMS[pick.itemId].cooldown ?? 1) + 0.2; return;
  }
}

/** Fire the first ready skill of the active preset that reaches `dist`. Auto keeps its own list: the hotbar is the
 *  player's, and an empty preset means plain swings only. */
/** Whether auto should swing when no skill fired: always with an empty preset, else only if the preset holds it. */
export const autoUsesBasic = () => { const p = AUTO.presets[AUTO.preset]; return p.every(id => !id) || p.includes("SKILL_BASIC"); };
export function autoSkill(dist: number) {
  if (!AUTO.skills) return false;
  const g = game(), P = g.P; if (P.busy > 0) return false;   // mid-swing: nothing would fire, and the turn must not pass
  const preset = AUTO.presets[AUTO.preset];
  const list = preset.filter((id): id is string => !!id);
  // left to right in turn: the search starts at the slot after the last one fired and wraps round, so every skill in
  // the row gets its go (it used to restart at the left each time, firing the first slot whenever it came off cooldown)
  for (let k = 0; k < list.length; k++) {
    const i = (cursor + k) % list.length, id = list[i];
    const S = SKILLS[shown(id)]; if (!S || S.kind === "dash" || S.kind === "revive" || !skillFits(shown(id), P.equip)) continue;   // not with this weapon in hand
    if ((P.cd[id] ?? 0) > 0 || (S.mana && P.mp < S.mana) || !P.skills.includes(id)) continue;
    if (S.kind === "heal" ? P.hp / P.maxHP > 0.7 : !S.self && dist > (S.range ?? 1.4) + 0.3) continue;
    g.act(id); cursor = i + 1; return true;
  }
  return false;
}
let cursor = 0;   // where auto's next search for a skill starts (autoSkill)
