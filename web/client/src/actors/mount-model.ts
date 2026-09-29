import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const sources = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D>>();
/** Shared, bone-attached detailing for the equipment portrait and the live mount. */
export function mountModel(source: THREE.Object3D, kind: string): THREE.Object3D {
  // the dragon GLB (work/blender/build_dragon.py) now carries its own wings, horns, spikes and saddle gear; this
  // overlay's navy membranes and second saddle would sit on top of them, so the dragon is used as modelled
  if (kind === 'dragon') { const d = clone(source); d.traverse((n: any) => { if (n.isMesh) n.material = n.material.clone(); }); return d; }
  let variants=sources.get(source); if(!variants){variants=new Map();sources.set(source,variants);}
  const cached=variants.get(kind); if(cached)return clone(cached);
  const root=clone(source); root.updateMatrixWorld(true);
  const mat=(color:number,roughness=.65,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const horn=mat(0xd8c3a0), iron=mat(0x344656,.38,.65),gold=mat(0xb69a58,.4,.55),leather=mat(0x342a24),cloth=mat(kind==='dragon'?0x304a55:0x223849);
  function add(geo:THREE.BufferGeometry,m:THREE.Material,pos:THREE.Vector3,bone='spine'){
    const mesh=new THREE.Mesh(geo,m);mesh.position.copy(pos);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);root.updateMatrixWorld(true);
    const socket=root.getObjectByName(bone);if(socket)socket.attach(mesh);return mesh;
  }
  function line(points:number[][],radius:number,m:THREE.Material,bone='spine'){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])));
    return add(new THREE.TubeGeometry(curve,12,radius,7,false),m,new THREE.Vector3(),bone);
  }
  const seat=kind==='dragon'?.70:.645;
  const pad=new THREE.SphereGeometry(1,20,12);pad.scale(.19,.035,.22);add(pad,cloth,new THREE.Vector3(0,seat-.02,0));
  const saddle=new THREE.SphereGeometry(1,20,12);saddle.scale(.13,.035,.15);add(saddle,leather,new THREE.Vector3(0,seat+.014,0));
  for(const z of [-.14,.14])line([[-.12,seat+.02,z],[0,seat+.065,z],[.12,seat+.02,z]],.023,gold);
  for(const s of [-1,1]){
    line([[s*.13,seat,0],[s*.19,seat-.12,0],[s*.16,seat-.23,.015]],.012,leather);
    const stirrup=new THREE.TorusGeometry(.035,.007,6,16);add(stirrup,iron,new THREE.Vector3(s*.17,seat-.23,.015));
  }
  if(kind==='dragon'){
    const scale=mat(0x244e50,.53,.12),membrane=mat(0x394853,.8),edge=mat(0x17373e,.55);
    membrane.side=THREE.DoubleSide;
    // Swept, scalloped wings supported by visible finger bones; they follow the GLB wing animation.
    for(const s of [-1,1]){
      const pts=[[.12,.69,.06],[.39,.94,.12],[.86,1.02,-.15],[.72,.78,-.32],[.62,.69,-.57],[.38,.62,-.41],[.19,.59,-.34]];
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pts.flatMap(([x,y,z])=>[s*x,y,z]),3));
      geo.setIndex(s>0?[0,1,2,0,2,3,0,3,4,0,4,5,0,5,6]:[0,2,1,0,3,2,0,4,3,0,5,4,0,6,5]);geo.computeVertexNormals();
      const bone=s>0?'wing_l':'wing_r';add(geo,membrane,new THREE.Vector3(),bone);
      for(const end of [2,4,6])line([pts[0],pts[1],pts[end]].map(([x,y,z])=>[s*x,y,z]),.018,edge,bone);
      line([[s*.075,1.00,.39],[s*.115,1.10,.29],[s*.12,1.13,.19]],.027,horn,'head');
      const spike=new THREE.ConeGeometry(.034,.15,9);spike.rotateX(-.7);add(spike,horn,new THREE.Vector3(s*.13,.89,.30),'head');
      for(let i=0;i<3;i++){const claw=new THREE.ConeGeometry(.015,.068,8);claw.rotateX(Math.PI/2);add(claw,horn,new THREE.Vector3(s*.11+(i-1)*.03,.045,.39),s>0?'fore_l':'fore_r');}
    }
    for(let i=0;i<5;i++){const g=new THREE.ConeGeometry(.042-i*.004,.13-i*.012,8);g.rotateX(-.35);add(g,scale,new THREE.Vector3(0,.64-i*.038,-.23-i*.105),i<2?'spine':'tail1');}
    for(let i=0;i<4;i++){const g=new THREE.SphereGeometry(1,12,8);g.scale(.095-i*.008,.07,.024);add(g,horn,new THREE.Vector3(0,.67+i*.062,.30+i*.025),'neck');}
  }else{
    const mane=mat(0x29201b,.95);
    for(let i=0;i<8;i++)line([[0,.96-i*.037,.33-i*.026],[.018,.98-i*.04,.27-i*.024],[.035,.9-i*.04,.23-i*.024]],.024,mane,'neck');
    for(const s of [-1,1]){
      line([[s*.075,.94,.44],[s*.10,.86,.52],[s*.075,.80,.59]],.009,leather,'head');
      line([[s*.085,.84,.55],[s*.19,.76,.28],[s*.13,seat+.04,.09]],.007,leather);
      const plate=new THREE.SphereGeometry(1,16,10);plate.scale(.025,.115,.105);add(plate,iron,new THREE.Vector3(s*.15,.51,.24));
      const buckle=new THREE.TorusGeometry(.032,.007,6,14);buckle.rotateY(Math.PI/2);add(buckle,gold,new THREE.Vector3(s*.18,.55,.23));
    }
  }
  root.name=`refined-${kind}`;variants.set(kind,root);return clone(root);
}
