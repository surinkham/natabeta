import * as THREE from 'three';
import { EQUIP_VISUALS, ITEMS } from '@shared/data';
import { createWeapon } from './weapon-model';
import { PALETTES, themeOf } from './style';
const attached=new WeakMap<THREE.Object3D,Map<string,THREE.Object3D>>();
const sources=new Map<string,THREE.BufferGeometry>(),variants=new Map<string,THREE.BufferGeometry>();
const painted=new WeakMap<THREE.Material,{before:THREE.Material["onBeforeCompile"];key:string}>();
const swordAxis=new THREE.Matrix4().set(0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,1);
/** Keep the existing skin weights: every armour silhouette continues to follow its owner's animations. */
function armour(mesh:THREE.Mesh,id:string,slot:string){
 const key=mesh.userData.equipmentSource??mesh.geometry.uuid;mesh.userData.equipmentSource=key;
 if(!sources.has(key))sources.set(key,mesh.geometry);
 const cacheKey=key+':'+id;let g=variants.get(cacheKey);
 const theme=themeOf(id),[base,dark,accent]=PALETTES[theme];
 if(!g){
  g=sources.get(key)!.clone();const p=g.getAttribute('position'),colors:number[]=[];
  for(let i=0;i<p.count;i++){
   let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   if(slot==='Chest'){
    if(/MAGE|GROVE/.test(id)&&y<.30){const t=Math.max(0,(.30-y)/.15);y-=t*.085;x*=1+t*.25;}
    if(/LEATHER|STARTER/.test(id)){x*=.94;z*=.94;}
    if(/GEAR_GLACIER/.test(id)&&Math.abs(x)>.16&&y>.32){x*=1.07;y+=.012;}
    if(/FROST|GLACIER|MOON/.test(id)&&Math.abs(x)>.14&&y>.32){x*=1.1;y+=.024;}
   }else if(slot==='Back'){
    if(/SHADOW/.test(id)){x*=1.15;if(y<.16)y-=.065*(.5+.5*Math.cos(x*48));}
    if(/(?:^|_)NIGHT_/.test(id)){x*=1.22;if(y<.18)y-=.05*Math.abs(Math.sin(x*35));}
    if(/FUR/.test(id)){z-=.024;x*=1.08;}
    if(/GUILD/.test(id)&&y<.2)y-=.06;
   }else if(slot==='Head'){
    if(/LEATHER|SAND|DUNE/.test(id)){if(y>.88)y=.88+(y-.88)*.25;x*=1.02;if(z>.17)z+=.025;}
    if(/GEAR_DUNE/.test(id)&&y<.68)y-=.06;
   }else if(slot==='Boots'){
    if(/RANGER/.test(id)){if(y>.085)y+=.025;z*=.96;}
    if(/STARTER/.test(id)){x*=.95;z*=.96;}
   }else if(slot==='Gloves'){
    if(/EMBER/.test(id)){x*=1.08;z*=1.12;}
   }
   const col=new THREE.Color(base);colors.push(col.r,col.g,col.b);p.setXYZ(i,x,y,z);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();if(g.boundingSphere)g.boundingSphere.radius*=1.8;variants.set(cacheKey,g);
 }
 mesh.geometry=g;const m=mesh.material as THREE.MeshStandardMaterial;
 if(m.userData.equipmentDesign!==id){m.userData.equipmentDesign=id;m.map=null;m.color.set(0xffffff);m.vertexColors=true;m.roughness=/leather|wood|void|arcane/.test(theme)?.82:.4;m.metalness=/leather|wood/.test(theme)?0:.45;m.needsUpdate=true;}
 if(m.userData.paintSignature!==id||!painted.has(m)){
  let original=painted.get(m);if(!original){original={before:m.onBeforeCompile,key:m.customProgramCacheKey()};painted.set(m,original);}
  const trim=new THREE.Color(accent),seam=new THREE.Color(dark);
  let mask=slot==='Chest'?'1.-smoothstep(.006,.012,abs(p.y-(.32-abs(p.x)*.65)))':slot==='Back'?'smoothstep(.125,.14,abs(p.x))':slot==='Head'?'1.-smoothstep(.008,.014,abs(p.y-.70))':slot==='Boots'?'1.-smoothstep(.006,.011,abs(p.y-.095))':'1.-smoothstep(.006,.011,abs(p.y-.255))';
  if(/MAGE|GROVE/.test(id))mask='1.-smoothstep(.012,.019,abs(p.x))';
  if(/LEATHER_VEST/.test(id))mask='1.-smoothstep(.012,.019,abs(p.x-(p.y-.27)*.8))';
  m.onBeforeCompile=(shader,renderer)=>{
   original!.before.call(m,shader,renderer);
   shader.uniforms.equipTrim={value:trim};shader.uniforms.equipSeam={value:seam};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n varying vec3 vEquipLocal;').replace('#include <begin_vertex>','#include <begin_vertex>\n vEquipLocal=position;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n varying vec3 vEquipLocal; uniform vec3 equipTrim; uniform vec3 equipSeam;').replace('#include <color_fragment>',`#include <color_fragment>
    vec3 p=vEquipLocal;float trimMask=${mask};
    diffuseColor.rgb=mix(diffuseColor.rgb,equipTrim,trimMask*.85);`);
  };
  m.customProgramCacheKey=()=>original!.key+'-equipment-painted-'+id;m.userData.paintSignature=id;m.needsUpdate=true;
 }
 // The legacy tint pass runs before this function on every equipment refresh.
 m.color.set(0xffffff);
}
export function applyEquipmentDesign(root:THREE.Object3D,equip:Record<string,string>){
 let active=attached.get(root);
 if(!active){active=new Map();attached.set(root,active);const stale:THREE.Object3D[]=[];root.traverse(n=>{if(n.userData.designedEquipment)stale.push(n);});for(const n of stale)n.removeFromParent();}
 const wanted=new Set<string>();
 for(const [slot,id] of Object.entries(equip)){
  const def=ITEMS[id],visual=def?.visual&&EQUIP_VISUALS[def.visual];if(!visual)continue;
  if(slot==='OffHand'&&ITEMS[equip.MainWeapon]?.weapon==='bow')continue;
  if(slot==='MainWeapon'||slot==='OffHand'){
   const source=root.getObjectByName(visual.mesh);if(!source?.parent)continue;
   wanted.add(id);let design=active.get(id);
   if(!design){design=createWeapon(id);design.userData.designedEquipment=true;design.position.copy(source.position);design.quaternion.copy(source.quaternion);design.scale.copy(source.scale);
    if(def.weapon==='sword')design.quaternion.multiply(new THREE.Quaternion().setFromRotationMatrix(swordAxis));
    source.parent.add(design);active.set(id,design);
   }
   root.traverse(n=>{if(n.name===visual.mesh||n.name.startsWith(visual.mesh+'_'))n.visible=false;});design.visible=true;
  }else root.traverse(n=>{if(n instanceof THREE.Mesh&&n.visible&&(n.name===visual.mesh||n.name.startsWith(visual.mesh+'_')))armour(n,id,slot);});
 }
 for(const [id,obj] of active)if(!wanted.has(id)){obj.removeFromParent();active.delete(id);}
}
