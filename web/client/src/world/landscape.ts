import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Q } from "../render/quality";
import { MAP } from "@shared/world";
import { CITIES, ROADS, roadDist, type Zone } from "@shared/regions";
import { riverPath, scenicBorders } from "@shared/scenery";
const BIOME_ORDER = ["forest", "meadow", "snow", "desert", "volcanic", "shadow"];   // index into biome() below

const wind = { value: 0 };
let seed = 8147;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const noiseGLSL = `
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
             mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
}
// Warped cellular edges resemble cooled lava plates, without repeating stripes.
float lavaFissure(vec2 p) {
  float outskirts=smoothstep(12.,24.,distance(p,vec2(${CITIES.find(c=>c.biome==='volcanic')!.x.toFixed(1)},${CITIES.find(c=>c.biome==='volcanic')!.z.toFixed(1)})));
  p=p*.72+vec2(noise2(p*.21),noise2(p*.21+17.))*1.8;
  vec2 cell=floor(p), f=fract(p); float first=9.,second=9.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
    vec2 o=vec2(float(x),float(y));
    vec2 seed=vec2(hash21(cell+o),hash21(cell+o+37.));
    float d=length(o+seed-f);
    if(d<first){second=first;first=d;}else second=min(second,d);
  }
  return (1.-smoothstep(.006,.045,second-first))*smoothstep(.48,.74,noise2(p*.23))*outskirts;
}
float terrainNoise(vec2 p) { return noise2(p)*0.55+noise2(p*2.07)*0.3+noise2(p*4.13)*0.15; }
`;

// Ground look per town index (0 Mossvale forest, 1 Pawhaven meadow, 2 Frostford snow, 3 Saharak desert,
// 4 Ignaroth volcanic, 5 Shadowlands); the meadow values are the base grass/dirt already computed.
const BIOME_GLSL = `
void biome(float k, vec2 p, float broad, vec3 mg, vec3 md, out vec3 g, out vec3 d) {
  g = mg; d = md;
  if (k < 0.5) g = mix(vec3(0.08,0.20,0.12), vec3(0.24,0.43,0.24), broad);
  else if (k < 1.5) {}
  else if (k < 2.5) { g = mix(vec3(0.60,0.76,0.85), vec3(0.95,0.98,1.), broad); d = vec3(0.60,0.72,0.79); }
  else if (k < 3.5) {
    float swell=terrainNoise(p*.065);
    float wind=p.x*.72+p.y*.38+terrainNoise(p*.18)*2.8;
    float ripple=sin(wind*15.+sin(wind*2.)*.55);
    float grains=noise2(p*65.);
    g=mix(vec3(.48,.255,.095),vec3(.86,.64,.32),smoothstep(.15,.85,swell));
    g*=.94+.045*ripple+.035*grains;
    float minerals=smoothstep(.79,.91,noise2(p*5.2))*smoothstep(.48,.7,terrainNoise(p*.7));
    g=mix(g,vec3(.36,.27,.16),minerals*.28);
    d=mix(vec3(.47,.30,.14),vec3(.69,.48,.25),broad);
  }
  else if (k < 4.5) {
    float ash=terrainNoise(p*.48+12.);
    float pores=noise2(p*29.);
    g=mix(vec3(.052,.060,.067),vec3(.19,.16,.14),broad);
    g=mix(g,vec3(.30,.28,.25),smoothstep(.55,.83,ash)*.48);
    g*=.82+.23*pores;
    g=mix(g,vec3(.62,.12,.016),lavaFissure(p)*.68);
    d=mix(vec3(.19,.18,.17),vec3(.29,.26,.22),terrainNoise(p*3.));
  }
  else { g = mix(vec3(0.09,0.06,0.15), vec3(0.30,0.20,0.37), broad); d = vec3(0.32,0.24,0.38); }
}`;

