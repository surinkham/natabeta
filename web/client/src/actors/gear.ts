// Worn gear with a look of its own. The rig carries ten authored gear meshes (knight sword, hunter bow, mage staff,
// kite shield, knight helmet/chest/cape/gloves/boots); seventy items shared them, tinted. Here every other item gets
// a model built to its name and icon: weapons, shields and headgear are rebuilt whole in the authored piece's place
// (same socket, same frame), and body pieces — which must bend with the rig — keep their skinned mesh and gain rigid
// accents on the bones (pauldrons, gems, belts, cuffs, wings). A theme read off the name (frost, ember, void, storm,
// sylvan, sand, fang, arcane, divine…) colours it and decides what glows.
// Everything is round (dense segments, spline outlines, rounded bevels, smoothed normals) and sits on the body's real
// surface, measured from the skinned pieces' bind-pose vertices, so a piece reads as part of the outfit, not a prop
// floating beside it. Parts are merged per bone and material, so a full set costs a handful of draws.
import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { EQUIP_VISUALS, ITEMS } from "@shared/data";

type Theme = { metal: number; accent: number; gem: number; glow?: number; grip: number; key: string; divine?: boolean };
const THEMES: [RegExp, Theme][] = [
  [/frost|rime|glacier|moon|silverfang/i, { key: "frost", metal: 0xd8efff, accent: 0x6fb8f0, gem: 0xbff0ff, glow: 0x8fdcff, grip: 0x3a5a7a }],
  [/ember|inferno|cinder|magma|obsidian|emberhorn/i, { key: "ember", metal: 0x2e2628, accent: 0xff7a2a, gem: 0xffb040, glow: 0xff6a1a, grip: 0x5a2a1a }],
  [/void|shadow|night|eclipse|dusk|amethyst|reaper/i, { key: "void", metal: 0x3a2a4e, accent: 0xb070ff, gem: 0xd6a0ff, glow: 0xa060ff, grip: 0x24182e }],
  [/storm/i, { key: "storm", metal: 0xa9bccf, accent: 0x5ac8ff, gem: 0xe8fbff, glow: 0x9ae8ff, grip: 0x2a3a4a }],
  [/sylvan|elven|sunseed|bloom|grove|treant|elderbark|moss|briar|stump|spore|shroom/i, { key: "sylvan", metal: 0x8a6238, accent: 0x74c85e, gem: 0xe8ff90, glow: 0xb8f090, grip: 0x5a3a1e }],
  [/sand|amber|scarab|scorpion|dune|copperback/i, { key: "sand", metal: 0xd9a64e, accent: 0x8a4f1c, gem: 0xffa020, grip: 0x6a4020 }],
  [/fang|alpha|wolf/i, { key: "fang", metal: 0xf1e8d2, accent: 0x6a707a, gem: 0x9fd8ff, glow: 0x9fd8ff, grip: 0x4a4038 }],
  [/arcane|mage|apprentice/i, { key: "arcane", metal: 0x6a5ab0, accent: 0xe8d8ff, gem: 0x9f7aff, glow: 0xc0a8ff, grip: 0x3a2a60 }],
  [/leather|ranger|hunter|fur|tusk|boar/i, { key: "leather", metal: 0x8a6a4a, accent: 0x5a3e28, gem: 0xe0b23f, grip: 0x4a3020 }],
  [/guild/i, { key: "guild", metal: 0xc8a24a, accent: 0x2f4f8f, gem: 0xfff0b0, grip: 0x2f4f8f }],
];
const STEEL: Theme = { key: "steel", metal: 0xcfd6de, accent: 0x2f4f8f, gem: 0xe0b23f, grip: 0x5a3a24 };
const HOLY: Theme = { key: "holy", metal: 0xf0c463, accent: 0xfff2c8, gem: 0x7fe3ff, glow: 0xffe890, grip: 0x8a5a20 };
/** The element read off the name; a divine item keeps its beast's element under gold trim and a glow. */
export const themeOf = (id: string): Theme => {
  const s = `${id} ${ITEMS[id]?.name ?? ""}`, base = THEMES.find(([re]) => re.test(s))?.[1];
  return /divine/i.test(s) ? { ...(base ?? HOLY), accent: 0xf0c463, glow: base?.glow ?? 0xffe890, divine: true } : base ?? STEEL;
};
/** Items whose authored mesh already is their look. */
const AUTHORED = new Set(["WOODEN_SWORD", "HUNTER_BOW", "APPRENTICE_STAFF", "KITE_SHIELD", "KNIGHT_HELMET", "KNIGHT_CHEST", "KNIGHT_GLOVES", "KNIGHT_BOOTS", "KNIGHT_CAPE", "STARTER_CHEST", "STARTER_BOOTS"]);

