import { addContactShadow } from "../render/contact-shadow";
import { NPCS } from "@shared/data";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { rig } from "../actors/actor";
import { Animator } from "../actors/anim";
import { applyEquipVisuals } from "../actors/visuals";
import { createNpcLife } from "./npc-life";

// Separate surface responses: matte fabric, supple leather, reflective hardware.
const surface=(color:number,roughness=.85,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});

type Profile = { species: "dog" | "cat" | "mouse"; fur: number; cloth: number; trim: number; scale: number };
const profiles: Record<string, Profile> = {
  NPC_SMITH: { species: "dog", fur: 0x936345, cloth: 0x714630, trim: 0xd4a34f, scale: 1.2 },
  NPC_TOOL: { species: "cat", fur: 0xe0ae66, cloth: 0x397b73, trim: 0xf1cc76, scale: 1.08 },
  NPC_STYLIST: { species: "cat", fur: 0xe9caba, cloth: 0x915887, trim: 0xf4b7c6, scale: 1.06 },
  NPC_VILLAGER1: { species: "dog", fur: 0xc49a63, cloth: 0x637f46, trim: 0xe5c589, scale: 1.04 },
  NPC_VILLAGER2: { species: "mouse", fur: 0xb6aaa1, cloth: 0x9b5840, trim: 0xf0c477, scale: 0.98 },
};

