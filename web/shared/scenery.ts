import { ZONES, edgeStyle, zoneAtCell, type Edge } from './regions';

/** One centre line per boundary, shared by scenery and cartography; collision banks are not rivers. */
export function scenicBorders() {
  const result: { x1:number;z1:number;x2:number;z2:number;look:Edge;gap?:{x:number;z:number} }[]=[];
  for(const z of ZONES) {
    result.push({x1:z.x0,z1:z.z0,x2:z.x0,z2:z.z1,look:edgeStyle(z.i,z.j,'w'),gap:z.exits.w});
    result.push({x1:z.x0,z1:z.z0,x2:z.x1,z2:z.z0,look:edgeStyle(z.i,z.j,'n'),gap:z.exits.n});
    if(!zoneAtCell(z.i+1,z.j))result.push({x1:z.x1,z1:z.z0,x2:z.x1,z2:z.z1,look:edgeStyle(z.i,z.j,'e')});
    if(!zoneAtCell(z.i,z.j+1))result.push({x1:z.x0,z1:z.z1,x2:z.x1,z2:z.z1,look:edgeStyle(z.i,z.j,'s')});
  }
  return result;
}

/** Soft meanders return to each junction and stay straight at a bridge/road crossing. */
export function borderBend(t:number,length:number,ax:number,az:number,gapAt?:number) {
  const u=Math.max(0,Math.min(1,t/length));
  const crossing=gapAt===undefined?1:Math.min(1,Math.max(0,(Math.abs(t-gapAt)-10)/14));
  return Math.sin(Math.PI*u)**2 * Math.sin(u*Math.PI*2+(ax+az)*.017) * 5 * crossing*crossing*(3-2*crossing);
}

export type ScenicBorder=ReturnType<typeof scenicBorders>[number];
export interface RiverPoint {x:number;z:number;nx:number;nz:number;halfWidth:number;t:number}
const riverPaths=new Map<string,RiverPoint[]>();
let junctions:Map<string,{x:number;z:number}[]>|undefined;
const key=(x:number,z:number)=>`${x},${z}`;
/** Continuous tangents across cell corners, with anchored straight bridge approaches.
 * This is the sole river geometry used by water, banks, collision and both maps. */
export function riverPath(b:ScenicBorder):RiverPoint[]{
  const cacheKey=`${b.x1},${b.z1}:${b.x2},${b.z2}:${b.gap?.x},${b.gap?.z}`;
  const cached=riverPaths.get(cacheKey);if(cached)return cached;
  if(!junctions){
    junctions=new Map();
    for(const e of scenicBorders().filter(e=>e.look==='river'))for(const [x,z,ox,oz] of [[e.x1,e.z1,e.x2,e.z2],[e.x2,e.z2,e.x1,e.z1]]){
      const k=key(x,z),list=junctions.get(k)??[];list.push({x:ox,z:oz});junctions.set(k,list);
    }
  }
  const length=Math.hypot(b.x2-b.x1,b.z2-b.z1),ux=(b.x2-b.x1)/length,uz=(b.z2-b.z1)/length;
  const gap=b.gap?Math.hypot(b.gap.x-b.x1,b.gap.z-b.z1):undefined;
  const direction=(x:number,z:number,ox:number,oz:number)=>{
    const peers=junctions!.get(key(x,z))??[],dx=(ox-x)/length,dz=(oz-z)/length;
    if(peers.length!==2)return {x:dx,z:dz};
    const other=peers.find(p=>p.x!==ox||p.z!==oz)!;
    const d=Math.hypot(other.x-x,other.z-z),tx=dx-(other.x-x)/d,tz=dz-(other.z-z)/d,n=Math.hypot(tx,tz);
    return {x:tx/n,z:tz/n};
  };
  const start=direction(b.x1,b.z1,b.x2,b.z2),end=direction(b.x2,b.z2,b.x1,b.z1);
  const phase=Math.sin(b.x1*.027+b.z1*.019)*2;
  const at=(t:number)=>{
    let lo=0,hi=length,ax=b.x1,az=b.z1,bx=b.x2,bz=b.z2,dx=start.x,dz=start.z,ex=end.x,ez=end.z;
    if(gap!==undefined){
      if(Math.abs(t-gap)<=12)return {x:b.x1+ux*t,z:b.z1+uz*t};
      if(t<gap){hi=gap-12;bx=b.x1+ux*hi;bz=b.z1+uz*hi;ex=-ux;ez=-uz;}
      else{lo=gap+12;ax=b.x1+ux*lo;az=b.z1+uz*lo;dx=ux;dz=uz;}
    }
    const u=(t-lo)/(hi-lo),v=1-u,h=(hi-lo)*.36;
    const x=v*v*v*ax+3*v*v*u*(ax+dx*h)+3*v*u*u*(bx+ex*h)+u*u*u*bx;
    const z=v*v*v*az+3*v*v*u*(az+dz*h)+3*v*u*u*(bz+ez*h)+u*u*u*bz;
    // Broad unequal meanders, with zero derivative at joins and bridge approaches.
    const bend=Math.sin(Math.PI*u)**2*Math.sin(Math.PI*u+phase)*(hi-lo)*.22;
    return {x:x-uz*bend,z:z+ux*bend};
  };
  const steps=Math.ceil(length/1.5),ts=new Set(Array.from({length:steps+1},(_,i)=>length*i/steps));
  if(gap!==undefined)for(const d of [-12,-2.04,0,2.04,12])ts.add(gap+d);
  const result=[...ts].sort((a,b)=>a-b).map(t=>{
    const p=at(t),a=at(Math.max(0,t-.01)),c=at(Math.min(length,t+.01)),n=Math.hypot(c.x-a.x,c.z-a.z);
    const fade=gap===undefined?1:Math.min(1,Math.max(0,(Math.abs(t-gap)-12)/14));
    const halfWidth=3+Math.sin(Math.PI*t/length)**2*(.6+.4*Math.sin(t*.065+phase))*fade;
    return {...p,nx:-(c.z-a.z)/n,nz:(c.x-a.x)/n,halfWidth,t};
  });
  riverPaths.set(cacheKey,result);return result;
}
