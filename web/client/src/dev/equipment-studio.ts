import * as THREE from 'three';
import { ITEMS } from '@shared/data';
import { createWeapon } from '../items/weapon-model';
import { itemIcon } from '../items/item-icons';
import { loadGlb } from '../render/assets';
import { playerModel } from '../actors/player-model';
import { rig } from '../actors/actor';
import { applyEquipVisuals } from '../actors/visuals';
import { Animator,loadClips } from '../actors/anim';
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;document.body.appendChild(renderer.domElement);
const views:{el:HTMLElement;card:HTMLElement;scene:THREE.Scene;camera:THREE.PerspectiveCamera;obj:THREE.Object3D;anim?:Animator}[]=[];
const worn=new URLSearchParams(location.search).has('wear');
const wear=document.getElementById('wear')!;wear.textContent=worn?'ดูอาวุธแยกชิ้น':'ดูอาวุธขณะสวมใส่';wear.onclick=()=>location.search=worn?'':'?wear=1';
let kind='Weapon';
function filter(){document.querySelectorAll<HTMLElement>('article').forEach(c=>c.hidden=kind!=='Item'&&c.dataset.kind!==kind);document.querySelectorAll<HTMLButtonElement>('nav button[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));}
document.querySelectorAll<HTMLButtonElement>('nav button[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind!;filter();});
async function start(){
 const [cat,armour,wood,ranged]=await Promise.all(['cat','knight-refined','shiba','SM_RangedKit'].map(n=>loadGlb('assets/'+n+'.glb')));await loadClips();
 for(const [id,d] of Object.entries(ITEMS)){
  const weapon=d.type==='Weapon'||d.slot==='OffHand',armor=d.type==='Armor'&&!weapon,card=document.createElement('article');card.dataset.kind=weapon?'Weapon':armor?'Armor':'Item';
  card.innerHTML=`<div class="${weapon||armor?'view':'icon-view'}">${weapon||armor?'':itemIcon(id)}</div><div class="label">${itemIcon(id)}<div><h2>${d.name}</h2><small>${id}</small></div></div>`;document.getElementById('cards')!.appendChild(card);
  if(!weapon&&!armor)continue;
  let obj:THREE.Object3D,anim:Animator|undefined;
  if(weapon&&!worn)obj=createWeapon(id);
  else{({obj}=rig(playerModel(cat,armour,wood)));for(const name of ['SM_HunterBow','SM_MageStaff']){const src=ranged.getObjectByName(name)!;obj.getObjectByName(src.parent!.name)?.add(src.clone(true));}applyEquipVisuals(obj,{Chest:'STARTER_CHEST',Boots:'STARTER_BOOTS',[d.slot!]:id});anim=new Animator(obj);anim.update(0);}
  const scene=new THREE.Scene();scene.add(obj,new THREE.HemisphereLight(0xc4eaff,0x6a5143,3));const light=new THREE.DirectionalLight(0xffe8bd,4);light.position.set(2,4,4);scene.add(light);const rim=new THREE.DirectionalLight(0x81bbff,2);rim.position.set(-2,2,-2);scene.add(rim);
  obj.updateMatrixWorld(true);const bounds=new THREE.Box3();obj.traverseVisible(n=>{if(n instanceof THREE.Mesh)bounds.expandByObject(n,true);});const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3()),r=Math.max(size.x,size.y,size.z)*1.8;
  const camera=new THREE.PerspectiveCamera(35,1,.01,20);camera.position.set(center.x+r*.2,center.y+r*.13,center.z+r);camera.lookAt(center);views.push({el:card.querySelector('.view')!,card,scene,camera,obj,anim});
 }
 document.getElementById('status')!.textContent=`${Object.keys(ITEMS).length} ไอเทม · โมเดลและไอคอนชุดเดียวกับในเกม`;filter();const clock=new THREE.Clock();let t=0;
 function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());t+=dt;renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);for(const v of views){if(v.card.hidden)continue;const r=v.el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)continue;v.anim?.update(dt);v.obj.rotation.y=v.card.dataset.kind==='Armor'&&v.card.textContent?.includes('CLO')?2.7+Math.sin(t*.3)*.35:Math.sin(t*.3)*.35;v.camera.aspect=r.width/r.height;v.camera.updateProjectionMatrix();renderer.setViewport(r.left,innerHeight-r.bottom,r.width,r.height);renderer.setScissor(r.left,innerHeight-r.bottom,r.width,r.height);renderer.render(v.scene,v.camera);}}frame();
}
start().catch(e=>{document.getElementById('status')!.textContent=String(e);console.error(e);});addEventListener('resize',()=>renderer.setSize(innerWidth,innerHeight));
