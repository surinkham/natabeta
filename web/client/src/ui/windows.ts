import { icon } from "./icons";
// Draggable paper windows toggled from the bottom-right menu; positions remembered per window.
const wins = new Map<string, HTMLElement>();
let z = 10;

export function createWindow(id: string, title: string, bodyHtml = ""): HTMLElement {
  const el = document.createElement("div"); el.className = "win frame"; el.id = "win-" + id; el.hidden = true;
  el.innerHTML = `<header><span>${title}</span><button data-close>✕</button></header><div class="body">${bodyHtml}</div>`;
  document.body.appendChild(el); wins.set(id, el);
  el.querySelector("[data-close]")!.addEventListener("click", () => toggleWindow(id, false));
  el.addEventListener("pointerdown", () => { el.style.zIndex = String(++z); });
  // drag by header
  const head = el.querySelector("header")!; let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
  head.addEventListener("pointerdown", (e: PointerEvent) => { if ((e.target as HTMLElement).tagName === "BUTTON") return; drag = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; head.setPointerCapture(e.pointerId); });
  head.addEventListener("pointermove", (e: PointerEvent) => { if (drag) { el.style.left = ox + e.clientX - sx + "px"; el.style.top = oy + e.clientY - sy + "px"; } });
  head.addEventListener("pointerup", () => { drag = false; try { localStorage.setItem("win." + id, JSON.stringify([el.offsetLeft, el.offsetTop])); } catch {} });
  let pos: [number, number] | null = null; try { pos = JSON.parse(localStorage.getItem("win." + id) ?? "null"); } catch {}
  if (pos) { el.style.left = pos[0] + "px"; el.style.top = pos[1] + "px"; } else { el.style.left = 20 + wins.size * 30 + "px"; el.style.top = 160 + wins.size * 20 + "px"; }
  new ResizeObserver(() => { if (!el.hidden) fit(el); }).observe(el);   // on open and whenever its content grows
  return el;
}
/** Windows shown as tabs of one host window (สกิล: list · Hotbar · Auto — three windows that did one job, side by side,
 *  were confusing). Each keeps its id, its body and its open/closed state (so isOpen/body work unchanged); opening one
 *  opens the host at its tab, and the host shows one tab's body at a time. */
const hostOf = new Map<string, string>(), bodies = new Map<string, HTMLElement>();
export function tabbed(host: string, tabs: [string, string][]) {
  const h = wins.get(host)!, bar = document.createElement("div"); bar.className = "tabs win-tabs";
  h.querySelector("header")!.after(bar);
  for (const [id, label] of tabs) {
    const b = Object.assign(document.createElement("button"), { type: "button", textContent: label }); b.dataset.tab = id; bar.append(b);
    b.addEventListener("click", () => toggleWindow(id, true));
    const w = wins.get(id)!, bd = w.querySelector<HTMLElement>(".body")!; bodies.set(id, bd); hostOf.set(id, host);
    if (id !== host) { h.append(bd); w.remove(); w.id = ""; bd.id = "win-" + id; }   // its CSS (#win-auto …) now matches the body
  }
  h.dataset.tab = tabs[0][0]; show(host);
}
function show(host: string) {
  const h = wins.get(host)!, tab = h.dataset.tab!;
  for (const [id, hid] of hostOf) if (hid === host) bodies.get(id)!.hidden = id !== tab;
  h.querySelectorAll<HTMLElement>(".win-tabs [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
}
export function toggleWindow(id: string, on?: boolean) {
  const host = hostOf.get(id);
  if (host) {   // a tab: show the host at this tab, or close the host when this tab is the one showing
    const h = wins.get(host)!, showing = !h.hidden && h.dataset.tab === id, open = on ?? !showing;
    if (!open) { if (showing || (id === host && !h.hidden)) { h.hidden = true; show(host); h.dispatchEvent(new CustomEvent("win:close")); } return; }
    const was = h.hidden; h.dataset.tab = id; h.hidden = false; h.style.zIndex = String(++z);
    if (was && document.body.classList.contains("touch")) for (const [k, w] of wins) if (!hostOf.has(k) && k !== host && !w.hidden) toggleWindow(k, false);
    show(host); wins.get(id)!.dispatchEvent(new CustomEvent("win:open")); return;
  }
  const el = wins.get(id); if (!el) return; el.hidden = on === undefined ? !el.hidden : !on; if (!el.hidden) el.style.zIndex = String(++z);
  // a phone screen fits one window: opening one closes the rest
  if (!el.hidden && document.body.classList.contains("touch")) for (const [k, w] of wins) if (k !== id && !w.hidden) toggleWindow(k, false);
  el.dispatchEvent(new CustomEvent(el.hidden ? "win:close" : "win:open"));
}
/** Keep a window on screen: one dragged low (or a screen that shrank) would open with its bottom cut off. */
function fit(el: HTMLElement) {
  if (document.body.classList.contains("touch")) return;   // phones place windows by CSS
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(0, Math.min(el.offsetLeft, innerWidth - r.width)) + "px";
  el.style.top = Math.max(0, Math.min(el.offsetTop, innerHeight - r.height)) + "px";
}
// Windows re-render from game state ~10×/s. Swapping the DOM between pointerdown and pointerup eats the click (the
// button pressed is gone), so: skip when the markup is unchanged (compared to what we wrote, not innerHTML, which the
// browser re-serialises differently), and hold off while a press is in progress inside that element.
const written = new WeakMap<Element, string>();
let pressed: Element | null = null;
addEventListener("pointerdown", e => { pressed = e.target as Element; }, true);
/** Writes held off while a button inside was down: done once it is released (not every window has a refresh loop). */
const held = new Map<Element, string>();
const release = () => { pressed = null; for (const [el, html] of held) { held.delete(el); setHTML(el, html); } };
addEventListener("pointerup", () => { setTimeout(release, 0); }, true);   // click fires right after pointerup
addEventListener("pointercancel", release, true);
export function setHTML(el: Element, html: string) {
  if (written.get(el) === html) return;
  if (pressed && el.contains(pressed)) { held.set(el, html); return; }   // written once the button is released
  held.delete(el); written.set(el, html); el.innerHTML = html;
}
export const isOpen = (id: string) => { const host = hostOf.get(id), h = host && wins.get(host); return h ? !h.hidden && h.dataset.tab === id : !(wins.get(id)?.hidden ?? true); };
export function bindMenu() {
  for (const b of document.querySelectorAll<HTMLElement>("#menu [data-ic]")) b.insertAdjacentHTML("afterbegin", icon("MENU_" + b.dataset.ic!));
  for (const b of document.querySelectorAll<HTMLElement>("#menu [data-win]")) b.addEventListener("click", () => toggleWindow(b.dataset.win!));
  addEventListener("keydown", e => { if (e.code === "Escape") for (const id of wins.keys()) toggleWindow(id, false); });
}
/** Run `fn` whenever window `id` opens (a tab of a tabbed window included). */
export const onWindowOpen = (id: string, fn: () => void) => wins.get(id)!.addEventListener("win:open", () => setTimeout(fn));
export const body = (id: string) => bodies.get(id) ?? wins.get(id)!.querySelector<HTMLElement>(".body")!;
