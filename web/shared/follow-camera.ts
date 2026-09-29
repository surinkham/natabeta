import { clearBoom, type Layout } from './world';

/** Keep the viewing direction fixed while the boom retracts around buildings. */
export function followCamera(from:{x:number;z:number},zoom:number,boom:number,dt:number,layout:Layout) {
  const aimHeight=.5, offset={x:0,y:6.9*zoom,z:7.4*zoom};
  const clear=clearBoom(from,offset,layout,aimHeight,.72);
  boom+=(clear-boom)*(1-Math.exp(-Math.max(0,dt)*(clear<boom?14:4)));
  return {boom,x:0,y:aimHeight+offset.y*boom,z:offset.z*boom,aimHeight};
}
