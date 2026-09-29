// The loot fairy (ทูตเก็บของ "ฟาริเทล"): a chibi fairy — cream-blonde hair, pointed ears, a gold tiara with a white
// flower, a white dress with a blue ribbon, a leather satchel with a blue gem, four glassy wings — who hovers at her
// player's shoulder and darts off to fetch drops (the sim decides what and when: the "fairy" event, shared/sim.ts).
// Built at runtime from rounded primitives painted with vertex colours and merged, so one fairy is four draws: the
// body, each pair of wings (they flap), and a soft glow.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { sparkBurst } from "../fx/fx";

const C = { skin: 0xffe2cf, hair: 0xf2dcae, hairDk: 0xecd3a0, eye: 0x2e6a78, white: 0xffffff, blush: 0xff9a9a, gold: 0xe8c060, dress: 0xfaf6ee, ribbon: 0x3d6fd6, gem: 0x4aa8ff, bag: 0x9a6636, bagDk: 0x70451f, petal: 0xfffaf0, pollen: 0xffd24a, shoe: 0x5a3a24 };
type Part = [THREE.BufferGeometry, number, [number, number, number]?, [number, number, number]?, [number, number, number]?];   // geometry, colour, position, rotation, scale

/** Paint each part one colour, place it, merge them into one geometry. */
function paint(parts: Part[]) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const gs = parts.map(([g0, col, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]]) => {
    const g = g0.index ? g0.toNonIndexed() : g0; g0 !== g && g0.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    g.applyMatrix4(m.compose(new THREE.Vector3(...p), q.setFromEuler(e.set(...r)), new THREE.Vector3(...s)));
    c.setHex(col).convertSRGBToLinear(); const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3)); return g;
  });
  const out = mergeGeometries(gs)!; gs.forEach(g => g.dispose()); return out;
}
const ball = (r: number) => new THREE.SphereGeometry(r, 32, 24);
const cone = (r: number, h: number) => new THREE.ConeGeometry(r, h, 24);
/** A turned shape whose outline is a smooth spline through `pts` (bottom to top or top to bottom), 32 sides round. */
const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(24), 32);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 16);
const torus = (R: number, tube: number) => new THREE.TorusGeometry(R, tube, 12, 48);
/** A wing: a rounded teardrop, root at the origin, reaching out along +X. */
function wing(len: number, width: number, droop: number) {
  const s = new THREE.Shape(); s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.3, width * 0.9 + droop, len * 0.95, width + droop, len, droop * 1.4);
  s.bezierCurveTo(len * 0.9, -width * 0.35 + droop, len * 0.4, -width * 0.4, 0, 0);
  return new THREE.ShapeGeometry(s, 24);
}

