import { scenicBorders } from "@shared/scenery";
import * as THREE from 'three';
import {renderer,camera,scene,resize,render} from '../render/scene';
import {buildWorld,layout,streamWorld} from '../world/world';
import {groundY} from '@shared/world';
import {regionAt} from '@shared/regions';
import {loadGlb} from '../render/assets';
import {rig} from '../actors/actor';
import {Animator,loadClips} from '../actors/anim';
import {clockState,updateDayNight} from '../render/daynight';
import {updateAtmosphere} from '../world/atmosphere';
const bridges=layout.props.filter(p=>p.name==='SM_Bridge');let index=bridges.findIndex(p=>regionAt(p).biome==='snow'),wide=false;
if(index<0)index=0;
const focus=new THREE.Vector3();document.body.appendChild(renderer.domElement);resize();addEventListener('resize',resize);clockState.hours=11;clockState.paused=true;
function select(){const b=bridges[index];focus.set(b.x,0,b.z);streamWorld(b.x,b.z,true);document.getElementById('status')!.textContent=`${regionAt(b).name} · ตัวละครเดินตามความสูงสะพานจริง`;camera.position.set(b.x+(wide?28:7),wide?34:8,b.z+(wide?30:10));camera.lookAt(focus);}
document.getElementById('next')!.onclick=()=>{index=(index+1)%bridges.length;select();};document.getElementById('view')!.onclick=()=>{wide=!wide;select();};
document.getElementById('junction')!.onclick=()=>{
 const ends=new Map<string,{x:number;z:number;directions:Set<string>;count:number}>();
 for(const b of scenicBorders().filter(b=>b.look==='river'))for(const [x,z] of [[b.x1,b.z1],[b.x2,b.z2]]){const key=`${x},${z}`,p=ends.get(key)??{x,z,directions:new Set<string>(),count:0};p.directions.add(b.x1===b.x2?'v':'h');p.count++;ends.set(key,p);}
 const junction=[...ends.values()].filter(p=>p.directions.size>1).sort((a,b)=>b.count-a.count)[0];
 if(!junction)return;focus.set(junction.x,0,junction.z);wide=true;streamWorld(junction.x,junction.z,true);camera.position.set(junction.x+20,30,junction.z+24);camera.lookAt(focus);document.getElementById('status')!.textContent='จุดเชื่อมแม่น้ำหลักและสาขา · ใช้แนวเดียวกับมินิแมป';
};
async function start(){await buildWorld();await loadClips();const {obj}=rig(await loadGlb('assets/breeds/husky.glb'));scene.add(obj);const anim=new Animator(obj);anim.setMoving(true);select();const clock=new THREE.Clock();let time=0;function frame(){requestAnimationFrame(frame);const dt=Math.min(.05,clock.getDelta());time+=dt;const b=bridges[index],d=Math.sin(time*.25)*6;obj.position.set(b.x+Math.cos(b.ry)*d,0,b.z-Math.sin(b.ry)*d);obj.position.y=groundY(obj.position,layout);obj.rotation.y=Math.PI/2+b.ry+(Math.cos(time*.25)<0?Math.PI:0);anim.update(dt);updateDayNight(dt,focus);updateAtmosphere(dt,focus);if(wide&&scene.fog instanceof THREE.Fog){scene.fog.near+=40;scene.fog.far+=40;}render();}frame();}start().catch(e=>document.getElementById('status')!.textContent=String(e));
