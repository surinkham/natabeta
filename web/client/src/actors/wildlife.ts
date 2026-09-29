import * as THREE from 'three';
import { Part, pivot } from './arthropod';
const fur=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91});
const cache=new Map<string,THREE.Group>();
type Motion={root:THREE.Group;head:THREE.Object3D;legs:THREE.Object3D[];tail:THREE.Object3D;time:number;stride:number;death:number;attack:number;attacking:boolean};
const motions=new WeakMap<THREE.Object3D,Motion>();
const COLORS:Record<string,[number,number,number]>={wolf:[0x64696c,0xb5b4a6,0x43494a],alpha:[0x38383b,0x818080,0x262729],fox:[0xa85c30,0xd7ccb5,0x483b30],boar:[0x554334,0x82705b,0x302c26],bear:[0x513c2b,0x8d7457,0x352d25]};
export const isWildlife=(kind:string)=>kind in COLORS;
function build(kind:string,tint?:number) {
 const root=new THREE.Group();root.name='wildlife-body';
 let [coat,light,dark]=COLORS[kind];if(tint!==undefined){coat=new THREE.Color(coat).lerp(new THREE.Color(tint),.45).getHex();light=new THREE.Color(light).lerp(new THREE.Color(tint),.22).getHex();}
 const bear=kind==='bear',boar=kind==='boar',fox=kind==='fox';
 const h=bear?.58:boar?.46:.57, width=bear?.28:boar?.24:.18;
 const body=new Part();body.oval([0,h,0],[width,bear?.27:.19,bear?.47:.43],coat,20);
 body.oval([0,h+.025,.27],[width*1.02,bear?.30:.23,.24],coat,16);
 body.oval([0,h-.09,.02],[width*.91,.14,.31],light,16);
 body.oval([0,h+.14,-.07],[width*.70,.065,.34],dark,16);
 // Shoulder ruff / bristle ridge break up the smooth toy silhouette.
 for(let i=0;i<(boar?8:0);i++) {
   const z=.30-i*.075;
   body.curve([[0,h+.17,z],[0,h+(boar?.30:.23),z-.035],[0,h+.18,z-.09]],boar?.021:.032,dark);
 }
 body.mesh(root,'wildlife-torso',fur);
 const head=pivot(root,'wildlife-head',[0,h+.11,.40]);const skull=new Part();
 skull.oval([0,.04,.07],[bear?.19:boar?.17:.135,bear?.16:.13,.19],coat,16);
 skull.oval([0,-.025,.225],[boar?.11:.078,.065,boar?.16:.14],light,16);
 skull.oval([0,-.027,boar?.365:.345],[boar?.098:.065,.042,.026],boar?0x5b4037:0x20211d,12);
 skull.oval([0,-.075,.245],[.068,.020,.112],dark,12);
 for(const side of [-1,1]) {
   skull.oval([side*.108,.079,.178],[.027,.026,.025],dark,12);
   skull.oval([side*.119,.080,.189],[.014,.014,.013],0xb79b59,10);
   skull.oval([side*.125,.081,.198],[.009,.011,.007],0x151916,8);
   skull.oval([side*.128,.087,.200],[.0035,.0035,.0035],0xe4e1d3,8);
   if(bear)skull.oval([side*.132,.163,.01],[.057,.063,.040],coat,12);
   else {
     const x=side*.092, tall=boar?.105:fox?.20:.17;
     const vertices=[x-side*.06,.11,.01,x+side*.06,.11,.01,x+side*.033,.11+tall,-.015,x,.12,-.045];
     const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(side>0?[0,1,2,0,3,1,1,3,2,2,3,0]:[2,1,0,1,3,0,2,3,1,0,3,2]);g.computeVertexNormals();skull.add(g,coat);
   }
   if(boar)skull.curve([[side*.098,-.07,.245],[side*.16,-.03,.29],[side*.17,.075,.285]],.026,0xd8cfb8);
   if(!bear&&!boar)for(let i=0;i<3;i++)skull.curve([[side*.09,-.008,.22],[side*.19,-.005+i*.018,.25],[side*.235,i*.02,.26]],.0018,0xbfb7a5);
 }
 skull.mesh(head,'wildlife-skull',fur);
 for(const side of [-1,1])for(let i=0;i<2;i++) {
   const front=i===0,z=front?.28:-.29;
   const leg=pivot(root,'wildlife-leg-'+side+'-'+i,[side*width*.80,h-.025,z]),part=new Part();
   part.oval([0,-.04,0],[bear?.10:.075,.13,.09],coat,12);
   const knee:[number,number,number]=[0,-h*.48,front?-.035:.075],ankle:[number,number,number]=[0,-h+.10,front?.01:-.025];
   part.link([0,0,0],knee,bear?.083:.057,bear?.068:.043,coat);part.oval(knee,[.054,.059,.056],coat,10);
   part.link(knee,ankle,bear?.062:.036,bear?.051:.027,coat);
   part.oval([0,-h+.054,.045],[bear?.089:.054,.055,boar?.07:.093],boar?dark:coat,12);
   for(let toe=0;toe<(boar?2:3);toe++)part.curve([[(toe-1)*.028,-h+.046,.088],[(toe-1)*.028,-h+.03,.114],[(toe-1)*.028,-h+.02,.124]],.009,boar?dark:0x302b23);
   part.mesh(leg,'wildlife-leg-fur',fur);
 }
 const tail=pivot(root,'wildlife-tail',[0,h+.015,-.39]),part=new Part();
 if(bear)part.oval([0,0,-.045],[.055,.05,.06],coat);
 else if(boar)part.curve([[0,0,0],[0,.08,-.12],[.05,.12,-.15],[.07,.05,-.15]],.016,dark);
 else {part.curve([[0,0,0],[0,-.11,-.22],[0,-.24,-.41],[.035,-.28,-.55]],fox?.13:.075,coat);
   part.curve([[0,-.23,-.39],[.02,-.27,-.49],[.035,-.28,-.55]],fox?.066:.028,fox?light:dark);}
 part.mesh(tail,'wildlife-tail-fur',fur);return root;
}
export function createWildlife(owner:THREE.Object3D,kind:string,tint?:number) {
 const key=kind+':'+tint;let template=cache.get(key);if(!template){template=build(kind,tint);cache.set(key,template);}
 const root=template.clone(true);owner.add(root);const legs:THREE.Object3D[]=[];root.traverse(n=>{if(/^wildlife-leg-(-?1)-[01]$/.test(n.name))legs.push(n);});
 const head=root.getObjectByName('wildlife-head')!,tail=root.getObjectByName('wildlife-tail')!;
 motions.set(owner,{root,head,tail,legs,time:0,stride:0,death:0,attack:0,attacking:false});
 return {head,spine_01:root,tail_01:tail};
}
export function updateWildlife(owner:THREE.Object3D,dt:number,moving:boolean,busy:string|undefined,dead:boolean) {
 const m=motions.get(owner);if(!m)return;m.time+=dt;m.stride=THREE.MathUtils.damp(m.stride,moving&&!dead?1:0,10,dt);m.death=THREE.MathUtils.damp(m.death,dead?1:0,7,dt);
 const attack=!!busy&&/Attack|Slash|Bash|Cast/.test(busy)&&!dead;if(attack&&!m.attacking)m.attack=0;m.attacking=attack;m.attack=attack?Math.min(1,m.attack+dt/.8):0;
 const strike=attack?Math.sin(m.attack*Math.PI):0;
 m.root.position.y=-.31*m.death+Math.sin(m.time*12)*.011*m.stride;m.root.rotation.z=1.2*m.death;m.root.position.z=strike*.12;
 m.head.rotation.x=Math.sin(m.time*1.7)*.025+strike*.22;m.tail.rotation.y=Math.sin(m.time*2.2)*.10*(1-m.death);
 m.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(m.time*9+(i===0||i===3?0:Math.PI))*.40*m.stride;});
}
