import { snowSurface, addVegetationSnow } from "./snow";
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITIES, type Biome } from '@shared/regions';


const material=(color:number,glow=0)=>new THREE.MeshStandardMaterial({color,roughness:0.8,emissive:glow?color:0,emissiveIntensity:glow});
class Sculpt {
  parts = new Map<THREE.Material,THREE.BufferGeometry[]>();
  add(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1,rz=0){
    g.scale(sx,sy,sz);g.rotateZ(rz);g.translate(x,y,z);const list=this.parts.get(m)??[];list.push(g.index?g.toNonIndexed():g);this.parts.set(m,list);if(g.index)g.dispose();
  }
  finish(){const group=new THREE.Group();for(const [m,list]of this.parts){const geo=mergeGeometries(list)!;const mesh=new THREE.Mesh(geo,m);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);list.forEach(g=>g.dispose());}return group;}
}
// ---------------------------------------------------------------- saguaro (desert): round and ribbed, no hard edges
const CACTUS_RIBS=12,CACTUS=new THREE.Color(0x5d7f3a),CACTUS_GROOVE=new THREE.Color(0x3c5a26),CACTUS_FLOWER=new THREE.Color(0xf2d27a);
/** Colour by rib: the ridge in the light green, the groove between ribs darker; a cream crown at the very top. */
function cactusColour(g:THREE.BufferGeometry,rib:(i:number)=>number,crown:(i:number)=>boolean){
  const n=g.attributes.position.count,col=new Float32Array(n*3),c=new THREE.Color();
  for(let i=0;i<n;i++){crown(i)?c.copy(CACTUS_FLOWER):c.copy(CACTUS_GROOVE).lerp(CACTUS,rib(i));c.toArray(col,i*3);}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;
}
/** The trunk: a lathe with a domed top, pushed out along ribs round its circumference. */
function saguaroTrunk(r:number,h:number){
  const pts:THREE.Vector2[]=[];for(let i=0;i<=14;i++){const t=i/14,y=t*h;pts.push(new THREE.Vector2(r*(1.06-0.1*t),y));}
  for(let i=1;i<=6;i++){const a=i/6*Math.PI/2;pts.push(new THREE.Vector2(r*0.96*Math.cos(a),h+r*0.9*Math.sin(a)));}   // round crown
  const seg=CACTUS_RIBS*4,g=new THREE.LatheGeometry(pts,seg),p=g.attributes.position,ribv=new Float32Array(p.count);
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),a=Math.atan2(z,x),k=0.5+0.5*Math.cos(a*CACTUS_RIBS);ribv[i]=k;const m=1+0.07*(k-0.5)*2;p.setX(i,x*m);p.setZ(i,z*m);}
  g.computeVertexNormals();return cactusColour(g,i=>ribv[i],i=>p.getY(i)>h+r*0.8);
}
/** An arm: a tube out of the trunk that bends up (ribbed the same way), closed by a dome. */
function saguaroArm(curve:THREE.Curve<THREE.Vector3>,r:number){
  const radial=CACTUS_RIBS*3,tube=new THREE.TubeGeometry(curve,20,r,radial,false),p=tube.attributes.position,nrm=tube.attributes.normal,ribv:number[]=[];
  for(let i=0;i<p.count;i++){const j=i%(radial+1),k=0.5+0.5*Math.cos(j/radial*Math.PI*2*CACTUS_RIBS),d=r*0.07*(k-0.5)*2;ribv.push(k);p.setXYZ(i,p.getX(i)+nrm.getX(i)*d,p.getY(i)+nrm.getY(i)*d,p.getZ(i)+nrm.getZ(i)*d);}
  tube.computeVertexNormals();cactusColour(tube,i=>ribv[i],()=>false);
  const tip=curve.getPoint(1),cap=new THREE.SphereGeometry(r*0.98,radial,8,0,Math.PI*2,0,Math.PI/2).translate(tip.x,tip.y,tip.z);
  const cp=cap.attributes.position;cactusColour(cap,i=>0.5+0.5*Math.cos(Math.atan2(cp.getZ(i)-tip.z,cp.getX(i)-tip.x)*CACTUS_RIBS),i=>cp.getY(i)>tip.y+r*0.85);
  return mergeGeometries([tube.index?tube.toNonIndexed():tube,cap.toNonIndexed()])!;
}
/** Two ancient woodland silhouettes, sharing the existing tree collision footprints. */
function spiritTree(willow=false){
  const a=new Sculpt(),bark=material(0x51465d),leaf=material(willow?0x286c69:0x34554f),tips=material(willow?0x57968b:0x65739a),glow=material(0x8eddd0,.55);
  const branch=(points:THREE.Vector3[],radius:number,m:THREE.Material)=>a.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,radius,5,false),m,0,0,0);
  branch([new THREE.Vector3(0,0,0),new THREE.Vector3(-.12,1.5,.04),new THREE.Vector3(.17,3,0),new THREE.Vector3(0,4.9,0)],willow?.24:.31,bark);
  for(let i=0;i<5;i++){
    const t=i*Math.PI*2/5,x=Math.cos(t),z=Math.sin(t),h=3.7+(i%3)*.45;
    branch([new THREE.Vector3(0,2.1,0),new THREE.Vector3(x*.55,3.1,z*.55),new THREE.Vector3(x*1.45,h,z*1.45)],.12,bark);
    a.add(new THREE.SphereGeometry(1,10,7),i%2?leaf:tips,x*1.4,h+.25,z*1.4,1.15,.55,.95);
    // Hanging vines end well above the player's head; roots remain inside the collider.
    branch([new THREE.Vector3(x*.2,.06,z*.2),new THREE.Vector3(x*.4,.12,z*.4),new THREE.Vector3(x*.48,.03,z*.48)],.09,bark);
    for(let j=0;j<2;j++){
      const dx=x*(1.25+j*.35),dz=z*(1.25+j*.35),end=h-(willow?1.6:1);
      branch([new THREE.Vector3(dx,h,dz),new THREE.Vector3(dx+.12,h-.55,dz),new THREE.Vector3(dx-.08,end,dz+.1)],.018,leaf);
      a.add(new THREE.SphereGeometry(.095,7,5),glow,dx-.08,end,dz+.1,.7,1.5,.7);
    }
    a.add(new THREE.SphereGeometry(.18,8,5,0,Math.PI*2,0,Math.PI/2),glow,x*.3,.5+i*.28,z*.3,1,.5,1);
  }
  a.add(new THREE.SphereGeometry(1,10,7),leaf,0,5,0,1.3,.65,1.2);
  return a.finish();
}
function monument(biome:Biome){
  const a=new Sculpt(), wood=material(0x6b4e37),stone=material(0x343139),ice=material(0x96dfff,.35),gold=material(0xc9954f),leaf=material(0x4eaa76,.1),violet=material(0xa277db,.6),fire=material(0xff7828,.9);
  const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>a.add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  if(biome==='forest'){
    const tree=spiritTree(true);tree.scale.setScalar(.88);return tree;
  }else if(biome==='snow'){
    for(let i=0;i<5;i++){const ang=i*2.4;a.add(new THREE.OctahedronGeometry(1),ice,Math.cos(ang)*.6,1.5,Math.sin(ang)*.6,.35,1.5+(i%2)*.7,.35);}
  }else if(biome==='desert'){
    box(gold,0,.25,0,2,.5,2);box(gold,0,1.6,0,1.1,2.5,1.1);a.add(new THREE.ConeGeometry(.85,1.5,4),gold,0,3.6,0);a.add(new THREE.OctahedronGeometry(.35),material(0x46babd,.5),0,2,.59);
  }else if(biome==='volcanic'){
    // A forge beacon contained inside the shared 1.45 m collision radius.
    const iron=material(0x74635b),basalt=material(0x49464a);
    for(let i=0;i<3;i++)a.add(new THREE.CylinderGeometry(1.25-i*.18,1.32-i*.18,.22,8),basalt,0,.11+i*.22,0);
    a.add(new THREE.CylinderGeometry(.64,.48,.75,8),iron,0,1,0);
    a.add(new THREE.CylinderGeometry(.55,.55,.06,12),fire,0,1.39,0);
    for(let i=0;i<6;i++){
      const t=i*Math.PI/3,x=Math.cos(t)*.9,z=Math.sin(t)*.9;
      box(iron,x,1.25,z,.18,1.7,.18);
      a.add(new THREE.ConeGeometry(.2,.55,5),gold,x,2.3,z);
    }
    a.add(new THREE.OctahedronGeometry(.6),fire,0,2,0,.7,1.6,.7);
    a.add(new THREE.OctahedronGeometry(.3),gold,0,2.9,0,.65,1.4,.65);
  }else if(biome==='shadow'){
    const trim=material(0x827594),rune=material(0x77c4cd,.45);
    a.add(new THREE.CylinderGeometry(1.28,1.36,.28,12),stone,0,.14,0);
    a.add(new THREE.CylinderGeometry(1.1,1.2,.16,12),trim,0,.36,0);
    for(const side of [-1,1]){
      box(stone,side*.9,1.7,0,.34,2.5,.42);
      a.add(new THREE.ConeGeometry(.36,1.2,4),trim,side*.9,3.5,0);
      a.add(new THREE.BoxGeometry(.2,1.25,.26),trim,side*.5,3,0,1,1,1,side*.65);
    }
    a.add(new THREE.OctahedronGeometry(.55),violet,0,1.85,0,.8,1.7,.8);
    const ring=new THREE.TorusGeometry(.77,.035,6,32);ring.rotateX(Math.PI/2);a.add(ring,rune,0,.46,0);
    for(let i=0;i<8;i++){const t=i*Math.PI/4;box(rune,Math.cos(t)*1.02,.46,Math.sin(t)*1.02,.09,.025,.16);}
  }else{
    box(stone,0,.2,0,2,.4,2);
    for(const s of [-1,1])a.add(new THREE.ConeGeometry(.45,3.3,5),stone,s*.7,1.85,0);
    a.add(new THREE.OctahedronGeometry(1),fire,0,2,0,.65,1.25,.65);
  }return a.finish();
}
function environment(biome:Biome){
  const a=new Sculpt();
  if(biome==='desert'){
    const green=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.75});
    a.add(saguaroTrunk(0.25,2.6),green,0,0,0);
    for(const s of [-1,1]){const y=1.05+s*.2,h=0.95-s*.15;a.add(saguaroArm(new THREE.CatmullRomCurve3([new THREE.Vector3(s*.12,y,0),new THREE.Vector3(s*.42,y-.04,0),new THREE.Vector3(s*.56,y+.2,0),new THREE.Vector3(s*.58,y+h,0)]),.14),green,0,0,0);}
  }else if(biome==='forest'){
    const stalk=material(0xc7c8a0),cap=material(0x63b9a7,.25);
    for(let i=0;i<3;i++){const x=(i-1)*.45,h=1.2+(i%2)*.8;a.add(new THREE.CylinderGeometry(.12,.2,h,8),stalk,x,h/2,0);a.add(new THREE.SphereGeometry(1,12,8,0,Math.PI*2,0,Math.PI/2),cap,x,h,0,.65,.4,.65);}
  }else if(biome==='shadow'){
    const bark=material(0x44394e),rune=material(0x91a6d9,.3),crystal=material(0xac70ff,.45);
    a.add(new THREE.CylinderGeometry(.12,.3,2.8,7),bark,0,1.4,0,1,1,1,.12);
    for(const side of [-1,1]){
      a.add(new THREE.CylinderGeometry(.035,.12,1.3,6),bark,side*.35,2.2,0,1,1,1,-side*.55);
      a.add(new THREE.CylinderGeometry(.018,.05,.7,5),bark,side*.64,2.8,0,1,1,1,side*.35);
      a.add(new THREE.OctahedronGeometry(.18),crystal,side*.6,1.93,0,.65,1.5,.65);
      a.add(new THREE.CylinderGeometry(.025,.1,.7,5),bark,side*.26,.18,0,1,1,1,side*1.1);
    }
    for(let i=0;i<3;i++)a.add(new THREE.OctahedronGeometry(.2),i%2?rune:crystal,(i-1)*.25,.25,.35,.7,1.5,.7);
  }else if(biome==='volcanic'){
    const basalt=material(0x35383c),ash=material(0x68615a),heat=material(0xe8460c,1.5);
    // Uneven hexagonal basalt columns, with glowing seams below the cooled crust.
    for(let i=0;i<7;i++){
      const t=i*2.399, r=i? .4+ i*.085:0,h=.55+(Math.sin(i*7.1)*.5+.5)*1.65;
      const x=Math.cos(t)*r,z=Math.sin(t)*r;
      a.add(new THREE.CylinderGeometry(.23,.31,h,6),i%3?basalt:ash,x,h/2,z);
      a.add(new THREE.CylinderGeometry(.245,.26,.035,6),heat,x,.09,z);
    }
    for(let i=0;i<5;i++)a.add(new THREE.DodecahedronGeometry(.24,1),basalt,Math.sin(i*3)*1.1,.12,Math.cos(i*3)*1.1,1,.5,.8);
  }else{
    const m=material(biome==='snow'?0x9edff1:0x363036,biome==='snow'?.2:0);
    for(let i=0;i<4;i++)a.add(new THREE.ConeGeometry(.5,2.7+i*.2,5),m,(i-1.5)*.3,1.3,Math.sin(i)*.3);

  }return a.finish();
}
function desertHouse(){
  const a=new Sculpt(),sand=material(0xc9a36d),gold=material(0xa87935),dark=material(0x44352d);
  a.add(new THREE.BoxGeometry(3.3,2.8,3.6),sand,0,1.4,0);
  a.add(new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI/2),gold,0,2.8,0,1.8,1.3,1.8);
  a.add(new THREE.BoxGeometry(.9,1.8,.08),dark,0,.9,1.84);
  for(const x of [-1.8,1.8]){a.add(new THREE.CylinderGeometry(.23,.28,4.3,8),sand,x,2.15,1.3);a.add(new THREE.ConeGeometry(.44,.7,8),gold,x,4.5,1.3);}
  return a.finish();
}
/** Each biome has its own structure, roof profile, entrance and workshop details. */
export function regionalHouse(biome:Biome, tavern=false) {
  if(biome==='desert')return desertHouse();
  const a=new Sculpt(), timber=material(0x634832), glass=material(biome==='shadow'?0xb182ee:biome==='volcanic'?0xff943b:0xf0cc87,.3);
  const box=(m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number)=>a.add(new THREE.BoxGeometry(w,h,d),m,x,y,z);
  if(biome==='forest') {
    const wall=material(0x9a7549),leaf=material(0x346847),leafLight=material(0x608150);
    for(const x of [-1.25,1.25])for(const z of [-1.2,1.2])a.add(new THREE.CylinderGeometry(.16,.23,.7,8),timber,x,.35,z);
    box(timber,0,.65,0,3.5,.25,3.4);
    a.add(new THREE.CylinderGeometry(1.5,1.6,2.35,10),wall,0,1.93,0);
    for(let i=0;i<10;i++){const angle=i*Math.PI/5;a.add(new THREE.CylinderGeometry(.08,.09,2.4,6),timber,Math.cos(angle)*1.55,1.9,Math.sin(angle)*1.55);}
    for(let i=0;i<3;i++)a.add(new THREE.ConeGeometry(2.15-i*.4,1.5,10),i%2?leafLight:leaf,0,3.5+i*.65,0);
    for(let i=0;i<5;i++)box(timber,(i-2)*.14,1.45,1.58,.022,1.5,.035);
    box(timber,0,1.45,1.52,.85,1.55,.1);for(const x of [-.9,.9])box(glass,x,2,1.35,.38,.55,.1);
    for(let i=0;i<3;i++)box(wall,0,.12+i*.18,2.1-i*.25,1.15,.23,.6);
    for(const x of [-1.7,1.7])a.add(new THREE.SphereGeometry(.4,9,6),leaf,x,.85,1.2);
  } else if(biome==='snow') {
    const logs=material(0x747782),snow=material(0xe8f1ee),roof=material(0x4e6680),stone=material(0x969e9f);
    box(stone,0,.4,0,3.5,.8,3.6);
    for(let i=0;i<6;i++)for(const z of [-1.6,1.6]){const g=new THREE.CylinderGeometry(.17,.17,3.5,8);g.rotateZ(Math.PI/2);a.add(g,logs,0,.9+i*.32,z);}
    box(logs,-1.6,1.8,0,.2,2.4,3.3);box(logs,1.6,1.8,0,.2,2.4,3.3);
    for(const side of [-1,1]){a.add(new THREE.BoxGeometry(2.7,.2,4.2),roof,side*.94,3.42,0,1,1,1,-side*.82);a.add(new THREE.BoxGeometry(2.8,.15,4.3),snow,side*.94,3.57,0,1,1,1,-side*.82);}
    box(timber,0,1.28,1.8,.9,1.75,.12);for(const x of [-1.05,1.05])box(glass,x,1.9,1.78,.42,.55,.08);
    box(stone,1.05,3.8,-.6,.55,2.1,.6);
    for(const x of [-1.05,1.05]){
      box(timber,x,1.9,1.84,.5,.045,.07);box(timber,x,1.9,1.84,.045,.63,.07);
      box(snow,x,2.23,1.82,.59,.10,.22);box(timber,x,1.56,1.82,.60,.09,.22);
    }
    // Rounded roof snow, beam ends and front foundation banks.
    for(const side of [-1,1]){
      for(let i=0;i<5;i++)a.add(new THREE.SphereGeometry(1,10,6),snow,side*1.87,2.53,-1.65+i*.82,.23,.12,.46);
      a.add(new THREE.SphereGeometry(1,10,6),snow,side*1.28,.18,1.68,.66,.23,.48);
      box(timber,side*1.45,1.67,1.80,.1,1.85,.08);
    }
    for(let i=0;i<5;i++)box(timber,0,.56+i*.27,1.87,.76,.025,.05);
    box(material(0x967d4f),.26,1.25,1.90,.07,.07,.05);
    for(let i=0;i<7;i++)a.add(new THREE.ConeGeometry(.045,.4+(i%3)*.12,5),snow,-1.7+i*.55,2.45,2.04,1,-1,1);
  } else if(biome==='volcanic') {
    const stone=material(0x3d383d),iron=material(0x6f5650),lava=material(0xff651b,.8);
    // Offset stone courses and soot-dark roof coping break up the flat block silhouette.
    for(let row=0;row<6;row++)for(let col=0;col<7;col++){
      const x=-1.53+col*.51+(row%2)*.12;
      if(Math.abs(x)>.8||row>4)box(row%2?stone:iron,x,.28+row*.43,1.77,.47,.39,.12);
    }
    box(stone,0,1.35,0,3.6,2.7,3.5);box(iron,0,2.8,0,4,.35,3.9);
    for(const x of [-1.5,1.5])for(const z of [-1.5,1.5]){box(iron,x,1.7,z,.4,3.4,.4);a.add(new THREE.ConeGeometry(.35,.8,4),stone,x,3.8,z);}
    // Riveted chimney bands and a sheltered furnace mouth.
    for(const y of [2.9,3.6,4.3])box(iron,1,y,-1,.9,.12,.9);
    for(const x of [-1.5,1.5])for(const y of [.55,1.3,2.05])a.add(new THREE.SphereGeometry(.065,6,4),iron,x,y,1.84);
    box(iron,0,2.2,1.93,1.65,.18,.5);
    for(const x of [-.62,.62])box(iron,x,1.1,1.89,.12,2,.16);
    box(iron,1,3.6,-1,.8,2.1,.8);box(lava,1,4.69,-1,.55,.04,.55);
    box(material(0x161319),0,1.1,1.8,1.4,2,.07);a.add(new THREE.TorusGeometry(.48,.09,7,16),iron,-1.05,1.5,1.8);a.add(new THREE.CircleGeometry(.39,16),lava,-1.05,1.5,1.82);
    for(let i=0;i<5;i++)box(stone,-1.6+i*.8,3.06,0,.68,.18,3.8);
    for(const x of [-1.6,1.6])box(lava,x,1.2,1.79,.035,2.3,.02);
    for(const side of [-1,1]){
      box(iron,side*1.82,.2,0,.3,.4,3.5);
      for(let i=0;i<4;i++){
        box(iron,side*1.82,1.35,-1.2+i*.8,.18,2.3,.17);
        box(lava,side*1.811,1.65,-.8+i*.42,.025,.55,.15);
      }
    }
  } else {
    const stone=material(0x635671),roof=material(0x302b45),trim=material(0x928199);
    box(stone,0,1.6,0,2.8,3.2,3.1);a.add(new THREE.ConeGeometry(2.3,2.2,4),roof,0,4.2,0,1,1,1,0);
    for(const x of [-1.45,1.45]){a.add(new THREE.CylinderGeometry(.31,.43,3.8,8),stone,x,1.9,1.2);a.add(new THREE.ConeGeometry(.6,2.2,8),roof,x,4.6,1.2);a.add(new THREE.OctahedronGeometry(.17),glass,x,5.9,1.2);}
    box(material(0x251e32),0,1.2,1.58,.85,2.25,.1);
    for(const x of [-.88,.88]){box(glass,x,2,1.58,.30,.95,.07);a.add(new THREE.ConeGeometry(.25,.45,3),glass,x,2.64,1.62);}
    box(trim,0,.15,1.9,1.4,.3,.7);
    // Pointed stone entrance, rose window and side buttresses.
    for(const side of [-1,1]){
      box(trim,side*.52,1.18,1.66,.13,2.2,.17);
      a.add(new THREE.BoxGeometry(.13,.86,.17),trim,side*.26,2.55,1.66,1,1,1,side*.66);
      for(const z of [-1.1,.35]){
        box(trim,side*1.43,1.3,z,.19,2.6,.24);
        a.add(new THREE.ConeGeometry(.22,.65,4),roof,side*1.43,2.93,z);
        box(glass,side*1.411,1.85,z+.37,.025,.75,.24);
      }
      box(trim,side*.88,1.48,1.65,.48,.1,.23);
      box(roof,side*.88,2.03,1.68,.045,.98,.045);
    }
    a.add(new THREE.CircleGeometry(.32,12),glass,0,3.1,1.59);
    a.add(new THREE.TorusGeometry(.34,.055,6,12),trim,0,3.1,1.63);
    box(roof,0,3.1,1.66,.045,.6,.04);box(roof,0,3.1,1.66,.6,.045,.04);
    for(let i=0;i<4;i++)box(trim,0,.36+i*.09,-1.56,2.8,.035,.04);
  }
  const obj=a.finish(); if(tavern)obj.scale.set(1.08,1.05,1.08);return obj;
}
export function buildRealmKit(base:Record<string,THREE.Group>){
  const result:Record<string,THREE.Group>={};
  for(const city of CITIES.slice(1)){
    for(const [name,src]of Object.entries(base)){
      const custom=['SM_House_Stone','SM_House_Stone2','SM_Tavern'].includes(name);
      const obj=custom?regionalHouse(city.biome,name==='SM_Tavern'):src.clone(true);
      if(!custom)obj.traverse(n=>{if(n instanceof THREE.Mesh){
        const tint=(mat:THREE.Material)=>{const m=mat.clone() as THREE.MeshStandardMaterial;if(m.color){
          const tint=city.biome==='volcanic'?0x493638:city.biome==='shadow'?0x635070:city.biome==='snow'?0xc4e4f2:city.biome==='forest'?0x76956e:0xd3b17c;
          m.color.lerp(new THREE.Color(tint),.52);
          
        }return city.biome==='snow'?(/Tree|Bush/.test(name)?snowSurface(m,-.10,.35,.99,m.side===THREE.DoubleSide):snowSurface(m)):m;};
        // foliage: snow on every tier
        n.material=Array.isArray(n.material)?n.material.map(tint):tint(n.material);
      }});
      if(city.biome==='snow' && /^(SM_Tree_Round|SM_Tree_Pine|SM_Bush)$/.test(name))addVegetationSnow(obj,name);
      result[`${city.biome}:${name}`]=obj;
    }
    if(city.biome==='forest'){
      result['forest:SM_Tree_Round']=spiritTree();
      result['forest:SM_Tree_Pine']=spiritTree(true);
    }
    result[`${city.biome}:landmark`]=monument(city.biome);
    result[`${city.biome}:decor`]=environment(city.biome);
  }
  return result;
}
