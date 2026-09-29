import { updateWildlife } from './wildlife';
import { updateArthropod } from './arthropod';
import { retargetClip } from "./retarget";
import * as THREE from "three";
import { loadGltf } from "../render/assets";

// Clips authored in work/blender/build_anim_clips.py on SK_BK_Chibi; every rig shares the bone names so one set fits all.
export type ClipName = "Idle" | "Run" | "Attack" | "Slash" | "Hit" | "Death" | "Dash" | "Bash" | "Whirl" | "Cast" | string;
const ONE_SHOT = ["Attack", "Slash", "Hit", "Death", "Dash", "Bash", "Whirl", "Cast", "Shoot", "Zap", "Volley", "Pick"];
const isOneShot = (name: string) => ONE_SHOT.some(n => name === n || name.endsWith(n));
let clipRig: THREE.Object3D | undefined;
let clips: Record<string, THREE.AnimationClip> = {};

export async function loadClips(url = "assets/anims.glb") {
  const gltf = await loadGltf(url);
  clipRig = gltf.scene;
  clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  return clips;
}

/** Per-actor state machine over an AnimationMixer: locomotion (Idle/Run) + one-shots that return to locomotion. */
export class Animator {
  mixer: THREE.AnimationMixer;
  /** Clip-set prefix: a four-legged monster plays "QIdle"/"QRun"/… from the same file. */
  prefix = "";
  actions: Partial<Record<ClipName, THREE.AnimationAction>> = {};
  current?: ClipName;
  busy?: ClipName;          // one-shot in flight
  dead = false;
  private moving = false;
  private sitting = false;     // resting pose replaces Idle while the character sits
  private riding = false;      // astride a mount: "Ride" replaces both Idle and Run

  constructor(private root: THREE.Object3D, prefix = "") {
    // "S" (slither): no legs to walk on — the two-legged clips without the leg tracks, and at rest or on the move
    // without the arm tracks either (a scorpion's pincers stayed "front legs" on the four-legged set)
    const slither = prefix === "S"; this.prefix = slither ? "" : prefix;
    this.mixer = new THREE.AnimationMixer(root);
    for (const [name, raw] of Object.entries(clips)) {
      let clip = raw;
      if (slither) { const still = name === "Idle" || name === "Run" ? /^(thigh|calf|foot|upperarm|lowerarm|hand)_/ : /^(thigh|calf|foot)_/;
        clip = new THREE.AnimationClip(raw.name, raw.duration, raw.tracks.filter(t => !still.test(t.name))); }
      const a = this.mixer.clipAction(clipRig ? retargetClip(clip, clipRig, root) : clip); this.actions[name as ClipName] = a;
      if (isOneShot(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }
    this.mixer.addEventListener("finished", (e: any) => {
      const done = (Object.entries(this.actions).find(([, a]) => a === e.action)?.[0]) as ClipName | undefined;
      if (done === this.busy && !String(done).endsWith("Death")) { this.busy = undefined; this.crossTo(this.rest(), 0.15); }
    });
    this.crossTo("Idle", 0);
  }

  /** Resolve through the prefix, falling back to the shared two-legged clip when a variant is missing. */
  private pick(name: ClipName): ClipName {
    return (this.prefix && this.actions[(this.prefix + name) as ClipName] ? this.prefix + name : name) as ClipName;
  }

  private crossTo(raw: ClipName, fade: number) {
    const name = this.pick(raw);
    const next = this.actions[name]; if (!next || this.current === name) return;
    next.timeScale = 1; next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.actions[this.current]!.fadeOut(fade);
    this.current = name;
  }

  private rest(): ClipName { return this.riding && this.actions.Ride ? "Ride" : this.moving ? "Run" : this.sitting && this.actions.Sit ? "Sit" : "Idle"; }
  /** Locomotion intent; ignored while a one-shot plays. */
  setMoving(moving: boolean, sitting = false, riding = false) {
    this.moving = moving; this.sitting = sitting && !moving; this.riding = riding; if (this.busy || this.dead) return;
    this.crossTo(this.rest(), this.sitting ? 0.35 : 0.12);
  }

  /** Fire a one-shot (`speed`: clip rate, e.g. attack speed). Hit does not interrupt attacks; Death wins over everything. Unknown clips fall back to Attack. */
  play(raw: ClipName, speed = 1) {
    if (this.dead) return;
    let name = this.pick(raw);
    if (!this.actions[name]) name = this.actions[raw] ? raw : "Attack";
    if (name === "Hit" && this.busy && this.busy !== "Hit") return;   // never cut a skill animation short
    if (String(raw) === "Death") { this.dead = true; this.busy = name; this.crossTo(raw, 0.08); return; }
    if (String(raw) === "Hit" && this.busy && !String(this.busy).endsWith("Hit")) return;
    this.busy = name; this.current = undefined;                 // force restart even if the same clip
    for (const a of Object.values(this.actions)) a.fadeOut(0.06);
    this.actions[name]!.timeScale = speed; this.actions[name]!.reset().setEffectiveWeight(1).fadeIn(0.06).play(); this.current = name;
  }

  revive() { this.dead = false; this.busy = undefined; this.current = undefined; this.mixer.stopAllAction(); this.crossTo("Idle", 0); }   // Death is clamped: stop it explicitly
  update(dt: number) { this.mixer.update(dt); updateArthropod(this.root, dt, this.moving, this.busy, this.dead); updateWildlife(this.root, dt, this.moving, this.busy, this.dead); }
}
