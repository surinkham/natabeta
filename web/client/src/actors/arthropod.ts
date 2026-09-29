import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type V = [number, number, number];
type Limb = { pivot: THREE.Group; side: number; index: number };
type Anatomy = { root: THREE.Group; legs: Limb[]; claws: THREE.Group[]; fingers: THREE.Group[]; tail: THREE.Group[]; time: number; stride: number; death: number; attack: number; attacking: boolean };
const bodies = new WeakMap<THREE.Object3D, Anatomy>();
const templates = new Map<string, { root: THREE.Group }>();
const shellMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .49, metalness: .06 });
const up = new THREE.Vector3(0, 1, 0);
const vector = (p: V) => new THREE.Vector3(...p);
const shell = 0x745031, ridge = 0xb58b51, joint = 0x342b23, tip = 0x201e19;

/** Merge each articulated part to one draw call; templates share all geometry/materials. */
export class Part {
  pieces: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number) {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv');
    const c = new THREE.Color(color), p = g.getAttribute('position'), colors = [];
    for (let i=0;i<p.count;i++) {
      const grain = .93 + .07 * Math.sin(p.getX(i)*173 + p.getY(i)*239 + p.getZ(i)*191);
      colors.push(c.r*grain,c.g*grain,c.b*grain);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.pieces.push(g);
  }
  oval(center: V, scale: V, color = shell, segments = 12) {
    const g=new THREE.SphereGeometry(1,segments,8);g.scale(...scale);g.translate(...center);this.add(g,color);
  }
  link(a: V,b: V,r1:number,r2:number,color=shell) {
    const delta=vector(b).sub(vector(a));
    const g=new THREE.CylinderGeometry(r2,r1,delta.length(),8,1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,delta.clone().normalize()));
    g.translate(...vector(a).add(vector(b)).multiplyScalar(.5).toArray() as V);this.add(g,color);
  }
  curve(points: V[], radius:number,color=shell) {
    const path=new THREE.CatmullRomCurve3(points.map(vector));
    const g=new THREE.TubeGeometry(path,12,radius,7,false), p=g.getAttribute('position');
    // Taper toward the tip, retaining the smooth curved centerline.
    for(let i=0;i<=12;i++) { const center=path.getPointAt(i/12), taper=1-.96*Math.pow(i/12,1.7);
      for(let j=0;j<=7;j++){const k=i*8+j;const v=new THREE.Vector3().fromBufferAttribute(p,k).sub(center).multiplyScalar(taper).add(center);p.setXYZ(k,v.x,v.y,v.z);}}
    g.computeVertexNormals();this.add(g,color);
  }
  mesh(parent:THREE.Object3D,name:string,material:THREE.Material=shellMaterial) {
    const g=mergeGeometries(this.pieces)!;const m=new THREE.Mesh(g,material);m.name=name;m.receiveShadow=true;
    parent.add(m);this.pieces.forEach(p=>p.dispose());return m;
  }
}
export function pivot(parent:THREE.Object3D,name:string,position:V) { const g=new THREE.Group();g.name=name;g.position.set(...position);parent.add(g);return g; }
function build(kind:'scorpion'|'scarab') {
  const root=new THREE.Group();root.name='arthropod-body';
  const body=new Part(), scorpion=kind==='scorpion';
  if(scorpion) {
    body.oval([0,.265,-.13],[.205,.105,.40],joint);
    body.oval([0,.285,.20],[.23,.115,.225]); // prosoma / carapace
    // Seven overlapping abdominal tergites with dark flexible seams and raised ridges.
    for(let i=0;i<7;i++) {
      const z=-.005-i*.077, width=.205*(1-.40*Math.pow(i/6,2));
      body.oval([0,.28,z],[width,.10,.059],i%2?shell:0x815937);
      for(const side of [-1,1])body.link([side*width*.72,.343,z-.025],[side*width*.72,.345,z+.027],.009,.007,ridge);
    }
    for(const s of [-1,1]) {
      body.oval([s*.042,.393,.20],[.021,.015,.02],tip);
      for(let i=0;i<3;i++)body.oval([s*(.155+i*.014),.349,.30-i*.025],[.008,.008,.008],tip,8);
      body.curve([[s*.045,.245,.37],[s*.065,.23,.43],[s*.025,.225,.46]],.025,joint);
    }
  } else {
    body.oval([0,.265,-.06],[.28,.19,.42],joint);
    for(const s of [-1,1]) {
      body.oval([s*.127,.30,-.13],[.147,.185,.335],0x736641);
      for(let i=0;i<5;i++)body.link([s*(.036+i*.043),.445-i*.018,-.35],[s*(.037+i*.043),.445-i*.018,.06],.004,.004,0xa29561);
    }
    body.oval([0,.27,.27],[.235,.135,.16],0x52472d);
    body.oval([0,.245,.40],[.135,.085,.10],joint);
    body.curve([[0,.31,.41],[0,.43,.47],[0,.51,.54],[0,.52,.62]],.036,0x574729);
    for(const s of [-1,1]) {body.oval([s*.111,.29,.425],[.016,.016,.016],tip);body.curve([[s*.09,.25,.43],[s*.18,.28,.50],[s*.23,.31,.54]],.009,joint);}
  }
  body.mesh(root,'arthropod-carapace');
  const legCount=scorpion?4:3;
  for(const s of [-1,1])for(let i=0;i<legCount;i++) {
    const z=.24-i*.095, sweep=.32-i*(scorpion?.22:.30);
    const g=pivot(root,'arthropod-leg-'+s+'-'+i,[s*.17,.255,z]), part=new Part();
    const a:V=[0,0,0],b:V=[s*.18,.03,sweep*.30],c:V=[s*.37,-.08,sweep*.65],d:V=[s*.50,-.24,sweep];
    part.oval(a,[.048,.043,.047],joint);part.link(a,b,.039,.027);part.oval(b,[.033,.033,.033],joint);
    part.link(b,c,.031,.019);part.oval(c,[.023,.024,.023],joint);part.link(c,d,.018,.005,ridge);
    part.curve([d,[d[0]+s*.035,d[1]-.005,d[2]+.025],[d[0]+s*.052,d[1],d[2]+.06]],.007,tip);
    part.mesh(g,'arthropod-leg-shell');
  }
  if(scorpion) {
    for(const s of [-1,1]) {
      const g=pivot(root,'arthropod-claw-'+s,[s*.19,.28,.33]), part=new Part();
      part.link([0,0,0],[s*.18,-.012,.17],.055,.042);part.oval([s*.18,-.012,.17],[.055,.044,.052],joint);
      part.link([s*.18,-.012,.17],[s*.27,-.025,.35],.045,.064);
      part.oval([s*.28,-.022,.39],[.105,.066,.14]);
      part.curve([[s*.34,-.02,.44],[s*.37,-.018,.56],[s*.31,-.01,.67],[s*.27,-.005,.69]],.043);
      for(let i=0;i<3;i++)part.oval([s*.29,.044,.33+i*.055],[.025,.012,.019],ridge,8);
      part.mesh(g,'arthropod-pedipalp');
      const finger=pivot(g,'arthropod-finger-'+s,[s*.21,-.021,.44]);const f=new Part();
      f.curve([[0,0,0],[-s*.035,0,.11],[s*.006,.006,.20],[s*.05,.012,.25]],.032);f.mesh(finger,'arthropod-pincer');
    }
    const points:V[]=[[0,.26,-.52],[0,.38,-.70],[0,.61,-.78],[0,.84,-.68],[0,.98,-.45],[0,.965,-.19]];
    let parent:THREE.Object3D=root;
    for(let i=0;i<5;i++) {
      const origin=i===0?points[0]:vector(points[i]).sub(vector(points[i-1])).toArray() as V;
      const g=pivot(parent,'arthropod-tail-'+i,origin), part=new Part(),end=vector(points[i+1]).sub(vector(points[i])).toArray() as V;
      const radius=.065-i*.004;
      part.oval([0,0,0],[radius*.94,radius*.88,radius*.94],joint);
      part.link([0,0,0],end,radius,radius*.86);
      for(const s of [-1,1])part.link([s*radius*.68,.015,0],[end[0]+s*radius*.59,end[1]+.015,end[2]],.009,.008,ridge);
      if(i===4) {
        part.oval([0,end[1]-.015,end[2]+.065],[.063,.063,.093],0x654326);
        part.curve([[0,end[1]-.025,end[2]+.11],[0,end[1]-.09,end[2]+.20],[0,end[1]-.21,end[2]+.22]],.028,tip);
      }
      part.mesh(g,'arthropod-tail-segment');parent=g;
    }
  }
  return root;
}