let bodyGeo: THREE.BufferGeometry | undefined, wingGeo: THREE.BufferGeometry | undefined, glowTex: THREE.Texture | undefined;
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.05 });
// a fairy glows a little in her own colours, so she reads at dusk and in the dark forest as well as at noon
bodyMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.45;"); };
bodyMat.customProgramCacheKey = () => "fairy-glow";
const wingMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
function build() {
  const H = 0.1;   // head centre height (the body's origin is her waist)
  bodyGeo = paint([
    // head, face and hair
    [ball(0.085), C.skin, [0, H, 0]],
    [ball(0.094), C.hair, [0, H + 0.014, -0.014], , [1, 1, 1]],
    [ball(0.088), C.hair, [0, H + 0.05, 0.02], , [1.05, 0.52, 0.92]],                         // bangs
    [ball(0.05), C.hairDk, [-0.07, H - 0.02, 0.0], , [0.55, 1.3, 0.8]], [ball(0.05), C.hairDk, [0.07, H - 0.02, 0.0], , [0.55, 1.3, 0.8]],   // side locks
    [lathe([[0, 0.02], [0.05, 0.012], [0.075, -0.03], [0.085, -0.1], [0.065, -0.155], [0.03, -0.172], [0, -0.175]]), C.hair, [0, H, -0.05]],   // long hair down the back
    [ball(0.019), C.eye, [-0.032, H - 0.005, 0.076], , [0.8, 1.25, 0.5]], [ball(0.019), C.eye, [0.032, H - 0.005, 0.076], , [0.8, 1.25, 0.5]],
    [ball(0.007), C.white, [-0.027, H + 0.004, 0.086]], [ball(0.007), C.white, [0.037, H + 0.004, 0.086]],
    [ball(0.012), C.blush, [-0.052, H - 0.03, 0.068], , [1, 0.6, 0.4]], [ball(0.012), C.blush, [0.052, H - 0.03, 0.068], , [1, 0.6, 0.4]],
    [ball(0.008), C.blush, [0, H - 0.04, 0.083], , [1.3, 0.6, 0.5]],                           // an open smile
    [cone(0.016, 0.07), C.skin, [-0.092, H, 0], [0, 0, 1.25]], [cone(0.016, 0.07), C.skin, [0.092, H, 0], [0, 0, -1.25]],   // elf ears
    // tiara of gold leaves, a white flower over the right ear
    [torus(0.07, 0.006), C.gold, [0, H + 0.08, -0.005], [Math.PI / 2 - 0.35, 0, 0]],
    [cone(0.012, 0.045), C.gold, [0, H + 0.12, 0.02], [0.3, 0, 0]], [cone(0.009, 0.035), C.gold, [-0.03, H + 0.11, 0.02], [0.3, 0, 0.4]], [cone(0.009, 0.035), C.gold, [0.03, H + 0.11, 0.02], [0.3, 0, -0.4]],
    ...Array.from({ length: 5 }, (_, i): Part => { const a = i / 5 * Math.PI * 2; return [ball(0.016), C.petal, [0.07 + Math.cos(a) * 0.017, H + 0.07 + Math.sin(a) * 0.017, 0.035], , [1, 1, 0.5]]; }),
    [ball(0.009), C.pollen, [0.07, H + 0.07, 0.042]],
    // dress, ribbon and bow gem
    [lathe([[0, 0.032], [0.028, 0.03], [0.04, 0.008], [0.048, -0.03], [0.064, -0.07], [0.076, -0.098], [0.04, -0.104], [0, -0.104]]), C.dress, [0, 0, 0]],
    [torus(0.038, 0.008), C.ribbon, [0, 0.005, 0], [Math.PI / 2, 0, 0]],
    [ball(0.012), C.ribbon, [-0.016, 0.008, 0.038], , [1.3, 0.8, 0.5]], [ball(0.012), C.ribbon, [0.016, 0.008, 0.038], , [1.3, 0.8, 0.5]], [ball(0.009), C.gem, [0, 0.008, 0.042]],
    // arms (one reaching forward), legs, shoes
    [capsule(0.012, 0.045), C.skin, [-0.05, 0.0, 0.01], [0.3, 0, 0.5]], [capsule(0.012, 0.045), C.skin, [0.052, 0.01, 0.03], [-1.0, 0, -0.4]],
    [capsule(0.012, 0.05), C.skin, [-0.022, -0.125, 0.0], [0.25, 0, 0]], [capsule(0.012, 0.05), C.skin, [0.022, -0.12, -0.01], [-0.35, 0, 0]],
    [ball(0.016), C.shoe, [-0.022, -0.155, 0.01], , [1, 0.8, 1.3]], [ball(0.016), C.shoe, [0.022, -0.15, 0.0], , [1, 0.8, 1.3]],
    // satchel at her hip: leather, a gold clasp ring, a blue gem
    [capsule(0.03, 0.025), C.bag, [-0.068, -0.05, 0.0], [0, 0, Math.PI / 2], [1, 1, 0.7]],
    [ball(0.028), C.bagDk, [-0.068, -0.033, 0.0], , [1.3, 0.35, 0.75]],
    [torus(0.016, 0.004), C.gold, [-0.068, -0.05, 0.022]], [ball(0.012), C.gem, [-0.068, -0.05, 0.023], , [1, 1, 0.6]],
  ]);
  // one side's pair of wings (upper and lower), tinted blue at the root to lavender at the tips
  const up = wing(0.19, 0.1, 0.02), low = wing(0.12, 0.06, -0.05);
  low.rotateZ(-0.5);
  const g = mergeGeometries([up, low])!; up.dispose(); low.dispose();
  const p = g.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color(0x9fdcff), b = new THREE.Color(0xe6b8ff), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(a).lerp(b, Math.min(1, Math.hypot(p.getX(i), p.getY(i)) / 0.19)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); wingGeo = g;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64; const x = cv.getContext("2d")!;
  const rg = x.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, "rgba(255,240,200,.9)"); rg.addColorStop(0.35, "rgba(200,180,255,.35)"); rg.addColorStop(1, "rgba(160,140,255,0)");
  x.fillStyle = rg; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(cv);
}

