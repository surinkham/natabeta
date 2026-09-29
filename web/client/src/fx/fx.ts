import * as THREE from "three";
import { scene } from "../render/scene";
import type { Actor } from "../actors/actor";

// Cheap juice (spec W1-08): hit flash, slash trail, footstep dust, camera shake. All pooled, no allocations per frame.
interface Flash { mats: THREE.MeshToonMaterial[]; t: number }
interface Trail { mesh: THREE.Mesh; t: number; life: number }
interface Puff { s: THREE.Sprite; t: number; life: number; size: number; rise?: number }

const flashes: Flash[] = [], trails: Trail[] = [], puffs: Puff[] = [];
let shakeAmp = 0; const shakeOff = new THREE.Vector3();

const white = new THREE.Color(1, 1, 1);
/** Every mesh of the actor goes white-emissive for ~80 ms then eases back. */
export function hitFlash(a: Actor) {
  const mats: THREE.MeshToonMaterial[] = [];
  // base stored as hex: material.clone() JSON-copies userData, which would turn a THREE.Color into a number
  a.obj.traverse((n: any) => { if (n.isMesh && n.material?.emissive) { if (n.material.userData.baseEmissive === undefined) n.material.userData.baseEmissive = n.material.emissive.getHex(); mats.push(n.material); } });
  flashes.push({ mats, t: 0 });
}

const trailGeo = new Map<string, THREE.RingGeometry>();
const trailMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
/** Arc in front of the actor covering the skill cone; grows and fades over `life`. */
export function slashTrail(a: Actor, range: number, coneDeg: number, life = 0.22) {
  const key = `${range}:${coneDeg}`;
  if (!trailGeo.has(key)) trailGeo.set(key, new THREE.RingGeometry(range * 0.35, range, 24, 1, -THREE.MathUtils.degToRad(coneDeg) / 2, THREE.MathUtils.degToRad(coneDeg)));
  const mesh = new THREE.Mesh(trailGeo.get(key)!, trailMat.clone());
  mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = a.yaw - Math.PI / 2;   // Euler XYZ applies Z first: spin the ring in-plane so theta 0 = actor forward (sin yaw, cos yaw)
  mesh.position.copy(a.pos).setY(0.45); scene.add(mesh); trails.push({ mesh, t: 0, life });
}

const puffTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d")!; const r = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  r.addColorStop(0, "rgba(255,255,255,0.9)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const puffPool: THREE.Sprite[] = [];
/** Dust puff at the feet (running, dash landing). */
export function dust(pos: THREE.Vector3, size = 0.35, color = 0xd9c9a6, life = 0.45, y = 0.12, rise = 0.4) {
  const s = puffPool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false }));
  (s.material as THREE.SpriteMaterial).color.set(color); (s.material as THREE.SpriteMaterial).opacity = 0.7;
  s.position.set(pos.x + (Math.random() - 0.5) * 0.3, y, pos.z + (Math.random() - 0.5) * 0.3); s.scale.setScalar(size * 0.5); scene.add(s);
  puffs.push({ s, t: 0, life, size, rise });
}

// ---------------------------------------------------------------- light + glow kit
// One PointLight lives in the scene forever at intensity 0: skills borrow it. Adding or removing a light would change
// every material's shader variant mid-fight, which is exactly the hitch this game already paid for once.
const fxLight = new THREE.PointLight(0xffffff, 0, 9, 2);
fxLight.castShadow = false; scene.add(fxLight);
let lightT = 0, lightLife = 1, lightPeak = 0;
let lightFollow: Actor | null = null;
/** Burst of light at a point (or riding an actor) that fades over `life`. */
export function flash(pos: THREE.Vector3, color: number, peak = 9, life = 0.35, follow: Actor | null = null) {
  fxLight.color.set(color); fxLight.position.copy(pos).setY(pos.y + 0.6);
  lightPeak = peak; lightT = 0; lightLife = life; lightFollow = follow;
}

const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

interface Spark { s: THREE.Sprite; v: THREE.Vector3; t: number; life: number; size: number; gravity: number; aspect: number; shrink: number }
const sparks: Spark[] = [], sparkPool: THREE.Sprite[] = [];
/** Additive motes thrown from a point: impact sparks, rising heal motes, trailing wind. */
export function spark(pos: THREE.Vector3, color: number, v: THREE.Vector3, size = 0.3, life = 0.5, gravity = 2.2, tex: THREE.Texture = glowTex, aspect = 1, shrink = 0.5) {
  const s = sparkPool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const m = s.material as THREE.SpriteMaterial; m.color.set(color); m.opacity = 1; m.map = tex;
  s.position.copy(pos); s.scale.setScalar(size); scene.add(s);
  sparks.push({ s, v: v.clone(), t: 0, life, size, gravity, aspect, shrink });
}
export function sparkBurst(pos: THREE.Vector3, color: number, n = 12, speed = 3.5, up = 2.5, size = 0.3, life = 0.5) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = speed * (0.6 + Math.random() * 0.6);
    spark(pos, color, new THREE.Vector3(Math.cos(a) * r, up * (0.4 + Math.random()), Math.sin(a) * r), size * (0.7 + Math.random() * 0.6), life);
  }
}

interface Beam { mesh: THREE.Mesh; t: number; life: number; follow?: Actor }
const beams: Beam[] = [];
const beamGeo = new THREE.CylinderGeometry(0.42, 0.62, 2.2, 18, 1, true);
/** Column of light around a caster — the "แสงออกมา" of a spell. */
export function beam(a: Actor, color: number, life = 0.7) {
  const mesh = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.position.copy(a.pos).setY(1.1); scene.add(mesh); beams.push({ mesh, t: 0, life, follow: a });
}

// ---------------------------------------------------------------- skill effects
interface Ring { mesh: THREE.Mesh; t: number; life: number; from: number; to: number; spin: number; follow?: Actor; y: number }
const rings: Ring[] = [];
const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
function ring(color: number, life: number, from: number, to: number, opts: { spin?: number; follow?: Actor; y?: number; pos?: THREE.Vector3 } = {}) {
  const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.rotation.x = -Math.PI / 2; const y = opts.y ?? 0.06;
  mesh.position.copy(opts.pos ?? opts.follow!.pos).setY(y); mesh.scale.setScalar(from); scene.add(mesh);
  rings.push({ mesh, t: 0, life, from, to, spin: opts.spin ?? 0, follow: opts.follow, y });
}

