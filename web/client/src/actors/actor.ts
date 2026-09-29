import { addContactShadow } from "../render/contact-shadow";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { scene, toonFrom, characterMaterial } from "../render/scene";
import type { Derived, Primary } from "@shared/formulas";
import { Animator } from "./anim";

// Every rig shares SK_BK_Chibi, so bone names below exist on every character.
export interface Actor extends Primary, Partial<Derived> {
  obj: THREE.Object3D; bones: Record<string, THREE.Bone>; pos: THREE.Vector3; yaw: number;
  hp: number; alive: boolean; anim: Animator;
  /** Per-actor secondary motion: ear flicks and tail sway on top of whatever clip is playing. */
  quirk?: Quirk;
  /** Eyelid meshes carrying a "Blink" morph (index into morphTargetInfluences). */
  lids?: { mesh: THREE.Mesh; i: number }[];
}

export interface Quirk { phase: number; ear: number; tail: number; sway: number; next: number; flick: number; blink?: number; shut?: number }
const rnd = () => Math.random();
/** `ear`/`tail` are radians of extra motion; a fox flicks more than a boar, a stump barely moves. */
export function makeQuirk(ear = 0.18, tail = 0.22, sway = 1): Quirk {
  return { phase: rnd() * 6.28, ear, tail, sway, next: 2 + rnd() * 4, flick: 0 };
}

// Skinned bounds are the rest-pose bounds, so animation can poke outside them; a padded sphere keeps frustum culling
// honest (without it every character on the map is drawn, and shadow-cast, every frame).
const padded = new WeakSet<THREE.BufferGeometry>();
function padBounds(g: THREE.BufferGeometry) {
  if (padded.has(g)) return; padded.add(g);
  if (!g.boundingSphere) g.computeBoundingSphere();
  g.boundingSphere!.radius *= 1.8;
}