export function createArthropod(kind:'scorpion'|'scarab',owner:THREE.Object3D,tint?:number) {
  // This is its own local-space anatomy, not a decoration stretched over a mammal.
  const key=kind+':'+tint;let template=templates.get(key);if(!template){template={root:build(kind)};
    if(tint!==undefined){const material=shellMaterial.clone();material.color.set(tint).lerp(new THREE.Color(0xffffff),.70);template.root.traverse(n=>{if(n instanceof THREE.Mesh)n.material=material;});}
    templates.set(key,template);}
  const root=template.root.clone(true), legs:Limb[]=[],claws:THREE.Group[]=[],fingers:THREE.Group[]=[],tail:THREE.Group[]=[];
  root.traverse(n=>{if(!(n instanceof THREE.Group))return;const m=n.name.match(/^arthropod-leg-(-?1)-(\d)$/);if(m)legs.push({pivot:n,side:Number(m[1]),index:Number(m[2])});
    if(/^arthropod-claw-/.test(n.name))claws.push(n);if(/^arthropod-finger-/.test(n.name))fingers.push(n);if(/^arthropod-tail-/.test(n.name))tail.push(n);});
  owner.add(root);bodies.set(owner,{root,legs,claws,fingers,tail,time:0,stride:0,death:0,attack:0,attacking:false});return root;
}

