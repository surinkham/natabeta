// Public replicated state: what every client needs to draw everyone else (monsters go per client, shared/mobwire.ts). Private data (bag, gold, exp) goes owner-only via "me".
// defineTypes instead of decorators so esbuild/vitest need no decorator config. Fields are `declare`d (no class-field
// initialisers: with ES2022 define semantics they would shadow the schema accessors) and set in the constructor.
import { MapSchema, Schema, defineTypes } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  declare name: string; declare race: string; declare mounted: boolean; declare x: number; declare z: number; declare yaw: number; declare hp: number; declare maxHP: number; declare level: number;
  declare alive: boolean; declare moving: boolean; declare sitting: boolean; declare furColor: number; declare equip: string; declare party: string; declare guild: string; declare mp: number; declare maxMP: number; declare mountKind: string;
  constructor() { super(); this.assign(({ name: "", race: "dog", mounted: false, x: 0, z: 0, yaw: 0, hp: 0, maxHP: 1, level: 1, alive: true, moving: false, sitting: false, furColor: 0, equip: "{}", party: "", guild: "", mp: 0, maxMP: 1, mountKind: "" }) as any); }
}
defineTypes(PlayerSchema, { name: "string", race: "string", mounted: "boolean", x: "number", z: "number", yaw: "number", hp: "number", maxHP: "number", level: "uint16", alive: "boolean", moving: "boolean", sitting: "boolean", furColor: "uint32", equip: "string", party: "string", guild: "string", mp: "number", maxMP: "number", mountKind: "string" });


export class GroundSchema extends Schema {
  declare id: string; declare itemId: string; declare count: number; declare gold: number; declare x: number; declare z: number; declare owner: string; declare free: boolean;
  constructor() { super(); this.assign(({ id: "", itemId: "", count: 0, gold: 0, x: 0, z: 0, owner: "", free: false }) as any); }
}
defineTypes(GroundSchema, { id: "string", itemId: "string", count: "uint16", gold: "uint32", x: "number", z: "number", owner: "string", free: "boolean" });   // owner + free: whose it is, and whether anyone may take it yet (auto loot)

export class MapState extends Schema {
  declare players: MapSchema<PlayerSchema>; declare ground: MapSchema<GroundSchema>; declare hours: number;
  constructor() { super(); this.players = new MapSchema<PlayerSchema>(); this.ground = new MapSchema<GroundSchema>(); this.hours = 9; }
}
defineTypes(MapState, { players: { map: PlayerSchema }, ground: { map: GroundSchema }, hours: "number" });
