import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { createArthropod,updateArthropod } from '../../client/src/actors/arthropod';
import { createWildlife,updateWildlife } from '../../client/src/actors/wildlife';
function count(root:THREE.Object3D,pattern:RegExp){let n=0;root.traverse(o=>{if(pattern.test(o.name))n++;});return n;}
function checkGeometry(root:THREE.Object3D){root.updateMatrixWorld(true);root.traverse(o=>{if(o instanceof THREE.Mesh){const p=o.geometry.getAttribute('position');expect([...p.array].every(Number.isFinite)).toBe(true);expect(o.geometry.getAttribute('normal').count).toBe(p.count);}});}
describe('creature anatomy and animation',()=>{
 it('builds eight walking legs, two pincers and five tail segments in local space',()=>{
   const owner=new THREE.Group();owner.position.set(100,0,-80);owner.scale.setScalar(1.5);const model=createArthropod('scorpion',owner);
   expect(count(model,/^arthropod-leg-(-?1)-[0-3]$/)).toBe(8);expect(count(model,/^arthropod-claw-/)).toBe(2);expect(count(model,/^arthropod-tail-[0-4]$/)).toBe(5);
   expect(model.position.length()).toBe(0);checkGeometry(model);
 });
 it('moves legs, strikes, dies and revives without freezing or changing the shared template',()=>{
   const a=new THREE.Group(),b=new THREE.Group();const x=createArthropod('scorpion',a),y=createArthropod('scorpion',b);
   const leg=x.getObjectByName('arthropod-leg-1-0')!,tail=x.getObjectByName('arthropod-tail-0')!;
   updateArthropod(a,.25,true,'Attack',false);expect(Math.abs(leg.rotation.y)).toBeGreaterThan(.01);expect(tail.rotation.x).toBeGreaterThan(.1);
   expect(y.getObjectByName('arthropod-leg-1-0')!.rotation.y).toBe(0);
   for(let i=0;i<90;i++)updateArthropod(a,1/60,false,'Death',true);expect(x.position.y).toBeLessThan(-.15);
   for(let i=0;i<120;i++)updateArthropod(a,1/60,false,undefined,false);expect(Math.abs(x.position.y)).toBeLessThan(.001);
   expect((x.getObjectByName('arthropod-carapace') as THREE.Mesh).geometry).toBe((y.getObjectByName('arthropod-carapace') as THREE.Mesh).geometry);
 });
 it('keeps scarabs at six legs and mammals at four with finite geometry',()=>{
   const owner=new THREE.Group();const beetle=createArthropod('scarab',owner);expect(count(beetle,/^arthropod-leg-(-?1)-[0-3]$/)).toBe(6);checkGeometry(beetle);
   for(const kind of ['wolf','alpha','fox','boar','bear']){const root=new THREE.Group();createWildlife(root,kind);expect(count(root,/^wildlife-leg-(-?1)-[01]$/)).toBe(4);updateWildlife(root,.25,true,'Attack',false);checkGeometry(root);}
 });
});
