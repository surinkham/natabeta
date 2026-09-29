import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { borderBend, type RiverPoint } from "@shared/scenery";
import * as THREE from 'three';
import { regionAt } from '@shared/regions';
import { BRIDGE } from '@shared/world';
import { nightU } from '../render/night';

/** Deck vertices follow the same ramp function as shared groundY(), including both landings. */
export function createBridge() {
  const group = new THREE.Group(); group.name = 'SM_Bridge';
  const wood = new THREE.MeshStandardMaterial({color:0x806448,roughness:.86,vertexColors:true});
  const rail = new THREE.MeshStandardMaterial({color:0x493b30,roughness:.8});
  const stone = new THREE.MeshStandardMaterial({color:0x807f76,roughness:.96});
  const metal = new THREE.MeshStandardMaterial({color:0x42474a,roughness:.45,metalness:.55});
  const top = BRIDGE.deck * BRIDGE.s + BRIDGE.y;
  const deck = (x:number) => (Math.max(0,top*Math.min(1,(BRIDGE.halfLen-Math.abs(x))*BRIDGE.s/1.4))-BRIDGE.y)/BRIDGE.s;
  const box = (x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  // Individual boards have sloped tops, so their visual surface cannot swallow the character.
  for(let i=0;i<40;i++) {
    const a=-2+i*.1,b=a+.1,geometry=new THREE.BoxGeometry(.1,.065,1.78);
    const positions=geometry.getAttribute('position');
    for(let v=0;v<positions.count;v++) {const x=(a+b)/2+positions.getX(v);positions.setY(v,positions.getY(v)+deck(x)-.0325);}
    const grain=new Float32Array(positions.count*3);const shade=.87+(Math.sin(i*17.13)+1)*.065;
    for(let v=0;v<grain.length;v+=3)grain.set([shade,shade,shade],v);geometry.setAttribute('color',new THREE.BufferAttribute(grain,3));
    geometry.computeVertexNormals();const board=new THREE.Mesh(geometry,wood);board.position.x=(a+b)/2;board.castShadow=board.receiveShadow=true;group.add(board);
  }
  for(const side of [-1,1]) {
    for(let i=0;i<=8;i++) {
      const x=-2+i*.5,y=deck(x),z=side*.94;
      box(x,y+.17,z,.065,.40,.065,rail);
      box(x,y+.34,z,.078,.025,.078,metal);
      if(i<8) {
        const nx=x+.5,ny=deck(nx),beam=box((x+nx)/2,(y+ny)/2+.34,z,Math.hypot(.5,ny-y),.055,.065,rail);
        beam.rotation.z=Math.atan2(ny-y,.5);
        const lower=box((x+nx)/2,(y+ny)/2+.12,z,Math.hypot(.5,ny-y),.035,.04,rail);lower.rotation.z=beam.rotation.z;
      }
    }
    for(const x of [-1.35,1.35])box(x,(deck(x)+.1)/2,side*.72,.26,deck(x)-.3,.32,stone);   // piers stop under the boards: flush with the deck they showed through it as grey patches
    box(0,BRIDGE.deck-.12,side*.64,2.85,.16,.12,rail);
  }
  // Each material is one mesh, rather than a draw call for every board, post and rail.
  group.updateMatrixWorld(true);const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const child of [...group.children]) if(child instanceof THREE.Mesh) {
    const list=batches.get(child.material)??[];list.push(child.geometry.clone().applyMatrix4(child.matrix));batches.set(child.material,list);child.geometry.dispose();
  }
  group.clear();for(const [mat,parts] of batches) {const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
  return group;
}

export function riverMaterial(length=90) {
  const mat=new THREE.MeshStandardMaterial({color:0x327d89,roughness:.27,metalness:.12});
  const time={value:0};
  mat.onBeforeCompile=shader=>{
    shader.uniforms.riverTime=time; shader.uniforms.riverLength={value:length}; shader.uniforms.riverNight=nightU;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 riverUv; varying vec3 riverWorld;').replace('#include <uv_vertex>','#include <uv_vertex>\nriverUv=uv;').replace('#include <project_vertex>', '#include <project_vertex>\nriverWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 riverUv; varying vec3 riverWorld; uniform float riverTime; uniform float riverLength; uniform float riverNight;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float endBlend=smoothstep(4.,10.,min(riverUv.x,1.-riverUv.x)*riverLength);
      float edge=abs(riverUv.y-.5)*2.*endBlend;
      float ripple=sin(riverWorld.x*2.1+riverWorld.z*.7-riverTime*.8+sin(riverWorld.z*1.8))*sin(riverWorld.z*4.2+riverWorld.x*.5+riverTime*.7);
      vec3 deep=vec3(.025,.16,.20), shallow=vec3(.13,.40,.39);
      diffuseColor.rgb=mix(deep,shallow,smoothstep(.48,1.,edge))+ripple*.018;
      float foam=smoothstep(.93,.995,edge)*(.45+.35*sin(riverWorld.x*2.6+riverWorld.z*1.9+riverTime));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.61,.76,.70),foam*.55);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      normal=normalize(normal+vec3(sin(riverWorld.x*2.1+riverWorld.z*.7-riverTime)*.07,cos(riverWorld.z*4.2+riverWorld.x*.5+riverTime)*.05,0.));`);
    // the moon on the water at night: the view ray mirrored in the rippled surface meets the moon (a fixed direction
    // up and away from the camera, where the HUD moon hangs), giving a shimmering silver road across the river
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      if(riverNight>.01){
        vec3 moonR=reflect(-normalize(vViewPosition),normal);
        vec3 moonM=normalize((viewMatrix*vec4(normalize(vec3(.18,.52,-.84)),0.)).xyz);
        float moonD=max(dot(moonR,moonM),0.);
        float moonSparkle=.35+.65*smoothstep(.2,.9,sin(riverWorld.x*9.+riverTime*2.3)*sin(riverWorld.z*13.-riverTime*1.7));   // broken into glints by the ripples
        totalEmissiveRadiance+=vec3(.78,.85,1.)*(pow(moonD,2500.)*3.5*moonSparkle+pow(moonD,300.)*.35*moonSparkle+pow(moonD,40.)*.05)*riverNight;
      }`);
  };
  mat.customProgramCacheKey=()=> 'river-flow-v2';
  mat.userData.riverTime=time;
  return mat;
}