// One toon material per (source material, tint). Without this every clone of a wolf made its own copy: 122 monsters
// meant 122 sets of materials to bind and keep in memory, all of them identical.
const matCache = new Map<string, THREE.Material>();
function skinMaterial(src: THREE.Material, tint?: number) {
  const key = src.uuid + ":" + (tint ?? "");
  let m = matCache.get(key);
  if (!m) {
    m = characterMaterial(src as THREE.MeshStandardMaterial);
    if (tint !== undefined && (m as THREE.MeshStandardMaterial).color) {
      const skin=m as THREE.MeshStandardMaterial;
      if(skin.map){
        skin.color.set(0xffffff);
        skin.onBeforeCompile=shader=>{
          shader.uniforms.realmTint={value:new THREE.Color(tint)};
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 realmTint;').replace('#include <map_fragment>',`#include <map_fragment>
          float coatLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
          float coatMask=smoothstep(.018,.10,coatLuma)*(1.-smoothstep(.65,.9,coatLuma));
          diffuseColor.rgb=mix(diffuseColor.rgb,realmTint*(.35+coatLuma*1.3),coatMask*.88);`);
        };
        skin.customProgramCacheKey=()=> 'regional-fur-v1';
      }else skin.color.multiply(new THREE.Color(tint));
    }
    matCache.set(key, m);
  }
  return m;
}

/** `tint` re-colours a shared model so a Frostfang Wolf is not just a Dire Wolf with a different name. */
export function rig(src: THREE.Object3D, tint?: number) {
  const obj = SkeletonUtils.clone(src);
  // no directional shadow by default: every skinned body in the shadow pass is skinned a second time, and the town's
  // NPCs and the monsters were most of the GPU frame. Bodies wear a contact shadow; the player's own opts back in.
  obj.traverse((n: any) => { if (n.isMesh) { n.castShadow = false; n.receiveShadow = true; padBounds(n.geometry); n.material = skinMaterial(n.material, tint); } });
  shareSkeletons(obj);
  const bones: Record<string, THREE.Bone> = {};
  obj.traverse((n: any) => { if (n.isBone) bones[n.name] = n; });
  return { obj, bones };
}

/** SkeletonUtils.clone gives every skinned part its own Skeleton even when the parts share one rig, so each part was
 *  posed and uploaded to the GPU separately every frame (3–10 per body). Parts bound to the same bones share one again. */
function shareSkeletons(obj: THREE.Object3D) {
  const kept: THREE.Skeleton[] = [];
  obj.traverse((n: any) => {
    if (!n.isSkinnedMesh) return;
    const s: THREE.Skeleton = n.skeleton, same = kept.find(k => k.bones.length === s.bones.length && k.bones.every((b, i) => b === s.bones[i]) && k.boneInverses.every((m, i) => m.equals(s.boneInverses[i])));
    if (same) n.skeleton = same; else kept.push(s);
  });
}

/** Move copies of `donor`'s parts (picked by name) into `target`, re-skinned onto target's bones by name. Breed models
 *  ship fur only; the knight armour set is grafted from one race model so nine breeds don't each carry a 1 MB copy. */
export function graft(target: THREE.Object3D, donor: THREE.Object3D, pick: (name: string) => boolean) {
  const bones = new Map<string, THREE.Bone>(); target.traverse((n: any) => { if (n.isBone) bones.set(n.name, n); });
  const copy = SkeletonUtils.clone(donor), parts: THREE.Object3D[] = [];
  copy.traverse(n => { if (pick(n.name) && !(n.parent && pick(n.parent.name))) parts.push(n); });
  for (const part of parts) {
    (target.getObjectByName(part.parent!.name) ?? target).add(part);   // same parent (armature or hand socket), same local transform
    part.traverse((n: any) => { if (n.isSkinnedMesh) n.bind(new THREE.Skeleton(n.skeleton.bones.map((b: THREE.Bone) => bones.get(b.name) ?? b), n.skeleton.boneInverses), n.bindMatrix); });
  }
  return target;
}

export function lidsOf(obj: THREE.Object3D) {
  const out: { mesh: THREE.Mesh; i: number }[] = [];
  obj.traverse((n: any) => { const i = n.morphTargetDictionary?.Blink; if (i !== undefined) out.push({ mesh: n, i }); });
  return out;
}
/** Blink every 2–6 s (sometimes a double blink); `q` carries the timers. Returns the lid closure 0..1. */
export function blink(q: { blink?: number; shut?: number }, dt: number) {
  q.blink = (q.blink ?? 1 + Math.random() * 3) - dt;
  if (q.blink <= 0) { q.blink = Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 4; q.shut = 0.16; }
  q.shut = Math.max(0, (q.shut ?? 0) - dt);
  return q.shut > 0 ? Math.sin((1 - q.shut / 0.16) * Math.PI) : 0;
}
export function makeActor<T extends object>(src: THREE.Object3D, opts: T, clipPrefix = "", tint?: number): Actor & T {
  const { obj, bones } = rig(src, tint); addContactShadow(obj); scene.add(obj);
  return { obj, bones, lids: lidsOf(obj), pos: obj.position, yaw: 0, hp: 1, alive: true, anim: new Animator(obj, clipPrefix), ...opts } as Actor & T;
}

const EAR_AXIS = new THREE.Vector3(1, 0, 0), TAIL_AXIS = new THREE.Vector3(0, 0, 1);
const tmpQ = new THREE.Quaternion();

/** Secondary motion applied after the mixer wrote the pose: a slow tail sway, plus ears that flick now and then.
 *  Cheap (two quaternion multiplies) and it is what stops a standing monster from looking like a statue. */
function quirks(a: Actor, dt: number) {
  const q = a.quirk; if (!q || !a.alive) return;
  q.phase += dt * (1.6 + q.sway);
  q.next -= dt;
  if (q.next <= 0) { q.next = 2.5 + rnd() * 5; q.flick = 0.35; }            // schedule the next ear flick
  if (q.flick > 0) q.flick = Math.max(0, q.flick - dt);
  if (a.lids?.length) { const k = blink(q, dt); for (const l of a.lids) l.mesh.morphTargetInfluences![l.i] = k; }
  const flick = q.flick > 0 ? Math.sin((0.35 - q.flick) / 0.35 * Math.PI) : 0;
  const tail = Math.sin(q.phase) * q.tail;
  const ear = Math.sin(q.phase * 0.7) * q.ear * 0.35 + flick * q.ear;
  for (const name of ["ear_l", "ear_r"]) {
    const b = a.bones[name]; if (!b) continue;
    b.quaternion.multiply(tmpQ.setFromAxisAngle(EAR_AXIS, name === "ear_l" ? -ear : -ear * 0.85));
  }
  const t = a.bones.tail_01;
  if (t) t.quaternion.multiply(tmpQ.setFromAxisAngle(TAIL_AXIS, tail));
}

/** Per-frame: advance the mixer, face the yaw. Locomotion state comes from `moving`.
 *  `budget` throttles the work for distant actors: 1 = every frame, 0 = skip this one (the pose simply holds). */
export function animate(a: Actor, dt: number, moving: boolean, budget = 1, sitting = false, riding = false) {
  a.obj.rotation.y = a.yaw;
  if (budget <= 0) return;
  a.anim.setMoving(moving, sitting, riding); a.anim.update(dt / budget);
  quirks(a, dt / budget);
}

export function inCone(a: Actor, b: Actor, range: number, deg: number) {
  const d = new THREE.Vector3().subVectors(b.pos, a.pos); if (d.length() > range) return false;
  return new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)).angleTo(d.normalize()) < THREE.MathUtils.degToRad(deg / 2);
}
