import { updateAtmosphere } from "../world/atmosphere";
import * as THREE from 'three';
import { CITIES } from '@shared/regions';
import { TOWNS } from '@shared/towns';
import { renderer,camera,scene,resize,render,project } from '../render/scene';
import { buildWorld, streamWorld } from '../world/world';
import { spawnNpcs,type Npc } from '../world/npc';
import { loadGlb } from '../render/assets';
import { loadClips } from '../actors/anim';
import { clockState,updateDayNight } from '../render/daynight';
let residents:Npc[]=[],city=CITIES[1];const center=new THREE.Vector3();
document.body.appendChild(renderer.domElement);resize();addEventListener('resize',resize);
scene.fog=new THREE.Fog(0xa9d3ef,55,90);camera.far=110;camera.fov=42;camera.updateProjectionMatrix();clockState.hours=10;clockState.paused=true;
function select(id:string){city=CITIES.find(c=>c.id===id)!;streamWorld(city.x,city.z,true);center.set(city.x,0,city.z-1);camera.position.set(city.x+16,25,city.z+24);camera.lookAt(center);for(const b of document.querySelectorAll<HTMLButtonElement>('[data-id]'))b.setAttribute('aria-pressed',String(b.dataset.id===id));document.getElementById('info')!.innerHTML=`<b>${city.realm} · ${city.name}</b><br>${city.description}<br><br>ชาวเมือง: ${TOWNS[city.biome]?.residents.length??6} คน · ประตูตะวันออก/ตะวันตกต่อถนนหลวง<br>ผังถนนและสิ่งกีดขวางตรงกับเกมจริง<br><br>${residents.filter(n=>Math.abs(n.pos.x-city.x)<11).map(n=>`<button data-resident="${n.id}" style="margin:3px;font-size:10px">${n.def.name}</button>`).join('')}`;
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-resident]'))b.onclick=()=>{const n=residents.find(n=>n.id===b.dataset.resident)!;camera.position.set(n.pos.x+1.1,1.7,n.pos.z+2.8);camera.lookAt(n.pos.x,.55,n.pos.z);};}
for(const c of CITIES){const b=document.createElement('button');b.textContent=c.realm;b.dataset.id=c.id;b.onclick=()=>select(c.id);document.getElementById('cities')!.appendChild(b);}
async function start(){await buildWorld();await loadClips();residents=spawnNpcs(await loadGlb('assets/knight-refined.glb'));select(city.id);const labels=residents.map(n=>{const el=document.createElement('span');el.textContent=n.def.name;document.getElementById('labels')!.appendChild(el);return el;});const clock=new THREE.Clock();function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);updateDayNight(dt,center);updateAtmosphere(dt,center);
const overviewOffset=Math.max(0,camera.position.distanceTo(center)-13);
if(scene.fog instanceof THREE.Fog){scene.fog.near+=overviewOffset;scene.fog.far+=overviewOffset;}
residents.forEach((n,i)=>{n.update(dt,camera.position.distanceTo(n.pos)<5?camera.position:undefined);const pos=n.pos.clone();pos.y=1.4;const [x,y,on]=project(pos);labels[i].hidden=!on||Math.abs(n.pos.x-city.x)>15;labels[i].style.left=x+'px';labels[i].style.top=y+'px';});render();}frame();}start().catch(e=>{document.getElementById('info')!.textContent=String(e);throw e;});
