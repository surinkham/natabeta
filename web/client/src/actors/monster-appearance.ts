import { createWildlife, isWildlife } from './wildlife';
import { createArthropod } from './arthropod';
import * as THREE from 'three';
import type { MonsterDef } from '@shared/data';
import type { Actor } from './actor';

/** Off: the player wants the chibi monsters (2026-09-25). On swaps wolves, foxes, boars, bears and the desert's
 *  scorpions/scarabs for the realistic procedural bodies of wildlife.ts / arthropod.ts. */
export const REALISTIC_BEASTS = false;

/** Decoration materials are shared by every monster that uses them — one per colour, not one per creature. */
const DECOR_MATS = new Map<string, THREE.MeshStandardMaterial>();

/** Geometry is attached to the animated bones in bind pose, so decorations follow attacks and death. */
export function applyMonsterAppearance(actor:Actor,def:MonsterDef) {
  // The body tint is applied once per (model, tint) in rig(): cloning materials here gave every one of the 100+
  // monsters its own copy of every material, which is what made the frame budget disappear.
  let anatomy:Record<string,THREE.Object3D>={};
  if(REALISTIC_BEASTS && isWildlife(def.model) && def.appearance!=='scorpion' && def.appearance!=='scarab') {
    actor.obj.traverse(n=>{if(n instanceof THREE.Mesh && n.name!=='contact-shadow')n.visible=false;});
    anatomy=createWildlife(actor.obj,def.model,def.tint);
  }
  if(!def.appearance)return;
  if(REALISTIC_BEASTS && (def.appearance==='scorpion'||def.appearance==='scarab')) {
    actor.obj.traverse(n=>{if(n instanceof THREE.Mesh && n.name!=='contact-shadow')n.visible=false;});
    createArthropod(def.appearance,actor.obj,def.tint);
    const shadow=actor.obj.getObjectByName('contact-shadow');if(shadow)shadow.scale.set(1.1,1.25,1);
    return;
  }
  const contact=actor.obj.getObjectByName('contact-shadow');contact?.removeFromParent();
  actor.obj.updateMatrixWorld(true);
  const bounds=new THREE.Box3();actor.obj.traverseVisible(n=>{if(n instanceof THREE.Mesh)bounds.expandByObject(n,true);});
  const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3());
  const h=Math.max(size.y,0.5),w=Math.max(size.x,0.45),d=Math.max(size.z,0.45);
  const mat=(color:number,glow=false)=>{const key=`${color}-${glow}`;if(!DECOR_MATS.has(key))DECOR_MATS.set(key,new THREE.MeshStandardMaterial({color,roughness:glow?0.24:0.8,metalness:glow?0.08:0,emissive:glow?color:0,emissiveIntensity:glow?0.22:0}));return DECOR_MATS.get(key)!;};
  const point=(x:number,y:number,z:number)=>new THREE.Vector3(center.x+x*w,bounds.min.y+y*h,center.z+z*d);
  const add=(geo:THREE.BufferGeometry,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,bone='spine_01',glow=false)=>{
    const mesh=new THREE.Mesh(geo,mat(color,glow));mesh.position.copy(point(x,y,z));mesh.scale.set(sx*h,sy*h,sz*h);mesh.castShadow=true;mesh.receiveShadow=true;mesh.name=`realm-${def.appearance}`;
    mesh.updateMatrixWorld(true);(anatomy[bone]??actor.bones[bone]??actor.obj).attach(mesh);return mesh;
  };
  const orb=(color:number,x:number,y:number,z:number,sx:number,sy=sx,sz=sx,bone='spine_01',glow=false)=>add(new THREE.SphereGeometry(1,16,12),color,x,y,z,sx,sy,sz,bone,glow);
  const spike=(color:number,x:number,y:number,z:number,r:number,length:number,bone='spine_01',glow=false)=>add(new THREE.ConeGeometry(1,1,10),color,x,y,z,r,length,r,bone,glow);
  const crystal=(color:number,x:number,y:number,z:number,s:number,bone='spine_01')=>add(new THREE.OctahedronGeometry(1),color,x,y,z,s,s*1.65,s,bone,true);
  const limb=(a:THREE.Vector3,b:THREE.Vector3,r:number,color:number,bone:string)=>{
    const delta=b.clone().sub(a);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r*h*0.65,r*h,delta.length(),7),mat(color));mesh.position.copy(a).add(b).multiplyScalar(0.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());mesh.castShadow=true;mesh.updateMatrixWorld(true);(actor.bones[bone]??actor.obj).attach(mesh);
  };
  switch(def.appearance){
    case 'scorpion': {
      // chibi scorpion (REALISTIC_BEASTS off): a round shell, a big head with big eyes, chunky pincers on the hands (they
      // swing with the attack), a curled tail of beads with a stinger, stubby legs — built over the borrowed rig, whose
      // own body is hidden
      const base:THREE.Object3D[]=[];actor.obj.traverse(n=>{if(n instanceof THREE.Mesh)base.push(n);});base.forEach(n=>n.visible=false);
      const body=def.tint??0xe0b070, dark=new THREE.Color(body).multiplyScalar(.62).getHex(), light=new THREE.Color(body).lerp(new THREE.Color(0xffffff),.35).getHex();
      orb(body,0,.30,-.02,.30,.20,.34);                                    // shell
      for(let i=0;i<3;i++)orb(dark,0,.44,-.18+i*.13,.20-i*.02,.035,.07);   // shell plates
      orb(light,0,.36,.24,.21,.19,.17,'head');                             // big round head
      for(const s of [-1,1]){
        orb(0xffffff,s*.085,.43,.50,.07,.08,.045,'head');orb(0x1d1612,s*.085,.43,.545,.04,.048,.025,'head');orb(0xffffff,s*.07,.455,.565,.013,.013,.008,'head');   // eyes with a glint
        limb(point(s*.22,.30,.12),point(s*.58,.32,.42),.055,body,s>0?'hand_l':'hand_r');                                 // arm
        orb(body,s*.62,.36,.60,.13,.09,.16,s>0?'hand_l':'hand_r');orb(dark,s*.68,.29,.64,.08,.05,.12,s>0?'hand_l':'hand_r');   // pincer: fat upper, small lower
        for(const z of [-.20,-.04,.12])limb(point(s*.22,.22,z),point(s*.40,.02,z+.04),.035,dark,s>0?'thigh_l':'thigh_r');  // stubby legs
      }
      const tail:[number,number,number,number][]=[[0,.34,-.36,.13],[0,.52,-.50,.12],[0,.74,-.50,.11],[0,.92,-.38,.10],[0,1.0,-.20,.09]];
      tail.forEach(([x,y,z,r],i)=>orb(i%2?dark:body,x,y,z,r,r,r));
      add(new THREE.ConeGeometry(1,1,12).rotateX(Math.PI*.75),dark,0,.96,-.08,.05,.16,.05);   // stinger, pointing forward and down
      break;
    }
    case 'spore':
      for(const [x,y,z,s] of [[-.2,.92,0,.18],[.15,1.08,.05,.24],[.25,.87,-.15,.13]]){
        orb(0x61cce0,x,y,z,s,.075,s,'head',true);spike(0xe4edbe,x,y-.09,z,.035,.18,'head');
      } break;
    case 'antlers':
      for(const sign of [-1,1]){
        limb(point(sign*.20,.83,0),point(sign*.43,1.4,0),.045,0x6d4927,'head');
        limb(point(sign*.32,1.14,0),point(sign*.65,1.31,.03),.025,0x6d4927,'head');
        for(let i=0;i<3;i++)orb(0x63ad54,sign*(.34+i*.12),1.3+i*.05,.03,.10,.045,.15,'head');
      }crystal(0x9bf7b8,0,.6,.28,.09);break;
    case 'ice-mane':
      for(let i=0;i<7;i++)crystal(0x93ddff,(i%2?-.22:.22),.43+Math.sin(i)*.03,-.3+i*.1,.045,'spine_01');
      for(const s of [-1,1])spike(0xe5fbff,s*.15,.57,.48,.018,.10,'head');break;
    case 'ice-armor':
      for(const s of [-1,1]){orb(0xb5e5f5,s*.23,.40,0,.14,.12,.18);for(let i=0;i<3;i++)crystal(0x7dcdff,s*.22,.52,-.13+i*.13,.045);}
      for(const s of [-1,1])spike(0xf3fcff,s*.2,.62,.45,.024,.13,'head');break;
    case 'ember':
      for(const s of [-1,1])spike(0xffa34b,s*.20,.91,.22,.045,.22,'head',true);
      for(let i=0;i<4;i++){orb(0x29272b,0,.42,-.24+i*.15,.16,.075,.11);crystal(0xff6023,0,.51,-.24+i*.15,.035);}
      break;
    case 'magma':
      for(const s of [-1,1]){add(new THREE.IcosahedronGeometry(1,0),0x3b3234,s*.38,.64,0,.27,.30,.25);crystal(0xff7133,s*.35,.91,0,.11);}
      orb(0xff7b20,0,.55,.31,.14,.19,.07,'spine_01',true);
      for(let i=0;i<3;i++)spike(0x33272c,(i-1)*.24,1.05,0,.1,.35,'head');break;
    case 'shadow':
      for(const s of [-1,1]){spike(0x261b35,s*.19,.96,.19,.035,.19,'head');crystal(0xbb7cff,s*.2,.43,-.12,.035);}
      for(let i=0;i<4;i++)crystal(0xa075e8,0,.43,-.24+i*.13,.035);break;
    case 'reaper':
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;crystal(0xc795ff,Math.cos(a)*.22,1.1,Math.sin(a)*.19,.065,'head');}
      for(const s of [-1,1]){spike(0x2d203e,s*.47,.68,0,.11,.65,s<0?'hand_l':'hand_r');crystal(0xb06ffa,s*.47,.96,0,.07,s<0?'hand_l':'hand_r');}
      orb(0xd6aaff,0,.65,.31,.09,.13,.06,'spine_01',true);break;
  }
  if(contact)actor.obj.add(contact);
}
