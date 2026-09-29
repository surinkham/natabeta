import { droppedBy } from "@shared/codex";
import { mountModel } from "../actors/mount-model";
// Equipment window with a live paper-doll: a second renderer draws a clone of the player's rig that mirrors
// equipment + fur colour; drag to rotate, click a slot to unequip. Slots follow spec §7.1 / GDD equipment list.
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { ITEMS, MOUNTS, modsText } from "@shared/data";
import { countOf } from "@shared/inventory";
import { loadGltf } from "../render/assets";
import { game } from "./api";
import { body, createWindow, isOpen, setHTML } from "./windows";
import { sys } from "./chat";
import { applyEquipVisuals } from "../actors/visuals";
import { Animator } from "../actors/anim";
import { icon, slotIcon } from "./icons";

const LEFT = [["Head", "หมวก"], ["Face", "หน้า"], ["MainWeapon", "อาวุธ"], ["Back", "ผ้าคลุม"], ["Accessory1", "เครื่องประดับ"]];
const RIGHT = [["Chest", "เกราะ"], ["OffHand", "มือซ้าย"], ["Gloves", "ถุงมือ"], ["Boots", "รองเท้า"], ["Accessory2", "เครื่องประดับ"]];
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, doll: THREE.Object3D | null = null, anim: Animator | null = null;
let yaw = 0.4, dragging = false, lastX = 0, lastSig = "", clock = new THREE.Clock();
// mount preview: which mount stands under the doll ("" = none); starts as the one ridden
let preview = "", steed: THREE.Object3D | null = null, steedMixer: THREE.AnimationMixer | null = null;
const RIDER_SEAT = 0.17;   // same as game.ts: the chibi pelvis sits this far above the rider's feet

export function setupEquip() {
  createWindow("equip", "Equipment", `<div class="eq-grid">
    <div class="eqcol" id="eq-left"></div><canvas id="eq-canvas" width="200" height="240" style="border-radius:10px;background:#e6d4ae;cursor:grab;touch-action:none"></canvas><div class="eqcol" id="eq-right"></div></div>
    <div class="eq-mount"><span>สัตว์ขี่</span><div id="eq-mounts"></div></div>
    <div class="row" style="color:#7a5a3a;margin-top:6px"><span>คลิกช่องเพื่อถอด · ลากรูปเพื่อหมุน</span><b id="eq-def"></b></div>`);
  const canvas = document.getElementById("eq-canvas") as HTMLCanvasElement;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(200, 240, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(28, 200 / 240, 0.1, 10); cam.position.set(0, 0.55, 2.6); cam.lookAt(0, 0.5, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9)); const key = new THREE.DirectionalLight(0xfff1dc, 1.6); key.position.set(1.5, 3, 2); scene.add(key);
  canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => { if (dragging) { yaw += (e.clientX - lastX) * 0.02; lastX = e.clientX; } });
  canvas.addEventListener("pointerup", () => { dragging = false; }); canvas.addEventListener("pointercancel", () => { dragging = false; });
  body("equip").addEventListener("click", e => {
    const s = (e.target as HTMLElement).closest<HTMLElement>("[data-slot]"); if (s && s.dataset.has) { game().unequipSlot(s.dataset.slot!); }
    // mount row: a chip previews that mount under the doll (or none); "ขี่ / ลง" uses the mount item in the game
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-mount]"); if (m) { preview = m.dataset.mount!; lastSig = ""; refreshEquip(); }
    if ((e.target as HTMLElement).closest("[data-ride]")) { const P = game().P, it = P.inv.items.find(i => i.itemId === MOUNTS[preview]?.item); if (it) game().useItem(it.id); }
  });
}

/** Rebuild the doll from the live player rig (cheap: only when equipment/colour changed). */
function syncDoll() {
  const P = game().P; const sig = JSON.stringify(P.equip) + P.furColor;
  if (sig === lastSig && doll) return; lastSig = sig;
  if (doll) scene.remove(doll);
  doll = SkeletonUtils.clone(P.obj); doll.position.set(0, 0, 0); doll.rotation.set(0, 0, 0);
  doll.traverse((n: any) => { if (n.isMesh) n.material = n.material.clone(); });
  applyEquipVisuals(doll, P.equip, P.furColor, P.race); scene.add(doll);
  anim = new Animator(doll); anim.setMoving(false, false, !!preview);
  if (steed) { scene.remove(steed); steed = null; steedMixer = null; }
  const def = MOUNTS[preview];
  if (def) {
    const kind = preview;
    loadGltf(`assets/${def.model}.glb`).then(g => {
      if (preview !== kind || !doll) return;
      // matte, and double-sided so both faces of a single-sheet wing are lit
      steed = mountModel(g.scene, kind); steed.scale.setScalar(def.scale); steed.traverse((n: any) => { if (n.isMesh) { n.material = n.material.clone(); n.material.metalness = 0; n.material.roughness = 0.8; n.material.side = THREE.DoubleSide; } }); scene.add(steed);
      steedMixer = new THREE.AnimationMixer(steed); const idle = g.animations.find(c => c.name === "Idle"); if (idle) steedMixer.clipAction(idle).play();
      doll.position.y = def.saddle * def.scale - RIDER_SEAT * doll.scale.y;
    }).catch(() => {});
  }
}