/** Bash: golden shockwave, sparks thrown out of the crater and a hard flash of light. */
export function shockwave(pos: THREE.Vector3, range: number) {
  ring(0xffd48a, 0.45, 0.25, range * 1.15, { pos });
  ring(0xfff0c4, 0.28, 0.15, range * 0.7, { pos, y: 0.12 });
  sparkBurst(pos, 0xffc266, 14, 4, 3, 0.34, 0.55);
  for (let i = 0; i < 8; i++) dust(pos, 0.5, 0xe8d3a8);
  flash(pos, 0xffb14d, 16, 0.3); shake(0.16);
}
/** Whirlwind: rings sweeping around the spin, wind motes dragged with them, cold light on the caster. */
export function spinTrail(a: Actor, range: number, life = 0.7) {
  ring(0xbfe6ff, life, range * 0.55, range * 1.05, { spin: 14, follow: a, y: 0.5 });
  ring(0x9fd8ff, life * 0.8, range * 0.35, range * 0.9, { spin: -9, follow: a, y: 0.2 });
  ring(0xe8f6ff, life * 0.6, range * 0.2, range * 0.75, { spin: 18, follow: a, y: 0.85 });
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2, r = range * 0.8;
    const p = new THREE.Vector3(a.pos.x + Math.cos(ang) * r * 0.5, 0.3 + Math.random() * 0.7, a.pos.z + Math.sin(ang) * r * 0.5);
    spark(p, 0xd8f0ff, new THREE.Vector3(Math.cos(ang + 1.2) * 3, 0.8, Math.sin(ang + 1.2) * 3), 0.26, 0.5, -0.4);
  }
  flash(a.pos, 0x8fd0ff, 10, life, a);
}
/** Heal: column of light, ring pulling in, motes drifting up out of the caster. */
export function healAura(a: Actor) {
  ring(0x8ef0a8, 0.8, 1.3, 0.35, { follow: a, y: 0.08 });
  ring(0xd8ffe4, 0.5, 0.2, 1.1, { follow: a, y: 0.5 });
  beam(a, 0x7ff0a0, 0.75);
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.35;
    spark(new THREE.Vector3(a.pos.x + Math.cos(ang) * r, 0.05, a.pos.z + Math.sin(ang) * r), 0x9dffb8,
      new THREE.Vector3(Math.cos(ang) * 0.3, 1.5 + Math.random(), Math.sin(ang) * 0.3), 0.24, 0.8, -0.6);
  }
  flash(a.pos, 0x6cf09a, 9, 0.7, a);
}
/** Cast windup: light gathering into the caster while the arms come up. */
export function castRing(a: Actor, color = 0xbfe6ff) {
  ring(color, 0.45, 1.1, 0.5, { follow: a, y: 0.06, spin: 3 });
  for (let i = 0; i < 6; i++) {
    const ang = Math.random() * Math.PI * 2;
    spark(new THREE.Vector3(a.pos.x + Math.cos(ang) * 1.1, 0.15 + Math.random() * 0.4, a.pos.z + Math.sin(ang) * 1.1), color,
      new THREE.Vector3(-Math.cos(ang) * 1.6, 0.9, -Math.sin(ang) * 1.6), 0.2, 0.45, -0.5);
  }
  flash(a.pos, color, 5, 0.45, a);
}
/** Weapon swing: the arc itself plus a short glint of light on the blade side. */
export function swingGlow(a: Actor, range: number, power = 1, color = 0x9fd8ff) {
  const tip = new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * range * 0.65, 0.5, a.pos.z + Math.cos(a.yaw) * range * 0.65);
  flash(tip, color, 3 * power, 0.18);
  sparkBurst(tip, color, Math.round(3 * power), 1.6 * power, 1.2, 0.2, 0.28);
}

// ---------------------------------------------------------------- projectiles & area spells
// Flights follow the sim's travel time exactly, so the arrow/fireball arrives when the damage number pops.
interface Flight { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; life: number; arc: number; spin: boolean; trail: number; color: number; onEnd?: () => void; tick?: number }
const flights: Flight[] = [];
const arrowGeo = (() => {
  const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5); shaft.rotateX(Math.PI / 2);
  const head = new THREE.ConeGeometry(0.035, 0.1, 6); head.rotateX(Math.PI / 2); head.translate(0, 0, 0.36);
  const fl = new THREE.BoxGeometry(0.07, 0.004, 0.1); fl.translate(0, 0, -0.27);
  const fl2 = fl.clone(); fl2.rotateZ(Math.PI / 2);
  return [shaft, head, fl, fl2];
})();
const arrowMats = [new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0xb8c0cc, metalness: 0.7, roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: 0xf2efe6, side: THREE.DoubleSide })];
function makeArrow() {
  const g = new THREE.Group();
  arrowGeo.forEach((geo, i) => g.add(new THREE.Mesh(geo, arrowMats[Math.min(i, 2)])));
  return g;
}
function flight(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, life: number, o: Partial<Flight> = {}) {
  obj.position.copy(from); scene.add(obj);
  flights.push({ obj, from: from.clone(), to: to.clone(), t: 0, life: Math.max(0.05, life), arc: 0, spin: false, trail: 0, color: 0xffffff, ...o });
}
const fireGeo = new THREE.SphereGeometry(0.16, 14, 10);
function fireball(color: number, size = 1) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.9 * size); g.add(halo); g.scale.setScalar(size);
  return g;
}
const hand = (a: Actor) => new THREE.Vector3(a.pos.x + Math.sin(a.yaw) * 0.35, 0.75 * a.obj.scale.y, a.pos.z + Math.cos(a.yaw) * 0.35);

/** Bow shot: an arrow on a shallow arc from the bow hand to (x,z). */
export function arrowShot(a: Actor, x: number, z: number, travel: number) {
  flight(makeArrow(), hand(a), new THREE.Vector3(x, 0.6, z), travel, { arc: 0.35, onEnd: () => sparkBurst(new THREE.Vector3(x, 0.6, z), 0xfff1d0, 4, 1.4, 1, 0.16, 0.25) });
}
/** Staff: a ball of blue fire trailing motes; bursts into a cold-blue flash where it lands. */
export function blueFire(a: Actor, x: number, z: number, travel: number) {
  const to = new THREE.Vector3(x, 0.6, z);
  flight(fireball(0x3f8cff), hand(a).setY(1.0 * a.obj.scale.y), to, travel, { arc: 0.15, trail: 0x5aa8ff, color: 0x5aa8ff, onEnd: () => {
    ring(0x6fb4ff, 0.4, 0.2, 1.4, { pos: to }); sparkBurst(to, 0x7fc0ff, 14, 3, 2.2, 0.3, 0.5); sparkBurst(to, 0xffffff, 5, 1.5, 1.5, 0.2, 0.3); flash(to, 0x4f9dff, 12, 0.35);
  } });
  flash(hand(a), 0x4f9dff, 5, 0.25);
}
/** Arrow Rain: a marked circle, then `waves` volleys dropping out of the sky over it. */
export function arrowRain(x: number, z: number, radius: number, delay: number, waves = 3, c1 = 0xffe0a0, c2 = 0xfff4d8) {
  const c = new THREE.Vector3(x, 0, z);
  ring(c1, delay + waves * 0.35, radius, radius, { pos: c, y: 0.05 }); ring(c2, delay, radius * 0.2, radius, { pos: c, y: 0.07 });
  for (let w = 0; w < waves; w++) for (let i = 0; i < 9; i++) {
    const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius, land = new THREE.Vector3(x + Math.cos(ang) * r, 0.05, z + Math.sin(ang) * r);
    const fall = 0.35, start = delay + w * 0.35 - fall;
    setTimeout(() => flight(makeArrow(), land.clone().add(new THREE.Vector3(-0.8, 7, -0.8)), land, fall, { trail: c1 === 0xffe0a0 ? 0 : c1, onEnd: () => { dust(land, 0.35, 0xd8c8a8); if (i % 3 === 0) sparkBurst(land, c2, 3, 1.2, 1, 0.14, 0.2); } }), Math.max(0, start) * 1000);
  }
  setTimeout(() => shake(0.1), delay * 1000);
}
/** Blazing Meteor: a warning ring, a burning rock falling steeply, then a fireburst that keeps smouldering. */
export function meteor(x: number, z: number, radius: number, delay: number, c1 = 0xff7a2a, c2 = 0xffc070) {
  const c = new THREE.Vector3(x, 0, z);
  ring(c1, delay, radius * 1.1, radius, { pos: c, y: 0.05, spin: 1.5 }); ring(c2, delay, radius * 0.1, radius * 0.9, { pos: c, y: 0.07 });
  const fall = Math.min(0.7, delay);
  setTimeout(() => flight(fireball(c1, 2.4), c.clone().add(new THREE.Vector3(3, 11, 2)), c.clone().setY(0.3), fall, { trail: c1, color: c1, onEnd: () => {
    ring(c2, 0.55, 0.3, radius * 1.3, { pos: c }); ring(c1, 0.8, 0.2, radius, { pos: c, y: 0.12 });
    sparkBurst(c.clone().setY(0.3), c1, 28, 6, 5, 0.45, 0.8); sparkBurst(c.clone().setY(0.3), c2, 10, 3, 4, 0.3, 0.5);
    for (let i = 0; i < 12; i++) dust(c, 0.9, 0x5a4a40);
    flash(c.clone().setY(1), c1, 26, 0.6); shake(0.35);
    for (let k = 0; k < 10; k++) setTimeout(() => {                     // embers smouldering on the ground
      const ang = Math.random() * Math.PI * 2, r = Math.random() * radius;
      spark(new THREE.Vector3(x + Math.cos(ang) * r, 0.1, z + Math.sin(ang) * r), c1, new THREE.Vector3(0, 1.2 + Math.random(), 0), 0.3, 0.7, -0.3);
    }, k * 120);
  } }), (delay - fall) * 1000);
}
/** Frost Nova: an ice ring bursting out of the caster, shards thrown flat along the ground. */
export function frostNova(x: number, z: number, radius: number) {
  const c = new THREE.Vector3(x, 0, z);
  ring(0xbfe6ff, 0.5, 0.3, radius * 1.1, { pos: c }); ring(0x6fb4ff, 0.7, 0.2, radius, { pos: c, y: 0.15, spin: 4 });
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; spark(c.clone().setY(0.3), 0xd8f0ff, new THREE.Vector3(Math.cos(a) * radius * 2.4, 0.6, Math.sin(a) * radius * 2.4), 0.3, 0.45, 1); }
  flash(c.clone().setY(1), 0x7fc0ff, 14, 0.4); shake(0.12);
}
// ---------------------------------------------------------------- boss telegraphs
// Red warning circle: a dim disc with a bright rim, and a fill that grows from the centre to the rim over `windup` —
// when the fill reaches the edge the hit lands, so the player can read exactly how long they have to step out.
interface Tele { group: THREE.Group; fill: THREE.Mesh; t: number; life: number; radius: number }
const teles: Tele[] = [];
const discGeo = new THREE.CircleGeometry(1, 48), rimGeo = new THREE.RingGeometry(0.94, 1, 64);
export function telegraph(x: number, z: number, radius: number, windup: number) {
  const g = new THREE.Group(); g.position.set(x, 0.04, z); g.rotation.x = -Math.PI / 2; g.scale.setScalar(radius);
  const mat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(discGeo, mat(0xff2a1a, 0.16)), new THREE.Mesh(rimGeo, mat(0xff4a2a, 0.9)));
  const fill = new THREE.Mesh(discGeo, mat(0xff3a20, 0.32)); fill.position.z = 0.002; fill.scale.setScalar(0.01); g.add(fill);
  scene.add(g); teles.push({ group: g, fill, t: 0, life: windup, radius });
}
/** The warned attack lands: a hard red-orange burst over the whole circle. */
export function slamBurst(x: number, z: number, radius: number) {
  const c = new THREE.Vector3(x, 0, z);
  ring(0xff5a2a, 0.45, radius * 0.4, radius * 1.1, { pos: c }); ring(0xffd0a0, 0.3, 0.2, radius * 0.8, { pos: c, y: 0.12 });
  sparkBurst(c.clone().setY(0.3), 0xff6a3a, 20, 5, 3, 0.36, 0.55); for (let i = 0; i < 8; i++) dust(c, 0.7, 0x6a5040);
  flash(c.clone().setY(1), 0xff4a2a, 18, 0.35); shake(0.25);
}