/** Same controller runs in the game and bestiary, including attacks, death and revival. */
export function updateArthropod(owner:THREE.Object3D,dt:number,moving:boolean,busy:string|undefined,dead:boolean) {
  const a=bodies.get(owner);if(!a)return;
  a.time+=dt;a.death=THREE.MathUtils.damp(a.death,dead?1:0,8,dt);
  a.stride=THREE.MathUtils.damp(a.stride,moving&&!dead?1:0,10,dt);
  const attacking=!!busy && /Attack|Slash|Bash|Cast/.test(busy)&&!dead;
  if(attacking&&!a.attacking)a.attack=0;a.attacking=attacking;
  a.attack=attacking?Math.min(1,a.attack+dt/0.8):0;
  const strike=attacking?Math.sin(a.attack*Math.PI):0;
  a.root.position.y=-.16*a.death+Math.sin(a.time*14)*.006*a.stride;
  a.root.rotation.z=.22*a.death;
  for(const l of a.legs) {
    const phase=a.time*11+l.index*Math.PI+(l.side<0?Math.PI:0);
    l.pivot.rotation.y=Math.sin(phase)*.20*a.stride;
    l.pivot.rotation.z=l.side*(Math.max(0,Math.cos(phase))*.14*a.stride+.65*a.death);
  }
  a.claws.forEach((g,i)=>{g.rotation.y=(i===0?-1:1)*(Math.sin(a.time*1.7)*.018+strike*.16);g.rotation.x=-strike*.09;});
  a.fingers.forEach((g,i)=>{g.rotation.y=(i===0?1:-1)*(.10+Math.sin(a.time*2)*.06+strike*.30);});
  a.tail.forEach((g,i)=>{g.rotation.x=(i===0?.60:.08)*strike-(i===0?.35:0)*a.death;g.rotation.z=Math.sin(a.time*1.5-i*.3)*.015*(1-a.death);});
}
