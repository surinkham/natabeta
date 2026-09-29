import { borderBend, riverPath } from "@shared/scenery";
import { riverMaterial, riverStrip, riverRibbon } from "./waterways";
// World edges: the walk limit (shared/world.ts MAP) is dressed as scenery so it never reads as an invisible wall —
// a mountain range along the north and at both ends of the royal road, a river along the south behind the towns.
// Peaks take their region's look (snow caps at Frostford, mesas at Saharak, black rock and lava at Ignaroth, …).
// All peaks are merged into one flat-shaded vertex-coloured mesh: one draw call.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MAP, ROUTE_HALF } from "@shared/world";
import { CELL, ZONES, RIVER_OUTLET, edgeStyle, holeStyle, passLine, regionAt, zoneAtCell, type Biome, type Dir, type Edge, type Zone } from "@shared/regions";
import { scene } from "../render/scene";

const LOOK: Record<Biome, { base: number; top: number; cap: number; capAt: number; mesa?: boolean }> = {
  meadow:   { base: 0x6d7a5c, top: 0x97a283, cap: 0xc9cfbf, capAt: 0.82 },
  forest:   { base: 0x33502f, top: 0x4f6f3f, cap: 0x7f9a66, capAt: 0.9 },
  snow:     { base: 0x7e8e9c, top: 0xaebccb, cap: 0xf6f9ff, capAt: 0.55 },
  desert:   { base: 0xb4743c, top: 0xd89a5a, cap: 0xf0c890, capAt: 0.9, mesa: true },
  volcanic: { base: 0x2e2422, top: 0x1c1514, cap: 0xff6a2a, capAt: 0.93 },
  shadow:   { base: 0x40344e, top: 0x5c4a70, cap: 0xb49ae0, capAt: 0.86 },
};

let seed = 2718;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function peak(x: number, z: number, r: number, h: number) {
  const look = LOOK[regionAt({ x, z }).biome];
  const g = new THREE.CylinderGeometry(look.mesa ? r * 0.55 : r * 0.05, r, h, 18, 9);
  const pos = g.getAttribute("position"), col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const base = new THREE.Color(look.base), top = new THREE.Color(look.top), cap = new THREE.Color(look.cap);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), k = (y + h / 2) / h;
    if (k > 0.02) { const angle=Math.atan2(pos.getZ(i),pos.getX(i)); const erosion=1+.10*Math.sin(angle*5+k*7)+.065*Math.cos(angle*9-k*4); pos.setX(i,pos.getX(i)*erosion+r*.12*k*k); pos.setZ(i,pos.getZ(i)*erosion-r*.08*k*k); }   // craggy
    c.copy(base).lerp(top, Math.min(1, k * 1.2)); const snowLine=look.capAt+.035*Math.sin(pos.getX(i)*2+pos.getZ(i)); if(k>snowLine)c.lerp(cap,Math.min(1,(k-snowLine)*14));
    c.multiplyScalar(.94+.045*Math.sin(k*65+pos.getX(i)*.6)+.025*Math.cos(pos.getZ(i)*3)); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.rotateY(rnd() * Math.PI); g.translate(x, h / 2 - 0.4, z);
  const out=g.toNonIndexed();g.dispose();return out;
}

const ridgeMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const treeMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });   // trees are smooth-shaded
/** The border and hole woods: their own mesh, so they keep smooth shading while the rocks stay craggy. */
const woods = (trees: THREE.BufferGeometry[]) => { const m = new THREE.Mesh(mergeGeometries(trees), treeMat()); m.receiveShadow = m.castShadow = true; for (const t of trees) t.dispose(); return m; };

/** A map's ridges, built and dropped with it (world.ts streaming), seeded per map so a rebuild looks the same:
 *  - its west and north borders (a shared border is drawn once, by the map east / south of it), and its east / south
 *    borders when no map lies beyond — low rocky hills, parted where a road crosses;
 *  - for a pass, ridges both sides of its road: low foothills right at the walk limit so the 2.5D camera still sees
 *    the player, taller peaks behind. */