// ---------------------------------------------------------------- materials & primitives
const mats = new Map<string, THREE.MeshStandardMaterial>();
let env: THREE.Texture | null = null;
/** The reflection map the authored armour uses (render/scene.ts), so made gear shines the same way. */
export function setGearEnv(t: THREE.Texture) { env = t; for (const m of mats.values()) { m.envMap = t; m.needsUpdate = true; } }
function mat(color: number, glow = 0, metal = 0.35, opacity = 1, side: THREE.Side = THREE.FrontSide) {
  const k = `${color}|${glow}|${metal}|${opacity}|${side}`;
  let m = mats.get(k);
  if (!m) mats.set(k, m = new THREE.MeshStandardMaterial({ color, roughness: glow ? 0.3 : metal > 0.5 ? 0.3 : 0.55, metalness: metal, envMap: env, envMapIntensity: 0.8,
    emissive: glow || 0, emissiveIntensity: glow ? 0.85 : 0, transparent: opacity < 1, opacity, side }));
  return m;
}
const V2 = THREE.Vector2, V3 = THREE.Vector3;
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const ball = (r: number) => new THREE.SphereGeometry(r, 24, 16);
const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 16);
const rod = (r0: number, r1: number, h: number) => new THREE.CylinderGeometry(r0, r1, h, 20);
const torus = (R: number, tube: number, arc = Math.PI * 2) => new THREE.TorusGeometry(R, tube, 12, 48, arc);
/** A cut gem / crystal: round in plan, pointed top and bottom — no flat facets. */
const gem = (r: number, h = r * 1.4) => new THREE.LatheGeometry([new V2(0, -h), new V2(r * 0.7, -h * 0.35), new V2(r, 0), new V2(r * 0.7, h * 0.35), new V2(0, h)], 24);
/** A closed ring of tube along an ellipse in the XZ plane (belts, cuffs, crown rims) — fits a non-round body. */
function loop(cx: number, y: number, cz: number, rx: number, rz: number, tube: number) {
  const pts = Array.from({ length: 32 }, (_, i) => { const a = i / 32 * Math.PI * 2; return new V3(cx + Math.sin(a) * rx, y, cz + Math.cos(a) * rz); });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, tube, 10, true);
}
/** An outline, straight-edged or (round) passed through as a smooth spline. */
function outline(pts: [number, number][], round: boolean) {
  const s = new THREE.Shape(); s.moveTo(...pts[0]);
  if (round) s.splineThru([...pts.slice(1), pts[0]].map(([x, y]) => new V2(x, y))); else pts.slice(1).forEach(([x, y]) => s.lineTo(x, y));
  return s;
}
const extrude = (s: THREE.Shape, t: number, bevel: number) => new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
/** A flat outline (x along the blade, y across it) with rounded edges, lying in the XZ plane, centred on y = 0. */
function slab(pts: [number, number][], t: number, bevel = 0.005, round = false) {
  const g = extrude(outline(pts, round), t, bevel); g.translate(0, 0, -t / 2); g.rotateX(Math.PI / 2); return g;
}
/** Same outline standing in the XY plane, face toward +Z (shields, wings). */
const plate = (pts: [number, number][], t: number, bevel = 0.006, round = false) => extrude(outline(pts, round), t, bevel);
const circle = (r: number, n = 48): [number, number][] => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * r, Math.sin(i / n * Math.PI * 2) * r]);

