import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Q } from "../render/quality";

const stone = new THREE.MeshStandardMaterial({ color: 0xa9a28e, roughness: 0.95 });
const paleStone = new THREE.MeshStandardMaterial({ color: 0xc3b9a2, roughness: 0.9 });
const timber = new THREE.MeshStandardMaterial({ color: 0x533b29, roughness: 0.92 });
const wood = new THREE.MeshStandardMaterial({ color: 0x987049, roughness: 0.86 });
const iron = new THREE.MeshStandardMaterial({ color: 0x38434b, metalness: 0.5, roughness: 0.6 });
const glass = new THREE.MeshStandardMaterial({ color: 0x698b92, roughness: 0.25, metalness: 0.15 });
const glow = new THREE.MeshStandardMaterial({ color: 0xffdfa1, emissive: 0xffb85b, emissiveIntensity: 0.5, roughness: 0.4 });
const leaves = new THREE.MeshStandardMaterial({ color: 0x52733f, roughness: 1 });

class Assembly {
  batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
    const parts = this.batches.get(m) ?? [];
    parts.push(g.index ? g.toNonIndexed() : g); this.batches.set(m, parts);
    if (g.index) g.dispose();
  }
  box(m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0) {
    this.add(new RoundedBoxGeometry(w, h, d, 1, Math.min(0.025, h / 6, d / 6)), m, x, y, z, rx, ry, rz);
  }
  finish() {
    const group = new THREE.Group();
    for (const [mat, parts] of this.batches) {
      const g = mergeGeometries(parts);
      if (!g) throw new Error("Unable to merge town building");
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      parts.forEach(p => p.dispose());
    }
    return group;
  }
}
function house(w: number, d: number, roofColor: number, plasterColor: number, tavern = false) {
  const a = new Assembly(), front = d / 2;
  const plaster = new THREE.MeshStandardMaterial({ color: plasterColor, roughness: 1 });
  const tiles = [0.82, 0.92, 1, 1.08].map(k => new THREE.MeshStandardMaterial({
    color: new THREE.Color(roofColor).multiplyScalar(k), roughness: 0.91,
  }));
  a.box(stone, 0, 0.58, 0, w, 1.16, d);
  for (let row = 0; row < 3; row++) for (const side of [-1, 1]) {
    for (let x = -w / 2; x < w / 2; x += 0.65) {
      const width = Math.min(0.65, w / 2 - x);
      a.box(row % 2 ? paleStone : stone, x + width / 2, 0.21 + row * 0.35, side * (front + 0.02), width - 0.022, 0.325, 0.1);
    }
  }
  a.box(plaster, 0, 2.13, 0, w + 0.12, 1.94, d + 0.12);
  for (const side of [-1, 1]) {
    for (const y of [1.2, 3.09]) a.box(timber, 0, y, side * (front + 0.09), w + 0.28, 0.15, 0.16);
    for (const x of [-w / 2 + 0.08, 0, w / 2 - 0.08])
      a.box(timber, x, 2.14, side * (front + 0.09), 0.14, 1.9, 0.14);
    for (const x of [-w * 0.35, w * 0.35])
      a.box(timber, x, 2.85, side * (front + 0.1), 0.1, 0.7, 0.12, 0, 0, x < 0 ? -0.75 : 0.75);
  }
  for (const side of [-1, 1]) {
    for (const y of [1.2, 3.09]) a.box(timber, side * (w / 2 + 0.08), y, 0, 0.16, 0.15, d + 0.2);
    for (const z of [-front + 0.06, 0, front - 0.06]) a.box(timber, side * (w / 2 + 0.08), 2.1, z, 0.14, 1.9, 0.14);
  }
  // Solid gable triangles fill the roof ends.
  // Ridge runs across x: end triangles occupy the yz plane.
  const end = new THREE.Shape(); end.moveTo(-front - 0.08, 0); end.lineTo(front + 0.08, 0); end.lineTo(0, 1.65); end.closePath();
  for (const side of [-1, 1]) a.add(new THREE.ExtrudeGeometry(end, { depth: 0.12, bevelEnabled: false }), plaster, side * w / 2, 3.12, 0, 0, Math.PI / 2);
  const rz = front + 0.38, height = 1.65, pitch = Math.atan2(height, rz);
  const rows = Q.name === "high" ? 7 : 5, cols = Math.ceil(w / 0.43), tw = (w + 0.65) / cols, step = rz / rows;
  for (const side of [-1, 1]) for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const z = side * (row + 0.5) * step;
    a.box(tiles[(row * 7 + col * 3) % tiles.length], -(w + 0.65) / 2 + (col + 0.5) * tw,
      3.16 + height * (1 - Math.abs(z) / rz), z, tw - 0.012, 0.085, step / Math.cos(pitch) + 0.05, side * pitch);
  }
  a.box(tiles[1], 0, 4.84, 0, w + 0.7, 0.16, 0.23);
  for (const side of [-1, 1]) a.box(timber, 0, 3.12, side * rz, w + 0.7, 0.17, 0.14);
  // Chimney masonry and dark open flue.
  a.box(stone, -w * 0.29, 4.52, -d * 0.2, 0.48, 1.35, 0.48);
  for (const y of [4.02, 4.35, 4.68, 5.08]) a.box(paleStone, -w * 0.29, y, -d * 0.2, 0.55, 0.07, 0.55);
  a.box(iron, -w * 0.29, 5.205, -d * 0.2, 0.32, 0.015, 0.32);
  // Recessed plank door with hinges, ring handle and doorstep.
  const doorX = w * 0.23;
  a.box(timber, doorX, 0.69, front + 0.08, 1.04, 1.38, 0.18);
  for (let i = 0; i < 5; i++) a.box(wood, doorX - 0.36 + i * 0.18, 0.68, front + 0.18, 0.17, 1.25, 0.065);
  for (const y of [0.38, 1.03]) a.box(iron, doorX, y, front + 0.23, 0.79, 0.045, 0.02);
  a.add(new THREE.TorusGeometry(0.045, 0.009, 6, 16), iron, doorX + 0.25, 0.68, front + 0.255);
  a.box(paleStone, doorX, 0.06, front + 0.3, 1.15, 0.12, 0.55);
  for (const side of [-1, 1]) for (const x of [-w * 0.27, w * 0.27]) {
    const z = side * (front + 0.1);
    a.box(timber, x, 2.22, z, 0.83, 0.91, 0.14);
    a.box(glass, x, 2.22, z + side * 0.08, 0.65, 0.72, 0.025);
    a.box(wood, x, 2.22, z + side * 0.11, 0.045, 0.75, 0.045);
    a.box(wood, x, 2.22, z + side * 0.11, 0.69, 0.045, 0.045);
    a.box(paleStone, x, 1.75, z + side * 0.12, 0.94, 0.12, 0.3);
    for (const dx of [-0.5, 0.5]) {
      a.box(wood, x + dx, 2.22, z + side * 0.06, 0.2, 0.84, 0.07);
      for (const y of [1.96, 2.48]) a.box(iron, x + dx, y, z + side * 0.105, 0.18, 0.027, 0.015);
    }
    a.box(wood, x, 1.59, z + side * 0.23, 0.83, 0.23, 0.31);
    for (let j = 0; j < 5; j++) {
      a.add(new THREE.SphereGeometry(0.105, 10, 6), leaves, x - 0.3 + j * 0.15, 1.76, z + side * 0.23);
      if (j % 2 === 0) a.add(new THREE.SphereGeometry(0.044, 8, 6), tiles[2], x - 0.3 + j * 0.15, 1.85, z + side * 0.23);
    }
  }
  a.box(iron, -w * 0.35, 1.71, front + 0.3, 0.05, 0.06, 0.45);
  a.box(iron, -w * 0.35, 1.49, front + 0.48, 0.24, 0.32, 0.24);
  a.box(glow, -w * 0.35, 1.49, front + 0.615, 0.16, 0.23, 0.018);
  if (tavern) {
    a.box(timber, -w / 2 + 0.1, 2.85, front + 0.5, 0.11, 0.11, 1.25);
    a.box(iron, -w / 2 + 0.1, 2.55, front + 0.95, 0.035, 0.5, 0.035);
    a.box(wood, -w / 2 + 0.1, 2.2, front + 0.95, 0.75, 0.5, 0.1);
    a.add(new THREE.TorusGeometry(0.12, 0.035, 6, 16), paleStone, -w / 2 + 0.29, 2.2, front + 1.02);
    a.box(paleStone, -w / 2 + 0.05, 2.2, front + 1.03, 0.25, 0.3, 0.06);
  }
  return a.finish();
}
const drops: { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; phase: number }[] = [];
const ripples: THREE.Mesh[] = [];
let waterTime = 0;
export function createFountain() {
  const a = new Assembly();
  a.add(new THREE.CylinderGeometry(1.2, 1.26, 0.17, 48), stone, 0, 0.085, 0);
  // Lathed basin has a real recessed interior, not a solid cylinder.
  const profile = [[0.96,0.16],[0.97,0.3],[0.98,0.48],[1.09,0.52],[1.19,0.48],[1.19,0.24],[1.15,0.16]];
  a.add(new THREE.LatheGeometry(profile.map(([r,y]) => new THREE.Vector2(r,y)),48), paleStone,0,0,0);
  for (let i=0;i<24;i++) {
    const t=i*Math.PI/12;
    a.box(stone,Math.sin(t)*1.16,0.31,Math.cos(t)*1.16,0.02,0.22,0.06,0,t);
  }
  a.add(new THREE.CylinderGeometry(0.16,0.24,0.9,24),paleStone,0,0.67,0);
  const bowl = [[0.08,0],[0.37,0.02],[0.49,0.15],[0.5,0.2],[0.43,0.21],[0.33,0.09],[0.08,0.065]];
  a.add(new THREE.LatheGeometry(bowl.map(([r,y]) => new THREE.Vector2(r,y)),32),paleStone,0,1.05,0);
  a.add(new THREE.SphereGeometry(0.12,20,12),paleStone,0,1.42,0);
  const group=a.finish();
  const water = new THREE.MeshStandardMaterial({color:0x469fae,roughness:0.18,metalness:0.22,transparent:true,opacity:0.82,depthWrite:false,side:THREE.DoubleSide});
  for (const [r,y] of [[0.98,0.35],[0.41,1.225]]) {
    const m=new THREE.Mesh(new THREE.CircleGeometry(r,48),water);m.rotation.x=-Math.PI/2;m.position.y=y;m.receiveShadow=true;group.add(m);
  }
  const stream = new THREE.MeshStandardMaterial({color:0xa5e5ee,roughness:0.17,metalness:0.12,transparent:true,opacity:0.62,depthWrite:false});
  for(let i=0;i<4;i++) {
    const angle=i*Math.PI/2+Math.PI/4;
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.sin(angle)*0.42,1.24,Math.cos(angle)*0.42),
      new THREE.Vector3(Math.sin(angle)*0.78,1.2,Math.cos(angle)*0.78),new THREE.Vector3(Math.sin(angle)*0.82,0.36,Math.cos(angle)*0.82));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,20,0.018,6,false),stream));
    for(let j=0;j<4;j++) {
      const m=new THREE.Mesh(new THREE.SphereGeometry(0.025,8,6),stream);group.add(m);drops.push({mesh:m,curve,phase:j/4+i*0.1});
    }
    const ripple=new THREE.Mesh(new THREE.RingGeometry(0.1,0.114,24),stream);
    ripple.rotation.x=-Math.PI/2;ripple.position.copy(curve.v2);ripple.position.y=0.359;
    group.add(ripple);ripples.push(ripple);
  }
  const jet=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,1.5,0),new THREE.Vector3(0,1.9,0),new THREE.Vector3(0.22,1.23,0));
  group.add(new THREE.Mesh(new THREE.TubeGeometry(jet,20,0.024,8,false),stream));
  for(let i=0;i<5;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(0.026,8,6),stream);group.add(m);drops.push({mesh:m,curve:jet,phase:i/5});}
  return group;
}
export function updateFountain(dt:number) {
  waterTime+=dt;
  for(const drop of drops) drop.mesh.position.copy(drop.curve.getPoint((waterTime*0.8+drop.phase)%1));
  ripples.forEach((r,i)=>r.scale.setScalar(0.45+((waterTime*0.65+i*0.25)%1)*1.7));
}
export function createTownBuildings() {
  return {
    SM_House_Stone:house(4,3.6,0x9b5541,0xdacbb1),
    SM_House_Stone2:house(3.4,3.1,0x587077,0xd3c5a8),
    SM_Tavern:house(5.2,4.2,0x4b5b6d,0xe0cba5,true),
  };
}
