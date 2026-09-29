import { monsterModel } from "../actors/monster-model";
import { rig, blink, lidsOf } from "../actors/actor";
import { bossLook } from "../actors/visuals";
import * as THREE from 'three';
import { CITIES } from '@shared/regions';
import { MONSTERS } from '@shared/data';
import { loadGlb } from '../render/assets';
import { Animator, loadClips } from '../actors/anim';
import { applyMonsterAppearance } from '../actors/monster-appearance';
import type { Actor } from '../actors/actor';
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.setSize(innerWidth,innerHeight);document.body.appendChild(renderer.domElement);
const views:{el:HTMLElement;scene:THREE.Scene;camera:THREE.PerspectiveCamera;obj:THREE.Object3D;anim:Animator}[]=[];
let walk=true;document.getElementById('motion')!.onclick=()=>{walk=!walk;document.getElementById('motion')!.textContent=walk?'แอนิเมชัน: เดิน':'แอนิเมชัน: ยืน';};
async function start(){
 await loadClips();const models=new Map<string,THREE.Object3D>();
 const focus=new URLSearchParams(location.search).get('focus');
 if(focus){document.getElementById('cards')!.style.gridTemplateColumns='repeat(2,minmax(0,1fr))';const style=document.createElement('style');style.textContent='.view{height:400px}';document.head.appendChild(style);}
 for(const [id,def] of Object.entries(MONSTERS)){
  if(focus && def.appearance!==focus && def.model!==focus)continue;
  const city=CITIES.find(c=>c.monsters.includes(def.base??id))??CITIES[0];
  if(!models.has(def.model))models.set(def.model,await loadGlb(`assets/${def.model==='alpha'?'alpha':def.model}.glb`));
  const card=document.createElement('article');card.innerHTML=`<div class="view"></div><h2>${def.name}</h2><small>${city.realm} · Lv. ${def.level} · ${def.appearance??def.model}</small>`;document.getElementById('cards')!.appendChild(card);
  const {obj}=rig(monsterModel(models.get(def.model)!,def.model),def.tint);const bones:Record<string,THREE.Bone>={};obj.traverse(n=>{if(n instanceof THREE.Bone)bones[n.name]=n;});
  const anim=new Animator(obj,def.clips??'');applyMonsterAppearance({obj,bones} as Actor,def);if(def.boss)bossLook(obj,def.pk?"pk":def.night?"night":"tyrant");anim.update(0);obj.userData.blinkState={};
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xd8edff,0x756c49,2.5));const light=new THREE.DirectionalLight(0xffebc8,3);light.position.set(3,5,5);scene.add(light);scene.add(obj);
  obj.updateMatrixWorld(true);const box=new THREE.Box3();obj.traverseVisible(n=>{if(n instanceof THREE.Mesh&&!n.name.startsWith('boss-aura'))box.expandByObject(n,true);});const framed=box,size=framed.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const camera=new THREE.PerspectiveCamera(35,1,.01,100);const radius=Math.max(size.y,size.x,size.z)*2.5;camera.position.set(center.x+radius*.52,center.y+radius*.36,center.z+radius);camera.lookAt(center);
  views.push({el:card.querySelector('.view')!,scene,camera,obj,anim});
 }
 const clock=new THREE.Clock();let time=0;function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());time+=dt;renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);for(const v of views){const r=v.el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)continue;v.anim.setMoving(walk);v.anim.update(dt);const k=blink(v.obj.userData.blinkState,dt);for(const l of lidsOf(v.obj))l.mesh.morphTargetInfluences![l.i]=k;v.obj.rotation.y=focus?.8:Math.sin(time*.35)*.7;v.camera.aspect=r.width/r.height;v.camera.updateProjectionMatrix();renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissor(r.left,innerHeight-r.bottom,r.width,r.height);renderer.render(v.scene,v.camera);}}frame();
}
start().catch(e=>{document.querySelector('header p')!.textContent=String(e);throw e;});addEventListener('resize',()=>renderer.setSize(innerWidth,innerHeight));