/** Thunder Strike: a jagged bolt out of the sky, a white-blue flash and a crackling ring on the ground. */
export function lightning(x: number, z: number, radius: number, delay: number) {
  const c = new THREE.Vector3(x, 0, z);
  ring(0xbfe0ff, delay + 0.1, radius * 0.3, radius, { pos: c, y: 0.05, spin: 6 });
  setTimeout(() => {
    const pts: THREE.Vector3[] = []; let p = c.clone().setY(9);
    for (let i = 0; i < 9; i++) { pts.push(p.clone()); p = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, -1, (Math.random() - 0.5) * 0.9)); }
    pts.push(c.clone().setY(0.05));
    const bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 40, 0.07, 5), new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(bolt); trails.push({ mesh: bolt, t: 0, life: 0.25 });
    ring(0x9fd0ff, 0.35, 0.2, radius * 1.2, { pos: c }); sparkBurst(c.clone().setY(0.3), 0xcfe8ff, 18, 5, 3, 0.3, 0.45);
    flash(c.clone().setY(2), 0xbfe0ff, 30, 0.25); shake(0.2);
  }, delay * 1000);
}
/** Flame Blade / Cinder Cleave: a wave of fire — a burning crescent leaves the blade and a front of real flames rolls
 *  out across the swing, row after row, to the skill's reach, leaving smoke behind. */
export function flameBlade(a: Actor, range: number, cone: number) {
  const yaw = a.yaw, half = THREE.MathUtils.degToRad(cone) / 2, x0 = a.pos.x, z0 = a.pos.z;
  crescent(x0, z0, yaw, range, 0xff7a2a, 1.3, 0.4); crescent(x0, z0, yaw, range * 0.85, 0xffd070, 0.9, 0.35);
  const rows = 6;
  for (let r = 1; r <= rows; r++) setTimeout(() => {
    const d = range * r / rows, n = 2 + r;
    for (let k = 0; k < n; k++) {
      const ang = yaw - half + (2 * half) * (n === 1 ? 0.5 : k / (n - 1)), x = x0 + Math.sin(ang) * d, z = z0 + Math.cos(ang) * d;
      flames(x, z, 0.18, 0.35, 0xff6a1a, 0xffc040, 30);
      if (r === rows) groundGlow(x, z, 0.6, 0xff6a1a, 0.8, 0.6);
    }
    if (r % 2 === 0) smoke(x0 + Math.sin(yaw) * d, z0 + Math.cos(yaw) * d, 0.5, 0.3, 0x2a1e18, 8, 1.1);
  }, r * 45);
  flash(a.pos.clone().setY(1), 0xff7a2a, 14, 0.4, a);
}

/** Healing Circle: a wide green ring reaching the party, motes rising everywhere inside it. */
export function healCircle(a: Actor, radius: number) {
  ring(0x8ef0a8, 0.9, 0.5, radius, { pos: a.pos.clone(), y: 0.06 }); ring(0xd8ffe4, 0.7, radius, radius * 0.3, { follow: a, y: 0.1, spin: 2 });
  for (let i = 0; i < 26; i++) {
    const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    spark(new THREE.Vector3(a.pos.x + Math.cos(ang) * r, 0.05, a.pos.z + Math.sin(ang) * r), 0x9dffb8, new THREE.Vector3(0, 1.4 + Math.random(), 0), 0.24, 0.9, -0.5);
  }
  beam(a, 0x7ff0a0, 0.8); flash(a.pos, 0x6cf09a, 12, 0.8, a);
}


// ---------------------------------------------------------------- sword wave, earth spikes, ice crystals, chill
interface Wave { mesh: THREE.Mesh; x: number; z: number; dx: number; dz: number; dist: number; t: number; life: number; base?: number }
const waves: Wave[] = [];
/** Slash: a crescent of blade-light that leaves the sword and flies out along the swing to `range`. */
export function swordWave(a: Actor, range: number, color = 0xbfe6ff) {
  const geo = new THREE.RingGeometry(0.5, 0.78, 28, 1, -1.05, 2.1);   // centred on theta 0: the crescent bulges forward
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.rotation.set(-Math.PI / 2, 0, a.yaw - Math.PI / 2);   // as slashTrail: theta 0 = the actor's forward
  const dx = Math.sin(a.yaw), dz = Math.cos(a.yaw); mesh.position.set(a.pos.x + dx * 0.4, 0.62, a.pos.z + dz * 0.4); scene.add(mesh);
  waves.push({ mesh, x: a.pos.x + dx * 0.4, z: a.pos.z + dz * 0.4, dx, dz, dist: Math.max(0.5, range - 0.2), t: 0, life: 0.32 });
  flash(a.pos.clone().setY(0.8), color, 6, 0.2, a);
}

