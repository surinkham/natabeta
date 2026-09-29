// The guild quest board (กระดานเควสกิลด์): a roofed notice board on two posts, a painted sign over it, hunting notices
// pinned on with red pins and a lantern at the side. It stands in the guild grounds as an NPC of kind "quest".
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const mat = (color: number, roughness = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const box = (w: number, h: number, d: number, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, r);

function signTexture() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 112; const g = c.getContext("2d")!;
  g.fillStyle = "#7a4a22"; g.fillRect(0, 0, 512, 112);
  g.strokeStyle = "#e0b23f"; g.lineWidth = 8; g.strokeRect(6, 6, 500, 100);
  g.fillStyle = "#fff2c8"; g.font = "bold 58px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("📜 เควสกิลด์", 256, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function makeQuestBoard() {
  const g = new THREE.Group(), wood = mat(0x6b4423), woodLight = mat(0x9a6a3a), roof = mat(0x8a2f24, 0.7), paper = mat(0xf3e6c4, 0.95), pin = mat(0xc8342a, 0.4), gold = mat(0xe0b23f, 0.35, { metalness: 0.6 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  for (const s of [-1, 1]) add(box(0.13, 2.05, 0.13, 0.03), wood, s * 0.82, 1.02, 0);          // posts
  add(box(1.62, 1.08, 0.07), woodLight, 0, 1.16, 0.02);                                             // the board
  for (const [w, h, x, y] of [[1.74, 0.08, 0, 1.72], [1.74, 0.08, 0, 0.6], [0.08, 1.12, -0.85, 1.16], [0.08, 1.12, 0.85, 1.16]]) add(box(w, h, 0.1), wood, x, y, 0.04);   // frame
  for (const s of [-1, 1]) add(box(1.95, 0.05, 0.42, 0.015), roof, 0, 2.04 + 0.07, s * 0.15, s * 0.42, 0, 0);   // a little pitched roof
  add(new THREE.PlaneGeometry(1.02, 0.22), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.8 }), 0, 1.86, 0.075);   // painted sign
  // the day's notices, pinned a little askew; one carries the guild's gold seal
  const notes = [[-0.5, 1.38, 0.08], [-0.02, 1.4, -0.05], [0.47, 1.36, 0.1], [-0.46, 0.9, -0.06], [0.02, 0.92, 0.07], [0.5, 0.9, -0.1]];
  notes.forEach(([x, y, rz], i) => {
    add(box(0.34, 0.38, 0.012, 0.004), paper, x, y, 0.065, 0, 0, rz);
    for (let l = 0; l < 3; l++) add(box(0.22, 0.018, 0.004, 0.002), mat(0x6a5236), x - Math.sin(rz) * (0.06 - l * 0.07), y + 0.06 - l * 0.07, 0.073, 0, 0, rz);   // lines of writing
    add(new THREE.SphereGeometry(0.028, 16, 12), i === 1 ? gold : pin, x - Math.sin(rz) * 0.15, y + Math.cos(rz) * 0.15, 0.085);   // the pin (a gold seal on one)
  });
  // lantern on the right post
  add(box(0.12, 0.16, 0.12, 0.02), wood, 0.98, 1.55, 0.05);
  const glow = add(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb040, emissiveIntensity: 1.6 }), 0.98, 1.55, 0.05); glow.castShadow = false;
  return g;
}