// ---------------------------------------------------------------- weapons (in the authored piece's own frame)
/** Sword: +X along the blade from the grip at 0, the blade flat in XZ. */
function sword(id: string, t: Theme) {
  const g = new THREE.Group(), name = ITEMS[id].name, divine = !!t.divine;
  const L = divine ? 0.5 : /alpha|blade/i.test(name) ? 0.46 : 0.42, w = t.key === "fang" ? 0.042 : t.key === "ember" ? 0.05 : 0.038;
  let edge: [number, number][], round = false;
  if (t.key === "fang") {            // a fang: one straight back, a serrated edge sweeping to a hooked point
    edge = [[0, -w], [L * 0.8, -w * 0.9], [L, w * 0.2]]; for (let i = 6; i >= 0; i--) edge.push([L * (0.12 + i * 0.11), w + (i % 2 ? 0.014 : 0)]); edge.push([0, w]);
  } else if (t.key === "ember") {     // a flame: wavy edges licking to a point
    round = true; edge = []; for (let i = 0; i <= 8; i++) edge.push([L * i / 9, -w * (1 - i / 14) - Math.sin(i * 1.4) * 0.01]); edge.push([L, 0]); for (let i = 8; i >= 0; i--) edge.push([L * i / 9, w * (1 - i / 14) + Math.sin(i * 1.4 + 1) * 0.01]);
  } else if (t.key === "frost" || t.key === "storm") {   // a crystal: widening, then tapering to the point
    edge = [[0, -w * 0.8], [L * 0.45, -w * 1.35], [L * 0.8, -w * 0.7], [L, 0], [L * 0.8, w * 0.7], [L * 0.45, w * 1.35], [0, w * 0.8]];
  } else if (t.key === "void") {      // a curved reaper's edge
    round = true; edge = []; for (let i = 0; i <= 10; i++) edge.push([L * i / 10, -w * (1 - i / 12) + Math.sin(i / 10 * Math.PI * 0.9) * 0.05]); for (let i = 9; i >= 0; i--) edge.push([L * i / 10, w * (1 - i / 12) + Math.sin(i / 10 * Math.PI * 0.9) * 0.05]);
  } else edge = [[0, -w], [L * 0.84, -w], [L, 0], [L * 0.84, w], [0, w]];   // a straight knightly blade
  g.add(mesh(slab(edge, 0.004, 0.006, round), mat(t.metal, t.key === "frost" || t.key === "storm" ? t.glow : 0, 0.6, t.key === "frost" ? 0.9 : 1)));
  if (t.glow) g.add(mesh(slab([[0.02, -0.005], [L * 0.8, -0.004], [L * 0.86, 0], [L * 0.8, 0.004], [0.02, 0.005]], 0.012, 0.002, true), mat(t.glow, t.glow, 0)));   // glowing fuller
  // guard: a swept bar, or claws / wings
  const guard: [number, number][] = t.key === "fang" || divine ? [[0.022, -0.075], [-0.006, -0.06], [0.004, -0.02], [-0.006, 0], [0.004, 0.02], [-0.006, 0.06], [0.022, 0.075], [0.012, 0.03], [0.014, 0], [0.012, -0.03]]
    : [[-0.012, -0.07], [0.014, -0.075], [0.004, 0], [0.014, 0.075], [-0.012, 0.07], [-0.004, 0]];
  g.add(mesh(slab(guard, 0.014, 0.006, true), mat(t.accent, 0, 0.5)));
  if (divine) for (const s of [-1, 1]) g.add(mesh(slab([[0, s * 0.02], [0.05, s * 0.05], [0.02, s * 0.11], [-0.03, s * 0.09]], 0.004, 0.004, true), mat(t.accent, t.glow, 0.2), -0.005));
  // grip wound in bands + pommel gem, all touching
  const grip = mesh(rod(0.013, 0.015, 0.075), mat(t.grip, 0, 0.1), -0.042); grip.rotation.z = Math.PI / 2; g.add(grip);
  for (const x of [-0.02, -0.042, -0.064]) { const b = mesh(torus(0.0145, 0.003), mat(t.accent, 0, 0.5), x); b.rotation.y = Math.PI / 2; g.add(b); }
  g.add(mesh(ball(0.02), mat(t.gem, t.glow ? t.gem : 0, 0.3), -0.092));
  return g;
}
/** Bow: along Y, limbs bowed toward +X, the string at the back. */
function bow(id: string, t: Theme) {
  const g = new THREE.Group(), recurve = t.key !== "leather" && t.key !== "steel", H = t.divine ? 0.32 : 0.3, B = 0.075, tipX = recurve ? -0.02 : 0;
  const pts = [new V3(tipX, -H, 0), new V3(B * 0.8, -H * 0.6, 0), new V3(B, 0, 0), new V3(B * 0.8, H * 0.6, 0), new V3(tipX, H, 0)];
  g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.017, 12), mat(t.metal, 0, t.key === "sylvan" ? 0.05 : 0.4)));
  g.add(mesh(rod(0.0025, 0.0025, H * 2), mat(t.glow ?? 0xf2ead8, t.glow ?? 0, 0), tipX));   // string, tip to tip (glowing for enchanted bows)
  g.add(mesh(rod(0.021, 0.021, 0.08), mat(t.grip, 0, 0.1), B));
  for (const s of [-1, 1]) {   // tip ornaments seated on the limb ends: leaves or crystals
    const tip = t.key === "sylvan" ? mesh(ball(0.03), mat(t.accent, 0, 0)) : mesh(gem(0.02, 0.035), mat(t.gem, t.glow ?? 0, 0.3));
    tip.position.set(tipX, s * (H + 0.02), 0); if (t.key === "sylvan") tip.scale.set(0.6, 1.4, 0.35); g.add(tip);
  }
  if (t.key === "storm" || t.divine) for (const s of [-1, 1]) { const fin = mesh(plate([[0, 0], [0.07, 0.02], [0.03, 0.05]], 0.003, 0.003, true), mat(t.accent, t.glow, 0.3), B - 0.01, s * 0.1); fin.rotation.z = s * 0.4 - (s < 0 ? Math.PI / 2 : 0); g.add(fin); }
  return g;
}
/** Staff: along Y, the head up. Every head part sits on the shaft or on the part below it. */
function staff(id: string, t: Theme) {
  const g = new THREE.Group(), top = 0.47, head = top + 0.07;
  g.add(mesh(rod(0.015, 0.018, 0.78), mat(t.divine ? t.metal : t.grip, 0, t.divine ? 0.7 : 0.1), 0, top - 0.39));
  g.add(mesh(rod(0.034, 0.016, 0.05), mat(t.accent, 0, 0.5), 0, top + 0.005));   // the cup the head rests in
  g.add(mesh(torus(0.034, 0.006), mat(t.accent, 0, 0.5), 0, top + 0.03)).rotation.x = Math.PI / 2;
  if (t.key === "ember") {           // a flame crystal licked by flame spikes
    const f = mesh(gem(0.045, 0.085), mat(t.accent, t.glow, 0.2), 0, head); g.add(f);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, s = mesh(cone(0.012, 0.07), mat(t.metal, 0, 0.3), Math.cos(a) * 0.035, top + 0.06, Math.sin(a) * 0.035); s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(s); }
  } else if (t.key === "void") {     // a crescent rising from the cup, a dark star held in it on a stem
    const c = mesh(torus(0.065, 0.013, Math.PI * 1.35), mat(t.metal, 0, 0.5), 0, top + 0.03 + 0.065); c.rotation.z = Math.PI * 0.825 + Math.PI; g.add(c);
    g.add(mesh(rod(0.006, 0.006, 0.07), mat(t.metal, 0, 0.5), 0, top + 0.06));
    g.add(mesh(ball(0.035), mat(t.gem, t.glow, 0.2), 0, top + 0.095));
  } else if (t.divine || t.key === "fang") {   // a scepter: a sun orb with rays, winged
    g.add(mesh(ball(0.042), mat(t.gem, t.glow ?? t.gem, 0.2), 0, head));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, ray = mesh(cone(0.011, 0.05), mat(t.metal, t.glow ?? 0, 0.8), Math.cos(a) * 0.055, head + Math.sin(a) * 0.055); ray.rotation.z = a - Math.PI / 2; g.add(ray); }
    for (const s of [-1, 1]) { const wing = mesh(plate([[0, 0], [0.09, 0.03], [0.1, 0.07], [0.03, 0.04]], 0.003, 0.003, true), mat(t.accent, t.glow ?? 0, 0.3), s * 0.035, top + 0.02); wing.scale.x = s; g.add(wing); }
  } else if (t.key === "frost") {    // an ice cluster growing out of the cup
    for (let i = 0; i < 5; i++) { const c = mesh(gem(0.022, 0.06), mat(t.metal, t.glow, 0.2, 0.9), Math.cos(i * 1.26) * 0.02, top + 0.07 + (i % 2) * 0.02, Math.sin(i * 1.26) * 0.02); c.rotation.z = (i - 2) * 0.3; g.add(c); }
  } else {                           // an orb held by three prongs rising from the cup
    g.add(mesh(ball(0.045), mat(t.gem, t.glow ?? t.gem, 0.2), 0, head));
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, p = mesh(cone(0.009, 0.09), mat(t.accent, 0, 0.5), Math.cos(a) * 0.04, top + 0.07, Math.sin(a) * 0.04); p.rotation.set(-Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35); g.add(p); }
  }
  return g;
}
/** Shield: face toward +Z, height along Y. Studs and emblems sit on the face. */
function shield(id: string, t: Theme) {
  const g = new THREE.Group(), name = ITEMS[id].name, FACE = 0.02 + 0.006;   // front of the face plate
  let face: [number, number][], round = true;
  if (/tower/i.test(name)) face = [[-0.075, -0.17], [0.075, -0.17], [0.08, 0.17], [0, 0.2], [-0.08, 0.17]];
  else if (/aegis/i.test(name) && t.key !== "ember") { face = circle(0.13); round = false; }
  else face = [[-0.08, 0.17], [0.08, 0.17], [0.07, 0.02], [0, -0.17], [-0.07, 0.02]];   // heater
  const rim = face.map(([x, y]) => [x * 1.12, y * 1.1] as [number, number]);
  g.add(mesh(plate(rim, 0.012, 0.006, round), mat(t.accent, 0, 0.5), 0, 0, -0.004));
  g.add(mesh(plate(face, 0.02, 0.006, round), mat(t.metal, 0, 0.55)));
  if (t.key === "ember") for (let i = 0; i < 4; i++) { const crack = mesh(plate([[-0.003, -0.045], [0.004, 0], [-0.002, 0.045], [0.002, 0]], 0.002, 0.002, true), mat(t.glow!, t.glow!, 0), (i - 1.5) * 0.035, -0.01 + (i % 2) * 0.04, FACE - 0.002); crack.rotation.z = (i - 1.5) * 0.4; g.add(crack); }
  if (t.divine && !round) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, ray = mesh(cone(0.012, 0.05), mat(t.metal, t.glow!, 0.7), Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.01); ray.rotation.z = a - Math.PI / 2; g.add(ray); }
  if (t.key === "void") { const moon = mesh(torus(0.05, 0.012, Math.PI * 1.3), mat(t.gem, t.glow!, 0.3), 0, 0.02, FACE); moon.rotation.z = Math.PI * 0.6; moon.scale.z = 0.5; g.add(moon); }
  else { const boss = mesh(ball(0.032), mat(t.gem, t.glow ?? 0, 0.4), 0, 0.02, FACE - 0.012); boss.scale.z = 0.6; g.add(boss); g.add(mesh(torus(0.034, 0.006), mat(t.accent, 0, 0.6), 0, 0.02, FACE)); }
  if (t.key === "sand") for (const s of [-1, 1]) { const tusk = mesh(cone(0.012, 0.08), mat(0xf4ead0, 0, 0.1), s * 0.035, -0.04, FACE); tusk.rotation.z = s * 2.6; g.add(tusk); }
  return g;
}

