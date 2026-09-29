import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITIES } from '@shared/regions';
import { TOWNS } from '@shared/towns';
import type { Layout } from '@shared/world';
import { scene } from '../render/scene';

const snowMaterial=new THREE.MeshStandardMaterial({color:0xe4edf4,roughness:.94});
/** Snow settles on upward-facing surfaces, preserving bare vertical stone and wood. */
/** `lo`/`hi`: how upward a surface must face before snow settles. Foliage uses a low band: pine tiers slope ~60°. */
export function snowSurface(source:THREE.Material,lo=.25,hi=.70,white=.94,foliage=false){
 const m=source.clone() as THREE.MeshStandardMaterial;
 if(!m.color)return m;
 m.roughness=.9;
 m.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSnowNormal;varying vec3 vSnowWorld;')
   .replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   vec4 snowWorld=vec4(transformed,1.);
   vec3 snowN=objectNormal;
   #ifdef USE_INSTANCING
    snowWorld=instanceMatrix*snowWorld;snowN=mat3(instanceMatrix)*snowN;
   #endif
   vSnowWorld=(modelMatrix*snowWorld).xyz;vSnowNormal=normalize(mat3(modelMatrix)*snowN);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSnowNormal;varying vec3 vSnowWorld;')
   .replace('#include <color_fragment>',`#include <color_fragment>
   float snowNoise=sin(vSnowWorld.x*7.)*sin(vSnowWorld.z*5.)*.06;
   float settled=smoothstep(${lo.toFixed(2)},${hi.toFixed(2)},${foliage ? "abs(normalize(vSnowNormal).y)" : "normalize(vSnowNormal).y"}+snowNoise);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.92,.98),settled*${white.toFixed(2)});`);
 };
 m.customProgramCacheKey=()=> `settled-snow-v4-${lo}-${hi}-${white}-${foliage}`;return m;
}
/** Low banks at walls and building foundations; kept away from gates, roads and NPC approach paths. */
export function buildSnowDrifts(L:Layout){
 const parts:THREE.BufferGeometry[]=[];
 for(const city of CITIES.filter(c=>c.biome==='snow')){
  const bank=(x:number,z:number,sx:number,sz:number,height:number)=>{
   const g=new THREE.SphereGeometry(1,12,7,0,Math.PI*2,0,Math.PI/2);g.scale(sx,height,sz);g.translate(city.x+x,.014,city.z+z);parts.push(g.toNonIndexed());g.dispose();
  };
  for(const b of TOWNS.snow!.buildings){
   // banks behind the house and at its corners, never in front of the doorway
   for(const side of [-1,1])bank(b.x+side*1.4,b.z-1.55,1.1,.8,.25);
  }
  for(let i=0;i<7;i++){const v=-8.4+i*2.8;if(Math.abs(v)>2.4){bank(-9.9,v,.7,1.9,.32);bank(9.9,v,.7,1.9,.32);}bank(v,9.9,1.8,.65,.25);}
  for(const p of L.props)if(Math.abs(p.x-city.x)<37&&p.z-city.z < -14 && (p.name==='SM_Tree_Pine'||p.name==='SM_Rock_A'))bank(p.x-city.x,p.z-city.z,1.1,1.0,.2);
 }
 if(parts.length){const mesh=new THREE.Mesh(mergeGeometries(parts)!,snowMaterial);mesh.castShadow=mesh.receiveShadow=true;mesh.name='snow-banks';scene.add(mesh);parts.forEach(g=>g.dispose());}
}
/** Wind-scoured snow exposes cobbles only around the two main roads. */
export function snowTownFloor(m:THREE.Material){
 const mat=m as THREE.MeshStandardMaterial;mat.color.set(0xffffff);mat.roughness=.94;
 mat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSnowFloor;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSnowFloor=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSnowFloor;')
   .replace('#include <map_fragment>',`#include <map_fragment>
   vec2 p=vSnowFloor.xy;float noise=sin(p.x*2.1+sin(p.y*3.))*sin(p.y*3.5)*.15;
   float path=min(abs(p.x),abs(p.y));float cover=smoothstep(.5,1.6,path+noise);
   vec3 cleanSnow=vec3(.79,.87,.94)*(1.+noise*.12);
   diffuseColor.rgb=mix(diffuseColor.rgb*.7,cleanSnow,.40+.60*cover);`);
 };
 mat.customProgramCacheKey=()=> 'snow-town-floor-v1';
}

/** Snow pillows sit on branch tiers and remain visible even on edge-on leaf cards. */
export function addVegetationSnow(root:THREE.Group,name:string) {
 const parts:THREE.BufferGeometry[]=[];
 const cap=(x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
   const g=new THREE.SphereGeometry(1,12,7,0,Math.PI*2,0,Math.PI*.62);
   g.scale(sx,sy,sz);g.translate(x,y,z);parts.push(g.toNonIndexed());g.dispose();
 };
 if(name==='SM_Tree_Pine') {
   for(let tier=0;tier<7;tier++) {
     const y=.9+tier*.43,r=1.03-tier*.13;
     for(let i=0;i<5;i++) {const a=i*Math.PI*2/5+tier*.9;
       cap(Math.cos(a)*r*.65,y+.09,Math.sin(a)*r*.65,r*.48,.10+r*.06,r*.48);}
   }
   cap(0,3.96,0,.13,.17,.13);
 } else if(name==='SM_Tree_Round') {
   for(let i=0;i<8;i++) {const a=i*2.399+.2,y=1.9+i*.15,r=i<5?.95:.58;
     cap(Math.cos(a)*r,y+.39,Math.sin(a)*r,.58,.15,.55);}
   cap(-.12,3.70,.04,.51,.17,.47);
 } else if(name==='SM_Bush') {
   for(let i=0;i<5;i++){const a=i*2.399;cap(Math.cos(a)*.24,.48+(i%2)*.12,Math.sin(a)*.24,.32,.12,.31);}
 }
 if(parts.length){const geo=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geo,snowMaterial);mesh.name='settled-canopy-snow';mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
}
