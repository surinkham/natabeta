import { cameraOcclusion } from '../render/camera-occlusion';
import { createBridge } from "./waterways";
import { buildSnowDrifts, snowTownFloor } from "./snow";
import { TOWNS } from "@shared/towns";
import { buildRealmKit } from "./realms";
import { CITIES, regionAt, zoneAt, zoneAtCell, type Zone } from "@shared/regions";
import { createLandscapeGround, createVegetationKit, createMeadow } from "./landscape";
import * as THREE from "three";
import { scene, pbrFrom } from "../render/scene";
import { lightSpots } from "../render/lights";
import { loadGlb, loadTex } from "../render/assets";
import { buildEdges, freeze, zoneRidges } from "./edges";
import { createTownBuildings, createFountain } from "./town-buildings";
import { Q } from "../render/quality";
import { createFortifications } from "./fortifications";

import { GUILD_HALL, Layout, SMITH, SPAWNERS, TOWN_HALF, buildLayout, collide as collideL } from "@shared/world";
export { TOWN_HALF, inTown } from "@shared/world";
export const smith = SMITH, spawners = SPAWNERS;

// Env kit from work/blender/build_env_kit.py; layout comes from shared/world.ts so server and client agree on every solid.
const KIT = ["SM_Tree_Round", "SM_Tree_Pine", "SM_Bush", "SM_Rock_A", "SM_Rock_B", "SM_Fence", "SM_Flower", "SM_House", "SM_Lamp", "SM_Barrel", "SM_Crate", "SM_Anvil",
  "SM_Wall", "SM_Tower", "SM_Gate", "SM_House_Stone", "SM_House_Stone2", "SM_Tavern", "SM_Stall", "SM_Well", "SM_Banner", "SM_Torch", "SM_Bridge", "SM_Keep"] as const;
export const layout: Layout = buildLayout(Q.density);
export const solids = layout.solids;
export const TOWN_RADIUS = TOWN_HALF;

let kit: Record<string, THREE.Group> = {};

function groundPatch(geo: THREE.BufferGeometry, tex: string, repeat: number, y = 0, tint: THREE.ColorRepresentation = 0xffffff, into: THREE.Object3D = scene) {
  const map = loadTex(`assets/env/T_Ground_${tex}_BaseColor.jpg`), nrm = loadTex(`assets/env/T_Ground_${tex}_Normal.jpg`, false);
  map.repeat.set(repeat, repeat); nrm.repeat.set(repeat, repeat);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tint, map, normalMap: nrm, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; into.add(m); return m;
}
const tmp = new THREE.Object3D();
// Streaming: every prop is filed under the zone ("map") it stands in; a zone's meshes are only built while the player
// is in it or next door, and dropped again when they are two maps away. Nothing far off costs memory or draw calls.
const placements = new Map<string, Record<string, THREE.Matrix4[]>>();   // zone id → prop type → matrices
let fountainObj: THREE.Object3D | undefined;
/** What a click can land on besides the ground, for click-to-walk: the town fountain. (Not walls and trees: the ones
 *  between the camera and the player are faded out for the view, yet a ray would still stop on them.) */
export const clickables = (): THREE.Object3D[] => (fountainObj ? [fountainObj] : []);
function put(name: string, x: number, z: number, ry = 0, s = 1, y = 0) {
  tmp.position.set(x, y, z); tmp.rotation.set(0, ry, 0); tmp.scale.setScalar(s); tmp.updateMatrix();
  const zone = zoneAt({ x, z }).id; let byName = placements.get(zone); if (!byName) placements.set(zone, byName = {});
  (byName[name] ??= []).push(tmp.matrix.clone());
}
const CELL = 24;   // metres: instancing granularity — small enough to cull, big enough to keep draw calls low

/** One InstancedMesh per (prop, mesh, CELL×CELL cell): copies in one clump share a draw call, and clumps the camera
 *  (or the sun's shadow camera) cannot see are culled whole. */
function instantiate(into: THREE.Group, byName: Record<string, THREE.Matrix4[]>) {
  for (const [name, mats] of Object.entries(byName)) {
    kit[name].updateMatrixWorld(true);
    const cells = new Map<string, THREE.Matrix4[]>();
    for (const m of mats) { const key = `${Math.round(m.elements[12] / CELL)},${Math.round(m.elements[14] / CELL)}`; (cells.get(key) ?? cells.set(key, []).get(key)!).push(m); }
    kit[name].traverse((n: any) => {
      if (!n.isMesh) return;
      (Array.isArray(n.material)?n.material:[n.material]).forEach(cameraOcclusion);
      const local = n.matrixWorld.clone();                         // mesh offset inside the prop group
      for (const list of cells.values()) {
        const im = new THREE.InstancedMesh(n.geometry, n.material, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(local)));
        im.castShadow = im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); into.add(im);
      }
    });
  }
}

