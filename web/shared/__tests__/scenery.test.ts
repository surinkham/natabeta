import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {createBridge,riverRibbon} from '../../client/src/world/waterways';
import {BRIDGE,groundY,type Layout} from '../world';
import {borderBend,scenicBorders,riverPath} from '../scenery';

describe('scenery agrees with traversal',()=>{
 it('keeps river junctions and crossings fixed while bending the banks',()=>{
  expect(borderBend(0,90,45,0)).toBe(0);expect(Math.abs(borderBend(90,90,45,0))).toBeLessThan(1e-10);
  expect(borderBend(45,90,45,0,45)).toBeCloseTo(0);expect(Math.abs(borderBend(25,90,45,0))).toBeGreaterThan(.5);
  const borders=scenicBorders();expect(new Set(borders.map(b=>`${b.x1}:${b.z1}:${b.x2}:${b.z2}`)).size).toBe(borders.length);
 });
 it('places feet on the visible deck and both ramps in either bridge orientation',()=>{
  for(const ry of [0,Math.PI/2]) {
   const bridge=createBridge();bridge.scale.setScalar(BRIDGE.s);bridge.position.set(10,BRIDGE.y,-20);bridge.rotation.y=ry;bridge.updateMatrixWorld(true);
   const L={props:[{name:'SM_Bridge',x:10,z:-20,ry,s:BRIDGE.s,y:BRIDGE.y}],solids:[],walls:[],occluders:[],lightSpots:[]} as Layout;
   for(const local of [-1.98,-1.75,-1.5,-1,0,.75,1.5,1.75,1.98]) {
    const p={x:10+Math.cos(ry)*local*BRIDGE.s,z:-20-Math.sin(ry)*local*BRIDGE.s};
    const hits=new THREE.Raycaster(new THREE.Vector3(p.x,10,p.z),new THREE.Vector3(0,-1,0)).intersectObject(bridge,true);
    expect(hits.length).toBeGreaterThan(0);expect(hits[0].point.y).toBeCloseTo(groundY(p,L),3);
   }
  }
 });
});

it('connects every river segment into one watershed',()=>{
 const graph=new Map<string,Set<string>>();
 for(const s of scenicBorders().filter(b=>b.look==='river')) {
  const a=`${s.x1},${s.z1}`,b=`${s.x2},${s.z2}`;
  if(!graph.has(a))graph.set(a,new Set());if(!graph.has(b))graph.set(b,new Set());graph.get(a)!.add(b);graph.get(b)!.add(a);
 }
 expect(graph.size).toBeGreaterThan(10);const seen=new Set<string>(),queue=[[...graph.keys()][0]];
 for(let i=0;i<queue.length;i++){const n=queue[i];if(seen.has(n))continue;seen.add(n);queue.push(...graph.get(n)!);}
 expect(seen.size).toBe(graph.size);
});

it('uses continuous curved joins, variable width and exact bridge anchors',()=>{
 const rivers=scenicBorders().filter(b=>b.look==='river');
 const joins=new Map<string,{nx:number;nz:number}[]>();let bent=0;
 for(const b of rivers){
  const path=riverPath(b),length=Math.hypot(b.x2-b.x1,b.z2-b.z1);
  expect(path.every(p=>Object.values(p).every(Number.isFinite))).toBe(true);
  expect(Math.max(...path.map(p=>p.halfWidth))).toBeGreaterThan(3.1);
  if(path.some(p=>Math.abs(b.x1===b.x2?p.x-b.x1:p.z-b.z1)>5))bent++;
  for(const p of [path[0],path[path.length-1]]){const k=`${p.x},${p.z}`,list=joins.get(k)??[];list.push(p);joins.set(k,list);}
  if(b.gap){const t=Math.hypot(b.gap.x-b.x1,b.gap.z-b.z1);for(const p of path.filter(p=>Math.abs(p.t-t)<=10)){
   expect(p.x).toBeCloseTo(b.x1+(b.x2-b.x1)*p.t/length,6);
   expect(p.z).toBeCloseTo(b.z1+(b.z2-b.z1)*p.t/length,6);expect(p.halfWidth).toBe(3);
  }}
  const mesh=riverRibbon(path,true),normals=mesh.geometry.getAttribute('normal');
  for(let i=0;i<normals.count;i++)expect(normals.getY(i)).toBeGreaterThan(.99);
  mesh.geometry.dispose();mesh.material.dispose();
 }
 expect(bent).toBeGreaterThan(rivers.length*.6);
 for(const normals of joins.values())if(normals.length===2)expect(Math.abs(normals[0].nx*normals[1].nx+normals[0].nz*normals[1].nz)).toBeGreaterThan(.999);
});