/** A low stylised conifer (trunk + two cones), vertex-coloured to merge with the peaks. */
function conifer(x: number, z: number, h: number, dark: number) {
  // three soft tiers, 14-sided and smooth-shaded (treeMat): a round pine, not a faceted cone
  const parts = [new THREE.CylinderGeometry(0.18 * h / 4, 0.25 * h / 4, h * 0.3, 8).translate(0, h * 0.15, 0),
    new THREE.ConeGeometry(h * 0.31, h * 0.46, 14).translate(0, h * 0.45, 0), new THREE.ConeGeometry(h * 0.25, h * 0.4, 14).translate(0, h * 0.64, 0),
    new THREE.ConeGeometry(h * 0.17, h * 0.34, 14).translate(0, h * 0.83, 0)];
  const cols = [0x5a3a1e, dark, new THREE.Color(dark).multiplyScalar(1.13).getHex(), new THREE.Color(dark).multiplyScalar(1.27).getHex()];
  const out = parts.map((g, i) => { const n = g.toNonIndexed(); g.dispose(); const c = new THREE.Color(cols[i]).multiplyScalar(0.9 + rnd() * 0.2); const a = new Float32Array(n.getAttribute("position").count * 3); for (let k = 0; k < a.length; k += 3) a.set([c.r, c.g, c.b], k); n.setAttribute("color", new THREE.BufferAttribute(a, 3)); return n; });
  const g = mergeGeometries(out)!; out.forEach(o => o.dispose()); g.rotateY(rnd() * 6.28); g.translate(x, 0, z); return g;
}
const TREE_DARK: Record<Biome, number> = { meadow: 0x2f6a3a, forest: 0x1f4a2c, snow: 0xd2e0e9, desert: 0x6f8a3c, volcanic: 0x2c2220, shadow: 0x3b2d52 };
const waterMat = riverMaterial;
const bankMat = () => new THREE.MeshStandardMaterial({ color: 0xb49a6a, roughness: 1 });