export function refreshEquip() {
  const P = game().P;
  const slot = ([id, label]: string[]) => { const it = P.eq[id]; const d = it && ITEMS[it.itemId]; return `<div class="eqslot ${it ? "has" : ""}" data-slot="${id}" ${it ? `data-has="1" title="${d!.name}${d!.mods ? " — " + modsText(it.itemId) : ""}${droppedBy(it.itemId) ? "\n" + droppedBy(it.itemId) : ""}"` : ""}><span class="ic">${it ? icon(it.itemId, d!.icon) : slotIcon(id)}</span><span>${d?.name ?? label}</span></div>`; };
  setHTML(document.getElementById("eq-left")!, LEFT.map(slot).join("")); const arrows = countOf(P.inv, "ARROW");   // the quiver: not worn, but a bow is nothing without it — shown under the gear, read-only
  setHTML(document.getElementById("eq-right")!, RIGHT.map(slot).join("") + `<div class="eqslot ${arrows ? "has" : ""}" title="ลูกธนูในกระเป๋า — ซื้อได้ที่ร้านเครื่องมือ"><span class="ic">${icon("ARROW", ITEMS.ARROW?.icon ?? "🏹")}</span><span>ลูกธนู ×${arrows}</span></div>`);
  document.getElementById("eq-def")!.textContent = `ATK ${P.ATK} · MATK ${P.MATK} · DEF ${P.DEF} · HP ${P.maxHP}`;
  const own = (k: string) => countOf(P.inv, MOUNTS[k].item) > 0;
  setHTML(document.getElementById("eq-mounts")!, [`<button data-mount="" class="${preview ? "" : "on"}">ไม่ขี่</button>`,
    ...Object.entries(MOUNTS).map(([k, m]) => `<button data-mount="${k}" class="${preview === k ? "on" : ""}" ${own(k) ? "" : "title=\"ยังไม่มี — ดูได้อย่างเดียว\""}>${k === "dragon" ? "🐉" : "🐴"} ${m.name}${own(k) ? "" : " 🔒"}</button>`),
    preview && own(preview) ? `<button data-ride class="ride">${P.mounted && P.mountKind === preview ? "ลงจาก" : "ขี่"}${MOUNTS[preview].name}</button>` : ""].join(""));
}
/** Portrait: head-and-shoulders snapshot of the doll into #avatar whenever equipment/colour changed (and every few seconds for the idle pose). */
let avatarSig = "", avatarT = 0;
export function renderAvatar(dt: number) {
  avatarT += dt; const P = game().P; const sig = JSON.stringify(P.equip) + P.furColor;
  if (sig === avatarSig && avatarT < 4) return; avatarSig = sig; avatarT = 0;
  syncDoll(); const av = document.getElementById("avatar") as HTMLCanvasElement | null; if (!av || !doll) return;
  const keepYaw = doll.rotation.y, keepY = doll.position.y; doll.rotation.y = 0.35; doll.position.y = 0; if (steed) steed.visible = false;
  // (the portrait is the rider alone)
  // frame the head where it really is: breeds differ in size (a mouse's head sits far lower than a golden's), so a
  // fixed camera cut smaller ones in half — measure the posed head mesh and fit it to the circle
  doll.updateMatrixWorld(true); let head: THREE.SkinnedMesh | undefined;
  doll.traverse((n: any) => { if (!head && n.isSkinnedMesh && /_Head$/.test(n.name) && n.visible) head = n; });
  const box = new THREE.Box3(); if (head) { head.computeBoundingBox(); box.copy(head.boundingBox!).applyMatrix4(head.matrixWorld); }
  const c = head ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0.62, 0), sz = head ? Math.max(box.max.x - box.min.x, box.max.y - box.min.y) : 0.45;
  cam.position.set(c.x, c.y + sz * 0.25, c.z + sz * 1.95); cam.lookAt(c.x, c.y - sz * 0.02, c.z); renderer.setSize(140, 140, false); cam.aspect = 1; cam.updateProjectionMatrix();
  renderer.render(scene, cam); av.getContext("2d")!.drawImage(renderer.domElement, 0, 0, 140, 140);
  renderer.setSize(200, 240, false); cam.aspect = 200 / 240; cam.position.set(0, 0.55, 2.6); cam.lookAt(0, 0.5, 0); cam.updateProjectionMatrix(); doll.rotation.y = keepYaw; doll.position.y = keepY; if (steed) steed.visible = true;
}
/** Per frame while the window is open. */
export function renderEquipDoll() {
  if (!isOpen("equip")) return; syncDoll();
  const dt = clock.getDelta(); if (!dragging) yaw += dt * 0.25; doll!.rotation.y = yaw; anim?.update(dt);
  if (steed) { steed.rotation.y = yaw; steedMixer?.update(dt); }
  // with a mount the pair is bigger: pull the camera back (and back in without one)
  const far = steed ? (preview === "dragon" ? 5.4 : 4.2) : 2.6; if (Math.abs(cam.position.z - far) > 0.01) { cam.position.set(0, steed ? 1.0 : 0.55, far); cam.lookAt(0, steed ? 0.85 : 0.5, 0); }
  renderer.render(scene, cam);
}
