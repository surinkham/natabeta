import * as THREE from "three";
import { scene } from "./scene";
import { daylight } from "./daynight";

// Torches / lamps / lanterns: a small pool of point lights follows the nearest spots to the player and fades in at night.
export const lightSpots: THREE.Vector3[] = [];
const POOL = 4, pool: THREE.PointLight[] = [];   // every enabled point light is shaded per pixel: four is what a 2.5D view needs
let acc = 1;
// the player's lantern: at night a warm light walks with the player, lighting the path a few metres round
const lantern = new THREE.PointLight(0xffe0b0, 0, 11, 1.6);
export function setupLights() {
  for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffb060, 0, 9, 2); l.castShadow = false; scene.add(l); pool.push(l); }
  lantern.castShadow = false; lantern.visible = false; scene.add(lantern);
}
/** Warm-up hook: switch the whole pool on so the "N point lights" shader variants compile before dusk. */
export function forceLights(on: boolean) { pool.forEach((l, i) => { l.visible = on; l.intensity = on ? 3 : 0; if (on) l.position.copy(lightSpots[i] ?? new THREE.Vector3(0, 2, 0)); }); lantern.visible = on; }

export function updateLights(dt: number, center: THREE.Vector3) {
  const night = 1 - daylight(); acc += dt;
  // hidden lights leave the shader entirely, so by day the whole pool switches off instead of shading at zero strength
  if (acc > 0.5) { acc = 0; const near = night > 0.05 ? lightSpots.map(p => ({ p, d: p.distanceTo(center) })).sort((a, b) => a.d - b.d).slice(0, POOL) : []; pool.forEach((l, i) => { if (near[i]) l.position.copy(near[i].p); l.visible = !!near[i]; }); }
  const flicker = 0.9 + 0.1 * Math.sin(performance.now() * 0.02);
  for (const l of pool) l.intensity = 5.5 * night * flicker;
  // switched on and off together with the pool (every 0.5 s above), so dusk costs one shader rebuild, not two
  if (acc === 0) lantern.visible = night > 0.05;
  lantern.position.set(center.x, center.y + 2.4, center.z + 0.8); lantern.intensity = 3.4 * night * (0.97 + 0.03 * Math.sin(performance.now() * 0.011));
}