interface Spike { mesh: THREE.Mesh; t: number; life: number; h: number; y0: number }
const spikes: Spike[] = [];
const spikeGeo = new THREE.ConeGeometry(1, 1, 5, 1); spikeGeo.translate(0, 0.5, 0);
const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.95, flatShading: true });
const iceMat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.15, metalness: 0.1, emissive: 0x2a6aa8, emissiveIntensity: 0.55, transparent: true, opacity: 0.88, flatShading: true });
/** Shards thrust up out of the ground in a ring and rings inside it, hold a moment, then sink back. */
function spikeField(x: number, z: number, radius: number, mat: THREE.Material, n: number, h: [number, number], w: number, life: number) {
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2, r = radius * (0.25 + Math.sqrt(Math.random()) * 0.8), hh = h[0] + Math.random() * (h[1] - h[0]);
    const mesh = new THREE.Mesh(spikeGeo, mat); mesh.castShadow = true;
    mesh.position.set(x + Math.cos(ang) * r, 0, z + Math.sin(ang) * r);
    mesh.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 6.28, (Math.random() - 0.5) * 0.5); mesh.scale.set(w * (0.7 + Math.random() * 0.6), 0.01, w * (0.7 + Math.random() * 0.6));
    scene.add(mesh); spikes.push({ mesh, t: -Math.random() * 0.08, life, h: hh, y0: 0 });
  }
}
/** Ground Slam: the earth breaks — rock spikes burst out across the circle in a cloud of dust. */
export function earthSpikes(x: number, z: number, radius: number) {
  spikeField(x, z, radius, rockMat, 16, [0.45, 1.1], 0.22, 0.9);
  const c = new THREE.Vector3(x, 0, z); for (let i = 0; i < 10; i++) dust(c, 0.9, 0x8a7458);
}
/** Frost Nova / Glacier Ring: ice crystals grow out of the ground where it lands. */
export function iceCrystals(x: number, z: number, radius: number) { spikeField(x, z, radius, iceMat, 14, [0.5, 1.2], 0.16, 1.4); }

interface Chill { mats: THREE.MeshToonMaterial[]; t: number; life: number }
const chills: Chill[] = [];
const frost = new THREE.Color(0x7fc8ff);
/** War Cry: a golden column and a ring bursting out of each buffed body, embers rising. */
export function buffAura(a: Actor, color = 0xffc94a) {
  ring(color, 0.7, 0.3, 1.6, { follow: a, y: 0.08 }); ring(0xfff0c0, 0.5, 1.2, 0.4, { follow: a, y: 0.6, spin: 5 });
  beam(a, color, 0.8); sparkBurst(a.pos.clone().setY(0.4), color, 12, 1.4, 2.6, 0.26, 0.7); flash(a.pos, color, 10, 0.6, a);
}
/** Level up: a gold pillar of light, rings racing out along the ground, sparks spiralling up round the body and a
 *  burst of stars overhead. */
export function levelUpFx(a: Actor) {
  beam(a, 0xffd86a, 1.8); flash(a.pos, 0xffd86a, 16, 1.1, a);
  ring(0xffe08a, 1.0, 0.3, 2.8, { follow: a, y: 0.06 }); ring(0xfff4d0, 0.8, 0.2, 1.8, { follow: a, y: 0.06 });
  ring(0xffd060, 1.4, 1.2, 0.4, { follow: a, y: 1.3, spin: 4 });
  for (let i = 0; i < 30; i++) {
    const ang = (i / 30) * Math.PI * 4, r = 0.7;
    spark(new THREE.Vector3(a.pos.x + Math.cos(ang) * r, 0.1 + i * 0.03, a.pos.z + Math.sin(ang) * r), i % 3 ? 0xffe27a : 0xffffff,
      new THREE.Vector3(-Math.sin(ang) * 1.1, 2.2 + Math.random(), Math.cos(ang) * 1.1), 0.26, 1.1, -0.4);
  }
  sparkBurst(a.pos.clone().setY(2.2), 0xfff0a0, 22, 3.2, 2.4, 0.32, 1.0);
}
/** Boss skills get the heroes' effects, picked by what the skill is called: fire rains meteors, ice freezes the ground,
 *  storms strike lightning, quakes raise spikes, venom and spores burst green, shadow and blood burst dark, swarms rain
 *  down. `windup` (on the warning) starts what falls from the sky so it lands with the hit; `impact` is the hit itself. */
const BOSS_THEMES: [RegExp, string][] = [
  [/fire|flame|magma|molten|inferno|ember|cataclysm|meteor|sun|\bra\b|wrath|charge/i, "fire"], [/frost|ice|glacier|polar|winter|crystal|shard|aurora|snow|breath/i, "ice"],
  [/thunder|storm|lightning|star|moon|lunar|howl|roar/i, "storm"], [/swarm|rain|crow|pollen|dust|gust/i, "swarm"],
  [/venom|spore|plague|blight|bog|mire|swamp|toxic|bloom|maw|devour/i, "venom"], [/eclipse|void|wraith|reaper|shadow|crimson|blood|wail|curse|doom|spirit/i, "shadow"],
  [/quake|stomp|slam|collapse|burrow|root|thorn|sand|dune|tomb|leap|pounce|lunge|dive|step|strike|sweep|cleave|bite/i, "earth"],
];
const bossTheme = (name = "") => BOSS_THEMES.find(([re]) => re.test(name))?.[1] ?? "earth";
export function bossSkillFx(when: "windup" | "impact", name: string | undefined, x: number, z: number, radius: number, windup = 0) {
  const t = bossTheme(name), at = new THREE.Vector3(x, 0.3, z);
  if (when === "windup") {
    if (t === "fire") meteor(x, z, radius, windup);
    else if (t === "storm") lightning(x, z, radius, windup);
    else if (t === "swarm") arrowRain(x, z, radius, windup, 3, 0x3a2a4a, 0x9a8aa8);
    return;
  }
  slamBurst(x, z, radius);
  if (t === "ice") { frostNova(x, z, radius); iceCrystals(x, z, radius); }
  else if (t === "earth") earthSpikes(x, z, radius);
  else if (t === "venom") { sparkBurst(at, 0x7ee04a, 26, 3, 3.2, 0.42, 1.1); flash(at, 0x6ad040, 10, 0.6); }
  else if (t === "shadow") { sparkBurst(at, 0x8a3ad0, 26, 3.4, 2.6, 0.45, 1.0); sparkBurst(at, 0xff4a7a, 12, 2, 3.5, 0.3, 0.8); flash(at, 0x9a4aff, 12, 0.7); }
  else if (t === "fire") { sparkBurst(at, 0xff7a2a, 22, 3.6, 3, 0.4, 0.9); flash(at, 0xff8a3a, 14, 0.6); }
  else if (t === "storm") flash(at, 0xcfe6ff, 16, 0.4);
}
/** Slowed by ice: the body glows frost-blue until the slow wears off. */
export function chill(a: Actor, life: number) {
  const mats: THREE.MeshToonMaterial[] = [];
  a.obj.traverse((n: any) => { if (n.isMesh && n.material?.emissive) { if (n.material.userData.baseEmissive === undefined) n.material.userData.baseEmissive = n.material.emissive.getHex(); mats.push(n.material); } });
  chills.push({ mats, t: 0, life }); sparkBurst(a.pos.clone().setY(0.6), 0xd8f0ff, 6, 1.2, 1.2, 0.2, 0.4);
}



// ---- volume for the special skills: flames, smoke, ground glow, a black-hole sphere (not just rings)
const flameTex = (() => {   // a tongue of fire, tall: white-hot root, orange body, a red tip that fades out
  const c = document.createElement("canvas"); c.width = 32; c.height = 80; const g = c.getContext("2d")!;
  const tongue = (w: number, top: number) => { g.beginPath(); g.moveTo(16, top); g.bezierCurveTo(16 + w * 0.2, top + 22, 16 + w, 44, 16 + w * 0.8, 62); g.quadraticCurveTo(16, 82, 16 - w * 0.8, 62); g.bezierCurveTo(16 - w, 44, 16 - w * 0.2, top + 22, 16, top); g.fill(); };
  const outer = g.createLinearGradient(0, 80, 0, 0); outer.addColorStop(0, "rgba(255,210,120,0.9)"); outer.addColorStop(0.35, "rgba(255,120,30,0.85)"); outer.addColorStop(0.75, "rgba(200,40,10,0.45)"); outer.addColorStop(1, "rgba(120,20,0,0)");
  g.fillStyle = outer; tongue(14, 2);
  const inner = g.createLinearGradient(0, 80, 0, 20); inner.addColorStop(0, "rgba(255,255,235,1)"); inner.addColorStop(0.5, "rgba(255,230,140,0.8)"); inner.addColorStop(1, "rgba(255,180,60,0)");
  g.fillStyle = inner; tongue(7, 26);
  return new THREE.CanvasTexture(c); })();