/** The winding road as GLSL: vec2(z of the centre line, slope) at x — the same polyline as shared roadZ(). */
// Every road (shared ROADS: town gates to map borders, bending across each map) is painted once into a mask texture
// the ground shader samples — one texture read however many roads there are.
const GROUND = { x0: MAP.minX - 80, z0: MAP.minZ - 80, w: MAP.maxX - MAP.minX + 160, h: MAP.maxZ - MAP.minZ + 160 };
function roadMask() {
  const k = Math.min(2, 4096 / GROUND.w, 4096 / GROUND.h), cv = document.createElement("canvas");
  cv.width = Math.ceil(GROUND.w * k); cv.height = Math.ceil(GROUND.h * k);
  const g = cv.getContext("2d")!; g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = "#fff"; g.lineCap = g.lineJoin = "round"; g.lineWidth = 2.7 * k;
  for (const segs of ROADS.values()) for (const [x1, z1, x2, z2] of segs) {
    g.beginPath(); g.moveTo((x1 - GROUND.x0) * k, (z1 - GROUND.z0) * k); g.lineTo((x2 - GROUND.x0) * k, (z2 - GROUND.z0) * k); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  return tex;
}
/** One continuous ground surface; dirt edges blend directly into grass. */
export function createLandscapeGround() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.98 });
  m.onBeforeCompile = shader => {
    shader.uniforms.grassDark = { value: new THREE.Color(0x4f794b) };
    shader.uniforms.grassLight = { value: new THREE.Color(0x88a966) };
    shader.uniforms.soilDark = { value: new THREE.Color(0x80644a) };
    shader.uniforms.soilLight = { value: new THREE.Color(0xb29b75) };
    shader.uniforms.uRoad = { value: roadMask() };
    shader.uniforms.uRoadBox = { value: new THREE.Vector4(GROUND.x0, GROUND.z0, GROUND.w, GROUND.h) };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTerrain;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTerrain=(modelMatrix*vec4(transformed,1.)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
      "#include <common>\nvarying vec3 vTerrain; uniform vec3 grassDark,grassLight,soilDark,soilLight; uniform sampler2D uRoad; uniform vec4 uRoadBox;\n" + noiseGLSL + BIOME_GLSL)
      .replace("#include <map_fragment>", `
        vec2 p=vTerrain.xz;
        float broad=terrainNoise(p*0.24);
        float fine=noise2(p*8.);
        vec3 grass=mix(grassDark,grassLight,smoothstep(0.18,0.85,broad));
        grass*=0.97+0.06*fine;
        // Pale dried areas interrupt the green carpet without high-frequency colour noise.
        grass=mix(grass,soilLight*0.72,smoothstep(0.7,0.88,terrainNoise(p*0.68+31.))*0.18);
        // roads: the painted mask, its edge frayed by noise so it never reads as a stencil
        float edgeN=(noise2(p*1.4)-0.5)*0.35;
        float road=smoothstep(0.3,0.7,texture2D(uRoad,(p-uRoadBox.xy)/uRoadBox.zw).r+edgeN);
        float grain=terrainNoise(p*7.);
        vec3 dirt=mix(soilDark,soilLight,0.25+grain*0.6);
        // Small mineral grains and worn wheel tracks, rather than stretched wood-like streaks.
        dirt+=vec3(smoothstep(0.93,0.98,noise2(p*43.))*0.04);
        // Biomes by town: each place takes the look of its nearest town, fading into the second-nearest across the
        // line halfway between them, so there is no hard colour seam anywhere on the continent.
        float d0=1e9,d1=1e9,k0=1.,k1=1.;
        ${CITIES.map(c => `{ float d=distance(p,vec2(${c.x.toFixed(1)},${c.z.toFixed(1)})); float k=${BIOME_ORDER.indexOf(c.biome)}.; if(d<d0){d1=d0;k1=k0;d0=d;k0=k;} else if(d<d1){d1=d;k1=k;} }`).join("\n        ")}
        float bt=smoothstep(0.36,0.5,d0/(d0+d1))*0.5;
        vec3 g0, e0, g1, e1;
        biome(k0, p, broad, grass, dirt, g0, e0); biome(k1, p, broad, grass, dirt, g1, e1);
        grass = mix(g0, g1, bt); dirt = mix(e0, e1, bt);
        float desertWeight=mix(step(2.5,k0)*(1.-step(3.5,k0)),step(2.5,k1)*(1.-step(3.5,k1)),bt);
        float volcanicWeight=mix(step(3.5,k0)*(1.-step(4.5,k0)),step(3.5,k1)*(1.-step(4.5,k1)),bt);
        float fissure=lavaFissure(p)*volcanicWeight*(1.-road);
        diffuseColor.rgb=mix(grass,dirt,road);
      `);
    if (Q.name === "high") shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      float sandPhase=p.x*.72+p.y*.38+terrainNoise(p*.18)*2.8;
      float rippleSlope=cos(sandPhase*15.+sin(sandPhase*2.)*.55)*.16;
      float duneSlope=cos(p.x*.13+p.y*.085+terrainNoise(p*.055)*3.)*.22;
      vec3 sandNormal=mat3(viewMatrix)*vec3(-.72*(rippleSlope+duneSlope),0.,-.38*(rippleSlope+duneSlope));
      vec3 rockNormal=mat3(viewMatrix)*vec3((noise2(p*5.)-.5)*.32,0.,(noise2(p*5.+13.)-.5)*.32);
      normal=normalize(normal+sandNormal*desertWeight*(1.-road*.8)+rockNormal*volcanicWeight);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,.9,desertWeight);`);
  };
  const compile=m.onBeforeCompile;
  m.onBeforeCompile=(shader,renderer)=>{compile.call(m,shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    totalEmissiveRadiance+=vec3(1.,.12,.008)*fissure*.95;`);};
  m.customProgramCacheKey = () => "bk-six-realms-v12-basalt";
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(MAP.maxX - MAP.minX + 160, MAP.maxZ - MAP.minZ + 160), m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.z = (MAP.minZ + MAP.maxZ) / 2; mesh.position.x = (MAP.minX + MAP.maxX) / 2;   // covers town (z 10) down to the Dark Forest (z -92)
  mesh.receiveShadow = true;
  return mesh;
}