export async function buildWorld() {
  kit = Object.fromEntries(await Promise.all(KIT.map(async n => [n, await loadGlb(`assets/env/${n}.glb`)])));
  for (const g of Object.values(kit)) g.traverse((n: any) => { if (n.isMesh) { n.material = pbrFrom(n.material); n.castShadow = n.receiveShadow = true; } });

  Object.assign(kit, createFortifications(), createTownBuildings(), createVegetationKit());

  kit.SM_Bridge = createBridge();
  Object.assign(kit, buildRealmKit(kit));
  scene.add(createLandscapeGround());
  buildEdges();
  groundPatch(new THREE.PlaneGeometry(22, 22), "Cobble", 4.5, 0.012, 0xc8c1b2);                 // walled town floor
  const yard = groundPatch(new THREE.PlaneGeometry(38, 34), "Cobble", 7, 0.012, 0xc8c1b2);        // guild grounds' paved yard
  yard.position.x = GUILD_HALL.x; yard.position.z = GUILD_HALL.z + 2;

  const fountain = fountainObj = createFountain(); fountain.position.set(0, 0, 1.2); scene.add(fountain);   // stands in for SM_Well
  for (const p of layout.props) if (p.name !== "SM_Well") {
    // the guild grounds keep the bright home-town kit whatever realm lies nearest
    const region=regionAt(p); put(region.biome==='meadow'||zoneAt(p).terrain==='hall'?p.name:`${region.biome}:${p.name}`,p.x,p.z,p.ry,p.s,p.y);
  }
  for(const city of CITIES.slice(1)) {
    put(`${city.biome}:landmark`,city.x,city.z+4);   // matches the landmark solid in shared/world.ts, clear of the road
    for(let i=0;i<14;i++)put(`${city.biome}:decor`,city.x+(i%2?1:-1)*(16+(i%3)*5),city.z-19-i*4.5,i*.8);
  }
  for (const [x, y, z] of layout.lightSpots) lightSpots.push(new THREE.Vector3(x, y, z));
  streamWorld(0, 0, true);   // the spawn map is built before the first frame; neighbours follow in idle time
  buildSnowDrifts(layout);
}

/** Push pos out of solids and clamp to the map (shared rule, same as the server). */
export function collide(pos: THREE.Vector3, r: number) { collideL(pos, r, layout); }