export function zoneRidges(zone: Zone): THREE.Group | null {
  seed = 911 + ZONES.indexOf(zone) * 7919;
  const parts: THREE.BufferGeometry[] = [], trees: THREE.BufferGeometry[] = [], R = ROUTE_HALF, group = new THREE.Group();
  // a border: a ridge of rocky hills, a belt of woods, or a river (with its banks; the bridge is a layout prop)
  const side = (d: Dir, ax: number, az: number, bx: number, bz: number, gap?: { x: number; z: number }, outer = false) => {
    const look: Edge = edgeStyle(zone.i, zone.j, d), len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    if (look === "river") {
      const path=riverPath({x1:ax,z1:az,x2:bx,z2:bz,look,gap});
      group.add(riverRibbon(path,false),riverRibbon(path,true));
      // Small overlapping discs seal tributaries; the long approach is already curved.
      for(const p of [path[0],path[path.length-1]]){
        const join=new THREE.Mesh(new THREE.CircleGeometry(p.halfWidth,24),riverMaterial(0));
        join.rotation.x=-Math.PI/2;join.position.set(p.x,.05,p.z);join.onBeforeRender=()=>{join.material.userData.riverTime.value=performance.now()/1000;};group.add(join);
      }
      for(let i=3;i<path.length-3;i+=3){
        const p=path[i];if(gap&&Math.hypot(p.x-gap.x,p.z-gap.z)<5)continue;
        for(const sign of [-1,1]){
          const offset=sign*(p.halfWidth+.3+rnd()*.6),x=p.x+p.nx*offset,z=p.z+p.nz*offset;
          const stone=new THREE.IcosahedronGeometry(.18+rnd()*.27,1);stone.scale(1.4,.7,1);stone.translate(x,.07,z);
          const color=new THREE.Color(LOOK[regionAt({x,z}).biome].top),colors=new Float32Array(stone.getAttribute('position').count*3);
          for(let k=0;k<colors.length;k+=3)colors.set([color.r,color.g,color.b],k);
          stone.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(stone);
        }
      }
      return;
    }
    const woods = look === "forest", step = woods ? 2.2 : 3.5, jig = woods ? 1.4 : 2.5;
    for (let t = 2; t < len - 1; t += step + rnd() * jig) {
      const bend=look==='forest'?borderBend(t,len,ax,az,gap?Math.hypot(gap.x-ax,gap.z-az):undefined):0;
      const x = ax + ux * t-uz*bend, z = az + uz * t+ux*bend, g = gap ? Math.hypot(x - gap.x, z - gap.z) : 99;
      if (g < R + 1) continue;
      const shoulder = g < R + 8;   // it dips toward the road gap
      if (woods) {
        for (const o of [-1.6, 1.6]) trees.push(conifer(x - uz * o + (rnd() - 0.5), z + ux * o + (rnd() - 0.5), shoulder ? 2.6 + rnd() : outer ? 4.5 + rnd() * 2 : 3.2 + rnd() * 1.6, TREE_DARK[regionAt({ x, z }).biome]));
        continue;
      }
      parts.push(peak(x + (rnd() - 0.5) * 2, z + (rnd() - 0.5) * 2, 2.2 + rnd() * 1.8, shoulder ? 1.8 + rnd() * 1.5 : outer ? 4 + rnd() * 4 : 2.5 + rnd() * 3));
    }
  };
  side("w", zone.x0, zone.z0, zone.x0, zone.z1, zone.exits.w, !zoneAtCell(zone.i - 1, zone.j));
  side("n", zone.x0, zone.z0, zone.x1, zone.z0, zone.exits.n, !zoneAtCell(zone.i, zone.j - 1));
  if (!zoneAtCell(zone.i + 1, zone.j)) side("e", zone.x1, zone.z0, zone.x1, zone.z1, undefined, true);
  if (!zoneAtCell(zone.i, zone.j + 1)) side("s", zone.x0, zone.z1, zone.x1, zone.z1, undefined, true);
  if (zone.terrain === "pass") {
    const ew = zone.axis === "ew";
    for (let t = (ew ? zone.x0 : zone.z0) + 1; t <= (ew ? zone.x1 : zone.z1) - 1; t += 4 + rnd() * 2.5) for (const s of [-1, 1]) {
      // stretch the offset on a slanted stretch (sec), so the foothills stay outside the corridor
      const c = passLine(zone, t), sec = Math.hypot(1, (passLine(zone, t + 1) - passLine(zone, t - 1)) / 2);
      const at = (d: number) => { const o = c + s * (R + d * sec); return ew ? [t, o] as const : [o, t] as const; };
      const low = ew && s > 0;   // an east–west pass: the south side faces the camera
      const cap = (ew ? zone.z1 : zone.x1) - 1, lo = (ew ? zone.z0 : zone.x0) + 1, ok = (v: readonly [number, number]) => { const o = ew ? v[1] : v[0]; return o > lo && o < cap; };
      for (const [d, r, h] of [[2.2 + rnd(), 2.6 + rnd(), low ? 1.6 + rnd() * 1.4 : 3 + rnd() * 3], [9 + rnd() * 3, 5 + rnd() * 2, low ? 4 + rnd() * 3 : 8 + rnd() * 6], [22 + rnd() * 16, 9 + rnd() * 5, 12 + rnd() * 12]]) {
        const v = at(d); if (ok(v)) parts.push(peak(v[0], v[1], r, h));
      }
    }
  }
  if (parts.length) {
    const mesh = new THREE.Mesh(mergeGeometries(parts), ridgeMat());
    mesh.receiveShadow = mesh.castShadow = true; for (const p of parts) p.dispose(); group.add(mesh);
  }
  if (trees.length) group.add(woods(trees));
  return group.children.length ? group : null;
}

