import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { ITEMS } from '../data';
import { itemIcon } from '../../client/src/items/item-icons';
import { createWeapon } from '../../client/src/items/weapon-model';
import { applyEquipVisuals } from '../../client/src/actors/visuals';
import { applyEquipmentDesign } from '../../client/src/items/equipment-design';
const mesh=(name:string)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.1,.4,.03),new THREE.MeshStandardMaterial());m.name=name;return m;};
describe('equipment artwork integration',()=>{
 it('renders a finite SVG for every catalog item and distinct art for base weapons and potions',()=>{
  for(const id of Object.keys(ITEMS)){const art=itemIcon(id)!;expect(art,id).toContain('<svg');expect(art,id).not.toMatch(/NaN|undefined|<script/);}
  const ids=Object.keys(ITEMS).filter(id=>ITEMS[id].weapon||(ITEMS[id].type==='Consumable'&&!ITEMS[id].food));   // food shows its emoji (ui/icons cookIcon)
  const art=ids.map(id=>itemIcon(id)!.replace(/aria-label="[^"]*"/,''));expect(new Set(art).size).toBe(art.length);
 });
 it('creates finite, differently shaped weapons while sharing cached geometry safely',()=>{
  const shapes=new Map<string,string>();
  for(const [id,d] of Object.entries(ITEMS)){if(!d.weapon&&d.slot!=='OffHand')continue;
   const obj=createWeapon(id),verts:number[]=[];obj.traverse(n=>{if(n instanceof THREE.Mesh){const a=n.geometry.getAttribute('position');expect(Array.from(a.array).every(Number.isFinite),id).toBe(true);verts.push(...a.array);expect(n.geometry.getAttribute('normal').count).toBe(a.count);}});shapes.set(id,verts.join(','));
   const clone=createWeapon(id);expect(clone).not.toBe(obj);expect((clone.children[0] as THREE.Mesh).geometry).toBe((obj.children[0] as THREE.Mesh).geometry);
  }
  expect(shapes.get('FROST_BLADE')).not.toBe(shapes.get('EMBER_SWORD'));expect(shapes.get('HUNTER_BOW')).not.toBe(shapes.get('LONGBOW'));expect(shapes.get('KITE_SHIELD')).not.toBe(shapes.get('TOWER_SHIELD'));
 });
 it('replaces held gear, avoids duplicate meshes on refresh, hides shields for bows, and clears unequipped models',()=>{
  const root=new THREE.Group(),hand=new THREE.Group();root.add(hand);
  for(const n of ['SM_KnightSword','SM_HunterBow','SM_KiteShield'])hand.add(mesh(n));
  const equip={MainWeapon:'FROST_BLADE',OffHand:'KITE_SHIELD'};applyEquipVisuals(root,equip);applyEquipVisuals(root,equip);
  const made=()=>hand.children.filter(n=>n.userData.designedEquipment);
  expect(made()).toHaveLength(2);expect(hand.getObjectByName('SM_KnightSword')!.visible).toBe(false);
  hand.position.set(2,3,4);root.updateMatrixWorld(true);expect(made()[0].getWorldPosition(new THREE.Vector3()).toArray()).toEqual([2,3,4]);
  applyEquipmentDesign(root,{MainWeapon:'HUNTER_BOW',OffHand:'KITE_SHIELD'});expect(made()).toHaveLength(1);
  // A paper-doll clone inherits generated children, but the next sync replaces them exactly once.
  const doll=root.clone(true);applyEquipmentDesign(doll,{MainWeapon:'FROST_BLADE'});let count=0;doll.traverse(n=>{if(n.userData.designedEquipment)count++;});expect(count).toBe(1);
  applyEquipmentDesign(root,{});expect(made()).toHaveLength(0);
 });
 it('keeps armour skin attributes and original geometry intact across equipment changes',()=>{
  const root=new THREE.Group(),m=mesh('SK_Knight_Chest');root.add(m);const original=m.geometry,positions=Array.from(original.getAttribute('position').array),n=original.getAttribute('position').count;
  original.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(n*4),4));original.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:n},()=>[1,0,0,0]).flat(),4));
  applyEquipmentDesign(root,{Chest:'MAGE_ROBE'});const robe=m.geometry;
  expect(robe.getAttribute('skinWeight').array).toEqual(original.getAttribute('skinWeight').array);
  applyEquipmentDesign(root,{Chest:'FROST_MAIL'});expect(m.geometry).not.toBe(robe);expect(Array.from(original.getAttribute('position').array)).toEqual(positions);
  applyEquipmentDesign(root,{Chest:'MAGE_ROBE'});expect(m.geometry).toBe(robe);
 });
});