class Vegetation {
  wood: THREE.BufferGeometry[] = [];
  foliage: THREE.BufferGeometry[] = [];
  branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const delta = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(radius * 0.48, radius, delta.length(), 6, 1, true);   // open: the ends sit inside wood or leaves
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize()));
    g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    this.color(g, new THREE.Color(0x68513c), 0.15); this.wood.push(g.toNonIndexed()); g.dispose();
  }
  color(g: THREE.BufferGeometry, base: THREE.Color, variation: number) {
    const pos=g.getAttribute("position"), colors=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++) {
      const c=base.clone().multiplyScalar(0.85+variation*(0.5+0.5*Math.sin(pos.getX(i)*11+pos.getY(i)*8+pos.getZ(i)*13)));
      colors.set([c.r,c.g,c.b],i*3);
    }
    g.setAttribute("color",new THREE.BufferAttribute(colors,3));
  }
  crown(x:number,y:number,z:number,sx:number,sy:number,sz:number,tint:number) {
    const g=new THREE.SphereGeometry(1,Q.name==="high"?18:12,Q.name==="high"?12:8);
    const p=g.getAttribute("position"), normals=g.getAttribute("normal");
    for(let i=0;i<p.count;i++){
      const vx=p.getX(i),vy=p.getY(i),vz=p.getZ(i);
      const n=1+0.045*Math.sin(vx*5+vy*3)*Math.sin(vz*5-vy*4);
      p.setXYZ(i,vx*n*sx+x,vy*n*sy+y,vz*n*sz+z);
      // Analytic ellipsoid normals keep UV seams and poles smoothly lit.
      const normal=new THREE.Vector3(vx/sx,vy/sy,vz/sz).normalize();
      normals.setXYZ(i,normal.x,normal.y,normal.z);
    }
    this.color(g,new THREE.Color(tint),0.12);
    this.foliage.push(g.toNonIndexed());g.dispose();
    // Rounded leaf sprays replace the long triangular spikes around the crown.
    const leafCount=Q.name==="high"?12:6;
    for(let j=0;j<leafCount;j++){
      const az=rand()*Math.PI*2, el=(rand()-0.25)*Math.PI;
      const pos=new THREE.Vector3(x+Math.cos(az)*Math.cos(el)*sx,y+Math.sin(el)*sy,z+Math.sin(az)*Math.cos(el)*sz);
      const shape=new THREE.Shape();
      shape.moveTo(0,0);
      shape.bezierCurveTo(-0.075,0.04,-0.075,0.13,0,0.18);
      shape.bezierCurveTo(0.075,0.13,0.075,0.04,0,0);
      const leaf=new THREE.ShapeGeometry(shape,4);
      leaf.rotateY(az);leaf.rotateZ((rand()-0.5)*1.5);leaf.translate(pos.x,pos.y,pos.z);
      this.color(leaf,new THREE.Color(tint).multiplyScalar(1.12),0.15);
      this.foliage.push(leaf.toNonIndexed());leaf.dispose();
    }
  }
  /** Open clusters of individual cupped leaves; no solid sphere inside the canopy. */
  spray(center: THREE.Vector3, radius: THREE.Vector3, tint: number, pine = false) {
    // leaf cards were ~10k triangles a tree, drawn twice with shadows; fewer, slightly larger ones keep the fullness
    const count=Q.name==="high" ? (pine?20:64) : (pine?12:36);
    const base=new THREE.Color(tint);
    for(let i=0;i<count;i++){
      const theta=rand()*Math.PI*2, h=rand()*2-1, ring=Math.sqrt(1-h*h);
      const radial=0.35+Math.pow(rand(),0.35)*0.65;
      const offset=new THREE.Vector3(Math.cos(theta)*ring*radius.x,h*radius.y,Math.sin(theta)*ring*radius.z).multiplyScalar(radial);
      const length=(pine?0.3:0.36)*(0.75+rand()*0.55), width=length*(pine?0.2:0.5);
      const points=new Float32Array([
        0,0,0, -width*0.8,length*0.28,0.01, -width,length*0.6,0.005,
        0,length,0, width,length*0.6,0.005, width*0.8,length*0.28,0.01,
        0,length*0.48,length*0.12,
      ]);
      const leaf=new THREE.BufferGeometry();leaf.setAttribute("position",new THREE.BufferAttribute(points,3));
      leaf.setIndex([0,2,6,2,3,6,3,4,6,4,0,6]);   // four facets round the raised midrib: the same cupped leaf, a third fewer triangles
      leaf.computeVertexNormals();
      leaf.rotateX(-0.55-rand()*1.1);leaf.rotateY(theta+rand()*0.8);
      leaf.translate(center.x+offset.x,center.y+offset.y,center.z+offset.z);
      this.color(leaf,base.clone().multiplyScalar(0.92+rand()*0.23),0.1);
      this.foliage.push(leaf.toNonIndexed());leaf.dispose();
    }
  }
  finish() {
    const root=new THREE.Group();
    for(const [parts,foliage] of [[this.wood,false],[this.foliage,true]] as const){
      if(!parts.length)continue;
      // Leaf sprays have no UVs; this vertex-colour material does not need them.
      parts.forEach(g=>g.deleteAttribute("uv"));
      const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:foliage?THREE.DoubleSide:THREE.FrontSide});
      const geo=mergeGeometries([...parts]);if(!geo)throw new Error("Vegetation merge failed");
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);parts.forEach(g=>g.dispose());
    }
    return root;
  }
}
function oak() {
  const v=new Vegetation();
  const trunk=[new THREE.Vector3(0,0,0),new THREE.Vector3(-0.09,1.1,0.03),new THREE.Vector3(0.08,2.1,-0.08),new THREE.Vector3(-0.12,3.15,0.04)];
  for(let i=0;i<trunk.length-1;i++)v.branch(trunk[i],trunk[i+1],0.22-i*0.055);
  for(let i=0;i<4;i++){
    const a=i*1.65;
    v.branch(new THREE.Vector3(Math.cos(a)*0.34,0.025,Math.sin(a)*0.34),new THREE.Vector3(0,0.32,0),0.065);
  }
  const palette=[0x49764d,0x659047,0x79a357,0x57854b];
  for(let i=0;i<8;i++){
    const a=i*2.399+0.2, y=1.9+i*0.15, r=i<5?0.95:0.58;
    const start=new THREE.Vector3(0,y-0.5,0);
    const elbow=new THREE.Vector3(Math.cos(a)*r*0.55,y-0.12,Math.sin(a)*r*0.55);
    const end=new THREE.Vector3(Math.cos(a)*r,y+0.12,Math.sin(a)*r);
    v.branch(start,elbow,0.075);v.branch(elbow,end,0.042);
    for(const side of [-1,1]){
      const tip=end.clone().add(new THREE.Vector3(Math.cos(a+side*0.7)*0.3,0.2,Math.sin(a+side*0.7)*0.3));
      v.branch(elbow,tip,0.025);
    }
    v.spray(end,new THREE.Vector3(0.68,0.42,0.65),palette[i%4]);
  }
  v.spray(new THREE.Vector3(-0.12,3.36,0.04),new THREE.Vector3(0.57,0.42,0.52),0x84a85d);
  return v.finish();
}
function pine() {
  const v=new Vegetation();
  v.branch(new THREE.Vector3(0,0,0),new THREE.Vector3(0.025,3.9,0),0.16);
  // Swept branches carry flat sprays, leaving gaps between tiers.
  for(let tier=0;tier<7;tier++){
    const y=0.9+tier*0.43,r=1.03-tier*0.13;
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5+tier*0.9;
      const end=new THREE.Vector3(Math.cos(a)*r,y-0.09,Math.sin(a)*r);
      v.branch(new THREE.Vector3(0,y+0.16,0),end,0.032);
      v.spray(new THREE.Vector3(end.x*0.65,y,end.z*0.65),
        new THREE.Vector3(r*0.53,0.17,r*0.53),tier%2?0x44765e:0x588968,true);
    }
  }
  v.spray(new THREE.Vector3(0,3.87,0),new THREE.Vector3(0.14,0.28,0.14),0x75a17a,true);
  return v.finish();
}
function bush() {
  const v=new Vegetation();
  for(let i=0;i<5;i++){
    const a=i*2.399;
    v.crown(Math.cos(a)*0.24,0.25+(i%2)*0.12,Math.sin(a)*0.24,0.34,0.28,0.33,i%2?0x71864a:0x536d3c);
  }
  return v.finish();
}
export function createVegetationKit(){
  seed=8147;
  return {SM_Tree_Round:oak(),SM_Tree_Pine:pine(),SM_Bush:bush()};
}