const CHUNK = 60;
/** Static scenery: work out its world matrix once and keep it — three.js would otherwise redo every one each frame. */
export function freeze<T extends THREE.Object3D>(o: T): T { o.updateMatrixWorld(true); o.traverse(n => { n.matrixAutoUpdate = false; n.matrixWorldAutoUpdate = false; }); return o; }
/** Group geometries by the CHUNK-sized square their centre falls in and merge each group (the inputs are disposed). */
function chunked(parts: THREE.BufferGeometry[]) {
  const cells = new Map<string, THREE.BufferGeometry[]>();
  for (const g of parts) { g.computeBoundingSphere(); const c = g.boundingSphere!.center, k = `${Math.floor(c.x / CHUNK)},${Math.floor(c.z / CHUNK)}`; (cells.get(k) ?? cells.set(k, []).get(k)!).push(g); }
  const out: THREE.BufferGeometry[] = [];
  for (const list of cells.values()) { const m = mergeGeometries(list); list.forEach(g => g.dispose()); if (m) { m.computeBoundingSphere(); out.push(m); } }
  return out;
}
export function buildEdges() {
  const parts: THREE.BufferGeometry[] = [], trees: THREE.BufferGeometry[] = [];
  const x0 = MAP.minX - 40, x1 = MAP.maxX + 40;
  // north range: a low front row just past the walk limit, a tall back row behind it
  for (let x = x0; x <= x1; x += 6 + rnd() * 3) {
    parts.push(peak(x, MAP.minZ - 6 - rnd() * 3, 5 + rnd() * 3, 7 + rnd() * 6));
    parts.push(peak(x + 3, MAP.minZ - 16 - rnd() * 6, 8 + rnd() * 4, 14 + rnd() * 12));
  }
  // west and east ends of the road: the range wraps round and closes the valley
  for (const [edge, dir] of [[MAP.minX, -1], [MAP.maxX, 1]] as const) {
    for (let z = MAP.minZ - 10; z <= MAP.maxZ + 30; z += 6 + rnd() * 3) {
      parts.push(peak(edge + dir * (6 + rnd() * 3), z, 5 + rnd() * 3, 7 + rnd() * 6));
      parts.push(peak(edge + dir * (17 + rnd() * 6), z + 3, 8 + rnd() * 4, 14 + rnd() * 12));
    }
  }
  // far hills beyond the river so the south horizon is not empty either
  for (let x = x0; x <= x1; x += 9 + rnd() * 4) parts.push(peak(x, MAP.maxZ + 30 + rnd() * 8, 8 + rnd() * 4, 8 + rnd() * 8));
  // holes in the grid (no map there) are solid mountain: big peaks inside, lower ones along a side that faces a map
  // to the north (that side is in view of the camera from the map above)
  for (let i = Math.round(MAP.minX / CELL); i <= Math.round(MAP.maxX / CELL); i++) for (let j = Math.round(MAP.minZ / CELL); j <= Math.round(MAP.maxZ / CELL); j++) {
    if (zoneAtCell(i, j)) continue;
    const cx = i * CELL, cz = j * CELL, h = CELL / 2, fill = holeStyle(i, j);
    if (fill === "lake") {   // a lake: sandy shore, then water
      for (const [r, y, mat] of [[CELL * 0.46, 0.017, bankMat()], [CELL * 0.4, 0.05, waterMat()]] as const) {
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), mat); m.rotation.x = -Math.PI / 2; m.scale.set(1, 0.85 + rnd() * 0.2, 1); m.position.set(cx, y, cz); m.receiveShadow = true; scene.add(m);
      }
      continue;
    }
    if (fill === "forest") {   // a wood too thick to walk: low trees at the side the camera looks from
      for (let k = 0; k < 110; k++) { const x = cx + (rnd() - 0.5) * (CELL - 6), z = cz + (rnd() - 0.5) * (CELL - 6), nearTop = z < cz - h + 14 && !!zoneAtCell(i, j - 1); trees.push(conifer(x, z, nearTop ? 3 + rnd() : 4.5 + rnd() * 3, TREE_DARK[regionAt({ x, z }).biome])); }
      continue;
    }
    for (let k = 0; k < 16; k++) {
      const x = cx + (rnd() - 0.5) * (CELL - 14), z = cz + (rnd() - 0.5) * (CELL - 14), nearTop = z < cz - h + 16 && !!zoneAtCell(i, j - 1);
      parts.push(peak(x, z, nearTop ? 4 + rnd() * 3 : 9 + rnd() * 6, nearTop ? 4 + rnd() * 4 : 14 + rnd() * 16));
    }
  }
  // merged per 60 m chunk, not continent-wide: one mesh round the whole map (620k triangles of peaks, 280k of woods)
  // could not be culled and was drawn whole every frame; chunks let the camera draw only the few in view
  const ridge = ridgeMat(), wood = treeMat();
  for (const g of chunked(parts)) { const m = new THREE.Mesh(g, ridge); m.receiveShadow = true; scene.add(freeze(m)); }
  for (const g of chunked(trees)) { const m = new THREE.Mesh(g, wood); m.receiveShadow = true; m.castShadow = false; scene.add(freeze(m)); }

  // A short estuary reaches the sea; no artificial canal across the whole continent.
  const mouth=riverStrip(22,7,true);mouth.rotation.set(-Math.PI/2,0,-Math.PI/2);mouth.position.set(RIVER_OUTLET.x,.05,RIVER_OUTLET.z+11);scene.add(mouth);
}
