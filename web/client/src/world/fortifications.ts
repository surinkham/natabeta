import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Q } from "../render/quality";

// Shared merged geometry per kit piece; world.ts instances the finished pieces.
// Fine deterministic pores add relief without another image download.
const pores = new Uint8Array(128 * 128 * 4);
let noiseSeed = 193;
for (let i = 0; i < pores.length; i += 4) {
  noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
  const v = 110 + (noiseSeed >>> 26);
  pores.set([v, v, v, 255], i);
}
const relief = new THREE.DataTexture(pores, 128, 128, THREE.RGBAFormat);
relief.wrapS = relief.wrapT = THREE.RepeatWrapping;
relief.magFilter = THREE.LinearFilter; relief.minFilter = THREE.LinearMipmapLinearFilter;
relief.generateMipmaps = true; relief.needsUpdate = true;
const stone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, bumpMap: relief, bumpScale: 0.025 });
const metal = new THREE.MeshStandardMaterial({ color: 0x444b50, roughness: 0.66, metalness: 0.45 });
const slate = new THREE.MeshStandardMaterial({ color: 0x43536a, roughness: 0.86 });
const fabric = new THREE.MeshStandardMaterial({ color: 0x304c72, roughness: 1, side: THREE.DoubleSide });
const gold = new THREE.MeshStandardMaterial({ color: 0xc79e53, roughness: 0.65, metalness: 0.3 });

