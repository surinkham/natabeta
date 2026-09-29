import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEMS } from '@shared/data';
import { PALETTES, themeOf, insignia } from './style';
const cache=new Map<string,THREE.Group>();
type V=[number,number,number];
/** Authored profiles, in metres: the grip is the origin in every weapon. */
export function createWeapon(id:string):THREE.Group {
 const old=cache.get(id);if(old)return old.clone(true);
 const def=ITEMS[id],theme=themeOf(id),[base,dark,accent]=PALETTES[theme],root=new THREE.Group();root.name='designed-'+id;
 const parts:THREE.BufferGeometry[][]=[[],[],[]];
 function add(g:THREE.BufferGeometry,c:number,layer=0){g=g.index?g.toNonIndexed():g;g.deleteAttribute('uv');const color=new THREE.Color(c),n=g.getAttribute('position').count;g.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:n},()=>[color.r,color.g,color.b]).flat(),3));parts[layer].push(g);}
 function rod(a:V,b:V,r:number,c:number,r2=r,layer=0){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const g=new THREE.CylinderGeometry(r2,r,d.length(),8);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate(...av.add(bv).multiplyScalar(.5).toArray() as V);add(g,c,layer);}
 function gem(p:V,s:V,c=accent){const g=new THREE.OctahedronGeometry(1);g.scale(...s);g.translate(...p);add(g,c,2);}
 function plate(points:number[][],depth:number,c:number,z=0){const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(...p as [number,number])));const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.003,bevelThickness:.002,bevelSegments:1,steps:1});g.translate(0,0,z-depth/2);add(g,c);}
 function curve(points:V[],r:number,c:number,layer=0){add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,6,false),c,layer);}
 function ring(p:V,r:number,t:number,c:number){const g=new THREE.TorusGeometry(r,t,6,24);g.translate(...p);add(g,c);}
 const divine=id.startsWith('DIVINE_'),sig=insignia(id);
 const isShield=def?.slot==='OffHand';
 if(isShield){
  const tower=id==='TOWER_SHIELD',outline=tower?[[-.13,.20],[.13,.20],[.145,-.14],[.09,-.22],[-.09,-.22],[-.145,-.14]]:[[-.14,.14],[0,.20],[.14,.14],[.12,-.07],[0,-.22],[-.12,-.07]];
  plate(outline,.036,accent);plate(outline.map(([x,y])=>[x*.87,y*.89]),.02,dark,.029);
  if(tower){for(const x of [-.07,.07])rod([x,-.16,.052],[x,.15,.052],.009,base);plate([[-.06,.07],[0,.12],[.06,.07],[.035,-.08],[0,-.13],[-.035,-.08]],.012,base,.055);}
  else{plate([[-.07,.065],[0,.025],[.07,.065],[.035,-.015],[0,-.06],[-.035,-.015]],.015,accent,.055);gem([0,.015,.078],[.025,.04,.012]);}
  for(const [x,y] of outline)gem([x*.84,y*.84,.049],[.007,.007,.006],base);
 }else if(def?.weapon==='bow'){
  const long=id==='LONGBOW', storm=theme==='storm',leaf=theme==='grove',h=long?.37:.30;
  for(const s of [-1,1]){
   const points:V[]=[[0,0,0],[.075,s*h*.38,0],[.065,s*h*.76,0],[-.035,s*h,0]];
   curve(points,.015,base);curve(points.map(([x,y,z])=>[x+.015,y,z]),.005,accent);
   if(storm||leaf){plate([[.035,s*.10],[.125,s*.18],[.083,s*.20],[.12,s*.28],[.048,s*.24]],.019,storm?accent:base);}
   rod([-.035,s*h,0],[-.065,0,0],.0025,0xe8e3cb,undefined,1);
  }
  rod([0,-.047,0],[0,.047,0],.023,dark);for(let i=0;i<5;i++)ring([0,-.032+i*.016,0],.022,.0025,accent);
  if(id==='GEAR_MEADOW'){for(const s of [-1,1])gem([.09,s*.2,.01],[.022,.032,.012],0xffda77);}
  if(storm)gem([.065,0,0],[.034,.06,.024]);
 }else if(def?.weapon==='staff'){
  rod([0,-.28,0],[0,.46,0],.015,dark,.011);for(const y of [-.23,-.05,.10,.38]){rod([0,y-.012,0],[0,y+.012,0],.020,accent);}
  const voided=theme==='void', fire=theme==='ember';
  if(voided){ring([0,.55,0],.105,.013,base);ring([0,.55,.008],.076,.004,accent);gem([0,.55,0],[.043,.070,.032]);for(const s of [-1,1])plate([[s*.075,.54],[s*.145,.66],[s*.07,.62],[s*.04,.70],[s*.035,.57]],.02,base);}
  else if(fire){for(const s of [-1,1])curve([[0,.41,0],[s*.075,.49,0],[s*.08,.59,0],[s*.025,.68,0]],.016,base);gem([0,.55,0],[.047,.105,.037],0xff8b31);gem([0,.57,.03],[.02,.065,.02],0xffeaaa);}
  else if(id==='APPRENTICE_STAFF'){curve([[0,.42,0],[.05,.50,0],[.04,.59,0],[-.035,.62,0],[-.06,.55,0]],.019,0x9b744e);gem([0,.54,0],[.026,.045,.026]);}
  else{ring([0,.55,0],.088,.009,accent);for(const s of [-1,1])rod([0,.40,0],[s*.075,.57,0],.012,base);gem([0,.56,0],[.048,.084,.035]);gem([0,.70,0],[.016,.026,.014]);}
  if(id==='GEAR_ECLIPSE')ring([0,.55,0],.135,.004,0xf0cc83);
 }else{
  const wood=id==='WOODEN_SWORD',fang=theme==='fang',frost=theme==='frost',fire=theme==='ember',alpha=id==='ALPHA_FANG_BLADE';
  const L=wood?.34:alpha?.52:.44;
  const profile=wood?[[-.021,.045],[-.021,L-.025],[0,L],[.021,L-.025],[.021,.045]]:
   fang?[[-.028,.045],[-.033,.22],[-.021,.34],[.041,L],[.052,.26],[.038,.09]]:
   frost?[[-.027,.045],[-.039,.19],[-.019,.18],[-.048,.32],[0,L+.035],[.047,.28],[.018,.29],[.033,.14],[.026,.045]]:
   fire?[[-.026,.045],[-.047,.18],[-.015,.16],[-.043,.29],[-.006,.27],[.016,L],[.052,.31],[.031,.22],[.054,.20],[.027,.045]]:
   alpha?[[-.04,.045],[-.059,.23],[-.03,.22],[-.041,.38],[0,L],[.06,.35],[.039,.14],[.04,.045]]:
   [[-.025,.045],[-.027,L-.075],[0,L],[.027,L-.075],[.025,.045]];
  plate(profile,.016,wood?base:theme==='iron'?0xc9dce9:base);
  plate([[0,.065],[-.007,L*.65],[0,L-.025],[.008,L*.65]],.004,wood?0xd6ad72:accent,.013);
  rod([0,-.052,0],[0,.035,0],.017,dark);for(let i=0;i<5;i++)rod([-.014,-.042+i*.015,.013],[.014,-.034+i*.015,.013],.003,wood?base:accent);
  curve([[-.073,.02,0],[-.039,.042,0],[0,.032,0],[.039,.042,0],[.073,.02,0]],.009,wood?dark:accent);
  gem([0,-.066,0],[.022,.020,.018],wood?dark:accent);
  if(!wood&&id!=='IRON_SWORD')gem([0,.034,.02],[.016,.023,.008]);
  if(fang||alpha)for(const s of [-1,1])plate([[s*.03,.035],[s*.08,.065],[s*.06,.01]],.016,0xe9d9af);
  if(id==='GEAR_CINDER'){for(const s of [-1,1])plate([[s*.03,.06],[s*.105,.11],[s*.08,-.005]],.02,accent);}
 }
 if(divine){
  const y=isShield?0:def.weapon==='staff'?.53:def.weapon==='bow'?0:.05;
  const radius=isShield?.08:def.weapon==='staff'?.10:.055;
  ring([0,y,.035],radius,.004,0xf0ce82);
  for(let i=0;i<8;i++)if((sig>>>i)&1){const a=i*Math.PI/4;gem([Math.cos(a)*radius,y+Math.sin(a)*radius,.045],[.009,.017,.008],0xf0ce82);}
 }
 for(let i=0;i<parts.length;i++){if(!parts[i].length)continue;const g=mergeGeometries(parts[i])!;parts[i].forEach(p=>p.dispose());const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:i===1?.9:theme==='wood'?.64:.32,metalness:i===1?0:.58,emissive:i===2?accent:0,emissiveIntensity:i===2?.28:0});const mesh=new THREE.Mesh(g,mat);mesh.name='weapon-detail-'+i;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
 cache.set(id,root);return root.clone(true);
}