/** Licking flames rising from a point for `secs` (fire skills): tall tongues that rise fast, sway and burn down. */
const FIRE_SHADES = [0xff3a0a, 0xff6a14, 0xff9a2a, 0xffc24a];
function flames(x: number, z: number, r: number, secs: number, color: number, color2: number, rate = 30) {
  for (let k = 0; k < Math.round(secs * rate); k++) setTimeout(() => { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r, pick = Math.random();
    const col = pick < 0.35 ? color : pick < 0.6 ? color2 : FIRE_SHADES[Math.floor(Math.random() * FIRE_SHADES.length)];
    spark(new THREE.Vector3(x + Math.cos(a) * d, 0.12, z + Math.sin(a) * d), col, new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.4 + Math.random() * 1.8, (Math.random() - 0.5) * 0.6),
      0.16 + Math.random() * 0.16, 0.34 + Math.random() * 0.22, -1.2, flameTex, 2.3, 0.75); }, (k / rate) * 1000);
}
/** Heavy smoke / mist: big soft puffs that hang and drift up slowly. */
function smoke(x: number, z: number, r: number, secs: number, color: number, rate = 10, size = 1.8) {
  for (let k = 0; k < Math.round(secs * rate); k++) setTimeout(() => { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r;
    dust(new THREE.Vector3(x + Math.cos(a) * d, 0, z + Math.sin(a) * d), size * (0.7 + Math.random() * 0.6), color, 1.4 + Math.random() * 0.8, 0.3 + Math.random() * 0.5, 0.25); }, (k / rate) * 1000);
}
/** A soft glowing patch on the ground (the light a spell throws on the grass). */
function groundGlow(x: number, z: number, r: number, color: number, life: number, peak = 0.8) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: peak, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.04, z); fadeOut(m, life);
}
/** Motes drifting up through a column (holy light, snow the other way round with a negative lift). */
function motes(x: number, z: number, r: number, n: number, color: number, lift = 1.6, life = 1.2) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r;
    spark(new THREE.Vector3(x + Math.cos(a) * d, lift > 0 ? 0.1 + Math.random() : 3 + Math.random() * 2, z + Math.sin(a) * d), color, new THREE.Vector3((Math.random() - 0.5) * 0.5, lift * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 0.5), 0.14 + Math.random() * 0.14, life, 0); }
}
interface Hole { core: THREE.Mesh; disc: THREE.Mesh; t: number; grow: number; life: number; r: number }
const holes: Hole[] = [];
const discTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 18, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(0.3, "rgba(255,255,255,1)"); r.addColorStop(0.55, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); g.globalCompositeOperation = "destination-out"; g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 6;
  for (let i = 0; i < 5; i++) { g.beginPath(); for (let t = 0; t < 1; t += 0.02) { const a = t * 5 + i * 1.26, rr = 20 + t * 44; g.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } g.stroke(); }   // spiral arms
  return new THREE.CanvasTexture(c); })();
/** Black hole: a black sphere swelling in the air with a glowing, spinning accretion disc, then collapsing. */
function blackHole(x: number, z: number, r: number, grow: number, color: number) {
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x050008 })); core.position.set(x, 1.2, z); core.scale.setScalar(0.05);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: discTex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  disc.position.set(x, 1.2, z); disc.rotation.x = -Math.PI / 2 + 0.35; scene.add(core, disc); holes.push({ core, disc, t: 0, grow: Math.max(0.3, grow), life: Math.max(0.3, grow) + 0.5, r });
}

