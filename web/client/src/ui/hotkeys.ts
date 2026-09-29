// Hotkeys: every action keeps the built-in key its handler listens for (`def`); the player may bind another key in the
// Hotkeys window. A capture-phase listener replays a bound key as the action's built-in one, so no handler changes,
// and a built-in key whose action moved elsewhere does nothing. Bindings live in this browser (bk.keys).
import { body, createWindow, isOpen, setHTML, toggleWindow } from "./windows";

type Act = { id: string; label: string; def: string };
export const ACTIONS: Act[] = [
  { id: "up", label: "เดินขึ้น", def: "KeyW" }, { id: "down", label: "เดินลง", def: "KeyS" }, { id: "left", label: "เดินซ้าย", def: "KeyA" }, { id: "right", label: "เดินขวา", def: "KeyD" },
  { id: "basic", label: "โจมตีปกติ", def: "Space" }, { id: "slash", label: "Slash", def: "KeyK" }, { id: "dash", label: "Dash", def: "ShiftLeft" },
  ...Array.from({ length: 9 }, (_, i) => ({ id: `hb${i + 1}`, label: `Hotbar ช่อง ${i + 1}`, def: `F${i + 1}` })),
  { id: "target", label: "เปลี่ยนเป้า", def: "Tab" }, { id: "pick", label: "เก็บของ", def: "KeyF" }, { id: "talk", label: "คุยกับ NPC", def: "KeyE" }, { id: "mount", label: "ขี่ / ลงพาหนะ", def: "KeyR" },
  { id: "auto", label: "เปิด/ปิด Auto", def: "KeyZ" }, { id: "zonemap", label: "แผนที่ขยาย", def: "KeyN" }, { id: "worldmap", label: "แผนที่โลก", def: "KeyM" },
  { id: "guild", label: "กิลด์", def: "KeyG" }, { id: "friends", label: "เพื่อน", def: "KeyO" },
];
let binds: Record<string, string> = {};
try { binds = JSON.parse(localStorage.getItem("bk.keys") ?? "{}") ?? {}; } catch {}
const save = () => { try { localStorage.setItem("bk.keys", JSON.stringify(binds)); } catch {} };
export const keyOf = (id: string) => binds[id] ?? ACTIONS.find(a => a.id === id)!.def;
/** "KeyQ" → "Q", "Digit1" → "1", "ShiftLeft" → "Shift" … for labels. */
const NAMES: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\" };
export const keyName = (code: string) => NAMES[code] ?? code.replace(/^Key|^Digit/, "").replace(/^Numpad/, "Num ").replace(/(Left|Right)$/, "");
const typing = () => { const a = document.activeElement; return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || (a as HTMLElement)?.isContentEditable; };
let replaying = false, capturing: string | null = null;

export function setupHotkeys() {
  for (const type of ["keydown", "keyup"] as const) addEventListener(type, e => {
    if (replaying) return;
    if (capturing && type === "keydown") { e.preventDefault(); e.stopImmediatePropagation(); bind(capturing, e.code); return; }
    if (typing()) return;
    const act = ACTIONS.find(a => keyOf(a.id) === e.code);
    if (act && act.def === e.code) return;   // the built-in key, still bound to its own action
    if (act || ACTIONS.some(a => a.def === e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }   // moved away: swallow it
    if (!act) return;
    replaying = true; try { dispatchEvent(new KeyboardEvent(type, { code: act.def, key: e.key, repeat: e.repeat, bubbles: true, cancelable: true })); } finally { replaying = false; }
  }, true);
  createWindow("hotkeys", "⌨ ปุ่มลัด", `<div id="hk-list"></div><div class="btns"><button id="hk-reset">คืนค่าเริ่มต้นทั้งหมด</button></div><div class="hint">กดปุ่มในช่องขวาแล้วกดคีย์ใหม่ · Esc = ยกเลิก · ปุ่มที่ใช้อยู่แล้วจะสลับกัน</div>`);
  const el = body("hotkeys");
  el.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-hk]"); if (b) { capturing = b.dataset.hk!; draw(); } });
  el.querySelector("#hk-reset")!.addEventListener("click", () => { binds = {}; save(); draw(); });
}
function bind(id: string, code: string) {
  capturing = null;
  if (code !== "Escape") {
    const mine = keyOf(id), other = ACTIONS.find(a => a.id !== id && keyOf(a.id) === code);
    if (other) binds[other.id] = mine;   // the key was taken: the two actions swap
    binds[id] = code;
    for (const a of ACTIONS) if (binds[a.id] === a.def) delete binds[a.id];
    save();
  }
  draw();
}
function draw() {
  if (!isOpen("hotkeys")) return;
  setHTML(body("hotkeys").querySelector("#hk-list")!, `<table>${ACTIONS.map(a => `<tr><td>${a.label}</td><td class="v"><button data-hk="${a.id}" class="hk-key${capturing === a.id ? " on" : ""}">${capturing === a.id ? "กดคีย์…" : keyName(keyOf(a.id))}</button></td></tr>`).join("")}</table>`);
}
export function openHotkeys() { toggleWindow("hotkeys", true); draw(); }
