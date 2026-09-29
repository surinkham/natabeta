import * as THREE from 'three';
import { CITIES, regionAt, type Biome } from '@shared/regions';
import { scene, sun, hemi, renderer } from '../render/scene';
import { daylight } from '../render/daynight';
import { Q } from '../render/quality';

type Climate={sky:number;sun:number;ground:number;sunPower:number;ambient:number;exposure:number;fogNear:number;fogFar:number;color:number;count:number;fall:number;wind:number;size:number;opacity:number};
export const CLIMATES:Record<Biome,Climate>={
 meadow:{sky:0xb5d4e5,sun:0xffefd0,ground:0x71855b,sunPower:1,ambient:1,exposure:1,fogNear:29,fogFar:55,color:0xffefd2,count:35,fall:.08,wind:.25,size:2,opacity:.22},
 forest:{sky:0x789e9f,sun:0xc6e2d5,ground:0x294943,sunPower:.62,ambient:.95,exposure:.97,fogNear:20,fogFar:46,color:0x9df0d6,count:210,fall:.12,wind:.2,size:2.8,opacity:.55},
 snow:{sky:0xc4d4e2,sun:0xe0ebff,ground:0xa6bfd9,sunPower:.6,ambient:1.1,exposure:1.03,fogNear:18,fogFar:43,color:0xf0f7ff,count:1000,fall:-1.2,wind:.55,size:3.4,opacity:.83},
 desert:{sky:0xdcc9a5,sun:0xffd898,ground:0xaa8254,sunPower:1.15,ambient:.93,exposure:1.02,fogNear:30,fogFar:60,color:0xe6c996,count:190,fall:.03,wind:1.2,size:2.4,opacity:.33},
 volcanic:{sky:0x795e5b,sun:0xffaa79,ground:0x5e3832,sunPower:.58,ambient:.8,exposure:.91,fogNear:20,fogFar:44,color:0xc2aba0,count:300,fall:-.22,wind:.55,size:2.1,opacity:.48},
 shadow:{sky:0x716984,sun:0xc4b0ee,ground:0x40364f,sunPower:.48,ambient:.85,exposure:.9,fogNear:18,fogFar:40,color:0xb294ed,count:120,fall:.15,wind:.18,size:2.3,opacity:.42},
};
const uniforms={uTime:{value:0},uOrigin:{value:new THREE.Vector3()},uFall:{value:-1.2},uWind:{value:.5},uSize:{value:3},uColor:{value:new THREE.Color()},uOpacity:{value:0},uPixelRatio:{value:1}};
let particles:THREE.Points|undefined;
function init(){
 const vertices=new Float32Array(1000*3);let seed=5173;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<1000;i++){vertices[i*3]=(rand()-.5)*42;vertices[i*3+1]=rand()*20;vertices[i*3+2]=(rand()-.5)*42;}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(vertices,3));
 const mat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,depthTest:true,
 vertexShader:`uniform float uTime,uFall,uWind,uSize,uPixelRatio;uniform vec3 uOrigin;varying float vFade;
 void main(){vec3 p=position; p.x=mod(p.x+uTime*uWind+21.,42.)-21.;p.y=mod(p.y+uTime*uFall,20.)+.15;p.z+=sin(uTime*.6+position.x)*.6;
 p.x+=sin(uTime+position.z)*.2;vec4 mv=modelViewMatrix*vec4(p+uOrigin,1.);gl_Position=projectionMatrix*mv;
 gl_PointSize=clamp(uSize*uPixelRatio*13./max(2.,-mv.z),1.,7.*uPixelRatio);vFade=(1.-smoothstep(23.,43.,-mv.z))*smoothstep(.15,1.,p.y);}`,
 fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying float vFade;void main(){float r=length(gl_PointCoord-.5);float a=(1.-smoothstep(.13,.5,r))*uOpacity*vFade;if(a<.015)discard;gl_FragColor=vec4(uColor,a);}`});
 particles=new THREE.Points(geo,mat);particles.frustumCulled=false;particles.renderOrder=2;particles.name='regional-weather';scene.add(particles);
}
const sky=new THREE.Color(),sunColor=new THREE.Color(),ground=new THREE.Color(),blend=new THREE.Color();
/** Called after the common day/night calculation; modifiers never accumulate across frames. */
export function updateAtmosphere(dt:number,center:THREE.Vector3){
 if(!particles)init();
 const region=regionAt(center),cfg=CLIMATES[region.biome];
 const others=CITIES.filter(c=>c.id!==region.id).sort((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)-Math.hypot(b.x-center.x,b.z-center.z));
 const neighbour=CLIMATES[others[0].biome];
 const gap=Math.hypot(others[0].x-center.x,others[0].z-center.z)-Math.hypot(region.x-center.x,region.z-center.z),weight=THREE.MathUtils.clamp(.5+gap/24,.5,1);
 const mix=(k:'sunPower'|'ambient'|'exposure'|'fogNear'|'fogFar')=>THREE.MathUtils.lerp(neighbour[k],cfg[k],weight);
 const day=daylight();
 sky.set(neighbour.sky).lerp(blend.set(cfg.sky),weight);sunColor.set(neighbour.sun).lerp(blend.set(cfg.sun),weight);ground.set(neighbour.ground).lerp(blend.set(cfg.ground),weight);
 (scene.background as THREE.Color).lerp(sky,.55*day);scene.fog!.color.copy(scene.background as THREE.Color);
 if(scene.fog instanceof THREE.Fog){scene.fog.near=mix('fogNear');scene.fog.far=mix('fogFar');}
 sun.color.lerp(sunColor,day*.55);sun.intensity*=mix('sunPower');sun.shadow.radius=region.biome==='desert'?1.5:3;
 hemi.groundColor.lerp(ground,.65);hemi.intensity*=mix('ambient');renderer.toneMappingExposure*=mix('exposure');
 uniforms.uTime.value+=Math.min(dt,.1);uniforms.uOrigin.value.set(center.x,0,center.z);
 uniforms.uFall.value=cfg.fall;uniforms.uWind.value=cfg.wind;uniforms.uColor.value.set(cfg.color);uniforms.uOpacity.value=cfg.opacity*(.65+.35*day);uniforms.uSize.value=cfg.size;uniforms.uPixelRatio.value=renderer.getPixelRatio();
 particles!.geometry.setDrawRange(0,Math.round(cfg.count*(Q.name==='low'?.35:1)));
}