/** Reuse SK_BK_Chibi and its facial detail; costumes follow existing bones. */
const recoloured = new WeakMap<object, Map<number, THREE.CanvasTexture>>();
export function makeNpcVisual(id: string, source: THREE.Object3D) {
  const def=NPCS[id], biome=def?.biome;
  const roleId=def?.kind==='craft'?'NPC_SMITH':def?.kind==='shop'?'NPC_TOOL':def?.kind==='stylist'?'NPC_STYLIST':'NPC_VILLAGER1';
  const theme = {forest:{fur:0x9b8157,cloth:0x356944,trim:0xb8ce7d},snow:{fur:0xd5dfe4,cloth:0x3f678d,trim:0xe5e9df},desert:{fur:0xc09563,cloth:0xcbb88a,trim:0x398e96},volcanic:{fur:0x71635d,cloth:0x493b3d,trim:0xee8e37},shadow:{fur:0x8a829c,cloth:0x493961,trim:0xbc9ae7},meadow:{fur:0xc49a63,cloth:0x637f46,trim:0xe5c589}};
  const p:Profile = biome ? {...(profiles[roleId]??profiles.NPC_VILLAGER1),...theme[biome],species:def.species??'dog'} : profiles[id]??profiles.NPC_VILLAGER1;
  const { obj, bones } = rig(source);
  // NPC textures and costume colours are unique; never alter the rig material cache.
  obj.traverse(n=>{if(n instanceof THREE.Mesh){const own=(m:THREE.Material)=>{const c=m.clone();c.onBeforeCompile=m.onBeforeCompile;c.customProgramCacheKey=m.customProgramCacheKey;return c;};n.material=Array.isArray(n.material)?n.material.map(own):own(n.material);}});
  applyEquipVisuals(obj, { Chest: "STARTER_CHEST", Boots: "STARTER_BOOTS" });
  // Recolour orange fur pixels only; preserve cream markings, eyes and muzzle.
  // Multiplying the baked orange texture by a grey tint produced green faces.
  obj.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !node.name.startsWith("SK_Dog_")) return;
    const mat = node.material as THREE.MeshStandardMaterial;
    if (!mat.map?.image) return;
    const image = mat.map.image as HTMLImageElement;
    // one recoloured copy per (texture, fur colour): every NPC of a biome shares it (per-NPC pixel loops cost seconds)
    const shared = recoloured.get(image)?.get(p.fur); if (shared) { mat.map = shared; return; }
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = [(p.fur >> 16) & 255, (p.fur >> 8) & 255, p.fur & 255];
    for (let i = 0; i < pixels.data.length; i += 4) {
      const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
      if (r < 55 || r < g * 1.12 || r < b * 1.35) continue;
      const shade = Math.min(1.2, (r * 0.299 + g * 0.587 + b * 0.114) / 158);
      const mask = Math.min(1, (r - b) / 45);
      for (let c = 0; c < 3; c++) pixels.data[i + c] =
        pixels.data[i + c] * (1 - mask) + Math.min(255, rgb[c] * shade) * mask;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = mat.map.flipY; texture.colorSpace = mat.map.colorSpace;
    texture.anisotropy = mat.map.anisotropy;
    if (!recoloured.has(image)) recoloured.set(image, new Map()); recoloured.get(image)!.set(p.fur, texture);
    mat.map = texture;
  });
  const chest = obj.getObjectByName("SK_Knight_Chest") as THREE.Mesh;
  (chest.material as THREE.MeshStandardMaterial).color.set(p.cloth);
  const leather = surface(p.cloth,.76), trim = surface(p.trim,.46,.3), dark = surface(0x40332c,.9);
  const fur = surface(p.fur,.96), pink = surface(0xd68f91,.78), steel = surface(0x9daab7,.28,.75);
  steel.envMap=(chest.material as THREE.MeshStandardMaterial).envMap;
  trim.envMap=steel.envMap;
  const chestMat=chest.material as THREE.MeshStandardMaterial;
  chestMat.metalness=0;chestMat.roughness=.92;
  const costume:THREE.Mesh[]=[];
  const attach = (mesh: THREE.Mesh, bone: string, x: number, y: number, z: number) => {
    costume.push(mesh);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    obj.add(mesh); obj.updateMatrixWorld(true); bones[bone].attach(mesh);
    return mesh;
  };
  const ball = (bone: string, mat: THREE.Material, pos: number[], size: number[]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mat);
    m.scale.set(size[0], size[1], size[2]);
    return attach(m, bone, pos[0], pos[1], pos[2]);
  };
  const box = (bone: string, mat: THREE.Material, pos: number[], size: number[]) =>
    attach(new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(...size) * 0.2), mat),
      bone, pos[0], pos[1], pos[2]);
  const ring = (bone: string, mat: THREE.Material, x: number, y: number, z: number, r: number) =>
    attach(new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 24), mat), bone, x, y, z);

  // Apron, waist belt, stitched pocket and clasp give occupations readable silhouettes.
  box("spine_01", leather, [0, 0.29, 0.135], [0.245, 0.26, 0.045]);
  box("spine_01", trim, [0, 0.35, 0.163], [0.26, 0.025, 0.018]);
  box("spine_01", dark, [0, 0.235, 0.166], [0.13, 0.065, 0.02]);
  ball("spine_01", trim, [0, 0.36, 0.182], [0.024, 0.025, 0.009]);

  // A layered pocket, rolled seams and tiny stitches soften the solid apron shape.
  box("spine_01", leather, [0,.246,.184],[.12,.06,.017]);
  for(const side of [-1,1]){
    box("spine_01",dark,[side*.115,.29,.161],[.009,.24,.009]);
    for(let i=0;i<8;i++)box("spine_01",trim,[side*.105,.19+i*.027,.171],[.009,.003,.003]);
    box("spine_01",leather,[side*.09,.415,.112],[.034,.1,.025]);
    ball("spine_01",steel,[side*.09,.378,.165],[.008,.008,.004]);
  }
  for(let i=0;i<7;i++)box("spine_01",trim,[-.051+i*.017,.218,.195],[.007,.003,.003]);

  if (p.species !== "dog") {
    obj.getObjectByName("SK_Dog_Ears")!.visible = false;
    obj.getObjectByName("SK_Dog_Tail")!.visible = false;
    for (const side of [-1, 1]) {
      if (p.species === "mouse") {
        ball(side<0?"ear_r":"ear_l", fur, [side * 0.19, 0.79, 0], [0.115, 0.13, 0.05]);
        ball(side<0?"ear_r":"ear_l", pink, [side * 0.19, 0.79, 0.045], [0.078, 0.09, 0.012]);
      } else {
        const ear = attach(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.19, 24), fur),
          side<0?"ear_r":"ear_l", side * 0.16, 0.79, 0);
        ear.rotation.z = -side * 0.18;
        ball(side<0?"ear_r":"ear_l", pink, [side * 0.16, 0.795, 0.059], [0.037, 0.059, 0.01]);
      }
      for (const dy of [-0.015, 0.012]) {
        const whisker = box("head", dark, [side * 0.19, 0.545 + dy, 0.225], [0.12, 0.004, 0.005]);
        whisker.rotation.z = side * (dy < 0 ? -0.15 : 0.15);
      }
    }
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.23, -0.12), new THREE.Vector3(0.2, 0.22, -0.25),
      new THREE.Vector3(0.3, 0.37, -0.23), new THREE.Vector3(0.27, 0.46, -0.21),
    ]);
    attach(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, p.species === "mouse" ? 0.015 : 0.04, 8, false),
      p.species === "mouse" ? pink : fur), "tail_01", 0, 0, 0);
  }
  if (roleId === "NPC_SMITH") {
    // Leather brow strap and brass-rimmed smith goggles.
    box("head", dark, [0, 0.735, 0.155], [0.32, 0.045, 0.025]);
    for (const x of [-0.07, 0.07]) {
      ball("head", steel, [x, 0.735, 0.18], [0.039, 0.035, 0.013]);
      ring("head", trim, x, 0.735, 0.193, 0.038);
    }
    box("hand_r", dark, [-0.26, 0.24, 0.1], [0.035, 0.29, 0.035]);
    box("hand_r", steel, [-0.26, 0.39, 0.1], [0.16, 0.075, 0.075]);
  } else if (roleId === "NPC_STYLIST") {
    // Bow and a pair of scissors in the apron.
    for (const x of [-0.035, 0.035]) ball("head", leather, [0.18 + x, 0.76, 0.1], [0.043, 0.031, 0.02]);
    ball("head", trim, [0.18, 0.76, 0.12], [0.015, 0.02, 0.01]);
    for (const x of [-0.026, 0.026]) {
      ring("spine_01", trim, x, 0.27, 0.19, 0.022);
      const blade = box("spine_01", steel, [x * 0.4, 0.315, 0.185], [0.009, 0.085, 0.009]);
      blade.rotation.z = x < 0 ? -0.3 : 0.3;
    }
  } else if (roleId === "NPC_TOOL") {
    for (const x of [-0.07, 0.07]) {
      ball("spine_01", surface(x < 0 ? 0xba4f56 : 0x6da8b1), [x, 0.27, 0.2], [0.032, 0.043, 0.022]);
      box("spine_01", trim, [x, 0.317, 0.2], [0.024, 0.018, 0.018]);
    }
  } else {
    box("spine_01", leather, [0, 0.32, -0.17], [0.27, 0.29, 0.13]);
    box("spine_01", trim, [0, 0.44, -0.2], [0.29, 0.035, 0.14]);
    for (const x of [-0.08, 0.08]) box("spine_01", trim, [x, 0.32, 0.13], [0.023, 0.24, 0.018]);
    if (p.species === "mouse") for (const x of [-0.09, 0.09]) ring("head", trim, x, 0.637, 0.233, 0.058);
  }
  // Regional clothing changes the silhouette and remains bound to the character rig.
  if(biome==='forest') {
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;ball('head',trim,[Math.cos(a)*.17,.79,Math.sin(a)*.1],[.075,.026,.037]);}
    const cape=box('spine_01',leather,[0,.34,-.20],[.34,.36,.04]);cape.rotation.x=-.18;
    if(def.kind==='skillshop')box('hand_r',dark,[-.29,.42,.05],[.025,.65,.025]);
  } else if(biome==='snow') {
    const white=surface(0xe1e6e4);
    for(let i=0;i<9;i++){const a=i*Math.PI*2/9;ball('spine_01',white,[Math.cos(a)*.15,.43,Math.sin(a)*.12],[.055,.05,.05]);}
    ball('head',leather,[0,.79,0],[.2,.13,.14]);box('spine_01',trim,[.08,.25,.17],[.07,.27,.025]);
    for(const side of [-1,1])ball('head',white,[side*.19,.7,0],[.055,.08,.07]);
  } else if(biome==='desert') {
    ball('head',leather,[0,.78,0],[.23,.1,.17]);
    for(let i=0;i<3;i++) {const band=attach(new THREE.Mesh(new THREE.TorusGeometry(.18,.026,6,20),trim),'head',0,.74+i*.035,0);band.rotation.x=Math.PI/2;}
    box('head',leather,[.18,.64,-.03],[.09,.31,.055]);box('spine_01',leather,[0,.20,.13],[.32,.34,.05]);
    ball('head',surface(0x47bac8),[0,.77,.17],[.03,.04,.02]);
  } else if(biome==='volcanic') {
    for(const side of [-1,1]){ball('upperarm_'+(side<0?'r':'l'),steel,[side*.2,.42,0],[.1,.06,.12]);attach(new THREE.Mesh(new THREE.ConeGeometry(.03,.15,5),trim),'head',side*.15,.83,0);}
    box('spine_01',dark,[0,.29,.15],[.26,.29,.06]);box('spine_01',trim,[0,.3,.19],[.03,.25,.01]);
  } else if(biome==='shadow') {
    const hood=attach(new THREE.Mesh(new THREE.ConeGeometry(.24,.37,7),leather),'head',0,.9,-.025);hood.rotation.z=.15;
    box('spine_01',leather,[0,.30,-.2],[.4,.43,.05]);
    attach(new THREE.Mesh(new THREE.OctahedronGeometry(.045),trim),'spine_01',0,.4,.2);
    if(def.kind==='skillshop'||def.kind==='talk'){box('hand_r',dark,[-.29,.45,.03],[.025,.7,.025]);attach(new THREE.Mesh(new THREE.OctahedronGeometry(.07),trim),'hand_r',-.29,.83,.03);}
  }
  // Batch rigid accessories per bone/material, including all stitches in one draw.
  const batches=new Map<THREE.Object3D,Map<THREE.Material,THREE.Mesh[]>>();
  for(const mesh of costume){
    const parent=mesh.parent!,mat=mesh.material as THREE.Material;
    let materials=batches.get(parent);if(!materials)batches.set(parent,materials=new Map());
    const list=materials.get(mat)??[];list.push(mesh);materials.set(mat,list);
  }
  for(const [parent,materials] of batches)for(const [mat,meshes] of materials){
    if(meshes.length<2)continue;
    const parts=meshes.map(mesh=>{mesh.updateMatrix();const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return g.applyMatrix4(mesh.matrix);});
    const merged=mergeGeometries(parts);
    parts.forEach(g=>g.dispose());
    if(!merged)continue;
    const mesh=new THREE.Mesh(merged,mat);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
    for(const old of meshes){parent.remove(old);old.geometry.dispose();}
  }
  obj.rotation.y=def?.yaw??0;
  addContactShadow(obj,.72,.58);
  obj.scale.set(p.scale*.97,p.scale*1.04,p.scale*.98);
  const anim = new Animator(obj);
  let phase=0;for(const c of id)phase=(phase*31+c.charCodeAt(0))>>>0;
  anim.update((phase%1000)/173);
  const update=createNpcLife(id,def.kind,obj,bones,dt=>anim.update(dt));
  return { obj, anim, update };
}