type Owner = { pos: THREE.Vector3; yaw: number };
export class Fairy {
  obj = new THREE.Group(); private body: THREE.Mesh; private wings: THREE.Mesh[];
  private mode: "follow" | "fetch" = "follow"; private goal = new THREE.Vector3(); private left = 0; private speed = 0;
  private t = Math.random() * 10; private heading = 0;
  constructor() {
    if (!bodyGeo) build();
    this.body = new THREE.Mesh(bodyGeo, bodyMat); this.body.castShadow = true;
    this.wings = [1, -1].map(s => { const w = new THREE.Mesh(wingGeo, wingMat); w.position.set(s * 0.012, 0.03, -0.035); w.scale.x = s; return w; });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(0.5);
    this.obj.add(this.body, ...this.wings, glow); this.obj.scale.setScalar(1.15);
  }
  /** Fly to a drop at (x, z) and be there in `secs` (when the sim takes it), then come back. */
  fetch(x: number, z: number, secs: number) {
    this.goal.set(x, 0.35, z); this.left = Math.max(0.05, secs); this.speed = this.obj.position.distanceTo(this.goal) / this.left; this.mode = "fetch";
  }
  update(dt: number, owner: Owner) {
    this.t += dt; const o = this.obj.position;
    if (this.mode === "fetch") {
      const d = this.goal.clone().sub(o), n = d.length(), step = this.speed * dt;
      this.heading = Math.atan2(d.x, d.z);
      if ((this.left -= dt) <= 0 || n <= step) { o.copy(this.goal); this.mode = "follow"; sparkBurst(o.clone(), 0xffe08a, 10, 2.2, 1.6, 0.22, 0.45); }
      else o.addScaledVector(d, step / n);
    } else {
      // at the player's right shoulder, a little behind, bobbing
      const s = Math.sin(owner.yaw), c = Math.cos(owner.yaw), bob = Math.sin(this.t * 2.2) * 0.06;
      const want = new THREE.Vector3(owner.pos.x + c * 0.55 - s * 0.25, owner.pos.y + 1.05 + bob, owner.pos.z - s * 0.55 - c * 0.25);
      const far = o.distanceTo(want); if (far > 12 || !this.obj.parent) o.copy(want);   // a teleport / map change: just be there
      o.lerp(want, 1 - Math.exp(-dt * (far > 1.5 ? 6 : 3.5)));
      const mv = Math.hypot(want.x - o.x, want.z - o.z); this.heading = mv > 0.15 ? Math.atan2(want.x - o.x, want.z - o.z) : owner.yaw;
    }
    let dy = this.heading - this.obj.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.obj.rotation.y += dy * Math.min(1, dt * 6);
    const flap = Math.sin(this.t * (this.mode === "fetch" ? 38 : 22)) * 0.55;
    this.wings[0].rotation.y = -0.35 - flap; this.wings[1].rotation.y = 0.35 + flap;
    this.body.rotation.x = this.mode === "fetch" ? 0.35 : Math.sin(this.t * 1.3) * 0.06;   // leans into the dash
  }
}