// ---------------------------------------------------------------- rigid accents on bones (bind-pose placement)
type Section = { cx: number; cz: number; rx: number; rz: number; x0: number; x1: number; z0: number; z1: number };
type Rig = { root: THREE.Object3D; skin?: THREE.SkinnedMesh; box: (m: RegExp | string) => THREE.Box3 | undefined; cut: (m: RegExp | string, y: number, xa?: number, xb?: number) => Section | undefined };
/** Where a bone sits at bind pose, in the skinned mesh's space. */
function bindPos(r: Rig, bone: string) {
  const b = r.root.getObjectByName(bone) as THREE.Bone | undefined, s = r.skin?.skeleton; if (!b || !s) return undefined;
  const i = s.bones.indexOf(b); if (i < 0) return undefined;
  return new V3().setFromMatrixPosition(s.boneInverses[i].clone().invert());
}
/** Attach `o`, placed in bind-pose (skinned mesh) space, to `bone` so it follows the animation. */
function onBone(r: Rig, bone: string, o: THREE.Object3D) {
  const b = r.root.getObjectByName(bone) as THREE.Bone | undefined, s = r.skin?.skeleton; if (!b || !s) return;
  const i = s.bones.indexOf(b); if (i < 0) return;
  o.updateMatrix(); o.matrix.premultiply(s.boneInverses[i]); o.matrix.decompose(o.position, o.quaternion, o.scale);
  o.userData.gear = true; b.add(o);
}
/** The cross-section of a skinned piece's bind-pose surface at height y (vertices within ±1.5 cm, x in [xa, xb]). */
function section(g: THREE.BufferGeometry, y: number, xa = -9, xb = 9): Section | undefined {
  const p = g.attributes.position; let x0 = 9, x1 = -9, z0 = 9, z1 = -9;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i); if (Math.abs(p.getY(i) - y) > 0.015 || px < xa || px > xb) continue;
    const pz = p.getZ(i); if (px < x0) x0 = px; if (px > x1) x1 = px; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
  }
  return x1 < x0 ? undefined : { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
}
const pauldron = (t: Theme) => {
  const g = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.065, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(t.metal, 0, 0.55)); dome.scale.set(1, 0.6, 1.1); g.add(dome);
  const rim = mesh(torus(0.065, 0.01), mat(t.accent, 0, 0.5)); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.1, 1); g.add(rim);
  if (t.key === "ember" || t.key === "void") for (let i = 0; i < 3; i++) g.add(mesh(cone(0.014, 0.07), mat(t.key === "ember" ? t.metal : t.accent, 0, 0.3), (i - 1) * 0.032, 0.06, 0));
  if (t.key === "frost") for (let i = 0; i < 3; i++) g.add(mesh(gem(0.016, 0.04), mat(t.gem, t.glow, 0.2, 0.9), (i - 1) * 0.032, 0.055, 0));
  if (t.key === "sylvan") for (let i = 0; i < 3; i++) { const leaf = mesh(ball(0.03), mat(t.accent, 0, 0), (i - 1) * 0.032, 0.05, 0); leaf.scale.set(0.5, 1.4, 0.3); leaf.rotation.z = (i - 1) * 0.5; g.add(leaf); }
  if (t.glow) { const s = mesh(ball(0.016), mat(t.gem, t.glow, 0.3), 0, 0.03, 0.05); s.scale.z = 0.6; g.add(s); }
  return g;
};
// The chibi's big head hides the shoulders and the upper back, so accents sit where they show: shoulder caps out at
// the sides of the chest, a belt at its hem, wings low on the back — each one pressed onto the measured surface.
function chestAccents(id: string, t: Theme, r: Rig) {
  const C = "SK_Knight_Chest", c = r.box(C); if (!c) return; const name = ITEMS[id].name;
  const sy = c.max.y - 0.1, sh = r.cut(C, sy), front = (y: number) => r.cut(C, y, -0.04, 0.04)?.z1 ?? c.max.z;
  if (sh) for (const [bone, s] of [["upperarm_l", 1], ["upperarm_r", -1]] as const) { const o = pauldron(t); o.position.set(s > 0 ? sh.x1 - 0.015 : sh.x0 + 0.015, sy, sh.cz); o.rotation.z = -s * 1.05; onBone(r, bone, o); }
  const hem = c.min.y + 0.05, h = r.cut(C, hem);
  if (h) {
    onBone(r, "pelvis", mesh(loop(h.cx, hem, h.cz, h.rx + 0.006, h.rz + 0.006, 0.016), mat(t.accent, 0, 0.5)));
    const buckle = mesh(gem(0.026, 0.032), mat(t.gem, t.glow ?? 0, 0.4), 0, hem, h.z1 + 0.018); buckle.scale.z = 0.5; onBone(r, "pelvis", buckle);
    if (/robe/i.test(name)) for (const s of [-1, 1]) onBone(r, "pelvis", mesh(plate([[-0.035, 0.01], [0.035, 0.01], [0.03, -0.1], [0, -0.13], [-0.03, -0.1]], 0.004, 0.003, true), mat(t.accent, 0, 0.1), s * 0.06, hem, (r.cut(C, hem, s * 0.06 - 0.02, s * 0.06 + 0.02)?.z1 ?? h.z1) - 0.002));   // a mage's tabard
  }
  const gy = c.max.y - 0.1, g = mesh(gem(0.024, 0.034), mat(t.gem, t.glow ?? 0, 0.4), 0, gy, front(gy)); g.scale.z = 0.5; onBone(r, "spine_01", g);
  if (/carapace|mail/i.test(name)) for (let i = 0; i < 3; i++) {   // layered plates down the front, each pressed onto the chest
    const y = gy - 0.06 - i * 0.05, p = mesh(new THREE.SphereGeometry(0.1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(t.metal, 0, 0.6), 0, y, front(y) - 0.015);
    p.scale.set(1.1, 0.35, 0.5); p.rotation.x = Math.PI / 2; onBone(r, "spine_01", p);
  }
}
function capeAccents(id: string, t: Theme, r: Rig) {
  const C = "SK_Knight_Cape", c = r.box(C); if (!c) return; const name = ITEMS[id].name, mid = (c.min.y + c.max.y) / 2;
  const back = (y: number, x = 0) => r.cut(C, y, x - 0.04, x + 0.04)?.z0 ?? c.min.z;   // the cape's outer surface there
  if (/fur|warcloak/i.test(name)) {   // a fur ruff along the cape's top edge, peeking out under the head
    const ty = c.max.y - 0.03, top = r.cut(C, ty);
    if (top) for (let i = 0; i <= 6; i++) { const x = top.x0 + 0.02 + (top.x1 - top.x0 - 0.04) * i / 6; onBone(r, "spine_01", mesh(ball(0.042), mat(t.divine ? 0xfff2c8 : 0xd8cbb4, 0, 0), x, ty, back(ty, x) + 0.012)); }
  }
  if (/night|bat/i.test(name) || t.key === "void") for (const s of [-1, 1]) {   // bat wings spread from the back
    const y = mid + 0.02, wing = mesh(plate([[0, 0.02], [0.16, 0.1], [0.2, -0.02], [0.14, -0.04], [0.1, -0.1], [0.04, -0.05]], 0.003, 0.003, true), mat(t.metal, 0, 0.2), s * 0.03, y, back(y, s * 0.03) + 0.004);
    wing.scale.x = s; wing.rotation.y = -s * 0.55; onBone(r, "spine_01", wing);
  }
  if (t.divine) for (const s of [-1, 1]) {   // small glowing wings
    const y = mid + 0.04, wing = mesh(plate([[0, 0.02], [0.12, 0.14], [0.2, 0.1], [0.15, 0], [0.18, -0.06], [0.06, -0.04]], 0.004, 0.003, true), mat(t.accent, t.glow!, 0.3), s * 0.03, y, back(y, s * 0.03) + 0.002);
    wing.scale.x = s; wing.rotation.y = -s * 0.4; onBone(r, "spine_01", wing);
  }
  const by = mid - 0.04, bz = back(by);
  const badge = mesh(rod(0.05, 0.05, 0.01), mat(t.key === "guild" ? t.metal : t.accent, t.glow ?? 0, 0.5), 0, by, bz - 0.003); badge.rotation.x = Math.PI / 2; onBone(r, "spine_01", badge);
  onBone(r, "spine_01", mesh(torus(0.05, 0.006), mat(t.gem, 0, 0.6), 0, by, bz - 0.008));
  const gm = mesh(gem(0.02, 0.026), mat(t.gem, t.glow ?? 0, 0.3), 0, by, bz - 0.01); gm.scale.z = 0.5; onBone(r, "spine_01", gm);
}
/** Cuffs round the top of the gloves / boots (fitted to their measured opening), with spikes, a gem, little wings. */
function limbAccents(t: Theme, r: Rig, piece: string, bones: [string, string], spikes: boolean, wings: boolean) {
  const b = r.box(piece); if (!b) return; const y = b.max.y - 0.025;
  for (const [bone, s] of [[bones[0], 1], [bones[1], -1]] as const) {
    const c = r.cut(piece, y, s > 0 ? 0.03 : -9, s > 0 ? 9 : -0.03); if (!c) continue;
    onBone(r, bone, mesh(loop(c.cx, y, c.cz, c.rx + 0.006, c.rz + 0.006, 0.01), mat(t.accent, 0, 0.6)));
    if (t.glow) onBone(r, bone, mesh(ball(0.013), mat(t.gem, t.glow, 0.3), c.cx, y, c.z1 + 0.012));
    const out = c.cx + s * (c.rx + 0.01);
    if (spikes) for (let i = -1; i <= 1; i++) { const k = mesh(cone(0.011, 0.05), mat(t.metal, 0, 0.4), out + s * 0.02, y - 0.02 + i * 0.018 + 0.02, c.cz + i * 0.012); k.rotation.z = -s * Math.PI / 2; onBone(r, bone, k); }
    if (wings) { const w = mesh(plate([[0, 0], [0.07, 0.05], [0.09, 0.02], [0.05, -0.01]], 0.003, 0.002, true), mat(t.accent, t.glow ?? 0, 0.3), out, y - 0.01, c.cz - 0.01); w.scale.x = s; w.rotation.y = -s * 0.6; onBone(r, bone, w); }
  }
}
/** Headgear built whole around the head (the skinned helmet is hidden for these), measured off the head mesh. */
function headgear(id: string, t: Theme, r: Rig) {
  const H = /^SK_.*_Head$/, hb = r.box(H); if (!hb) return false;
  const name = ITEMS[id].name, g = new THREE.Group(), R = (hb.max.x - hb.min.x) / 2, cz = hb.min.z + R, cy = hb.max.y - R;
  if (/cap/i.test(name)) {   // a leather cap hugging the crown, a short brim, a feather tucked in its band
    const y0 = cy + R * 0.5, s = r.cut(H, y0) ?? { cx: 0, cz, rx: R * 0.9, rz: R * 0.9 }, up = hb.max.y + 0.02 - y0;
    const dome = mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(t.metal, 0, 0.1), s.cx, y0, s.cz); dome.scale.set(s.rx + 0.012, up, s.rz + 0.012); g.add(dome);
    g.add(mesh(loop(s.cx, y0 + 0.012, s.cz, s.rx + 0.014, s.rz + 0.014, 0.012), mat(t.accent, 0, 0.1)));
    const brim = mesh(new THREE.CylinderGeometry(1, 1, 0.01, 40, 1, false, -Math.PI / 2, Math.PI), mat(t.accent, 0, 0.1), s.cx, y0, s.cz); brim.scale.set(s.rx + 0.03, 1, s.rz + 0.07); g.add(brim);
    const feather = mesh(ball(0.04), mat(0xc8413a, 0, 0), s.cx + s.rx * 0.9, y0 + 0.07, s.cz - 0.03); feather.scale.set(0.35, 1.8, 0.35); feather.rotation.z = -0.5; g.add(feather);
  } else if (/hat/i.test(name)) {   // a wizard's hat: a wide soft brim, a tall cone bending back at the tip, a band with a gem, a star at the point
    const y0 = cy + R * 0.55, s = r.cut(H, y0) ?? { cx: 0, cz, rx: R * 0.9, rz: R * 0.9 }, cloth = mat(t.metal, 0, 0.08), h1 = R * 0.95;
    const brim = mesh(new THREE.CylinderGeometry(1, 1, 0.014, 56), cloth, s.cx, y0, s.cz); brim.scale.set(s.rx + 0.1, 1, s.rz + 0.1); g.add(brim);
    const crownCone = mesh(new THREE.CylinderGeometry(0.055, 1, h1, 48), cloth, s.cx, y0 + h1 / 2, s.cz - 0.01); crownCone.scale.set(s.rx * 0.92, 1, s.rz * 0.92); g.add(crownCone);
    const tip = mesh(cone(0.058, 0.2), cloth, s.cx, y0 + h1 + 0.06, s.cz - 0.07); tip.rotation.x = -0.85; g.add(tip);   // the point flops backwards
    g.add(mesh(loop(s.cx, y0 + 0.035, s.cz - 0.01, s.rx * 0.9, s.rz * 0.9, 0.016), mat(t.accent, 0, 0.3)));
    const jewel = mesh(gem(0.026, 0.034), mat(t.gem, t.glow ?? 0, 0.3), s.cx, y0 + 0.035, s.cz - 0.01 + s.rz * 0.9 + 0.012); jewel.scale.z = 0.5; g.add(jewel);
    const star = mesh(gem(0.03, 0.022), mat(0xffe890, 0xffe890, 0.3), s.cx, y0 + h1 + 0.11, s.cz - 0.2); g.add(star);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.4, dot = mesh(ball(0.012), mat(0xffe890, 0xffc860, 0.2), s.cx + Math.sin(a) * s.rx * 0.6, y0 + h1 * (0.35 + 0.1 * (i % 2)), s.cz - 0.01 + Math.cos(a) * s.rz * 0.6); g.add(dot); }   // little stars sewn on
  } else if (/hood/i.test(name)) {   // open at the face: a cap over the crown and a drape down the back, a peak trailing behind
    const cloth = mat(t.metal, 0, 0.05);
    g.add(mesh(new THREE.SphereGeometry(R * 1.08, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.3), cloth, 0, cy, cz));
    g.add(mesh(new THREE.SphereGeometry(R * 1.08, 40, 20, Math.PI, Math.PI, 0, Math.PI * 0.72), cloth, 0, cy, cz));
    const edge = mesh(torus(R * 1.08, 0.014, Math.PI), mat(t.accent, 0, 0.2), 0, cy, cz); edge.rotation.x = -Math.PI * 0.2; g.add(edge);
    const tail = mesh(cone(0.07, 0.24), cloth, 0, cy + R * 0.05, cz - R * 1.1); tail.rotation.x = -2.5; g.add(tail);
    const jewel = mesh(gem(0.024, 0.03), mat(t.gem, t.gem, 0.3), 0, cy + R * 1.0, cz + R * 0.32); jewel.scale.z = 0.5; g.add(jewel);
  } else {   // crowns: a band fitted to the head, rimmed, with points rooted in it — stingers, horns, ice, gold
    const bh = 0.06, by = hb.max.y - 0.045, s = r.cut(H, by) ?? { cx: 0, cz, rx: R * 0.6, rz: R * 0.6 }, rx = s.rx + 0.01, rz = s.rz + 0.01, gold = t.key === "ember" ? t.metal : 0xf0c463;
    const band = mesh(new THREE.CylinderGeometry(1, 1, bh, 48, 1, true), mat(gold, 0, 0.8, 1, THREE.DoubleSide), s.cx, by, s.cz); band.scale.set(rx, 1, rz); g.add(band);
    for (const y of [by - bh / 2, by + bh / 2]) g.add(mesh(loop(s.cx, y, s.cz, rx, rz, 0.008), mat(gold, 0, 0.8)));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, x = s.cx + Math.sin(a) * rx, z = s.cz + Math.cos(a) * rz, big = i === 0, ph = big ? 0.11 : 0.07, top = by + bh / 2;
      const tip = t.key === "frost" ? mesh(gem(big ? 0.022 : 0.016, ph / 2), mat(t.gem, t.glow!, 0.2, 0.9)) : mesh(cone(big ? 0.026 : 0.019, ph), mat(t.key === "ember" ? t.accent : gold, t.key === "ember" || t.divine ? t.glow! : 0, 0.8));
      tip.position.set(x, top + ph / 2 - 0.006, z); if (t.key === "sand") { tip.rotation.x = 0.35 * Math.cos(a); tip.rotation.z = -0.35 * Math.sin(a); } g.add(tip);
      if (t.key !== "frost") g.add(mesh(ball(big ? 0.014 : 0.01), mat(t.gem, t.glow ?? 0, 0.4), x, top + ph - 0.004, z));   // a bead on each point
      const stone = mesh(ball(big ? 0.017 : 0.012), mat(t.gem, t.glow ?? 0, 0.4), s.cx + Math.sin(a) * (rx + 0.004), by, s.cz + Math.cos(a) * (rz + 0.004)); stone.scale.set(1, 1.2, 1); g.add(stone);
    }
    if (t.key === "ember" || /tusk|horn/i.test(name)) for (const sd of [-1, 1]) {   // horns growing from the band's sides
      const tilt = 0.6, hl = 0.2, base = new V3(s.cx + sd * rx, by, s.cz), dir = new V3(sd * Math.sin(tilt), Math.cos(tilt), 0);
      const horn = mesh(cone(0.034, hl), mat(t.key === "ember" ? t.metal : 0xf4ead0, 0, 0.3)); horn.position.copy(base).addScaledVector(dir, hl / 2 - 0.01); horn.rotation.z = -sd * tilt; g.add(horn);
    }
  }
  onBone(r, "head", g); return true;
}