// ---------------------------------------------------------------- special skills (skills.json `special`: style + colours)
// Thirty boss-tome skills share these building blocks; the style picks the shape, the two colours make each its own.
interface Fade { obj: THREE.Mesh; t: number; life: number; peak: number; grow?: number }
const fades: Fade[] = [];
function fadeOut(obj: THREE.Mesh, life: number, grow = 0) { const m = obj.material as THREE.MeshBasicMaterial; scene.add(obj); fades.push({ obj, t: 0, life, peak: m.opacity, grow }); }
const glowMat = (color: number, opacity = 0.9) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
/** A crescent of light flying from (x,z) along `yaw` for `dist` metres. */
function crescent(x: number, z: number, yaw: number, dist: number, color: number, scale = 1, life = 0.32) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.78, 28, 1, -1.05, 2.1), glowMat(color, 0.95));
  mesh.rotation.set(-Math.PI / 2, 0, yaw - Math.PI / 2); mesh.scale.setScalar(scale); scene.add(mesh);
  waves.push({ mesh, x, z, dx: Math.sin(yaw), dz: Math.cos(yaw), dist, t: 0, life, base: scale });
}
const matCache = new Map<number, THREE.MeshStandardMaterial>();
const crystalMat = (color: number, ice: boolean) => { const k = color * 2 + (ice ? 1 : 0); let m = matCache.get(k);
  if (!m) matCache.set(k, m = ice ? new THREE.MeshStandardMaterial({ color, roughness: 0.15, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.88, flatShading: true }) : new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
  return m; };
function pillar(x: number, z: number, r: number, color: number, color2: number) {
  const col = new THREE.Mesh(beamGeo, glowMat(color, 0.55)); col.position.set(x, 5, z); col.scale.set(r * 1.1, 5, r * 1.1); fadeOut(col, 0.7);
  const core = new THREE.Mesh(beamGeo, glowMat(color2, 0.8)); core.position.set(x, 5, z); core.scale.set(r * 0.35, 5, r * 0.35); fadeOut(core, 0.5);
  const c = new THREE.Vector3(x, 0, z); groundGlow(x, z, r * 1.5, color, 1.2); ring(color2, 0.45, 0.3, r * 1.2, { pos: c });
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28, shaft = new THREE.Mesh(beamGeo, glowMat(color2, 0.35)); shaft.position.set(x + Math.cos(a) * r * 0.6, 5, z + Math.sin(a) * r * 0.6); shaft.scale.set(0.15, 5, 0.15); fadeOut(shaft, 0.5 + i * 0.08); }
  motes(x, z, r, 30, color2, 2.4, 1.3); sparkBurst(c.clone().setY(0.3), color2, 18, 3, 5, 0.3, 0.7); flash(c.clone().setY(2), color, 24, 0.5); shake(0.2);
}
function implode(x: number, z: number, r: number, delay: number, color: number, color2: number) {
  const c = new THREE.Vector3(x, 0, z);
  blackHole(x, z, r, delay, color2); groundGlow(x, z, r * 1.3, color, delay + 0.6, 0.6); ring(color, Math.max(0.2, delay), r * 1.4, 0.2, { pos: c, spin: -6 });
  for (let k = 0; k < 6; k++) setTimeout(() => smoke(x, z, r * 1.2, 0.1, 0x2a1a40, 20, 1.2), k * delay * 150);
  for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28, d = r * (0.8 + Math.random() * 0.5);
    spark(new THREE.Vector3(x + Math.cos(a) * d, 0.3 + Math.random(), z + Math.sin(a) * d), color2, new THREE.Vector3(-Math.cos(a) * d / Math.max(0.2, delay), 0, -Math.sin(a) * d / Math.max(0.2, delay)), 0.28, Math.max(0.2, delay), 0); }
  setTimeout(() => { ring(color2, 0.45, 0.2, r * 1.3, { pos: c }); sparkBurst(c.clone().setY(0.6), color, 22, 5, 3, 0.36, 0.6); flash(c.clone().setY(1.5), color2, 22, 0.4); shake(0.25); }, delay * 1000);
}
const bladeGeo = (() => { const b = new THREE.BoxGeometry(0.12, 0.5, 3.2); const g = new THREE.BoxGeometry(0.9, 0.12, 0.14); g.translate(0, 0, -1.2); return [b, g]; })();
function skyBlade(x: number, z: number, r: number, delay: number, color: number, color2: number) {
  const c = new THREE.Vector3(x, 0, z), fall = Math.min(0.45, delay), blade = new THREE.Group();
  blade.add(new THREE.Mesh(bladeGeo[0], glowMat(color, 0.9)), new THREE.Mesh(bladeGeo[1], glowMat(color2, 0.9)));
  ring(color, delay, r, r, { pos: c, y: 0.05, spin: 2 });
  setTimeout(() => flight(blade, c.clone().add(new THREE.Vector3(0.2, 10, 0.2)), c.clone().setY(1.3), fall, { trail: color2, onEnd: () => {
    ring(color2, 0.5, 0.2, r * 1.3, { pos: c }); sparkBurst(c.clone().setY(0.4), color, 20, 5, 3, 0.34, 0.55); for (let i = 0; i < 8; i++) dust(c, 0.8, 0xcfc4b0);
    flash(c.clone().setY(1.5), color, 20, 0.4); shake(0.3); spikeField(x, z, r * 0.8, crystalMat(color, true), 8, [0.3, 0.8], 0.12, 0.8);
  } }), (delay - fall) * 1000);
}
function cross(x: number, z: number, r: number, color: number, color2: number) {
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4;
    for (let s = 1; s <= 4; s++) setTimeout(() => { const p = new THREE.Vector3(x + Math.cos(a) * r * s / 4, 0.3, z + Math.sin(a) * r * s / 4);
      flames(p.x, p.z, 0.45, 0.6, color, color2, 26); groundGlow(p.x, p.z, 0.9, color, 0.9, 0.7); sparkBurst(p, color2, 4, 1.6, 3, 0.26, 0.5); }, s * 70); }
  smoke(x, z, r, 0.8, 0x3a2a22, 10, 1.4); flash(new THREE.Vector3(x, 1, z), color, 20, 0.5); shake(0.2);
}
function cloud(x: number, z: number, r: number, secs: number, color: number, color2: number) {
  groundGlow(x, z, r * 1.2, color, secs + 1, 0.5); smoke(x, z, r, secs, color, 16, 2.2); smoke(x, z, r * 0.7, secs, color2, 6, 1.4);
  for (let k = 0; k < Math.round(secs * 6); k++) setTimeout(() => motes(x, z, r, 3, color2, 0.8, 1.0), k * 160);
}
function hail(x: number, z: number, r: number, delay: number, n: number, color: number) {
  const c = new THREE.Vector3(x, 0, z); ring(color, delay + n * 0.35, r, r, { pos: c, y: 0.05, spin: 1 });
  for (let w = 0; w < n; w++) for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r, land = new THREE.Vector3(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d);
    const shard = new THREE.Mesh(spikeGeo, crystalMat(color, true)); shard.scale.set(0.08, 0.35, 0.08);
    setTimeout(() => flight(shard, land.clone().add(new THREE.Vector3(-0.5, 7, -0.5)), land, 0.35, { onEnd: () => { sparkBurst(land, 0xffffff, 3, 1, 1, 0.14, 0.2); } }), Math.max(0, delay + w * 0.35 - 0.35) * 1000);
  }
}
function flare(x: number, z: number, r: number, color: number, color2: number) {
  const c = new THREE.Vector3(x, 0, z); groundGlow(x, z, r * 1.6, color, 1.0); ring(color, 0.6, 0.3, r * 1.4, { pos: c });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 20, 14), glowMat(color2, 0.9)); sun.position.set(x, 1.1, z); fadeOut(sun, 0.5);
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; lineTo(new THREE.Vector3(x, 1.1, z), new THREE.Vector3(x + Math.cos(a) * r * 1.3, 0.4 + Math.random(), z + Math.sin(a) * r * 1.3), color, 0.05, 0.35); }
  sparkBurst(c.clone().setY(0.5), color, 30, 6, 4, 0.4, 0.7); sparkBurst(c.clone().setY(0.5), color2, 12, 3, 5, 0.3, 0.5); flash(c.clone().setY(1.5), color, 32, 0.6); shake(0.25);
}
function lineTo(from: THREE.Vector3, to: THREE.Vector3, color: number, width = 0.06, life = 0.3) {
  const len = from.distanceTo(to), m = new THREE.Mesh(new THREE.CylinderGeometry(width, width, len, 6, 1, true), glowMat(color, 0.9));
  m.position.copy(from).lerp(to, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()); fadeOut(m, life);
}
function bolt(from: THREE.Vector3, to: THREE.Vector3, color: number) {
  const pts: THREE.Vector3[] = [], n = 8; for (let i = 0; i <= n; i++) { const p = from.clone().lerp(to, i / n); if (i && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)); pts.push(p); }
  fadeOut(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 24, 0.05, 5), glowMat(color, 0.95)), 0.28);
}
function lance(a: Actor, x: number, z: number, travel: number, color: number, onEnd: () => void) {
  const m = new THREE.Mesh(spikeGeo, crystalMat(color, true)); m.scale.set(0.12, 1.1, 0.12); m.rotation.x = Math.PI / 2;
  const g = new THREE.Group(); g.add(m); flight(g, hand(a), new THREE.Vector3(x, 0.6, z), travel, { trail: 0xffffff, onEnd });
}
function orb(a: Actor, x: number, z: number, travel: number, color: number, size: number, onEnd: () => void) {
  flight(fireball(color, size), hand(a).setY(1.0 * a.obj.scale.y), new THREE.Vector3(x, 0.6, z), travel, { arc: 0.15, trail: color, color, onEnd });
}
function coloredArrow(a: Actor, x: number, z: number, travel: number, color: number, onEnd: () => void) {
  flight(makeArrow(), hand(a), new THREE.Vector3(x, 0.6, z), travel, { arc: 0.2, trail: color, color, onEnd });
}
const hex = (c?: string, d = 0xffffff) => (c ? parseInt(c.slice(1), 16) : d);
export interface SpecialSpec { style?: string; color?: string; color2?: string; range?: number; radius?: number; cone?: number; waves?: number; delay?: number }
/** One special skill's look. `when`: "cast" (melee styles, at the contact frame), "shot" (projectiles: fly to x,z over
 *  travel), "aoe" (areas at x,z, landing after delay). */
