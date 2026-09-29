import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { CITIES,regionAt } from '../regions';
import { MONSTERS, NPCS } from '../data';
import { TOWNS } from '../towns';
import { SPAWNS,MAP,buildLayout,collide } from '../world';
import { REALISTIC_BEASTS, applyMonsterAppearance } from '../../client/src/actors/monster-appearance';
import type { Actor } from '../../client/src/actors/actor';

describe('six realms content',()=>{
 it('places every city on the map with its regional spawns (the road itself is covered by world-travel)',()=>{
  for(const city of CITIES){
   expect(regionAt(city).id).toBe(city.id);expect(city.x).toBeGreaterThan(MAP.minX);expect(city.x).toBeLessThan(MAP.maxX);
   for(const id of city.monsters){expect(MONSTERS[id]).toBeDefined();expect(SPAWNS.some(s=>s.kind===id&&Math.abs(s.x-city.x)<35)).toBe(true);}
  }
 });
 it('makes Mossvale at least twice as wooded as Pawhaven without quality-dependent tree collisions',()=>{
  const high=buildLayout(1),low=buildLayout(.5);
  const trees=(layout:ReturnType<typeof buildLayout>,id:string)=>{
   const city=CITIES.find(c=>c.id===id)!;
   return layout.props.filter(p=>p.name.startsWith('SM_Tree_')&&Math.abs(p.x-city.x)<40&&Math.abs(p.z-city.z)<40);
  };
  expect(trees(high,'mossvale').length).toBeGreaterThan(trees(high,'pawhaven').length*2);
  expect(trees(low,'mossvale')).toEqual(trees(high,'mossvale'));
 });
 it('keeps each resident reachable from their arrival square and provides every town service',()=>{
  const L=buildLayout();
  for(const city of CITIES.slice(1)) {
   const free=(x:number,z:number)=>{const p={x:city.x+x,z:city.z+z},q=collide({...p},.35,L);return Math.hypot(p.x-q.x,p.z-q.z)<.001;};
   const queue:[[number,number]]=[[0,-4.5]],seen=new Set<string>(['0,-4.5']);
   for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz]of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){const nx=x+dx,nz=z+dz,key=`${nx},${nz}`;if(Math.abs(nx)>10||nz < -11||nz>10||seen.has(key)||!free(nx,nz))continue;seen.add(key);queue.push([nx,nz]);}}
   expect(queue.length).toBeGreaterThan(100);
   for(const resident of TOWNS[city.biome]!.residents){
    const npc=NPCS[`NPC_${city.id}_${resident.role}`];expect(npc.pos).toEqual([city.x+resident.x,city.z+resident.z]);expect(npc.biome).toBe(city.biome);
    expect(queue.some(([x,z])=>Math.hypot(x-resident.x,z-resident.z)<1.8),`${city.id}: ${resident.name} unreachable`).toBe(true);
    if(npc.kind==='shop')expect(npc.stock).toContain('HP_POTION');
    if(npc.kind==='craft')expect(npc.recipes!.length).toBeGreaterThan(0);
    if(npc.kind==='skillshop')expect(npc.skills!.length).toBeGreaterThan(0);
   }
  }
 });
 it('gives every kingdom creatures of its own shape: no model is shared between kingdoms', () => {
  // (the old way re-tinted wolves, boars and stumps and bolted parts on; each realm now has its own beasts,
  // work/blender/build_realm_beasts.py)
  const owner = new Map<string, string>();
  for (const city of CITIES) for (const id of city.monsters) {
   const model = MONSTERS[id].model; expect(model).toBeTruthy();
   const prev = owner.get(model); if (prev) expect(prev).toBe(city.id); else owner.set(model, city.id);
  }
 });
});