class Builder {
  batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  index = 0;
  add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rz = 0, tone = 0) {
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz)), new THREE.Vector3(1, 1, 1)));
    if (mat === stone) {
      const c = new THREE.Color(tone || 0xb0aa99);
      c.multiplyScalar(0.88 + ((this.index++ * 37 % 19) / 19) * 0.2);
      const rgb = new Float32Array(geo.getAttribute("position").count * 3);
      for (let i = 0; i < rgb.length; i += 3) { rgb[i] = c.r; rgb[i + 1] = c.g; rgb[i + 2] = c.b; }
      geo.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    }
    const list = this.batches.get(mat) ?? []; list.push(geo.index ? geo.toNonIndexed() : geo); this.batches.set(mat, list);
    if (geo.index) geo.dispose();
  }
  block(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tone = 0) {
    this.add(new RoundedBoxGeometry(w, h, d, 1, Math.min(0.035, h * 0.1, d * 0.15)), stone, x, y, z, ry, 0, tone);
  }
  masonry(width: number, height: number, depth: number, cx = 0, y0 = 0, cz = 0) {
    // Recessed mortar core and staggered ashlar on BOTH sides.
    this.block(width, height, depth - 0.06, cx, y0 + height / 2, cz, 0, 0x777a70);
    const rows = Math.round(height / 0.4), rh = height / rows;
    for (const side of [-1, 1]) for (let row = 0; row < rows; row++) {
      for (let left = -width / 2 - (row % 2 ? 0.4 : 0); left < width / 2; left += 0.8) {
        const a = Math.max(-width / 2, left), b = Math.min(width / 2, left + 0.8);
        if (b - a < 0.06) continue;
        this.block(b - a - 0.024, rh - 0.022, 0.1, cx + (a + b) / 2, y0 + (row + 0.5) * rh,
          cz + side * (depth / 2 - 0.015), 0, row === 0 ? 0x92947c : 0xb0aa99);
      }
    }
  }
  finish() {
    const group = new THREE.Group();
    for (const [mat, parts] of this.batches) {
      const geometry = mergeGeometries(parts);
      if (!geometry) throw new Error("Unable to merge fortification geometry");
      const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); parts.forEach(g => g.dispose());
    }
    return group;
  }
}
function wall() {
  const b = new Builder();
  b.masonry(4, 2.95, 1);
  b.block(4, 0.3, 1.16, 0, 0.15, 0, 0, 0x8d9082);
  b.block(4.1, 0.22, 1.18, 0, 3.04, 0, 0, 0xc2baa7);
  for (const x of [-1.5, -0.5, 0.5, 1.5]) for (const z of [-0.43, 0.43]) {
    b.block(0.49, 0.55, 0.32, x, 3.42, z);
    b.block(0.55, 0.1, 0.39, x, 3.72, z, 0, 0xc2baa7);
  }
  for (const x of [-1.7, 1.7]) for (const side of [-1, 1]) {
    b.block(0.38, 2.45, 0.28, x, 1.225, side * 0.59);
    b.block(0.47, 0.18, 0.37, x, 2.5, side * 0.59);
  }
  return b.finish();
}
function gate() {
  const b = new Builder();
  for (const x of [-2.7, 2.7]) {
    b.masonry(1.4, 5.5, 1.6, x);
    b.block(1.55, 0.32, 1.78, x, 0.16, 0, 0, 0x8d9082);
    b.block(1.55, 0.22, 1.82, x, 3.02, 0, 0, 0xc2baa7);
    for (const side of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.68, 1.3, 0.03), fabric, x, 3.85, side * 0.87);
      b.add(new THREE.BoxGeometry(0.74, 0.065, 0.08), gold, x, 4.51, side * 0.88);
      b.add(new THREE.SphereGeometry(0.15, 12, 8).scale(1, 1, 0.15), gold, x, 3.94, side * 0.9);
    }
  }
  // True voussoir arch: radius 2 leaves the full central passage open.
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI / 18 + 0.006, end = (i + 1) * Math.PI / 18 - 0.006;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 2.47, a, end, false);
    shape.lineTo(2 * Math.cos(end), 2 * Math.sin(end));
    shape.absarc(0, 0, 2, end, a, true); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.72, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 1, steps: 1, curveSegments: 2 });
    b.add(g, stone, 0, 2.65, -0.86, 0, 0, i === 8 || i === 9 ? 0xc9bd9f : 0xb7af9b);
  }
  b.masonry(6.8, 0.72, 1.6, 0, 5.05);
  b.block(7, 0.22, 1.85, 0, 5.85, 0, 0, 0xc2baa7);
  for (let x = -3; x <= 3; x++) {
    b.block(0.5, 0.55, 0.42, x, 6.23, -0.64);
    b.block(0.58, 0.1, 0.5, x, 6.54, -0.64);
  }
  // Raised portcullis teeth sit above head height.
  for (let x = -1.5; x <= 1.5; x += 0.5) b.add(new THREE.CylinderGeometry(0.024, 0.024, 0.65, 6), metal, x, 4.7, 0);
  return b.finish();
}
function tower() {
  const b = new Builder(), n = Q.name === "high" ? 24 : 16;
  b.add(new THREE.CylinderGeometry(1.19, 1.26, 5, n), stone, 0, 2.5, 0, 0, 0, 0x83867a);
  for (let row = 0; row < 12; row++) for (let i = 0; i < n; i++) {
    const a = (i + (row % 2) * 0.5) * Math.PI * 2 / n;
    const r = 1.24 - row * 0.003;
    b.block(2 * r * Math.tan(Math.PI / n) - 0.023, 0.386, 0.105, Math.sin(a) * r, 0.22 + row * 0.4, Math.cos(a) * r, a);
  }
  for (const [y, r, h] of [[0.16, 1.38, 0.32], [2.8, 1.3, 0.16], [4.96, 1.4, 0.27]]) {
    b.add(new THREE.CylinderGeometry(r, r, h, 32), stone, 0, y, 0, 0, 0, 0xc0b8a4);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5;
    b.block(0.46, 0.58, 0.32, Math.sin(a) * 1.24, 5.32, Math.cos(a) * 1.24, a);
  }
  // Layered slate roof courses create an eave silhouette and self-shadow.
  for (let i = 0; i < 7; i++) {
    const lower = 1.55 * (1 - i / 7), upper = 1.55 * (1 - (i + 1) / 7);
    b.add(new THREE.CylinderGeometry(Math.max(0.025, upper), lower + 0.04, 0.3, 32), slate, 0, 5.72 + i * 0.3, 0);
  }
  b.add(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 8), metal, 0, 8, 0);
  b.add(new THREE.BoxGeometry(0.65, 0.35, 0.025), fabric, 0.33, 8.2, 0);
  return b.finish();
}
export function createFortifications() {
  return { SM_Wall: wall(), SM_Gate: gate(), SM_Tower: tower() };
}
