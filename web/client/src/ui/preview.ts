import { playerModel } from "../actors/player-model";
// Character-creator stage: the chosen breed, in the chosen fur colour, idling on a little plinth. Its own small
// renderer (the game's is busy drawing the world behind the card); dropped as soon as the player is in the world.
import * as THREE from "three";
import { BREEDS } from "@shared/sim";
import { loadGlb } from "../render/assets";
import { blink, lidsOf, rig } from "../actors/actor";
import { Animator, loadClips } from "../actors/anim";
import { applyEquipVisuals, releaseMaterials } from "../actors/visuals";

let renderer: THREE.WebGLRenderer | null = null, raf = 0, token = 0, spin = 0.5, drag: number | null = null;
const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20), clock = new THREE.Clock();
let selectedColor = 0;
const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
let framing = { height: 1, width: 1, center: 0.5 };
function frame() {
  const halfFov = THREE.MathUtils.degToRad(cam.fov / 2);
  const distance = Math.max(framing.height / 2 / Math.tan(halfFov), framing.width / 2 / (Math.tan(halfFov) * cam.aspect)) * 1.15;
  cam.position.set(0, framing.center + distance * .08, distance);
  cam.lookAt(0, framing.center, 0);
}
let shown: { obj: THREE.Object3D; anim: Animator; race: string; lids: ReturnType<typeof lidsOf>; q: { blink?: number; shut?: number } } | null = null;
const portraitCache = new Map<string, Promise<string>>();

/** Render a saved character as a small head-and-shoulders profile image for the slot picker. */
export function characterPortrait(race: string, color: number) {
  const key = `${race}:${color}`;
  let cached = portraitCache.get(key);
  if (cached) return cached;
  cached = (async () => {
    const legacy: Record<string, string> = { dog: "knight-refined", cat: "cat", mouse: "mouse" };
    const [src, armour, weapons] = await Promise.all([
      loadGlb(legacy[race] ? `assets/${legacy[race]}.glb` : `assets/breeds/${race}.glb`),
      loadGlb("assets/cat.glb"), loadGlb("assets/shiba.glb"),
    ]);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 160;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(160, 160, false); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xfff6df, 0x567061, 2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5); keyLight.position.set(2, 3, 3); s.add(keyLight);
    const rim = new THREE.DirectionalLight(0xcbe1ff, 1.1); rim.position.set(-2, 2, -2); s.add(rim);
    const { obj } = rig(playerModel(src, armour, weapons, race));
    obj.scale.setScalar(BREEDS[race]?.size ?? 1); obj.rotation.y = .28; applyEquipVisuals(obj, {}, color, race); s.add(obj);
    obj.updateMatrixWorld(true);
    const bounds = new THREE.Box3(); obj.traverseVisible(n => { if (n instanceof THREE.Mesh) bounds.expandByObject(n, true); });
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const c = new THREE.PerspectiveCamera(27, 1, .1, 20), focusY = bounds.min.y + size.y * .7;
    const viewHeight = size.y * .68, distance = Math.max(viewHeight, size.x * 1.15) / (2 * Math.tan(THREE.MathUtils.degToRad(c.fov / 2))) * 1.08;
    c.position.set(0, focusY + size.y * .02, center.z + distance); c.lookAt(0, focusY, center.z); c.updateProjectionMatrix();
    r.render(s, c); const url = canvas.toDataURL("image/png");
    releaseMaterials(obj); r.dispose(); r.forceContextLoss();
    return url;
  })().catch(() => "");
  portraitCache.set(key, cached); return cached;
}

export function startPreview(canvas: HTMLCanvasElement) {
  if (renderer) return;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return; }   // no second context: the card still works without it
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  scene.add(new THREE.HemisphereLight(0xfff4de, 0x6a5238, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, 3, 2.5); scene.add(key);
  const rimL = new THREE.DirectionalLight(0xbfd8ff, 1.2); rimL.position.set(-2, 1.5, -2); scene.add(rimL);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.47, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x52684c, roughness: 0.85 }));
  plinth.position.y = -0.03; scene.add(plinth);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);
  cam.position.set(0, 0.75, 3.0); cam.lookAt(0, 0.3, 0);   // low target: the character stands clear of the name plate
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();spin+=e.key==='ArrowLeft'?-.25:.25;}if(e.key==='Enter'||e.key===' '){e.preventDefault();emote();}});
  canvas.addEventListener("pointercancel",()=>{drag=null;});
  canvas.addEventListener("pointerdown", e => { drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => { if (drag !== null) { spin += (e.clientX - drag) * 0.012; drag = e.clientX; } });
  canvas.addEventListener("pointerup", e => { if (drag !== null && Math.abs(e.clientX - drag) < 2) emote(); drag = null; });
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta()), w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0 && (canvas.width !== Math.round(w * renderer!.getPixelRatio()) || canvas.height !== Math.round(h * renderer!.getPixelRatio()))) { renderer!.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); frame(); }
    if (drag === null && !reducedMotion) spin += dt * 0.12;
    if (shown) { shown.obj.rotation.y = spin; shown.anim.update(dt); const k = blink(shown.q, dt); for (const l of shown.lids) l.mesh.morphTargetInfluences![l.i] = k; }
    renderer!.render(scene, cam);
  };
  loop();
}

/** Swap in `race` (a breed id) tinted `color` (0 = its natural coat); keeps the rotation. */
export async function showBreed(race: string, color: number) {
  if (!renderer || !BREEDS[race]) return;
  const id = ++token; selectedColor = color;
  const legacy: Record<string, string> = { dog: "knight-refined", cat: "cat", mouse: "mouse" };
  const [src, armour, weapons] = await Promise.all([loadGlb(legacy[race] ? `assets/${legacy[race]}.glb` : `assets/breeds/${race}.glb`), loadGlb("assets/cat.glb"), loadGlb("assets/shiba.glb"), loadClips()]);
  if (id !== token || !renderer) return;                                  // the player clicked on while this loaded
  if (shown) { scene.remove(shown.obj); releaseMaterials(shown.obj); }
  const { obj } = rig(playerModel(src, armour, weapons, race)); obj.scale.setScalar(BREEDS[race].size);
  applyEquipVisuals(obj, {}, selectedColor, race); scene.add(obj);   // the breed itself, as on the breed sheet: no gear
  obj.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  obj.traverseVisible(node => { if (node instanceof THREE.Mesh) bounds.expandByObject(node, true); });
  const size = bounds.getSize(new THREE.Vector3());
  framing = { height: size.y + .15, width: Math.max(size.x, size.z, 1.0), center: bounds.getCenter(new THREE.Vector3()).y };
  frame();
  shown = { obj, anim: new Animator(obj), race, lids: lidsOf(obj), q: {} }; shown.anim.setMoving(false);

}
export function setPreviewColor(color: number) { selectedColor = color; if (shown) applyEquipVisuals(shown.obj, {}, color, shown.race); }
function emote(clip?: string) { shown?.anim.play((clip ?? ["Attack", "Slash", "Cast", "Pick"][Math.floor(Math.random() * 4)]) as any); }

export function stopPreview() {
  cancelAnimationFrame(raf); if (!renderer) return;
  if (shown) { scene.remove(shown.obj); releaseMaterials(shown.obj); }
  renderer.dispose(); renderer.forceContextLoss(); renderer = null; shown = null; token++;
}