export function specialFx(when: "cast" | "shot" | "aoe", S: SpecialSpec, a: Actor, x = a.pos.x, z = a.pos.z, travel = 0.3, delay = S.delay ?? 0) {
  const c1 = hex(S.color), c2 = hex(S.color2), R = S.range ?? 2, r = S.radius ?? 2, yaw = a.yaw, fx = a.pos.x, fz = a.pos.z;
  const at = new THREE.Vector3(x, 0, z);
  if (when === "cast") switch (S.style) {
    case "fan": for (const d of [-0.45, 0, 0.45]) crescent(fx, fz, yaw + d, R, c1, 1.1); flash(a.pos.clone().setY(0.8), c1, 10, 0.3, a); return;
    case "spin": ring(c1, 0.6, R * 0.5, R * 1.05, { spin: 16, follow: a, y: 0.5 }); ring(c2, 0.5, R * 0.3, R * 0.9, { spin: -12, follow: a, y: 0.2 });
      for (let k = 0; k < 4; k++) crescent(fx, fz, yaw + k * Math.PI / 2, R * 0.8, c1, 1.2, 0.4); flash(a.pos, c1, 14, 0.5, a); return;
    case "cone-spikes": case "cone-ice": { const ice = S.style === "cone-ice";
      for (let i = 0; i < 9; i++) setTimeout(() => { const d = R * (0.2 + (i / 9) * 0.8), ang = yaw + (Math.random() - 0.5) * THREE.MathUtils.degToRad(S.cone ?? 40) * 0.8;
        spikeField(fx + Math.sin(ang) * d, fz + Math.cos(ang) * d, 0.3, crystalMat(ice ? c1 : c1, ice), 2, [0.5, 1.1], ice ? 0.12 : 0.2, 0.9); dust(new THREE.Vector3(fx + Math.sin(ang) * d, 0, fz + Math.cos(ang) * d), 0.6, ice ? 0xe8f6ff : c2); }, i * 35);
      shake(0.15); return; }
    case "thunder-cone": crescent(fx, fz, yaw, R, c1, 1); { const p = new THREE.Vector3(fx + Math.sin(yaw) * R * 0.7, 0, fz + Math.cos(yaw) * R * 0.7); bolt(p.clone().setY(8), p.clone().setY(0.05), c2); ring(c2, 0.35, 0.2, 1.4, { pos: p }); sparkBurst(p.clone().setY(0.3), c1, 12, 3, 2, 0.26, 0.4); flash(p.clone().setY(2), c2, 22, 0.25); shake(0.15); } return;
    case "dashline": for (let i = 0; i < 16; i++) { const d = (i / 16) * R; spark(new THREE.Vector3(fx + Math.sin(yaw) * d, 0.6, fz + Math.cos(yaw) * d), i % 2 ? c1 : c2, new THREE.Vector3(0, 0.6, 0), 0.34, 0.45, 0); }
      lineTo(a.pos.clone().setY(0.6), new THREE.Vector3(fx + Math.sin(yaw) * R, 0.6, fz + Math.cos(yaw) * R), c1, 0.08, 0.3); crescent(fx, fz, yaw, R, c2, 0.8, 0.2); flash(a.pos, c1, 12, 0.3, a); return;
    case "bigwave": crescent(fx, fz, yaw, R, c1, 2.2, 0.5); crescent(fx, fz, yaw, R * 0.8, c2, 1.6, 0.45);
      for (let i = 0; i < 14; i++) { const ang = yaw + (Math.random() - 0.5) * 1.2; spark(new THREE.Vector3(fx + Math.sin(ang), 0.3, fz + Math.cos(ang)), c2, new THREE.Vector3(Math.sin(ang) * R * 2, 1.5, Math.cos(ang) * R * 2), 0.3, 0.5, 2); } return;
    case "fan-arrows": for (let i = 0; i < 5; i++) { const ang = yaw + (i - 2) * THREE.MathUtils.degToRad(S.cone ?? 60) / 4; coloredArrow(a, fx + Math.sin(ang) * R, fz + Math.cos(ang) * R, 0.3, c1, () => {}); } return;
    default: slashTrail(a, R, S.cone ?? 90); return;
  }
  if (when === "shot") {
    const land = () => {
      switch (S.style) {
        case "arrow-ice": iceCrystals(x, z, Math.max(0.8, r * 0.8)); ring(c1, 0.4, 0.2, r, { pos: at }); break;
        case "arrow-fire": flames(x, z, r * 0.6, 0.7, c1, c2, 40); smoke(x, z, r * 0.7, 0.6, 0x2a1e18, 8, 1.2); ring(c1, 0.45, 0.2, r * 1.2, { pos: at }); sparkBurst(at.clone().setY(0.4), c1, 20, 4, 3, 0.36, 0.55); sparkBurst(at.clone().setY(0.4), c2, 8, 2, 3, 0.3, 0.4); flash(at.clone().setY(1), c1, 18, 0.35); break;
        case "arrow-bolt": bolt(at.clone().setY(8), at.clone().setY(0.05), c1); ring(c2, 0.35, 0.2, r, { pos: at }); flash(at.clone().setY(2), c2, 24, 0.25); shake(0.12); break;
        case "arrow-wind": ring(c1, 0.6, 0.3, r, { pos: at, spin: 10 }); ring(c2, 0.5, r, 0.3, { pos: at, y: 0.5, spin: -12 }); for (let i = 0; i < 12; i++) { const ang = i / 12 * 6.28; spark(at.clone().setY(0.3), c1, new THREE.Vector3(Math.cos(ang + 1.3) * 3, 1.5, Math.sin(ang + 1.3) * 3), 0.26, 0.5, 0); } break;
        case "lance": iceCrystals(x, z, 0.9); sparkBurst(at.clone().setY(0.5), c2, 10, 3, 2, 0.24, 0.4); break;
        case "chain": { let from = at.clone().setY(0.8); for (let i = 0; i < 4; i++) { const ang = Math.random() * 6.28, d = r * (0.4 + Math.random() * 0.6), to = new THREE.Vector3(x + Math.cos(ang) * d, 0.8, z + Math.sin(ang) * d); setTimeout(((f, t) => () => { bolt(f, t, c1); sparkBurst(t, c2, 5, 1.5, 1, 0.2, 0.3); })(from, to), i * 60); from = to; } flash(at.clone().setY(1.5), c1, 18, 0.3); break; }
        default: sparkBurst(at.clone().setY(0.5), c1, 10, 3, 2, 0.26, 0.4);
      }
    };
    if (S.style === "beam") { lineTo(hand(a), at.clone().setY(0.6), c1, 0.1, 0.4); lineTo(hand(a), at.clone().setY(0.6), c2, 0.03, 0.3); setTimeout(() => { ring(c1, 0.4, 0.2, 1.4, { pos: at }); sparkBurst(at.clone().setY(0.6), c2, 12, 3, 2, 0.26, 0.4); flash(at.clone().setY(1), c1, 20, 0.3); }, travel * 1000); flash(hand(a), c1, 10, 0.25); return; }
    if (S.style === "chain") { bolt(hand(a), at.clone().setY(0.8), c1); setTimeout(land, travel * 1000); return; }
    if (S.style === "lance") return lance(a, x, z, travel, c1, land);
    if (S.style?.startsWith("arrow")) return coloredArrow(a, x, z, travel, c1, land);
    return orb(a, x, z, travel, c1, 1.2, land);
  }
  switch (S.style) {   // aoe
    case "skyblade": return skyBlade(x, z, r, delay, c1, c2);
    case "pillar": ring(c1, delay, r * 1.1, r, { pos: at, y: 0.05, spin: 2 }); setTimeout(() => pillar(x, z, r, c1, c2), delay * 1000); return;
    case "firepillar": ring(c1, delay, r * 1.1, r, { pos: at, y: 0.05, spin: 2 }); setTimeout(() => { pillar(x, z, r * 0.8, c1, c2); flames(x, z, r * 0.7, 1.0, c1, c2, 60); smoke(x, z, r, 1.2, 0x2a1e18, 8, 1.6); }, delay * 1000); return;
    case "implode": return implode(x, z, r, delay, c1, c2);
    case "cross": return cross(x, z, r, c1, c2);
    case "rain": case "rain-dark": return arrowRain(x, z, r, delay, S.waves ?? 3, c1, c2);
    case "spikes-vine": groundGlow(x, z, r, c1, delay + 1.4, 0.5); setTimeout(() => { spikeField(x, z, r, crystalMat(c1, false), 18, [0.4, 1.0], 0.1, 1.4); motes(x, z, r, 16, c2, 0.8, 1.2); smoke(x, z, r, 0.4, 0x6a8a4a, 10, 1.0); }, delay * 1000); return;
    case "meteor": for (let w = 0; w < (S.waves ?? 1); w++) setTimeout(() => { const ang = Math.random() * 6.28, d = Math.random() * r * 0.5; meteor(x + Math.cos(ang) * d, z + Math.sin(ang) * d, r * 0.7, delay, c1, c2); }, w * 350); return;
    case "comet": meteor(x, z, r, delay, c1, c2); setTimeout(() => { groundGlow(x, z, r * 1.4, c1, 1.2); smoke(x, z, r, 1, 0x2a1a3a, 10, 1.8); motes(x, z, r, 24, c2, 1.8, 1.2); }, delay * 1000); return;
    case "hail": hail(x, z, r, delay, S.waves ?? 3, c1); smoke(x, z, r, delay + (S.waves ?? 3) * 0.35, 0xe8f6ff, 8, 1.6); for (let k = 0; k < 6; k++) setTimeout(() => motes(x, z, r, 8, 0xffffff, -0.8, 1.4), k * 250); return;
    case "quake": earthSpikes(x, z, r); shockwave(at, r); smoke(x, z, r, 0.8, 0x8a7458, 14, 1.8); shake(0.4); return;
    case "flare": return flare(x, z, r, c1, c2);
    case "cloud": return cloud(x, z, r, delay + (S.waves ?? 3) * 0.35, c1, c2);
    default: flare(x, z, r, c1, c2);
  }
}

