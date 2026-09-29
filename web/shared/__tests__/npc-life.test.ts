import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createNpcLife} from '../../client/src/world/npc-life';
const make=()=>{
 const obj=new THREE.Group(),bones:Record<string,THREE.Bone>={};
 for(const name of ['head','spine_01','upperarm_l','upperarm_r','hand_r','ear_l','ear_r','tail_01']){bones[name]=new THREE.Bone();obj.add(bones[name]);}
 return {obj,bones};
};
describe('NPC secondary motion',()=>{
 it('never accumulates rotations on joints with no mixer track or moves the service location',()=>{
  const {obj,bones}=make();obj.position.set(8,0,4);
  const update=createNpcLife('artisan','craft',obj,bones,()=>{});
  for(let i=0;i<3600;i++)update(1/60);
  for(const bone of Object.values(bones)){
   expect(bone.quaternion.length()).toBeCloseTo(1);
   expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(.7);
  }
  expect(obj.position.toArray()).toEqual([8,0,4]);
 });
 it('looks toward a nearby visitor with a limited head turn and returns when they leave',()=>{
  const {obj,bones}=make(),update=createNpcLife('merchant','shop',obj,bones,()=>{});
  for(let i=0;i<240;i++)update(1/60,new THREE.Vector3(3,0,2));
  const yaw=new THREE.Euler().setFromQuaternion(bones.head.quaternion).y;
  expect(yaw).toBeGreaterThan(.45);expect(yaw).toBeLessThan(.6);
  for(let i=0;i<240;i++)update(1/60,new THREE.Vector3(100,0,100));
  expect(Math.abs(new THREE.Euler().setFromQuaternion(bones.head.quaternion).y)).toBeLessThan(.2);
 });
 it('keeps the mixer pose as the base for additive motion',()=>{
  const {obj,bones}=make();const base=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7);
  const update=createNpcLife('guide','talk',obj,bones,()=>bones.head.quaternion.copy(base));
  for(let i=0;i<600;i++)update(1/60);
  expect(bones.head.quaternion.angleTo(base)).toBeLessThan(.2);
 });
});
