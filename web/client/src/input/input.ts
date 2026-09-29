// Keyboard + touch joystick + action buttons. Emits actions; movement is polled via move().
export type Action = string;   // skill id (SKILL_BASIC / SKILL_SLASH / …)
const KEY_SKILL: Record<string, string> = { Space: "SKILL_BASIC", KeyJ: "SKILL_BASIC", KeyK: "SKILL_SLASH", KeyL: "SKILL_DASH", ShiftLeft: "SKILL_DASH", ShiftRight: "SKILL_DASH" };
const BUTTON_SKILL: Record<string, string> = { atk: "SKILL_BASIC", slash: "SKILL_SLASH", dash: "SKILL_DASH" };
const keys: Record<string, boolean> = {};
const stick = { x: 0, y: 0, id: null as number | null };
let onAction: (a: Action) => void = () => {};
export interface Pointer { x: number; y: number; down: boolean; fresh: boolean }   // screen px; fresh = new press this frame
export const pointer: Pointer = { x: 0, y: 0, down: false, fresh: false };

export function setupInput(handler: (a: Action) => void, canvas: HTMLElement) {
  onAction = handler;
  document.body.classList.toggle("touch", matchMedia("(pointer: coarse)").matches);
  // touch stand-ins for keys the game listens for (Tab: next target, F: pick up)
  for (const [id, code] of [["lockb", "Tab"], ["pickb", "KeyF"]]) document.getElementById(id)!.addEventListener("pointerdown", e => { e.preventDefault(); dispatchEvent(new KeyboardEvent("keydown", { code })); });
  const menu = document.getElementById("menu")!;
  menu.addEventListener("click", e => { const b = (e.target as HTMLElement).closest("button"); if (b) menu.classList.toggle("open", b.id === "menutog" && !menu.classList.contains("open")); });
  // mouse / tap on the world: hold to keep walking toward the cursor
  canvas.addEventListener("pointerdown", e => { if (e.button !== 0) return; pointer.x = e.clientX; pointer.y = e.clientY; pointer.down = true; pointer.fresh = true; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => { if (pointer.down) { pointer.x = e.clientX; pointer.y = e.clientY; } });
  const up = () => { pointer.down = false; };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  addEventListener("keydown", e => {
    if (document.activeElement instanceof HTMLInputElement) return;
    keys[e.code] = true;
    if (KEY_SKILL[e.code]) onAction(KEY_SKILL[e.code]);
    if (e.code === "Space") e.preventDefault();
  });
  addEventListener("keyup", e => { keys[e.code] = false; });
  const stickEl = document.getElementById("stick")!, knob = document.getElementById("knob")!;
  const move = (e: PointerEvent) => {
    const r = stickEl.getBoundingClientRect();
    let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    stick.x = dx; stick.y = dy; knob.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  };
  const end = (e: PointerEvent) => { if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; knob.style.transform = ""; stickEl.style.transform = ""; } };
  // a floating stick: a thumb landing anywhere in the zone round it (not only on the pad) brings the pad under the
  // thumb and starts from there; it slides home when let go
  const zone = Object.assign(document.createElement("div"), { id: "stickzone" }); stickEl.before(zone);
  const float = (e: PointerEvent) => {
    const r = stickEl.getBoundingClientRect(), z = zone.getBoundingClientRect(), h = r.width / 2;
    const cx = Math.min(z.right - h, Math.max(z.left + h, e.clientX)), cy = Math.min(z.bottom - h, Math.max(z.top + h, e.clientY));
    stickEl.style.transform = `translate(${cx - (r.left + h)}px, ${cy - (r.top + h)}px)`;
  };
  // read the finger first: a capture that fails (the pointer already gone) must not lose the touch
  for (const el of [stickEl, zone]) {
    el.addEventListener("pointerdown", e => { if (stick.id !== null) return; if (el === zone) float(e); stick.id = e.pointerId; move(e); try { el.setPointerCapture(e.pointerId); } catch {} });
    el.addEventListener("pointermove", e => { if (e.pointerId === stick.id) move(e); });
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  for (const id of Object.keys(BUTTON_SKILL)) document.getElementById(id)!.addEventListener("pointerdown", e => { e.preventDefault(); onAction(BUTTON_SKILL[id]); });
}

/** Movement vector in world XZ (x right, z toward camera), length ≤ 1. */
export function move(): { x: number; z: number } {
  const x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
  const z = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + stick.y;
  const l = Math.hypot(x, z); return l > 1 ? { x: x / l, z: z / l } : { x, z };
}
export const debugKeys = keys;
