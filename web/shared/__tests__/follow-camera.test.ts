import { describe, expect, it } from 'vitest';
import { followCamera } from '../follow-camera';
import { buildLayout } from '../world';
import { NPCS } from '../data';
const layout=buildLayout();
describe('NPC camera regression',()=>{
  it('keeps pitch and yaw fixed around every NPC, including Leon, at every zoom',()=>{
    for(const npc of Object.values(NPCS))for(const zoom of [.7,1,1.5])for(const dx of [-1.8,0,1.8]) {
      let boom=1;
      for(let frame=0;frame<90;frame++) {
        const c=followCamera({x:npc.pos[0]+dx,z:npc.pos[1]-1.8},zoom,boom,1/60,layout);boom=c.boom;
        expect(c.x).toBe(0);expect((c.y-c.aimHeight)/c.z).toBeCloseTo(6.9/7.4,10);
        expect(c.boom).toBeGreaterThanOrEqual(.72);expect(c.boom).toBeLessThanOrEqual(1);
      }
    }
  });
  it('retracts near a house and recovers smoothly in an open field',()=>{
    let boom=1;
    for(let i=0;i<90;i++)boom=followCamera({x:7.2,z:-1},1,boom,1/60,layout).boom;
    expect(boom).toBeLessThan(.99);
    const first=followCamera({x:0,z:-30},1,boom,1/60,layout).boom;
    expect(first).toBeGreaterThan(boom);expect(first).toBeLessThan(1);
    for(let i=0;i<180;i++)boom=followCamera({x:0,z:-30},1,boom,1/60,layout).boom;
    expect(boom).toBeCloseTo(1,3);
  });
});
