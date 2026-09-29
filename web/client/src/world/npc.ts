import * as THREE from "three";
import { NPCS, NpcDef } from "@shared/data";
import { scene } from "../render/scene";
import { makeNpcVisual } from "./npc-visuals";
import { makeQuestBoard } from "./quest-board";
import { Animator } from "../actors/anim";

export interface Npc { id: string; def: NpcDef; pos: THREE.Vector3; obj: THREE.Object3D; line: number; talkT: number; anim?: Animator; update:(dt:number,target?:THREE.Vector3)=>void }   // anim: none for a board

/** Town residents share the character rig, with occupation-specific costumes. */
export function spawnNpcs(source: THREE.Object3D): Npc[] {
  return Object.entries(NPCS).map(([id, def]) => {
    const { obj: g, anim, update } = def.kind === "quest" ? { obj: makeQuestBoard(), anim: undefined, update: () => {} } : makeNpcVisual(id, source);   // the quest board is a board, not a resident
    g.position.set(def.pos[0], 0, def.pos[1]); scene.add(g);   // solid comes from shared/world.ts
    return { id, def, pos: g.position, obj: g, anim, update, line: 0, talkT: 5 + Math.random() * 10 };
  });
}