// ---------------------------------------------------------------- zone streaming
// A built map costs 20–160 ms (mostly its border ridges and rivers), so maps are built ahead and kept: the player's map
// and the eight around it are in the scene, and maps walked away from stay built (out of the scene) until KEEP_BUILT
// is exceeded, so walking back and forth never rebuilds.
const KEEP_BUILT = 2, KEEP_S = 45, EDGE_R = 14, NOW_R = 8;   // one map drawn: a neighbour only once the player is about to step into it (EDGE_R), built at once from NOW_R   // maps walked away from: at most KEEP_BUILT kept, none longer than KEEP_S seconds (RAM back)
const leftAt = new Map<string, number>();   // zone id → when it stopped being wanted   // maps kept built · a neighbour joins within EDGE_R of its edge, builds at once within NOW_R
const built = new Map<string, THREE.Group>();   // zone id → its meshes; Map order = least recently wanted first
function buildZone(zone: Zone) {
  const into = new THREE.Group(); into.name = `zone:${zone.id}`; into.userData.zone = zone;
  const ridges = zoneRidges(zone); if (ridges) into.add(ridges);
  const meadow = createMeadow(zone, solids); if (meadow) into.add(meadow);   // grass wherever the ground is green (landscape.ts)
  instantiate(into, placements.get(zone.id) ?? {});
  const city = zone.kind === "town" && zone.home.id !== "pawhaven" ? zone.home : null;
  if (city) {
    const floor = groundPatch(new THREE.PlaneGeometry(22,22), "Cobble", 4.5, 0.012, city.biome==='volcanic'?0x887b71:city.biome==='shadow'?0x91869e:city.color, into);
    floor.position.x = city.x; floor.position.z = city.z;
    if(city.biome==='snow')snowTownFloor(floor.material);
    // Local road plans follow shops and residents instead of duplicating the starter square.
    const roadMat=new THREE.MeshStandardMaterial({color:city.biome==='snow'?0x849eac:city.biome==='shadow'?0x74627e:city.biome==='volcanic'?0x625553:city.biome==='forest'?0x8d7854:0xd8bf86,roughness:1});
    if(city.biome==='volcanic'||city.biome==='shadow'){
      roadMat.map=floor.material.map;roadMat.normalMap=floor.material.normalMap;
      roadMat.normalScale=new THREE.Vector2(.22,.22);
      roadMat.color.set(city.biome==='volcanic'?0xb1a18d:0xb2a7bd);
    }
    if(city.biome==='snow') {
      roadMat.map=floor.material.map;roadMat.normalMap=floor.material.normalMap;
      roadMat.normalScale=new THREE.Vector2(.16,.16);roadMat.color.set(0xc6d3dc);
    }
    for(const [x1,z1,x2,z2] of TOWNS[city.biome]!.paths) {
      const length=Math.hypot(x2-x1,z2-z1),road=new THREE.Mesh(new THREE.PlaneGeometry(1.4,length),roadMat);
      road.rotation.set(-Math.PI/2,0,Math.atan2(x2-x1,z2-z1));road.position.set(city.x+(x1+x2)/2,.024,city.z+(z1+z2)/2);road.receiveShadow=true;into.add(road);
    }
  }
  scene.add(freeze(into)); built.set(zone.id, into);   // a built map never moves: its matrices are worked out once
}
function dropZone(id: string) {
  const g = built.get(id); if (!g) return; built.delete(id); scene.remove(g);
  // instance buffers and the per-town floor/road meshes are this zone's own; kit geometries and materials are shared
  g.traverse((n: any) => { if (n.isInstancedMesh) { n.dispose(); if (n.userData.ownsGrassResources) { n.geometry.dispose(); n.material.dispose(); } } else if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); } });   // zone meshes own their materials (ground, roads, ridges, rivers)
}
let current: Zone | null = null, pending: Zone[] = [], lastBuild = 0, wantKey = "";
/** Keep the player's map and the (up to) eight around it in the scene. Returns the zone just entered (null if unchanged)
 *  and whether it was not built yet — the caller then shows a loading card and it builds next frame. The maps next door
 *  build one per frame only while `idle` (the player standing still), so walking and fighting never hitch on a build. */
/** One map at a time: the map the player stands in is built and drawn; a neighbour joins only while its edge is within
 *  sight (EDGE_R — the camera sees ~30 m, the fog ends at 50), and leaves again after. Built maps are kept for a quick
 *  way back only up to KEEP_BUILT, then freed. The own map builds at once (behind the loading card on entering); a
 *  neighbour at most every 250 ms while standing still, or at once when its edge is already close (NOW_R). */
export function streamWorld(x: number, z: number, force = false, idle = true): { entered: Zone | null; loaded: boolean } {
  const zone = zoneAt({ x, z }), edge = (b: Zone) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
  const want = [zone];
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const n = zoneAtCell(zone.i + di, zone.j + dj); if (n && n !== zone && edge(n) < EDGE_R) want.push(n); }
  const key = want.map(w => w.id).join(",");
  if (key !== wantKey || force) {
    wantKey = key; const wanted = new Set(want.map(w => w.id));
    for (const [id, g] of built) if (!wanted.has(id) && g.parent) { scene.remove(g); leftAt.set(id, performance.now()); }
    for (const w of want) leftAt.delete(w.id);
    for (const w of want) { const g = built.get(w.id); if (g) { built.delete(w.id); built.set(w.id, g); if (!g.parent) scene.add(g); } }   // most recent last
    for (const id of [...built.keys()]) if (built.size > KEEP_BUILT && !wanted.has(id)) dropZone(id);
    pending = want.filter(w => !built.has(w.id));   // the own map first (want[0])
  }
  for (const [id, t] of leftAt) if (performance.now() - t > KEEP_S * 1000) { leftAt.delete(id); dropZone(id); }   // walked past long ago: free its meshes
  const entered = zone !== current ? zone : null, loaded = !!entered && !built.has(zone.id);
  if (entered) current = zone;
  const next = pending[0];
  if (next && (next === zone || force || edge(next) < NOW_R || (idle && performance.now() - lastBuild > 250))) { buildZone(pending.shift()!); lastBuild = performance.now(); }
  return { entered, loaded };
}
export const zoneMeshes = () => built.size;
