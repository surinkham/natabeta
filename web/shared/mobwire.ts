// Monster sync on the wire. The world holds thousands of monsters; replicating them all in the room state sent every
// client every awake monster. Instead each client gets a "mobs" message with only the ones near it, and only what
// changed: within MOB_NEAR every tick, out to MOB_FAR every MOB_FAR_EVERY ticks, beyond that nothing (the client does
// not draw them). A monster the client has not seen yet, or one coming back into range, arrives as a full record.
//   full:   [i, x, z, yaw, hp, flags, maxHP, level, kind, id]      (i = index in sim.monsters)
//   update: i, x, z, yaw, hp, flags                                  (flattened, 6 numbers per monster)
// x, z and yaw travel as ×100 integers (msgpack packs small ints tighter than doubles); flags: 1 alive, 2 moving.
export const MOB_NEAR = 45, MOB_FAR = 130, MOB_FAR_EVERY = 10;
export interface MobView { id: string; kind: string; level: number; x: number; z: number; yaw: number; hp: number; maxHP: number; alive: boolean; moving: boolean }
export type MobsMsg = [full: (number | string)[][], upd: number[]];

type Body = { x: number; z: number; yaw: number; hp: number; alive: boolean; moving: boolean };
/** The quantised dynamic fields, as sent. */
export const mobFields = (m: Body) => [Math.round(m.x * 100), Math.round(m.z * 100), Math.round(m.yaw * 100), Math.ceil(m.hp), (m.alive ? 1 : 0) | (m.moving ? 2 : 0)];

/** Apply a "mobs" message; true when it added monsters the client did not know. */
export function applyMobs(into: Map<number, MobView>, [full, upd]: MobsMsg): boolean {
  const set = (v: MobView, x: number, z: number, yaw: number, hp: number, f: number) => { v.x = x / 100; v.z = z / 100; v.yaw = yaw / 100; v.hp = hp; v.alive = !!(f & 1); v.moving = !!(f & 2); };
  let added = false;
  for (const r of full) {
    const [i, x, z, yaw, hp, f, maxHP, level, kind, id] = r as [number, number, number, number, number, number, number, number, string, string];
    let v = into.get(i); if (!v) { into.set(i, v = { id, kind, level, maxHP } as MobView); added = true; }
    Object.assign(v, { id, kind, level, maxHP }); set(v, x, z, yaw, hp, f);
  }
  for (let k = 0; k + 5 < upd.length; k += 6) { const v = into.get(upd[k]); if (v) set(v, upd[k + 1], upd[k + 2], upd[k + 3], upd[k + 4], upd[k + 5]); }
  return added;
}
