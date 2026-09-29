import * as THREE from 'three';
let texture:THREE.CanvasTexture|undefined;
const geometry=new THREE.PlaneGeometry(1,1);
/** A cheap soft ambient contact shadow; directional shadows still show the actual animated silhouette. */
export function addContactShadow(root:THREE.Object3D,width=.65,depth=.55){
 if(!texture){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d')!,gradient=g.createRadialGradient(32,32,3,32,32,31);gradient.addColorStop(0,'rgba(12,19,27,.40)');gradient.addColorStop(.45,'rgba(12,19,27,.23)');gradient.addColorStop(1,'rgba(12,19,27,0)');g.fillStyle=gradient;g.fillRect(0,0,64,64);texture=new THREE.CanvasTexture(c);}
 const shadow=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
 shadow.name='contact-shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;shadow.scale.set(width,depth,1);shadow.renderOrder=1;root.add(shadow);return shadow;
}
