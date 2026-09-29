// Loot on the ground. Gold is a pile of real coins — minted discs with a raised rim, some stacked, some spilled, more
// of them the bigger the pile, with a glint — and an item shows its own icon (the same art as the bag and the codex),
// standing up and facing the camera over a soft ring of light (gold for a rare find). Built here, animated by game.ts.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ITEMS } from "@shared/data";
import { icon } from "../ui/icons";

const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.85, roughness: 0.28, emissive: 0x3a2400, emissiveIntensity: 0.15 });
/** The reflection map the armour uses (render/scene.ts), so coins shine like metal instead of looking like clay. */
export const setDropEnv = (t: THREE.Texture) => { gold.envMap = t; gold.envMapIntensity = 0.8; gold.needsUpdate = true; };

let coinGeo: THREE.BufferGeometry | undefined;
/** One coin, lying flat: a disc with a raised rim on both faces and a small raised boss in the middle. */
function coin() {
  if (coinGeo) return coinGeo;
  const body = new THREE.CylinderGeometry(0.085, 0.085, 0.018, 20);
  const rims = [0.011, -0.011].map(y => { const r = new THREE.TorusGeometry(0.075, 0.006, 4, 20); r.rotateX(Math.PI / 2); r.translate(0, y, 0); return r; });
  const boss = [0.01, -0.01].map(y => { const b = new THREE.CylinderGeometry(0.04, 0.045, 0.006, 12); b.translate(0, y, 0); return b; });
  const parts = [body, ...rims, ...boss].map(g => g.index ? g.toNonIndexed() : g).map(g => { for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k); return g; });
  coinGeo = mergeGeometries(parts)!; return coinGeo;
}
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
let glintTex: THREE.Texture | undefined;
function glint() {
  if (glintTex) return glintTex;
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,250,220,1)"); r.addColorStop(0.2, "rgba(255,230,150,.6)"); r.addColorStop(1, "rgba(255,210,120,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); g.fillStyle = "rgba(255,255,240,.9)"; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4);   // a four-point star
  return (glintTex = new THREE.CanvasTexture(c));
}
/** A pile of coins sized to the amount: a couple of short stacks and a scatter round them — one instanced draw of the
 *  shared coin (merging a fresh copy per pile cost a frame hitch every time a monster dropped gold). */
export function makeGoldPile(amount: number, seed = 1) {
  const r = rng((seed * 9301 + 49297) % 233280 + 1), n = Math.max(4, Math.min(16, Math.round(3 + Math.log2(Math.max(1, amount)) * 1.6)));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), parts: THREE.Matrix4[] = [];
  const stacks = n >= 8 ? [[0.02, -0.03], [-0.09, 0.05]] : [[0, 0]];
  let left = n;
  for (const [sx, sz] of stacks) { const h = Math.min(left, 3 + Math.floor(r() * 3)); for (let i = 0; i < h; i++) { parts.push(m.clone().compose(new THREE.Vector3(sx + (r() - 0.5) * 0.012, 0.01 + i * 0.02, sz + (r() - 0.5) * 0.012), q.setFromEuler(e.set(0, r() * 6.28, 0)), one)); } left -= h; }
  for (let i = 0; i < left; i++) {   // spilled coins: tilted, some leaning on the stack
    const a = r() * 6.28, d = 0.08 + r() * 0.1;
    parts.push(m.clone().compose(new THREE.Vector3(Math.cos(a) * d, 0.012 + r() * 0.02, Math.sin(a) * d), q.setFromEuler(e.set((r() - 0.5) * 0.9, r() * 6.28, (r() - 0.5) * 0.9)), one));
  }
  const pile = new THREE.InstancedMesh(coin(), gold, parts.length); parts.forEach((p, i) => pile.setMatrixAt(i, p)); pile.computeBoundingSphere(); pile.castShadow = true;
  const g = new THREE.Group(); g.add(pile);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glint(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(0.18); s.position.set(0.03, 0.1, 0.02); s.name = "glint"; g.add(s);
  g.userData.ownsGeometry = { dispose: () => pile.dispose() };   // the instance buffer; the coin itself is shared
  g.scale.setScalar(1.15);   // small enough to sit in the grass, big enough to read at the game camera's distance
  return g;
}

// ---- items: the icon itself, as a billboard
const iconTex = new Map<string, THREE.Texture>(), iconMat = new Map<string, THREE.SpriteMaterial>();
function iconTexture(id: string) {
  let t = iconTex.get(id); if (t) return t;
  const c = document.createElement("canvas"); c.width = c.height = 128; t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; iconTex.set(id, t);
  const g = c.getContext("2d")!, art = icon(id, ITEMS[id]?.icon ?? "📦"), tex = t;
  if (art.trim().startsWith("<svg")) {
    const img = new Image(); img.onload = () => { g.drawImage(img, 4, 4, 120, 120); tex.needsUpdate = true; };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(art.replace(/width="100%" height="100%"/, 'width="128" height="128"'));
  } else { g.font = "88px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ITEMS[id]?.icon ?? "📦", 64, 70); t.needsUpdate = true; }
  return t;
}
let ringTex: THREE.Texture | undefined;
function ring() {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 6, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,.55)"); r.addColorStop(0.6, "rgba(255,255,255,.25)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (ringTex = new THREE.CanvasTexture(c));
}
export const ICON_Y = 0.26;
/** An item on the floor: its icon upright over a ring of light — pale for common things, gold for rare ones. */
export function makeItemDrop(id: string) {
  const g = new THREE.Group(), rare = !!ITEMS[id]?.rare;
  let mat = iconMat.get(id); if (!mat) iconMat.set(id, mat = new THREE.SpriteMaterial({ map: iconTexture(id), transparent: true, depthWrite: false }));
  const s = new THREE.Sprite(mat); s.scale.setScalar(0.4); s.position.y = ICON_Y; s.name = "icon"; g.add(s);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ map: ring(), color: rare ? 0xffc94a : 0xfff4dc, transparent: true, opacity: rare ? 0.6 : 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
  g.userData.ownsGeometry = glow.geometry; g.userData.ownsMaterial = glow.material;
  return g;
}