// ---------------------------------------------------------------- dressing a rig
/** Build (or rebuild, when the equipment changed) the made-to-measure gear on a rig. Call after the authored gear
 *  meshes were toggled for `equip`; hides the authored piece an item replaces. */
export function dressGear(root: THREE.Object3D, equip: Record<string, string>) {
  const sig = JSON.stringify(equip);
  if (root.userData.gearSig === sig) { hideReplaced(root); return; }
  root.userData.gearSig = sig;
  const old: THREE.Object3D[] = []; root.traverse(n => { if (n.userData.gear) old.push(n); });
  for (const o of old) { o.removeFromParent(); o.traverse((n: any) => n.geometry?.dispose?.()); }
  let skin: THREE.SkinnedMesh | undefined; root.traverse((n: any) => { if (!skin && n.isSkinnedMesh && n.skeleton?.bones.some((b: THREE.Bone) => b.name === "head")) skin = n; });
  const geos = new Map<string, THREE.BufferGeometry>();   // the rig's skinned pieces in bind pose (hidden ones included)
  root.traverse((n: any) => { if (n.isSkinnedMesh) geos.set(n.name, n.geometry); });
  const find = (m: RegExp | string) => [...geos].find(([k]) => typeof m === "string" ? k === m || k.startsWith(m + "_") : m.test(k))?.[1];
  const box = (m: RegExp | string) => { const g = find(m); if (!g) return undefined; g.boundingBox ?? g.computeBoundingBox(); return g.boundingBox!; };
  const cut = (m: RegExp | string, y: number, xa?: number, xb?: number) => { const g = find(m); return g && section(g, y, xa, xb); };
  const r: Rig = { root, skin, box, cut }, replaced = new Set<string>();
  for (const [slot, id] of Object.entries(equip)) {
    const it = ITEMS[id]; if (!it || AUTHORED.has(id)) continue;
    const t = themeOf(id), vis = it.visual ? EQUIP_VISUALS[it.visual] : undefined;
    if (slot === "MainWeapon" || slot === "OffHand") {
      const authored = vis && findPiece(root, vis.mesh); if (!authored) continue;
      const g = it.weapon === "bow" ? bow(id, t) : it.weapon === "staff" ? staff(id, t) : it.weapon === "sword" ? sword(id, t) : shield(id, t);
      g.position.copy(authored.position); g.quaternion.copy(authored.quaternion); g.scale.copy(authored.scale);
      g.userData.gear = true; authored.parent!.add(g); replaced.add(vis!.mesh);
    } else if (slot === "Head") { if (headgear(id, t, r) && vis) replaced.add(vis.mesh); }
    else if (slot === "Chest") chestAccents(id, t, r);
    else if (slot === "Back") capeAccents(id, t, r);
    else if (slot === "Gloves") limbAccents(t, r, "SK_Knight_Gloves", ["hand_l", "hand_r"], t.key === "ember" || t.key === "void", false);
    else if (slot === "Boots") limbAccents(t, r, "SK_Knight_Boots", ["calf_l", "calf_r"], t.key === "ember", !!t.divine || t.key === "storm");
  }
  root.userData.gearReplaced = [...replaced]; hideReplaced(root);
  const parents = new Set<THREE.Object3D>(); root.traverse(n => { if (n.userData.gear) parents.add(n.parent!); });
  root.updateMatrixWorld(true); parents.forEach(bake);
}
/** One draw per material per bone: a full set is dozens of small parts, and every player on screen wears one. */
function bake(parent: THREE.Object3D) {
  const parts = parent.children.filter(n => n.userData.gear), inv = parent.matrixWorld.clone().invert(), byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) p.traverse((m: any) => {
    if (!m.isMesh) return;
    const rel = inv.clone().multiply(m.matrixWorld), g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(rel);
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (rel.determinant() < 0) flipWinding(g);   // a mirrored part (the left wing) would render inside out once baked
    (byMat.get(m.material) ?? byMat.set(m.material, []).get(m.material)!).push(g); m.geometry.dispose();
  });
  parts.forEach(p => p.removeFromParent());
  for (const [material, gs] of byMat) {
    const merged = mergeGeometries(gs); gs.forEach(g => g.dispose()); if (!merged) continue;
    const smooth = toCreasedNormals(merged, Math.PI / 3); merged.dispose();   // bevels and seams shade round; real edges stay crisp
    const o = new THREE.Mesh(smooth, material); o.userData.gear = true; o.castShadow = true; parent.add(o);
  }
}
function flipWinding(g: THREE.BufferGeometry) {
  for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) for (let i = 0; i < a.count; i += 3) for (let c = 0; c < a.itemSize; c++) {
    const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t);
  }
}
function findPiece(root: THREE.Object3D, name: string) { let hit: THREE.Object3D | undefined; root.traverse(n => { if (!hit && (n.name === name || n.name.startsWith(name + "_")) && !n.userData.gear) hit = n; }); return hit; }
/** The authored pieces an item replaces stay hidden (applyEquipVisuals shows them again on every refresh). */
function hideReplaced(root: THREE.Object3D) {
  const names: string[] = root.userData.gearReplaced ?? []; if (!names.length) return;
  root.traverse(n => { if (!n.userData.gear && names.some(m => n.name === m || n.name.startsWith(m + "_"))) n.visible = false; });
}
