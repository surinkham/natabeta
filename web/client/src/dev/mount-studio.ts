import * as THREE from 'three';
import { MOUNTS } from '@shared/data';
import { loadGltf } from '../render/assets';
import { mountModel } from '../actors/mount-model';
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x1b2530);scene.add(new THREE.HemisphereLight(0xd4e8ff,0x605244,2.5));const key=new THREE.DirectionalLight(0xffe4c1,3);key.position.set(3,5,4);scene.add(key);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.01,30);camera.position.set(2,1.5,2.6);camera.lookAt(0,.6,0);
let obj:THREE.Object3D|undefined,mixer:THREE.AnimationMixer,clips:THREE.AnimationClip[]=[],moving=false;
async function select(kind:string){const g=await loadGltf(`assets/${MOUNTS[kind].model}.glb`);if(obj)scene.remove(obj);obj=mountModel(g.scene,kind);scene.add(obj);mixer=new THREE.AnimationMixer(obj);clips=g.animations;play();}
function play(){mixer?.stopAllAction();const clip=clips.find(c=>c.name===(moving?'Gallop':'Idle'));if(clip)mixer.clipAction(clip).play();}
for(const kind of ['horse','dragon'])document.getElementById(kind)!.onclick=()=>select(kind);
document.getElementById('motion')!.onclick=()=>{moving=!moving;play();};
const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{mixer?.update(Math.min(clock.getDelta(),.05));renderer.render(scene,camera);});
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});select('dragon');
