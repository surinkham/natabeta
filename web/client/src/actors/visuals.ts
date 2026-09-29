import { applyEquipmentDesign } from "../items/equipment-design";
import * as THREE from "three";
import { EQUIP_VISUALS, ITEMS } from "@shared/data";
import { BREEDS } from "@shared/sim";
import { dressGear } from "./gear";

// Equipment → appearance (GDD "Stats + Appearance"): every gear mesh in the rig is visible only while an item that
// maps to it is equipped; a visual may tint the mesh so two items can share one mesh (starter vs knight chest).
const GEAR_MESHES = new Set(Object.values(EQUIP_VISUALS).map(v => v.mesh));

// Rigs share one cached material per source part (actor.ts), so tinting it in place would re-colour every player of
// that breed. The first tint gives the mesh its own copy; `clone()` drops onBeforeCompile, so the fur-rim hook and its
// cache key are carried over by hand (same key → same compiled program, no shader stall).
const owned = new WeakSet<THREE.Mesh>();
function ownMaterial(n: THREE.Mesh) {
  if (owned.has(n)) return; owned.add(n);
  const src = n.material as THREE.Material, m = src.clone();
  m.onBeforeCompile = src.onBeforeCompile; m.customProgramCacheKey = src.customProgramCacheKey;
  n.material = m;
}
/** Boss look: the same creature darkened, lit from behind by a red rim glow, standing in a slow pulsing ring of red
 *  light — readable as a boss at a glance, from across the field. The materials become this rig's own copies. */
/** Boss looks: a Tyrant burns red, a night lord glows moonlit blue-violet, a PK warlord wears gold — a golden rim and a
 *  double ring of gold light (the outer one turning against the inner), readable across a contested field. */
const BOSS_STYLE = {
  tyrant: { rim: "1.,.16,.04", emissive: 0x2a0400, aura: 0xff3018 },
  night: { rim: ".5,.58,1.", emissive: 0x08082a, aura: 0x7a8cff },
  pk: { rim: "1.,.72,.16", emissive: 0x2a1a00, aura: 0xffb81c },
};
export function bossLook(root: THREE.Object3D, kind: keyof typeof BOSS_STYLE = "tyrant") {
  const st = BOSS_STYLE[kind];
  root.traverse((n: any) => {
    if (!n.isMesh || n.name === "boss-aura") return;
    ownMaterial(n); const m = n.material as THREE.MeshStandardMaterial;
    m.color?.multiplyScalar(0.88); if (m.emissive) m.emissive.set(st.emissive);
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey?.() ?? "";
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(${st.rim}) * pow(1. - abs(dot(normalize(vViewPosition), normal)), 3.5) * ${kind === "pk" ? "0.45" : "0.35"};`);
    };
    m.customProgramCacheKey = () => key + "|" + kind + "-rim"; m.needsUpdate = true;
  });
  const ringMat = () => new THREE.MeshBasicMaterial({ color: st.aura, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const aura = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.8, 48), ringMat());   // small and faint: players found the old wide glow a nuisance
  aura.name = "boss-aura"; aura.rotation.x = -Math.PI / 2; aura.position.y = 0.05; aura.renderOrder = 2;
  aura.onBeforeRender = () => { const t = performance.now() / 1000; (aura.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(t * 2.4) * 0.06; aura.scale.setScalar(1 + Math.sin(t * 1.2) * 0.03); };
  if (kind === "pk") {   // an outer ring of eight gold arcs, turning the other way (a child: it hides with the aura on death)
    const outer = new THREE.Group();
    for (let i = 0; i < 8; i++) { const arc = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.95, 8, 1, i * Math.PI / 4 + 0.08, Math.PI / 4 - 0.16), ringMat()); arc.name = "boss-aura-arc"; outer.add(arc); }   // not the body: portraits and bounds skip it
    outer.renderOrder = 2; aura.add(outer);
    outer.children[0].onBeforeRender = () => { const t = performance.now() / 1000; outer.rotation.z = -t * 0.6; for (const c of outer.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 3 + 1) * 0.08; };
  }
  root.add(aura);
}
/** A rig leaving the scene frees the copies it owns; the shared cached materials stay. */
export function releaseMaterials(root: THREE.Object3D) { root.traverse((n: any) => { if (owned.has(n)) (n.material as THREE.Material).dispose(); }); }
const FUR_PART = /^SK_(?!Knight_)[A-Za-z]+_(Head|Body|Ears|Tail)/;
export function applyEquipVisuals(root: THREE.Object3D, equip: Record<string, string>, furColor?: number, race = "dog") {
  const want = new Map<string, string | undefined>();   // mesh -> tint
  for (const itemId of Object.values(equip)) { const v = ITEMS[itemId]?.visual && EQUIP_VISUALS[ITEMS[itemId].visual!]; if (v) want.set(v.mesh, v.tint); }
  const bow = ITEMS[equip.MainWeapon]?.weapon === "bow";   // a bow takes both paws: the shield stays on the back of the mind
  root.traverse((n: any) => {
    if (!n.isMesh && !(n.name && GEAR_MESHES.has(n.name))) return;
    const gear = [...GEAR_MESHES].find(name => n.name === name || n.name.startsWith(name + "_"));
    if (gear) {
      n.visible = want.has(gear) && !(bow && gear === "SM_KiteShield");
      if (n.visible && n.isMesh) {
        ownMaterial(n);
        // hex, not a THREE.Color: material.clone() deep-copies userData through JSON, which turns a Color into a
        // number — copy() of that gave NaN and a black tunic on every cloned rig (equipment doll)
        n.material.userData.baseColor ??= n.material.color.getHex();
        n.material.color.set(n.material.userData.baseColor).multiply(new THREE.Color(want.get(gear) ?? "#ffffff"));
      }
    }
    else if (furColor !== undefined && FUR_PART.test(n.name)) ownMaterial(n), n.material.color.copy(furColor ? furTint(furColor, BREEDS[race]?.coat) : WHITE);   // 0 = the breed's natural coat
  });
  applyEquipmentDesign(root, equip);
  const { MainWeapon, OffHand, ...armour } = equip;
  dressGear(root, armour);   // retain fitted, bone-bound armour accents
}

// The dog's baked texture is already orange; `color` multiplies it, so express the chosen fur as a ratio to that base.
const WHITE = new THREE.Color(1, 1, 1);
export function furTint(color: number, coat = 0xe8963a) {
  const c = new THREE.Color(color), BASE = new THREE.Color(coat);
  return new THREE.Color(Math.min(1.5, c.r / BASE.r), Math.min(1.5, c.g / BASE.g), Math.min(1.5, c.b / BASE.b));
}
