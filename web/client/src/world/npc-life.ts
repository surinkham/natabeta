import * as THREE from 'three';

/** Additive gestures restore the previous unmodified pose before the mixer runs.
 * This also prevents drift on joints that have no animation track. */
export function createNpcLife(id:string,role:string,obj:THREE.Object3D,bones:Record<string,THREE.Bone>,animate:(dt:number)=>void){
  let seed=0;for(const c of id)seed=(Math.imul(seed,31)+c.charCodeAt(0))>>>0;
  let time=(seed%1000)/83,look=0;
  const joints=['spine_01','head','upperarm_l','upperarm_r','hand_r','ear_l','ear_r','tail_01'];
  const poses=joints.filter(n=>bones[n]).map(n=>({name:n,bone:bones[n],base:bones[n].quaternion.clone()}));
  const turn=new THREE.Quaternion(),axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
  const rotate=(name:string,axis:THREE.Vector3,angle:number)=>bones[name]?.quaternion.multiply(turn.setFromAxisAngle(axis,angle));
  return (dt:number,target?:THREE.Vector3)=>{
    dt=Math.max(0,Math.min(dt,.1));time+=dt;
    for(const p of poses)p.bone.quaternion.copy(p.base);
    animate(dt);
    for(const p of poses)p.base.copy(p.bone.quaternion);
    let wanted=Math.sin(time*.37)*.13;
    if(target){
      const dx=target.x-obj.position.x,dz=target.z-obj.position.z;
      const yaw=Math.atan2(dx,dz)-obj.rotation.y,relative=Math.atan2(Math.sin(yaw),Math.cos(yaw));
      if(dx*dx+dz*dz<25&&Math.abs(relative)<1.7)wanted=THREE.MathUtils.clamp(relative,-.55,.55);
    }
    look=THREE.MathUtils.damp(look,wanted,4,dt);
    const breath=Math.sin(time*1.8),shift=Math.sin(time*.65);
    rotate('spine_01',axisX,breath*.018);rotate('spine_01',axisZ,shift*.018);
    rotate('head',axisY,look);rotate('head',axisX,Math.sin(time*.83)*.025);
    // Slow, occasional occupational gestures, with a smooth return to idle.
    const cycle=(time+(seed%7))%12,gesture=cycle<3?Math.sin(cycle*Math.PI/3)**2:0;
    if(role==='craft'){
      rotate('upperarm_r',axisX,-gesture*.25);rotate('hand_r',axisZ,gesture*Math.sin(time*3)*.12);
      rotate('head',axisX,gesture*.10);
    }else if(role==='shop'||role==='talk'){
      rotate('upperarm_l',axisZ,-gesture*.22);rotate('upperarm_l',axisX,-gesture*.12);
    }else if(role==='stylist'){
      rotate('upperarm_r',axisX,-gesture*.22);rotate('head',axisZ,gesture*.07);
    }else{
      rotate('head',axisX,gesture*.08);rotate('upperarm_l',axisX,-gesture*.13);
    }
    const flick=Math.max(0,Math.sin(time*.7))**18*.13;
    rotate('ear_l',axisX,flick);rotate('ear_r',axisX,-flick*.7);
    rotate('tail_01',axisZ,Math.sin(time*1.7)*.16);
  };
}