/** Instanced clumps: many blades, one draw call, no new collisions. */
/** Is the ground green here? The ground shader's own rule (landscape ground): the look of the nearest town, fading into
 *  the second-nearest across the halfway line — so a meadow map's edge that already reads as sand or snow gets no grass. */
function greenAt(x: number, z: number) {
  let d0 = 1e9, d1 = 1e9, b0 = "", b1 = "";
  for (const c of CITIES) { const d = Math.hypot(x - c.x, z - c.z); if (d < d0) { d1 = d0; b1 = b0; d0 = d; b0 = c.biome; } else if (d < d1) { d1 = d; b1 = c.biome; } }
  const green = (b: string) => b === "meadow" || b === "forest", t = d0 / (d0 + d1), bt = t <= 0.36 ? 0 : t >= 0.5 ? 0.5 : ((t - 0.36) / 0.14) ** 2 * (3 - 2 * (t - 0.36) / 0.14) * 0.5;
  return green(b0) && (green(b1) || bt < 0.12);
}
/** Grass tufts for one map: only where the ground is green, never on roads, in rivers or on their banks. Null when the
 *  map has no green ground at all. */
export function createMeadow(zone: Zone, solids: readonly {x:number;z:number;r:number}[]) {
  const positions:number[]=[],colors:number[]=[];
  const forest=zone.home.biome==="forest";
  const water=scenicBorders().filter(b=>b.look==="river").flatMap(b=>riverPath(b)).filter(p=>p.x>zone.x0-12&&p.x<zone.x1+12&&p.z>zone.z0-12&&p.z<zone.z1+12);
  const wet=(x:number,z:number)=>water.some(p=>Math.hypot(x-p.x,z-p.z)<p.halfWidth+1.2);
  const nearby=solids.filter(s=>s.x+s.r>zone.x0&&s.x-s.r<zone.x1&&s.z+s.r>zone.z0&&s.z-s.r<zone.z1);
  const base=new THREE.Color(forest?0x315f38:0x699453),tip=new THREE.Color(forest?0x6d914f:0xa1bd77);
  for(let blade=0;blade<6;blade++){
    const a=blade*2.399,dx=Math.cos(a)*0.1,dz=Math.sin(a)*0.1,h=0.12+(blade%3)*0.03,w=0.022;
    const verts=[[dx-w,0,dz],[dx+w,0,dz],[dx+Math.cos(a)*0.07,h,dz+Math.sin(a)*0.07]];
    for(let i=0;i<3;i++){positions.push(...verts[i]);const c=i===2?tip:base;colors.push(c.r,c.g,c.b);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  // Meadow blades borrow the ground's upward normal so back faces do not turn black.
  const grassNormals=geo.getAttribute("normal");
  for(let i=0;i<grassNormals.count;i++) grassNormals.setXYZ(i,0,1,0);
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  mat.onBeforeCompile=shader=>{
    shader.uniforms.uMeadowTime=wind;
    shader.fragmentShader=shader.fragmentShader.replace("#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal *= faceDirection;\n#endif");
    shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nuniform float uMeadowTime;")
      .replace("#include <begin_vertex>",`#include <begin_vertex>
        #ifdef USE_INSTANCING
        transformed.x+=sin(uMeadowTime*1.3+instanceMatrix[3].x*0.7+instanceMatrix[3].z*0.4)*position.y*0.17;
        #endif`);
  };
  mat.customProgramCacheKey=()=>"bk-grass-wind-v1";
  const count=Q.name==="high"?2800:900, meadow=new THREE.InstancedMesh(geo,mat,count);
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  let n=0;seed=(1913+zone.i*73856093+zone.j*19349663)>>>0;
  for(let i=0;i<count*3&&n<count;i++){
    const x=zone.x0+1+rand()*(zone.x1-zone.x0-2),z=zone.z0+1+rand()*(zone.z1-zone.z0-2);
    if(zone.terrain==="town"&&Math.abs(x-zone.home.x)<13&&Math.abs(z-zone.home.z)<13)continue;
    if(roadDist({x,z})<1.9)continue;   // no grass tufts on the roads
    if(!greenAt(x,z)||wet(x,z))continue;   // only on green ground, never in a river or on its bank
    if(nearby.some(s=>Math.hypot(x-s.x,z-s.z)<Math.min(s.r,0.6)))continue;
    // Natural patches of varying density instead of a uniform grid.
    if(Math.sin(x*0.47)*Math.cos(z*0.38)<-0.4&&rand()<0.8)continue;
    dummy.position.set(x,0.016,z);dummy.rotation.set(0,rand()*Math.PI*2,0);
    dummy.scale.setScalar(0.8+rand()*0.5);dummy.updateMatrix();meadow.setMatrixAt(n,dummy.matrix);
    color.setScalar(0.93+rand()*0.14);meadow.setColorAt(n,color);n++;
  }
  meadow.count=n;meadow.instanceMatrix.needsUpdate=true;if(meadow.instanceColor)meadow.instanceColor.needsUpdate=true;
  if(!n){meadow.dispose();geo.dispose();mat.dispose();return null;}   // no green ground in this map
  meadow.receiveShadow=true;meadow.computeBoundingSphere();meadow.userData.ownsGrassResources=true;
  return meadow;
}
export function updateLandscape(dt:number){wind.value+=dt;}
