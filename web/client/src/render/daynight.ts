import * as THREE from "three";
import { hemi, renderer, scene, sun } from "./scene";
import { gameHours } from "@shared/sim";

// Day/night: one shadow-casting directional light plays sun by day and moon by night; sky, fog, hemisphere and
// exposure follow the sun's elevation. Time is hours [0,24), read from the wall clock (1 real hour = 1 game day), so
// everyone sees the same sky. `paused` exists only for the dev town studio, which freezes a pretty noon.
export const clockState = { hours: gameHours(), paused: false };
const C = {
  skyDay: new THREE.Color(0xa9d3ef), skyDusk: new THREE.Color(0xf0a060), skyNight: new THREE.Color(0x0d1738),
  sunNoon: new THREE.Color(0xfff1dc), sunLow: new THREE.Color(0xffb070), moon: new THREE.Color(0xb8c8ff),
  hemiSkyDay: new THREE.Color(0xcfe6ff), hemiSkyNight: new THREE.Color(0x20345f), hemiGndDay: new THREE.Color(0x82916b), hemiGndNight: new THREE.Color(0x111d19),
};
const tmp = new THREE.Color();
import { nightU } from "./night";

// The moon: the follow camera never shows the sky, so a moon hangs at the top of the screen at night — a pale disc
// with craters and a soft halo that fades in at dusk — and its light lies on the rivers (world/waterways.ts).
let moonEl: HTMLElement | null | undefined;
function moonHud(night: number) {
  if (moonEl === undefined) {
    moonEl = typeof document === "undefined" ? null : Object.assign(document.createElement("div"), { id: "moon", className: "hud" });
    if (moonEl) { moonEl.setAttribute("aria-hidden", "true"); moonEl.innerHTML = `<svg viewBox="0 0 64 64" width="100%" height="100%"><defs><radialGradient id="moon-g" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#fffdf2"/><stop offset=".65" stop-color="#ece6cf"/><stop offset="1" stop-color="#c9c2a8"/></radialGradient></defs>
        <circle cx="32" cy="32" r="26" fill="url(#moon-g)"/><g fill="#b9b196" opacity=".42"><circle cx="24" cy="26" r="5"/><circle cx="39" cy="36" r="7"/><circle cx="30" cy="45" r="3.2"/><circle cx="43" cy="21" r="2.6"/><circle cx="18" cy="38" r="2.2"/></g></svg>`; document.body.append(moonEl); }
  }
  if (!moonEl) return;
  const o = night < 0.05 ? 0 : Math.min(1, night * 1.15), v = o.toFixed(2);
  if (moonEl.style.opacity !== v) moonEl.style.opacity = v;
}

/** 0 = deep night … 1 = full day, from the sun's elevation (smooth over dawn/dusk). */
export function daylight() { return THREE.MathUtils.smoothstep(sunElevation(), -0.12, 0.25); }
export function sunElevation() { return Math.sin((clockState.hours - 6) / 12 * Math.PI); }   // +1 at 12:00, −1 at 00:00

const snapM = new THREE.Matrix4(), snapQ = new THREE.Quaternion(), snapV = new THREE.Vector3(), ZERO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
export function updateDayNight(dt: number, center: THREE.Vector3) {
  if (!clockState.paused) clockState.hours = gameHours();
  const a = (clockState.hours - 6) / 12 * Math.PI;                 // sun angle: 0 sunrise (east) → π sunset (west)
  const el = Math.sin(a), day = daylight();
  const dir = el >= 0 ? new THREE.Vector3(-Math.cos(a), Math.max(el, 0.02), 0.35) : new THREE.Vector3(Math.cos(a), Math.max(-el, 0.02), -0.35);   // moon rises opposite
  dir.normalize();
  // the shadow box follows the player in whole shadow-map texels (in the light's own frame): sliding it by fractions
  // re-rasterised every shadow edge a little differently each frame, so shadows shimmered while walking
  snapQ.setFromRotationMatrix(snapM.lookAt(ZERO, dir, UP)).invert(); snapV.copy(center).applyQuaternion(snapQ);
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  snapV.x = Math.round(snapV.x / texel) * texel; snapV.y = Math.round(snapV.y / texel) * texel; snapV.applyQuaternion(snapQ.invert());
  sun.position.copy(snapV).addScaledVector(dir, 22); sun.target.position.copy(snapV);
  if (el >= 0) { sun.color.copy(C.sunLow).lerp(C.sunNoon, THREE.MathUtils.smoothstep(el, 0, 0.5)); sun.intensity = 0.15 + 2.05 * Math.pow(Math.max(el, 0), 0.6); }
  else { sun.color.copy(C.moon); sun.intensity = 0.28 + 0.65 * Math.pow(Math.max(-el, 0), 0.5); }   // silver moonlight remains readable, but night feels properly dark
  hemi.color.copy(C.hemiSkyNight).lerp(C.hemiSkyDay, day); hemi.groundColor.copy(C.hemiGndNight).lerp(C.hemiGndDay, day); hemi.intensity = 0.4 + 0.75 * day;
  // sky: night → dusk band around the horizon crossing → day
  const dusk = 1 - Math.min(1, Math.abs(el) / 0.22);
  tmp.copy(C.skyNight).lerp(C.skyDay, day).lerp(C.skyDusk, dusk * 0.7);
  (scene.background as THREE.Color).copy(tmp); scene.fog!.color.copy(tmp);
  renderer.toneMappingExposure = 0.76 + 0.29 * day;
  nightU.value = 1 - day; moonHud(1 - day);
}
export const timeString = () => `${String(Math.floor(clockState.hours)).padStart(2, "0")}:${String(Math.floor((clockState.hours % 1) * 60)).padStart(2, "0")}`;
