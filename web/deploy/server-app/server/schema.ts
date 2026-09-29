// Public replicated state: what every client needs to draw everyone else. Private data (bag, gold, exp) goes owner-only via "me".
// defineTypes instead of decorators so esbuild/vitest need no decorator config. Fields are `declare`d (no class-field
// initialisers: with ES2022 define semantics they would shadow the schema accessors) and set in the constructor.
import { ArraySchema, MapSchema, Schema, defineTypes } from "@colyseus/schema";

export class PlayerSchema extends Schema {
  declare name: string; declare race: string; declare mounted: boolean; declare x: number; declare z: number; declare yaw: number; declare hp: number; declare maxHP: number; declare level: number;
  declare alive: boolean; declare moving: boolean; declare sitting: boolean; declare furColor: number; declare equip: string;
  constructor() { super(); this.assign(({ name: "", race: "dog", mounted: false, x: 0, z: 0, yaw: 0, hp: 0, maxHP: 1, level: 1, alive: true, moving: false, sitting: false, furColor: 0, equip: "{}" }) as any); }
}
defineTypes(PlayerSchema, { name: "string", race: "string", mounted: "boolean", x: "number", z: "number", yaw: "number", hp: "number", maxHP: "number", level: "uint8", alive: "boolean", moving: "boolean", sitting: "boolean", furColor: "uint32", equip: "string" });

export class MonsterSchema extends Schema {
  declare id: string; declare kind: string; declare x: number; declare z: number; declare yaw: number; declare hp: number; declare maxHP: number; declare alive: boolean; declare moving: boolean;
  constructor() { super(); this.assign(({ id: "", kind: "", x: 0, z: 0, yaw: 0, hp: 0, maxHP: 1, alive: true, moving: false }) as any); }
}
defineTypes(MonsterSchema, { id: "string", kind: "string", x: "number", z: "number", yaw: "number", hp: "number", maxHP: "number", alive: "boolean", moving: "boolean" });

export class MapState extends Schema {
  declare players: MapSchema<PlayerSchema>; declare monsters: ArraySchema<MonsterSchema>; declare hours: number;
  constructor() { super(); this.players = new MapSchema<PlayerSchema>(); this.monsters = new ArraySchema<MonsterSchema>(); this.hours = 9; }
}
defineTypes(MapState, { players: { map: PlayerSchema }, monsters: [MonsterSchema], hours: "number" });