// Camera shake reads as stutter to some players, so it is a setting (remembered per browser).
let shakeOn = true; try { shakeOn = localStorage.getItem("bk.shake") !== "0"; } catch {}
export const shakeEnabled = () => shakeOn;
export function setShake(on: boolean) {
  shakeOn = on;
  if (!on) { shakeAmp = 0; shakeOff.set(0, 0, 0); }
  try { localStorage.setItem("bk.shake", on ? "1" : "0"); } catch {}
}
export function shake(amp: number) { if (shakeOn) shakeAmp = Math.max(shakeAmp, amp); }

/** Call once per frame; returns the camera offset to add this frame. */
export function updateFx(dt: number): THREE.Vector3 {
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t += dt; const k = f.t < 0.08 ? 1 : Math.max(0, 1 - (f.t - 0.08) / 0.12);
    for (const m of f.mats) m.emissive.set(m.userData.baseEmissive).lerp(white, k * 0.9);
    if (k <= 0) flashes.splice(i, 1);
  }
  for (let i = holes.length - 1; i >= 0; i--) {
    const h = holes[i]; h.t += dt; const k = h.t / h.grow, s = h.t < h.grow ? h.r * 0.35 * k * k : h.r * 0.35 * Math.max(0, 1 - (h.t - h.grow) / 0.5);
    h.core.scale.setScalar(Math.max(0.01, s)); h.disc.scale.setScalar(Math.max(0.01, s * 5)); h.disc.rotation.z += dt * 6;
    if (h.t >= h.life) { scene.remove(h.core, h.disc); h.core.geometry.dispose(); h.disc.geometry.dispose(); (h.core.material as THREE.Material).dispose(); (h.disc.material as THREE.Material).dispose(); holes.splice(i, 1); }
  }
  for (let i = fades.length - 1; i >= 0; i--) {
    const f = fades[i]; f.t += dt; const k = Math.min(1, f.t / f.life);
    (f.obj.material as THREE.MeshBasicMaterial).opacity = f.peak * (1 - k);
    if (k >= 1) { scene.remove(f.obj); f.obj.geometry !== beamGeo && f.obj.geometry.dispose(); (f.obj.material as THREE.Material).dispose(); fades.splice(i, 1); }
  }
  for (let i = chills.length - 1; i >= 0; i--) {
    const c = chills[i]; c.t += dt; const k = c.t > c.life - 0.3 ? Math.max(0, (c.life - c.t) / 0.3) : 1;
    if (!flashes.length) for (const m of c.mats) m.emissive.set(m.userData.baseEmissive).lerp(frost, 0.55 * k);
    if (c.t >= c.life) { for (const m of c.mats) m.emissive.set(m.userData.baseEmissive); chills.splice(i, 1); }
  }
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.t += dt; const k = Math.min(1, w.t / w.life), d = w.dist * (1 - (1 - k) * (1 - k));
    w.mesh.position.set(w.x + w.dx * d, 0.62, w.z + w.dz * d); w.mesh.scale.setScalar((w.base ?? 1) * (0.8 + k * 0.9));
    (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - k * k);
    if (Math.random() < 0.6) spark(w.mesh.position.clone(), 0xd8f0ff, new THREE.Vector3(w.dx * 1.5, 0.4, w.dz * 1.5), 0.22, 0.3, 0);
    if (k >= 1) { scene.remove(w.mesh); w.mesh.geometry.dispose(); (w.mesh.material as THREE.Material).dispose(); waves.splice(i, 1); }
  }
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i]; s.t += dt; if (s.t < 0) continue;
    const up = Math.min(1, s.t / 0.12), down = s.t > s.life - 0.35 ? Math.max(0, (s.life - s.t) / 0.35) : 1;   // burst up, hold, sink
    s.mesh.scale.y = Math.max(0.01, s.h * up * (1 - (1 - up) * 0.3)); s.mesh.position.y = -s.h * (1 - down);
    if (s.t >= s.life) { scene.remove(s.mesh); spikes.splice(i, 1); }
  }
  for (let i = trails.length - 1; i >= 0; i--) {
    const tr = trails[i]; tr.t += dt; const k = tr.t / tr.life;
    (tr.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k); tr.mesh.scale.setScalar(0.7 + 0.5 * k);
    if (k >= 1) { scene.remove(tr.mesh); (tr.mesh.material as THREE.Material).dispose(); trails.splice(i, 1); }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.t += dt; const k = p.t / p.life;
    p.s.scale.setScalar(p.size * (0.5 + k)); p.s.position.y += dt * (p.rise ?? 0.4); (p.s.material as THREE.SpriteMaterial).opacity = 0.7 * (1 - k);
    if (k >= 1) { scene.remove(p.s); puffPool.push(p.s); puffs.splice(i, 1); }
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; const k = Math.min(1, r.t / r.life);
    const s = r.from + (r.to - r.from) * (1 - (1 - k) * (1 - k));
    r.mesh.scale.setScalar(s); if (r.spin) r.mesh.rotation.z += r.spin * dt;
    if (r.follow) r.mesh.position.set(r.follow.pos.x, r.y, r.follow.pos.z);
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    if (k >= 1) { scene.remove(r.mesh); (r.mesh.material as THREE.Material).dispose(); rings.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]; s.t += dt; const k = s.t / s.life;
    s.v.y -= s.gravity * dt; s.s.position.addScaledVector(s.v, dt);
    const sz = s.size * (1 - s.shrink * k); s.s.scale.set(sz, sz * s.aspect, 1); (s.s.material as THREE.SpriteMaterial).opacity = 1 - k * k;
    if (k >= 1) { scene.remove(s.s); sparkPool.push(s.s); sparks.splice(i, 1); }
  }
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]; b.t += dt; const k = b.t / b.life;
    if (b.follow) b.mesh.position.set(b.follow.pos.x, 1.2, b.follow.pos.z);
    b.mesh.rotation.y += dt * 2.5; b.mesh.scale.set(1 - 0.35 * k, 1 + 0.6 * k, 1 - 0.35 * k);
    (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.38 * (1 - k);
    if (k >= 1) { scene.remove(b.mesh); (b.mesh.material as THREE.Material).dispose(); beams.splice(i, 1); }
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const fl = flights[i]; fl.t += dt; const k = Math.min(1, fl.t / fl.life);
    const prev = fl.obj.position.clone();
    fl.obj.position.lerpVectors(fl.from, fl.to, k); fl.obj.position.y += Math.sin(k * Math.PI) * fl.arc * fl.from.distanceTo(fl.to) * 0.25;
    if (fl.obj.position.distanceToSquared(prev) > 1e-6) fl.obj.lookAt(fl.obj.position.clone().add(fl.obj.position.clone().sub(prev)));
    if (fl.trail && (fl.tick = (fl.tick ?? 0) + 1) % 2 === 0) spark(fl.obj.position.clone(), fl.trail, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6), 0.28 * fl.obj.scale.x, 0.35, -0.2);
    if (k >= 1) { scene.remove(fl.obj); flights.splice(i, 1); fl.onEnd?.(); }
  }
  for (let i = teles.length - 1; i >= 0; i--) {
    const tl = teles[i]; tl.t += dt; const k = Math.min(1, tl.t / tl.life);
    tl.fill.scale.setScalar(Math.max(0.01, k));
    ((tl.group.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * Math.abs(Math.sin(tl.t * (6 + k * 10)));   // rim pulses faster near the end
    if (k >= 1) { scene.remove(tl.group); tl.group.traverse((n: any) => n.material?.dispose()); teles.splice(i, 1); }
  }
  if (lightPeak > 0) {
    lightT += dt; const k = Math.min(1, lightT / lightLife);
    if (lightFollow) fxLight.position.set(lightFollow.pos.x, 0.9, lightFollow.pos.z);
    fxLight.intensity = lightPeak * (1 - k) * (1 - k);
    if (k >= 1) { lightPeak = 0; fxLight.intensity = 0; lightFollow = null; }
  }
  if (!shakeOn) { shakeAmp = 0; shakeOff.set(0, 0, 0); }
  else if (shakeAmp > 0.001) { shakeOff.set((Math.random() - 0.5) * 2 * shakeAmp, (Math.random() - 0.5) * 2 * shakeAmp, 0); shakeAmp *= Math.pow(0.02, dt); }
  else shakeOff.set(0, 0, 0);
  return shakeOff;
}