export function riverStrip(length:number,width:number,water:boolean, bend?:{ax:number;az:number;length:number;gapAt?:number}) {
  const geometry=new THREE.PlaneGeometry(length,width,Math.ceil(length/1.5),8);
  const pos=geometry.getAttribute('position');
  for(let i=0;i<pos.count;i++) {
    const x=pos.getX(i),y=pos.getY(i),edge=Math.abs(y)/(width/2);
    const meander=bend?borderBend(x+length/2,bend.length,bend.ax,bend.az,bend.gapAt):0;
    pos.setY(i,y-meander+Math.sin(x*.37)*.16*edge+Math.sin(x*1.14)*.07*edge);
  }
  geometry.computeVertexNormals();
  const material=water?riverMaterial(length):new THREE.MeshStandardMaterial({color:bend&&regionAt({x:bend.ax,z:bend.az}).biome==='snow'?0xbcc8c8:0x898c70,roughness:1,transparent:true,depthWrite:false});
  if(!water) {
    material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 bankUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nbankUv=uv;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 bankUv;').replace('#include <color_fragment>',`#include <color_fragment>
        float bankEdge=abs(bankUv.y-.5)*2.;
        diffuseColor.a*=1.-smoothstep(.65,1.,bankEdge);
        diffuseColor.rgb*=.95+.05*sin(bankUv.x*430.)*sin(bankUv.y*71.);`);
    };material.customProgramCacheKey=()=> 'soft-bank-v1';
  }
  const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;
  if(water)mesh.onBeforeRender=()=>{material.userData.riverTime.value=performance.now()/1000;};
  return mesh;
}

/** Sweep the shared centerline in world coordinates; normals follow bends, not grid axes. */
export function riverRibbon(path:RiverPoint[],water:boolean){
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[];
  for(const [i,p] of path.entries())for(const side of [-1,1]){
    const width=p.halfWidth+(water?0:2);
    vertices.push(p.x+p.nx*width*side,water?.05:.016,p.z+p.nz*width*side);
    uv.push(i/(path.length-1),(side+1)/2);
    if(i&&side===-1){const k=i*2;indices.push(k-2,k-1,k,k,k-1,k+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const template=riverStrip(path[path.length-1].t,1,water,{ax:path[0].x,az:path[0].z,length:path[path.length-1].t});template.geometry.dispose();
  const mesh=new THREE.Mesh(g,template.material);mesh.receiveShadow=true;mesh.onBeforeRender=template.onBeforeRender;
  return mesh;
}
