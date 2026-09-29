import { setupSkillPreview } from "./ui/skillpreview";
import { onFriendRequest, onFriends, onRanking, setupSocial } from "./ui/social";
import { capeRunning, flutterCapes, tickCapes } from "./render/cape";
import { setupOrientation } from "./ui/orient";
import { setMonsterMaker, setupCodex } from "./ui/codex";
import { updateCameraOcclusion } from './render/camera-occlusion';
import { followCamera } from '@shared/follow-camera';
import { setupSkillRing } from "./ui/skillring";
import { addContactShadow } from "./render/contact-shadow";
import { perfEnd, perfMark, perfStart, startPerfReports } from "./perf";
import { mountModel } from "./actors/mount-model";
import { playerModel } from "./actors/player-model";
import { updateAtmosphere } from "./world/atmosphere";
import { setMood, sfx, updateMusic } from "./audio/audio";
import { inTown } from "@shared/world";
import { applyMonsterAppearance } from "./actors/monster-appearance";
import { setupWorldMap, refreshWorldMap } from "./ui/worldmap";
import { updateLandscape } from "./world/landscape";
import { updateFountain } from "./world/town-buildings";
import * as THREE from "three";
import { ITEMS, MONSTERS, SKILLS, itemName } from "@shared/data";
import { countOf } from "@shared/inventory";
import { BREEDS, FAIRY_ITEM, PICK_RANGE, attackSkill, hasFairy, weaponOf } from "@shared/sim";
import { PICK_CURSOR, attackCursor } from "./ui/cursors";
import { MOUNTS } from "@shared/data";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { SimPlayer } from "@shared/sim";
import { camera, characterEnv, render, renderer, scene, toonFrom, warmup } from "./render/scene";
import { setGearEnv } from "./actors/gear";
import { Q } from "./render/quality";
import { Fairy } from "./actors/fairy";
import { ICON_Y, makeGoldPile, makeItemDrop, setDropEnv } from "./actors/drops";
import { pickLoot } from "./auto-loot";
setGearEnv(characterEnv); setDropEnv(characterEnv);
import { clockState, updateDayNight } from "./render/daynight";
import { forceLights, setupLights, updateLights } from "./render/lights";
import { loadGlb, loadGltf } from "./render/assets";
import { Animator, ClipName, loadClips } from "./actors/anim";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { Actor, animate, makeActor, makeQuirk, rig } from "./actors/actor";
import { clickables, layout, smith, streamWorld } from "./world/world";
import { groundY, zoneName } from "@shared/world";
import { findPath } from "@shared/path";
import { CITIES, isPK, zoneAt } from "@shared/regions";
import { Npc, spawnNpcs } from "./world/npc";
import { Action, move, pointer, setupInput } from "./input/input";
import { setupChannel } from "./ui/channel";
import { onGuildList, onGuildRequest, onGuildView, setupGuild } from "./ui/guild";
import { ringShow, AUTO, autoPotion, autoSkill, autoUsesBasic, setAuto, setupAuto } from "./ui/autobattle";
import { bindDead, floatText, showDead, toast, updateHud } from "./ui/hud";
import { bossSkillFx, levelUpFx, specialFx, buffAura, chill, earthSpikes, iceCrystals, swordWave, arrowRain, arrowShot, blueFire, flameBlade, frostNova, healCircle, lightning, meteor, slamBurst, telegraph, beam, castRing, dust, flash, healAura, hitFlash, shake, shockwave, slashTrail, sparkBurst, spinTrail, swingGlow, updateFx } from "./fx/fx";
import { GameApi, setGame } from "./ui/api";
import { bindMenu, tabbed, toggleWindow } from "./ui/windows";
import { chatFocused, say, setupChat, sys } from "./ui/chat";
import { setupStatus } from "./ui/status";
import { setupInventory } from "./ui/inventory";
import { setupEquip } from "./ui/equip";
import { applyEquipVisuals, bossLook, releaseMaterials } from "./actors/visuals";
import { setupHotbar } from "./ui/hotbar";
import { setupMail } from "./ui/mail";
import { setupHotkeys } from "./ui/hotkeys";
import { setupHotbarEditor } from "./ui/hbedit";
import { refreshCooking, setupCooking } from "./ui/cooking";
import { INGREDIENTS, RARITY, campfires, nearCampfire, nearWater, type Rarity } from "@shared/cooking";
import { riverPath, scenicBorders } from "@shared/scenery";
import { openNpc, setupNpc } from "./ui/npc";
import { onTradeRequest, onTradeView, setupTrade } from "./ui/trade";
import { setupSkills } from "./ui/skills";
import { setupOptions } from "./ui/options";
import { onMarket, setupMarket } from "./ui/market";
import { setupMinimapControls } from "./ui/minimap";
import { onPartyRequest, openPlayerMenu, setupParty } from "./ui/party";
import { enterWorld, loadingPhase } from "./ui/creator";
import type { Creation } from "./ui/creator";
import { NetHost, type BodyView, type GroundView, type Host, type MonsterView, type PlayerView } from "./net/host";

/** The local player: the host's sim state (read model + prediction) with the three.js actor merged in. */
export type Player = SimPlayer & Actor;
/** Everyone else on screen (remote players and monsters): a rig that follows a host view. */
interface Ride { kind: string; obj: THREE.Object3D; mixer: THREE.AnimationMixer; run?: THREE.AnimationAction; idle?: THREE.AnimationAction; t: number; w: number }
export interface Mob extends Actor { apart?: boolean;   // another guild's member in the guild grounds: not drawn (each guild has its grounds to itself)
  glide?: { fx: number; fz: number; tx: number; tz: number; u: number; span: number; at: number }; plateY?: number; ride?: Ride; fly?: number; gone?: number; id: string; kind: "player" | "monster"; view: BodyView; name: string; maxHP: number; level: number; equipJson: string; furColor: number; mount?: THREE.Object3D }

const RIDER_SEAT = 0.17;   // chibi pelvis sits this far above the rider's feet when astride (× rider scale)

// Every race and monster model starts downloading the moment the page opens, while the player is still picking a
// name: the single-file artifact embeds them all anyway, and remote players can be any race.
const MODELS = Promise.all(
  ["shiba", "knight-refined", "cat", "mouse", "wolf", "alpha", "fox", "boar", "shroom", "bear", "slime", "stump", "SM_Horse", "SM_LootBag", "SM_CoinPile", "SM_RangedKit", "bat"].map(n => loadGlb(`assets/${n}.glb`)).concat(loadClips() as any));
// Each kingdom's own beasts (work/blender/build_realm_beasts.py): fetched alongside but never waited for — the kingdoms
// that use them are a long walk from the start, and a beast met before its model arrives borrows the wolf's.
const REALM_MODELS = Object.fromEntries([...new Set(Object.values(MONSTERS).map(m => m.model))].filter(n => !["wolf", "alpha", "fox", "boar", "shroom", "bear", "slime", "stump", "bat"].includes(n))
  .map(n => [n, loadGlb(`assets/${n}.glb`)]));
const BREED_IDS = Object.keys(BREEDS).filter(id => !["dog", "cat", "mouse"].includes(id));
const BREED_MODELS = Promise.all(BREED_IDS.map(id => loadGlb(`assets/breeds/${id}.glb`)));


// Client loop: render + input + prediction. Every rule (combat, loot, AI, trade) runs in shared/sim.ts, on the server when online.
export async function startGame(creation: Creation, host: Host) {
  const [shibaSrc, knightSrc, catSrc, mouseSrc, wolfSrc, alphaSrc, foxSrc, boarSrc, shroomSrc, bearSrc, slimeSrc, stumpSrc, horseSrc, bagSrc, coinSrc, rangedSrc, batSrc] = await MODELS;
  const RACE_SRC: Record<string, THREE.Object3D> = { dog: playerModel(knightSrc, catSrc, shibaSrc), cat: playerModel(catSrc, catSrc, shibaSrc), mouse: playerModel(mouseSrc, catSrc, shibaSrc) };
  (await BREED_MODELS).forEach((src, i) => { RACE_SRC[BREED_IDS[i]] = playerModel(src, catSrc, shibaSrc, BREED_IDS[i]); });
  const sizeOf = (race: string) => BREEDS[race]?.size ?? 1;
  const MODEL_SRC: Record<string, THREE.Object3D> = { wolf: wolfSrc, alpha: alphaSrc, fox: foxSrc, boar: boarSrc, shroom: shroomSrc, bear: bearSrc, slime: slimeSrc, stump: stumpSrc, bat: batSrc };
  for (const [n, p] of Object.entries(REALM_MODELS)) p.then(src => { MODEL_SRC[n] = src; }).catch(e => console.warn("realm model", n, e));

  // (actors/monster-model.ts reshapes beasts toward "realistic" proportions — smaller heads, longer bodies; the game keeps
  // the original chibi models, as the player asked on 2026-09-25)

  // bow and staff: lifted off their socket bones in the kit, a copy goes onto the same bone of every player rig;
  // applyEquipVisuals shows whichever is equipped. The staff crystal glows.
  const RANGED = ["SM_HunterBow", "SM_MageStaff"].map(n => { const o = rangedSrc.getObjectByName(n)!; return { bone: o.parent!.name, obj: o }; });
  const armWeapons = (a: Actor) => { for (const w of RANGED) {
    const o = w.obj.clone(true); o.visible = false;
    o.traverse((n: any) => { if (n.isMesh) { n.castShadow = true; n.material = toonFrom(n.material); if (n.name.endsWith("_Gem")) { n.material.emissive?.set(0x2f7cff); n.material.emissiveIntensity = 1.4; } } });
    // the staff stood straight up beside the big chibi head and its crook went through it: lean the top out, away
    // from the body (its local +x points outward from the hand), and hold it a little further out
    if (w.obj.name === "SM_MageStaff") { o.rotateZ(-0.45); o.translateX(0.03); }
    a.bones[w.bone]?.add(o);
  } };
  const pa = makeActor(RACE_SRC[host.me.race] ?? knightSrc, {}); pa.obj.scale.setScalar(sizeOf(host.me.race));
  pa.obj.traverse((n: any) => { if (n.isMesh && n.name !== "contact-shadow") n.castShadow = true; });   // only the player casts a real shadow (rig)
  armWeapons(pa);
  const P = Object.assign(host.me, { obj: pa.obj, bones: pa.bones, lids: pa.lids, pos: pa.pos, anim: pa.anim, quirk: makeQuirk(0.14, 0.2, 0.8) }) as Player;
  P.pos.set(P.x, 0, P.z);
  // mounts: one animated steed per mounted actor (gallops while moving, idles otherwise); the rider plays "Ride"
  // and sits on the saddle whatever their size. Flyers hover and bob.
  const MOUNT_GLTF: Record<string, GLTF> = Object.fromEntries((await Promise.all(Object.entries(MOUNTS).map(async ([k, m]) => [k, await loadGltf(`assets/${m.model}.glb`).catch(() => null)]))).filter(([, g]) => g));
  const mountFor = (a: Actor & { ride?: Ride }, kind: string, moving: boolean, dt: number) => {
    if (a.ride && a.ride.kind !== kind) { if (a === P) toast(`ลงจาก${MOUNTS[a.ride.kind].name}แล้ว`); scene.remove(a.ride.obj); a.ride = undefined; }
    if (kind && !MOUNT_GLTF[kind]) kind = "horse";   // a mount whose model failed to load falls back to the horse
    if (kind && !a.ride) {
      const def = MOUNTS[kind], g = MOUNT_GLTF[kind], obj = mountModel(g.scene, kind);
      obj.scale.setScalar(def.scale); obj.traverse((n: any) => { if (n.isMesh) { n.castShadow = true; n.material = toonFrom(n.material); n.material.side = THREE.DoubleSide; } });   // double-sided: a dragon's wing membranes are single sheets
      const mixer = new THREE.AnimationMixer(obj), clip = (n: string) => g.animations.find(c => c.name === n);
      const run = clip("Gallop") && mixer.clipAction(clip("Gallop")!), idle = clip("Idle") && mixer.clipAction(clip("Idle")!);
      run?.play(); idle?.play(); scene.add(obj); a.ride = { kind, obj, mixer, run, idle, t: Math.random() * 6, w: 0 };
      if (a === P) toast(`${kind === "dragon" ? "🐉" : "🐴"} ขึ้น${def.name} — ${def.speed} เท่า (R อีกครั้งเพื่อลง)`);
    }
    const r = a.ride; if (!r) return;   // groundY already placed the actor on the deck; never reset an unmounted actor to sea level
    const def = MOUNTS[r.kind]; r.t += dt; r.w += ((moving ? 1 : 0) - r.w) * Math.min(1, dt * 6);   // blend gallop in/out
    r.run?.setEffectiveWeight(r.w); r.idle?.setEffectiveWeight(1 - r.w); r.mixer.update(dt * (moving ? 1.25 : 1));
    const y = a.pos.y + (def.fly ? def.fly + Math.sin(r.t * 2.2) * 0.1 : 0);   // a.pos.y: on a bridge deck the steed stands on it too
    r.obj.position.set(a.pos.x, y, a.pos.z); r.obj.rotation.y = a.yaw;
    a.obj.position.y = y + def.saddle * def.scale - RIDER_SEAT * a.obj.scale.y;
  };
  let visKey = ""; const refreshVisuals = () => { const k = JSON.stringify(P.equip) + P.furColor; if (k === visKey) return; visKey = k; applyEquipVisuals(P.obj, P.equip, P.furColor, host.me.race); };
  refreshVisuals();

  const npcs = spawnNpcs(knightSrc), mobs = new Map<string, Mob>();

  // ---------------------------------------------------------------- ground loot
  // One sack (or coin pile) per dropped stack, bobbing in place. The sim owns them; this only draws what it reports.
  interface Drop { obj: THREE.Object3D; view: GroundView; phase: number }
  const drops = new Map<string, Drop>();
  const picked = new Map<string, number>(), flying: { obj: THREE.Object3D; a: Actor; from: THREE.Vector3; t: number; s?: number }[] = [];   // drops on their way into a picker's hands
  const BAG_TINT: Record<string, number> = { Weapon: 0xb8c4d8, Armor: 0xb8c4d8, Consumable: 0xd08a7a, Key: 0xe0c070 };
  function syncDrops(list: GroundView[], dt: number) {
    const seen = new Set<string>();
    for (const g of list) {
      seen.add(g.id);
      if ((picked.get(g.id) ?? 0) > performance.now()) continue;   // already flying into someone's hands
      let d = drops.get(g.id);
      if (!d) {
        // a pile of real coins for gold; for an item, its own icon over a ring of light (actors/drops.ts)
        const obj = g.gold ? makeGoldPile(g.gold, Number(g.id.replace(/\D/g, "")) || 1) : makeItemDrop(g.itemId);
        scene.add(obj);
        d = { obj, view: g, phase: Math.random() * 6.28 }; drops.set(g.id, d);
        for (let i = 0; i < 3; i++) dust(new THREE.Vector3(g.x, 0, g.z), 0.3, 0xe8d9b8);
      }
      d.view = g; d.phase += dt * 2;
      d.obj.position.set(g.x, 0, g.z);
      if (g.gold) { d.obj.rotation.y += dt * 0.35; const gl = d.obj.getObjectByName("glint"); if (gl) (gl as THREE.Sprite).material.opacity = Math.max(0, Math.sin(d.phase * 1.3)) ** 6; }   // a glint now and then
      else { const ic = d.obj.getObjectByName("icon"); if (ic) ic.position.y = ICON_Y + Math.sin(d.phase) * 0.03; }                                   // the icon floats
    }
    for (let i = flying.length - 1; i >= 0; i--) {   // picked-up drops: a short arc into the hands, shrinking
      const f = flying[i]; f.t += dt / 0.35; const k = Math.min(1, f.t), to = f.a.pos.clone().add(new THREE.Vector3(Math.sin(f.a.yaw) * 0.2, 0.55, Math.cos(f.a.yaw) * 0.2));
      f.obj.position.lerpVectors(f.from, to, k); f.obj.position.y += Math.sin(k * Math.PI) * 0.5; f.obj.scale.setScalar(Math.max(0.05, (1 - k * 0.85)) * (f.s ??= f.obj.scale.x));
      if (k >= 1) { scene.remove(f.obj); f.obj.userData.ownsGeometry?.dispose(); f.obj.userData.ownsMaterial?.dispose(); (f.obj.getObjectByName("glint") as THREE.Sprite | undefined)?.material.dispose(); sparkBurst(to, 0xfff1c0, 5, 1.2, 1, 0.16, 0.3); flying.splice(i, 1); }
    }
    for (const [id, d] of drops) if (!seen.has(id)) {
      scene.remove(d.obj); drops.delete(id); if (pickTarget?.view.id === id) pickTarget = null;
      d.obj.userData.ownsGeometry?.dispose(); d.obj.userData.ownsMaterial?.dispose(); (d.obj.getObjectByName("glint") as THREE.Sprite | undefined)?.material.dispose();
    }
  }
  /** Nearest drop within reach — used by the pick-up key and by the walk-up-and-grab loop. */
  const nearestDrop = (r = PICK_RANGE) => [...drops.values()].filter(d => Math.hypot(d.view.x - P.x, d.view.z - P.z) < r).sort((a, b) => Math.hypot(a.view.x - P.x, a.view.z - P.z) - Math.hypot(b.view.x - P.x, b.view.z - P.z))[0];
  // the codex draws each monster as it looks in the world: its model, tint, realm decorations and boss form, standing
  setMonsterMaker(kind => {
    const def = MONSTERS[kind], { obj, bones } = rig(MODEL_SRC[def.model] ?? wolfSrc, def.tint), anim = new Animator(obj, def.clips ?? "");
    applyMonsterAppearance({ obj, bones, anim } as unknown as Actor, def); obj.scale.setScalar(def.scale); if (def.boss) bossLook(obj, def.pk ? "pk" : def.night ? "night" : "tyrant");
    anim.setMoving(false); anim.update(0.4); return obj;
  });
  const plateOf: Record<string, number> = {};   // name-plate height per monster model + scale
  function mobFor(v: BodyView, kind: Mob["kind"]) {
    let m = mobs.get(v.id); if (m) return m;
    const def = kind === "monster" ? MONSTERS[(v as MonsterView).kind] : undefined;
    const src = def ? MODEL_SRC[def.model] ?? wolfSrc : RACE_SRC[(v as PlayerView).race] ?? knightSrc;
    m = makeActor(src, { id: v.id, kind, view: v, name: def?.name ?? "", maxHP: v.maxHP, level: (v as MonsterView).level || (def?.level ?? 1), equipJson: "", furColor: 0 }, def?.clips ?? "", def?.tint) as Mob;
    m.quirk = makeQuirk(...(def?.quirk ?? (kind === "player" ? [0.14, 0.2, 0.8] : [0.18, 0.22, 1])));
    if (def) {
      applyMonsterAppearance(m, def); m.obj.scale.setScalar(def.scale); if (def.boss) bossLook(m.obj, def.pk ? "pk" : def.night ? "night" : "tyrant");
      // the name plate sits just over the model's real top, whatever its shape and size: skinned meshes are measured in
      // their posed shape (their stored bounds are the bind pose; bones overshoot; a scale guess floats off big ones)
      // (measured once per kind: posing every vertex of a skinned body is costly and every wolf is the same height)
      if (plateOf[def.model + (def.appearance ?? "") + def.scale] === undefined) {
        m.obj.updateMatrixWorld(true); const box = new THREE.Box3(), b = new THREE.Box3();
        m.obj.traverseVisible((n: any) => {
          if (!n.isMesh || n.name.startsWith("boss-aura") || n.name === "contact-shadow") return;
          if (n.isSkinnedMesh) { n.skeleton?.update(); n.computeBoundingBox(); box.union(b.copy(n.boundingBox).applyMatrix4(n.matrixWorld)); } else box.expandByObject(n);
        });
        plateOf[def.model + (def.appearance ?? "") + def.scale] = box.isEmpty() ? 1.2 * def.scale : box.max.y - m.obj.position.y + 0.2;
      }
      m.plateY = plateOf[def.model + (def.appearance ?? "") + def.scale];
    } else { m.obj.scale.setScalar(sizeOf((v as PlayerView).race)); armWeapons(m); }
    // only the player's own body casts a real shadow (see rig; realm decorations set their own): everyone else keeps a
    // soft contact shadow under their feet
    m.obj.traverse((n: any) => { if (n.isMesh) n.castShadow = false; });
    if (!m.obj.getObjectByName("contact-shadow")) addContactShadow(m.obj);
    m.pos.set(v.x, 0, v.z); m.yaw = v.yaw; m.alive = v.alive; if (!v.alive) m.anim.play("Death"); bossAura(m);
    mobs.set(v.id, m); return m;
  }
  let combatT = 99;
  const nearXZ = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x - P.pos.x, z - P.pos.z) / 28);   // sound falloff
  const near = (a: Actor) => nearXZ(a.pos.x, a.pos.z);
  const actorOf = (id: string): Actor | undefined => id === P.id ? P : mobs.get(id);
  // ---------------------------------------------------------------- map changes
  // Crossing a zone border shows the map's name; if the map was not built yet (the player never stood still next door,
  // a respawn, a jump across the world) a short loading card covers the frame in which it is built. Monsters farther
  // than STREAM_R are not given a body at all.
  const STREAM_R = 70, DRAW_R = Q.name === "low" ? 42 : 55, FRESH_PER_FRAME = 6;   // STREAM_R: bodies for the map in view and its near edges only (one map at a time, like world/world.ts)
    // DRAW_R: a little past the fog's far end (scene.ts); the smooth mode keeps fewer bodies in the scene
  const banner = Object.assign(document.createElement("div"), { id: "zone-banner", className: "hud" }), loadCard = Object.assign(document.createElement("div"), { id: "zone-load", className: "hud", hidden: true });
  document.body.append(banner, loadCard);
  let bannerT = 0, firstZone = true, stillT = 0, lastHitBy = "";
  const enterZone = (name: string, kind: string, loaded: boolean) => {
    if (loaded) { loadCard.innerHTML = `<b>กำลังโหลดแผนที่</b><span>${name}</span><i></i>`; loadCard.hidden = false; setTimeout(() => { loadCard.hidden = true; }, 450); }
    if (firstZone) { firstZone = false; return; }
    banner.innerHTML = `<small>${kind}</small><b>${name}</b>`; banner.classList.remove("show"); void banner.offsetWidth; banner.classList.add("show");
    clearTimeout(bannerT); bannerT = window.setTimeout(() => banner.classList.remove("show"), 2600);
  };

  // ---------------------------------------------------------------- soft lock
  // With no clicked target, the monster nearest to where the character faces (within SOFT_RANGE) is soft-locked:
  // a thin ring marks it and any attack or targeted skill turns to face it first. A basic attack from too far walks
  // up and keeps swinging. Tab / "เป้า" first hard-locks the highlighted one, then steps to the next by distance
  // (same as clicking it); Esc or the ✕ on the target frame lets go. A hard lock follows the fight: when the target
  // dies the next nearest foe is locked, a monster that hits an unlocked player becomes the target, and a target that
  // gets farther than LOCK_DROP is let go. The target frame (top of the screen) shows name, level and HP.
  const SOFT_RANGE = 8, CYCLE_RANGE = 20, LOCK_DROP = 30;
  let softTarget: Mob | null = null;
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 40), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.5, depthWrite: false }));   // small, thin: marks the target without shouting
  lockRing.rotation.x = -Math.PI / 2; lockRing.visible = false; scene.add(lockRing);
  // auto battle's search radius (AUTO.range), drawn round the feet while auto is on: a thin dashed-looking ring
  const autoRing = new THREE.Mesh(new THREE.RingGeometry(0.988, 1, 128), new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.3, depthWrite: false }));
  autoRing.rotation.x = -Math.PI / 2; autoRing.visible = false; scene.add(autoRing);
  const liveMonsters = () => [...mobs.values()].filter(m => m.kind === "monster" && m.alive && m.obj.visible);
  // in a free-PK map other players (also standing in one) are fair game for the lock, Tab and a click; the server
  // decides what actually lands (party mates, town walls)
  const pkFoe = (m: Mob) => m.kind === "player" && m.alive && isPK(P) && !inTown(P) && isPK(m.pos) && !inTown(m.pos);
  const liveFoes = () => [...mobs.values()].filter(m => (m.kind === "monster" && m.alive && m.obj.visible) || pkFoe(m));
  // the soft lock is simply the nearest foe (weighting the one ahead made it skip a closer one at the player's side or back)
  const pickSoft = () => {
    let best: Mob | null = null, bd = SOFT_RANGE;
    for (const m of liveFoes()) { const d = Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z); if (d < bd) { bd = d; best = m; } }
    return best;
  };
  const lockOf = () => (api.target && api.target.alive && (api.target.kind === "monster" || pkFoe(api.target as Mob)) ? api.target : softTarget);
  const TARGET_FRAME_OFF = true;
  const tframe = Object.assign(document.createElement("div"), { id: "tframe", className: "hud frame", hidden: true });
  tframe.innerHTML = `<div class="tf-top"><b class="nm"></b><small class="lv"></small><button type="button" class="x" title="ปลดล็อกเป้า">✕</button></div><div class="bar"><i></i><span></span></div>`;
  document.body.append(tframe);
  tframe.querySelector(".x")!.addEventListener("click", () => { api.target = null; attackTarget = null; });
  let tfSig = "";
  const drawTargetFrame = (t: Mob | null) => {
    if (TARGET_FRAME_OFF) { tframe.hidden = true; return; }   // the name + HP plate over the target is enough (asked 2026-09-26)
    const hard = !!t && t === api.target;
    tframe.hidden = !hard; if (!hard) { tfSig = ""; return; }
    const boss = t.kind === "monster" && MONSTERS[(t.view as MonsterView).kind]?.boss, hp = Math.max(0, Math.ceil(t.hp)), sig = `${t.id}|${hp}|${t.maxHP}`;
    if (sig === tfSig) return; tfSig = sig;
    tframe.classList.toggle("boss", !!boss);
    tframe.querySelector(".nm")!.textContent = (boss ? "BOSS · " : "") + t.name;
    tframe.querySelector(".lv")!.textContent = t.kind === "player" ? "ผู้เล่น (PK)" : `Lv ${t.level}`;
    (tframe.querySelector(".bar i") as HTMLElement).style.width = `${Math.min(100, hp / Math.max(1, t.maxHP) * 100)}%`;
    tframe.querySelector(".bar span")!.textContent = `${hp} / ${t.maxHP}`;
  };
  /** The nearest live foe within `r` (excluding `not`): what a lock moves on to. */
  const nearestFoe = (r: number, not?: Mob) => liveFoes().filter(m => m !== not && m.pos.distanceTo(P.pos) < r).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0] ?? null;
  const updateLock = (dt: number) => {
    if (api.target && api.target.pos.distanceTo(P.pos) > LOCK_DROP) api.target = null;   // ran off, or we did
    softTarget = P.alive ? pickSoft() : null;
    const t = lockOf(); drawTargetFrame(t);
    lockRing.visible = !!t && t === api.target;   // the ring only marks a monster that was clicked (or Tab-locked), never the soft pick
    if (!lockRing.visible) return;
    const hard = t === api.target, k = t.obj.scale.x;
    lockRing.position.set(t.pos.x, 0.04, t.pos.z); lockRing.scale.setScalar(k * (hard ? 1 + Math.sin(performance.now() / 180) * 0.03 : 1));
    const m = lockRing.material as THREE.MeshBasicMaterial; m.color.set(hard ? 0xff4a2a : 0xffb040); m.opacity = hard ? 0.5 : 0.28; void dt;
  };
  const cycleLock = () => {
    // first press: lock what the ring already shows; after that, step through the foes around by distance
    if (!api.target && softTarget) { api.target = softTarget; return; }
    const list = liveFoes().filter(m => m.pos.distanceTo(P.pos) < CYCLE_RANGE).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
    if (!list.length) { api.target = null; return; }
    const i = api.target ? list.indexOf(api.target as Mob) : -1; api.target = list[(i + 1) % list.length];
  };
  /** Auto battle's next prey: the locked monster, else the nearest one within AUTO.range that can be walked to —
   *  not one across a river, a cliff or the map's edge, which it used to press against forever. A foe it could not
   *  reach (no route, a long detour, or no headway while walking at it) is left alone for a while. */
  const shunned = new Map<Mob, number>();
  const reachable = (m: Mob) => {
    const zone = zoneAt(P); if (zoneAt(m.pos) !== zone) return false;
    const pad = 12, box = { x0: Math.max(zone.x0, Math.min(P.x, m.pos.x) - pad), x1: Math.min(zone.x1, Math.max(P.x, m.pos.x) + pad), z0: Math.max(zone.z0, Math.min(P.z, m.pos.z) - pad), z1: Math.min(zone.z1, Math.max(P.z, m.pos.z) + pad) };
    const path = findPath(layout, P, { x: m.pos.x, z: m.pos.z }, box); if (!path) return false;   // searched near the two only: a small grid, a quick answer
    let len = 0, a = { x: P.x, z: P.z }; for (const w of path) { len += Math.hypot(w.x - a.x, w.z - a.z); a = w; }
    return len <= m.pos.distanceTo(P.pos) * 1.5 + 3;   // a long way round: the straight walk would stall at the edge
  };
  // auto's ground: AUTO.range round the spot where auto was switched on (not round the player, which walked the circle
  // off after every kill); with nothing left to do, auto walks back to it
  const autoHome = new THREE.Vector3(); let autoWasOn = false, autoSteered = false;
  const inField = (p: THREE.Vector3) => Math.hypot(p.x - autoHome.x, p.z - autoHome.z) <= AUTO.range;
  const hunt = () => {
    const now = performance.now(), ok = (m: Mob) => !((shunned.get(m) ?? 0) > now);
    const t = api.target && lockOf() === api.target ? api.target : null;   // the player's own lock is obeyed; the soft ring is just "nearest" and gets checked below
    if (t && ok(t) && inField(t.pos)) return t;
    const near = liveMonsters().filter(m => ok(m) && inField(m.pos)).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos));
    for (const m of near.slice(0, 4)) { if (reachable(m)) return (api.target = m); shunned.set(m, now + 8000); }   // a few per frame: A* is not free
    return null;
  };
  let headway = { m: null as Mob | null, d: Infinity, t: 0 };
  /** Auto battle's loot run (the Auto window's two ticks): the nearest drop within AUTO.range this player may take —
   *  its own, its party's, or one past the owner window — of the ticked kinds (items / gold). A drop it could not take
   *  (a full bag) is not chosen again for a while, so auto never circles one. */
  const lootTried = new Map<string, number>(); let lootCheckT = 0; const CLOSE = 2;   // a monster this close is fought before any loot
  /** How far the weapon in hand reaches: auto's "stay" mode fights only what comes this close. */
  const reachNow = () => SKILLS[attackSkill(P.equip, P.inv, P.mp)].range!;
  /** Auto's own walking (to a drop, back to its spot): along an A* route round trees, rocks and walls instead of a
   *  straight line that stalled against the first obstacle. The route is planned once per goal and followed point by
   *  point; returns the direction to step this frame (null when there). */
  let steerGoal: THREE.Vector3 | null = null, steerPath: { x: number; z: number }[] = [], steerStuck = { x: 0, z: 0, t: 0 };
  const steer = (x: number, z: number, stop = 0.3): { x: number; z: number } | null => {
    const d = Math.hypot(x - P.x, z - P.z); if (d < stop) return null;
    // no headway for 0.8 s (brushing the fountain's rim): plan again from here, through free cells only
    const now = performance.now(), moved = Math.hypot(P.x - steerStuck.x, P.z - steerStuck.z) > 0.15;
    if (moved) steerStuck = { x: P.x, z: P.z, t: now };
    const stuck = !moved && now - steerStuck.t > 800; if (stuck) steerStuck.t = now;
    if (stuck || !steerGoal || Math.hypot(steerGoal.x - x, steerGoal.z - z) > 0.5) {
      steerGoal = new THREE.Vector3(x, 0, z); const zone = zoneAt(P), pad = 10;
      const box = { x0: Math.max(zone.x0, Math.min(P.x, x) - pad), x1: Math.min(zone.x1, Math.max(P.x, x) + pad), z0: Math.max(zone.z0, Math.min(P.z, z) - pad), z1: Math.min(zone.z1, Math.max(P.z, z) + pad) };
      steerPath = (stuck && findPath(layout, P, { x, z }, box, 0.45, true, true)) || findPath(layout, P, { x, z }, box, 0.4, true) || [];
    }
    while (steerPath.length > 1 && Math.hypot(steerPath[0].x - P.x, steerPath[0].z - P.z) < 0.4) steerPath.shift();
    const to = steerPath[0] ?? { x, z }, l = Math.hypot(to.x - P.x, to.z - P.z) || 1;
    return { x: (to.x - P.x) / l, z: (to.z - P.z) / l };
  };
  /** The buff on me (War Cry), for the HUD chip: counted down here, the sim holds the real timer. */
  let buffShown: { name: string; icon: string; until: number } | null = null;
  const buffChip = Object.assign(document.createElement("div"), { className: "hud buffchip" }); buffChip.hidden = true; document.body.appendChild(buffChip);
  const drawBuff = () => { const left = buffShown ? (buffShown.until - performance.now()) / 1000 : 0; buffChip.hidden = left <= 0 || !P.alive;
    if (left > 0) { const t = `${buffShown!.icon} ${buffShown!.name} ${Math.ceil(left)} วิ`; if (buffChip.textContent !== t) buffChip.textContent = t; } else buffShown = null; };
  const lootNext = (): Drop | null => {
    const now = performance.now(), best = pickLoot(drops.values(), { id: P.id, x: autoHome.x, z: autoHome.z, party: P.party }, id => (mobs.get(id)?.view as PlayerView | undefined)?.party,
      { items: AUTO.lootItems, gold: AUTO.lootGold, range: AUTO.range }, lootTried, now);   // drops inside auto's circle
    if (best) lootTried.set(best.view.id, now + 8000);
    return best;
  };
  const NO_AIM = new Set(["dash", "heal", "revive"]);
  const act = (kind: Action, at?: THREE.Vector3) => {
    if (!(P.alive && P.busy <= 0 && (P.cd[kind] ?? 0) <= 0 && P.skills.includes(kind))) return;   // the sim refuses mid-animation too
    if (at) { P.yaw = Math.atan2(at.x - P.pos.x, at.z - P.pos.z); host.cmd("act", kind, P.yaw, at.x, at.z); return; }   // aimed by hand (press, drag, let go)
    // face what is being fought (auto's or a click's target) before the nearest foe: the soft pick could be another
    // monster, and the swing went its way and missed the one being chased
    const S = SKILLS[kind === "SKILL_BASIC" ? attackSkill(P.equip, P.inv, P.mp) : kind], t = attackTarget?.alive ? attackTarget : lockOf();
    if (t && S && !NO_AIM.has(S.kind) && !S.self) {
      P.yaw = Math.atan2(t.pos.x - P.pos.x, t.pos.z - P.pos.z);
      if (kind === "SKILL_BASIC" && t.pos.distanceTo(P.pos) > (S.range ?? 1.4) + 0.3) { attackTarget = t; return; }   // too far: walk up, then swing
    }
    host.cmd("act", kind, P.yaw);
  };

  // ---------------------------------------------------------------- aimed skills
  // Hold a skill (the phone's ring button, or its hotkey) and drag: an area skill is placed where it will land, a
  // forward one (cone, line, shot) is pointed. Letting go casts it there; a quick tap still aims by itself. Skills
  // centred on the caster (self, a full circle) and the basic attack are never aimed.
  // only area skills are placed by hand; everything else (cones, lines, shots) aims itself at the target as before
  const aimKind = (id: string): "area" | "dir" | null => { const S = SKILLS[id]; return S && S.kind === "aoe" && !S.self ? "area" : null; };
  const aimMat = () => new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.32, depthWrite: false, depthTest: false, side: THREE.DoubleSide });   // drawn over props: the aim must never hide
  const aimReach = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), aimMat()), aimSpot = new THREE.Mesh(new THREE.CircleGeometry(1, 40), aimMat());
  const aimLine = new THREE.Group(), aimBar = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), aimMat());   // the bar points along the group's +z
  aimBar.rotation.x = Math.PI / 2; aimBar.renderOrder = 5; aimLine.add(aimBar);
  for (const m of [aimReach, aimSpot]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 5; }
  for (const m of [aimReach, aimSpot, aimLine]) { m.visible = false; scene.add(m); }
  let aim: { id: string; kind: "area" | "dir"; at: THREE.Vector3 } | null = null;
  const aimRange = (id: string) => SKILLS[id].range ?? 6;
  /** Point the held skill: `screen` = the mouse (a ground point, kept within reach), `drag` = the finger's pull from the
   *  button (screen px; direction by the camera, distance by how far it is pulled). null = drop the aim. */
  const aimAt = (id: string, w: { x: number; y: number } | { dx: number; dy: number } | null) => {
    const kind = aimKind(id); if (!w || !kind) { aim = null; return; }
    const R = aimRange(id), to = new THREE.Vector3();
    if ("x" in w) { ndc.set(w.x / innerWidth * 2 - 1, -(w.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); if (!ray.ray.intersectPlane(groundPlane, to)) return; to.sub(P.pos).setY(0); }
    else { const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize(); const r = new THREE.Vector3(-f.z, 0, f.x); to.addScaledVector(r, w.dx).addScaledVector(f, -w.dy); const l = to.length(); if (l < 1e-3) return; to.multiplyScalar(Math.min(1, l / 110) * R / l); }
    if (kind === "dir" || to.length() > R) to.setLength(R);   // a pointed skill always shows its full reach
    aim = { id, kind, at: to.add(P.pos).setY(0) };
  };
  const updateAim = () => {
    const on = !!aim && P.alive; aimReach.visible = on; aimSpot.visible = on && aim!.kind === "area"; aimLine.visible = on && aim!.kind === "dir"; if (!on) return;
    const S = SKILLS[aim!.id], R = aimRange(aim!.id);
    aimReach.position.set(P.pos.x, 0.05, P.pos.z); aimReach.scale.setScalar(R);
    if (aim!.kind === "area") { aimSpot.position.set(aim!.at.x, 0.06, aim!.at.z); aimSpot.scale.setScalar(S.radius ?? 2); }
    else { const w = Math.max(0.8, (S.radius ?? 0) * 2, S.cone ? 2 * R * Math.tan(Math.min(60, S.cone / 2) * Math.PI / 180) * 0.5 : 0);
      aimLine.position.set(P.pos.x, 0.06, P.pos.z); aimLine.rotation.y = Math.atan2(aim!.at.x - P.pos.x, aim!.at.z - P.pos.z); aimBar.scale.set(w, R, 1); }
  };

  const api: GameApi = {
    P, mobs, npcs, online: host.online, target: null, drops: () => host.ground(), act, aimKind, aimAt, aimCast() { const a = aim; aim = null; if (a) act(a.id, a.at); }, kills: 0, crafted: false, autoMode: "melee",
    useItem: id => host.cmd("use", id), equipInst: id => host.cmd("equipInst", id), unequipSlot: s => host.cmd("unequipSlot", s),
    learn: id => host.cmd("learn", id),
    mount() { const w = P.inv.items.find(s => s.itemId === "MOUNT_HORSE"); if (w) host.cmd("use", w.id); else sys(`ยังไม่มี ${ITEMS.MOUNT_HORSE.name} — ซื้อที่ร้านเครื่องมือ ${ITEMS.MOUNT_HORSE.buy} Gold`); },
    allocate: (a, n) => host.cmd("allocate", a, n), craft: r => host.cmd("craft", r), buy: (i, n) => host.cmd("buy", i, n), sell: (i, n) => host.cmd("sell", i, n), mail: (c, id) => host.cmd(c, id), partyRules: (e, l) => host.cmd("partyRules", e, l), cook: f => host.cmd("cook", f), fish: yaw => host.cmd("fish", yaw),
    restyle(color) { host.cmd("restyle", color); try { const c = JSON.parse(localStorage.getItem("bk.char") ?? "{}"); c.color = color; localStorage.setItem("bk.char", JSON.stringify(c)); } catch {} },
    sit: () => host.cmd("sit"), say: (text, chan) => host.say(text, chan),
    market: (cmd, ...args) => host.cmd(cmd, ...args),
    quest: (cmd, id) => host.cmd(cmd, id),
    partyInvite: id => host.cmd("partyInvite", id), partyAccept: () => host.cmd("partyAccept"), partyLeave: () => host.cmd("partyLeave"), partyKick: id => host.cmd("partyKick", id), respawnTown: (town?: string) => host.cmd("respawnTown", town), deathAt: null, reviveSelf: () => host.cmd("reviveSelf"), guild: (cmd, ...args) => host.cmd(cmd, ...args), social: (cmd, ...args) => host.cmd(cmd, ...args),
    previewSkill: (id: string) => {   // the events the sim would send, played locally: the clip + fx, no damage, nothing spent
      const S = SKILLS[id]; if (!S || !P.alive) return;
      const ahead = (d: number) => ({ x: P.pos.x + Math.sin(P.yaw) * d, z: P.pos.z + Math.cos(P.yaw) * d });
      onEvent({ t: "cast", id: P.id, skill: id } as any);
      setTimeout(() => {
        if (S.kind === "ranged") { const r = S.range ?? 6, at = ahead(r); onEvent({ t: "shot", id: P.id, skill: id, x: at.x, z: at.z, travel: r / (S.speed ?? 20) } as any); }
        else if (S.kind === "aoe") { const at = S.self ? { x: P.pos.x, z: P.pos.z } : ahead((S.range ?? 5) * 0.7); onEvent({ t: "aoe", id: P.id, skill: id, x: at.x, z: at.z, delay: S.delay ?? 0 } as any); }
        else if (S.kind === "buff") buffAura(P);
      }, S.hit * 1000);
    },
    tradeReq: id => host.cmd("tradeReq", id), tradeAccept: () => host.cmd("tradeAccept"), tradeOffer: (items, gold) => host.cmd("tradeOffer", items, gold), tradeConfirm: () => host.cmd("tradeConfirm"), tradeCancel: () => host.cmd("tradeCancel"),
    walkTo(x, z) {
      // a click past the map's edge (across a bridge, out through a gate) plans over both maps: the border's walls,
      // rivers and cliffs leave only the real way through, so the route finds it instead of stopping at the edge
      const here = zoneAt(P), there = zoneAt({ x, z }), zone = there === here ? here
        : { x0: Math.min(here.x0, there.x0), x1: Math.max(here.x1, there.x1), z0: Math.min(here.z0, there.z0), z1: Math.max(here.z1, there.z1) };
      const path = findPath(layout, P, { x: THREE.MathUtils.clamp(x, zone.x0 + 0.5, zone.x1 - 0.5), z: THREE.MathUtils.clamp(z, zone.z0 + 0.5, zone.z1 - 0.5) }, zone);
      if (!path || !P.alive) return false;
      route = path.map(p => new THREE.Vector3(p.x, 0, p.z)); moveTarget = route.shift()!; attackTarget = npcTarget = pickTarget = null; api.target = null;
      { const e = route.at(-1) ?? moveTarget; marker.position.set(e.x, groundY(e, layout) + 0.03, e.z); } (marker.material as THREE.MeshBasicMaterial).opacity = 0.9;   // on the deck of a bridge, not under it
      return true;
    },
    route: () => (moveTarget ? [moveTarget, ...route] : []),
    cameraReset() { camZoom = 1; }, zoom(v) { camZoom = THREE.MathUtils.clamp(v, 0.7, 1.5); },
  };
  setGame(api);
  if (host.online) startPerfReports(NetHost.url.replace(/^ws/, "http") + "/perf", () => ({ zone: zoneName(P), bodies: mobs.size, channel: host.channel }));
  bindDead(api.respawnTown, api.reviveSelf);
  setupWorldMap(); setupParty(); setupMarket(); setupMinimapControls(); if (host instanceof NetHost) setupChannel(host);
  host.onChat = (who, text, chan) => say(who, text, chan);

  // ---------------------------------------------------------------- UI
  setupLights(); bindMenu(); setupChat(); setupStatus(); setupInventory(); setupEquip(); setupHotbar(); setupSkillRing(); setupNpc(); setupCodex(); setupOptions(); setupTrade(); setupSkills(); setupAuto(); setupGuild(); setupSocial(); setupSkillPreview(); setupMail(); setupHotkeys(); setupHotbarEditor();
  tabbed("skills", [["skills", "📖 สกิล"], ["hbedit", "🎛 Hotbar"], ["auto", "🤖 Auto"]]);   // one window for everything about skills
  // ---------------------------------------------------------------- campfires (shared/cooking.ts): logs, a stone ring and a flickering flame
  const fireFlames: THREE.Mesh[] = [];
  {
    const logGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.8, 7).rotateZ(Math.PI / 2), stoneGeo = new THREE.DodecahedronGeometry(0.11);
    const flameGeo = new THREE.ConeGeometry(0.22, 0.6, 9).translate(0, 0.3, 0), innerGeo = new THREE.ConeGeometry(0.12, 0.4, 7).translate(0, 0.2, 0);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.95 }), stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), innerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const f of campfires(layout)) {
      const g = new THREE.Group(); g.position.set(f.x, groundY(new THREE.Vector3(f.x, 0, f.z), layout), f.z); g.name = "campfire";
      for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(logGeo, logMat); l.rotation.y = i * Math.PI / 3; l.position.y = 0.06; g.add(l); }
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, s = new THREE.Mesh(stoneGeo, stoneMat); s.position.set(Math.cos(a) * 0.5, 0.06, Math.sin(a) * 0.5); s.rotation.set(a, a * 2, 0); g.add(s); }
      const fl = new THREE.Mesh(flameGeo, flameMat), inner = new THREE.Mesh(innerGeo, innerMat); fl.position.y = inner.position.y = 0.08; g.add(fl, inner); fireFlames.push(fl, inner);
      scene.add(g);
    }
  }
  const nearFire = () => nearCampfire(P, layout);
  setupCooking(nearFire);
  const cookBtn = Object.assign(document.createElement("button"), { id: "cookbtn", type: "button", className: "hud", textContent: "🔥 ทำอาหาร", hidden: true });
  cookBtn.addEventListener("click", () => toggleWindow("cook", true)); document.body.append(cookBtn);
  // 🎣 at a river bank: cast a line; the button waits while a fish is on its way
  const fishBtn = Object.assign(document.createElement("button"), { id: "fishbtn", type: "button", className: "hud", textContent: "🎣 ตกปลา", hidden: true });
  fishBtn.addEventListener("click", () => { const w = waterAhead(); if (w) P.yaw = Math.atan2(w.x - P.pos.x, w.z - P.pos.z); api.fish(P.yaw); }); document.body.append(fishBtn);
  // ---------------------------------------------------------------- fishing animation: rod in hand, a line to a bobber that floats, dips at the bite, and flies back with the catch
  const riverPts = scenicBorders().filter(b => b.look === "river").flatMap(b => riverPath(b));
  /** Where the bobber lands: toward the nearest water, 3.5 m out at most. */
  const waterAhead = () => {
    let best: (typeof riverPts)[number] | undefined, bd = Infinity;
    for (const q of riverPts) { const d = Math.hypot(q.x - P.pos.x, q.z - P.pos.z); if (d < bd) { bd = d; best = q; } }
    if (!best || bd > 12) return undefined;
    if (bd < best.halfWidth + 0.3) {   // over the water: on a bridge — face off its side, along the river, and drop the line there
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), s = -best.nz * fx + best.nx * fz >= 0 ? 1 : -1;   // the side nearer the way we face
      return new THREE.Vector3(P.pos.x - best.nz * s * 2.6, 0.05, P.pos.z + best.nx * s * 2.6);
    }
    const k = Math.min(1, 3.5 / (bd || 1));
    return new THREE.Vector3(P.pos.x + (best.x - P.pos.x) * k, 0.05, P.pos.z + (best.z - P.pos.z) * k);
  };
  const rod = new THREE.Group(), rodTip = new THREE.Object3D(); rod.name = "fishing-rod";
  rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.018, 1.0, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.7 })),
    new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateZ(Math.PI / 2).translate(0.03, 0.16, 0), new THREE.MeshStandardMaterial({ color: 0xb8c2cc, metalness: 0.6, roughness: 0.35 })));
  rodTip.position.y = 1.0; rod.add(rodTip); rod.position.set(0.17, 0.32, 0.06); rod.rotation.x = 0.95;   // held out in front, tip up and over the water
  const bobber = new THREE.Group();
  bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0322a, roughness: 0.4 })),
    new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.4 })));
  const lineGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 16 }, () => new THREE.Vector3()));
  const fishLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.8 })); fishLine.frustumCulled = false;
  let fv: { at: THREE.Vector3; t0: number; end: number; reel?: number; hidden: THREE.Object3D[] } | null = null;
  const tipW = new THREE.Vector3(), mid = new THREE.Vector3();
  const stopFishing = () => { if (!fv) return; rod.removeFromParent(); bobber.removeFromParent(); fishLine.removeFromParent(); fv.hidden.forEach(o => (o.visible = true)); fv = null; };
  const updateFishing = () => {
    const now = performance.now() / 1000;
    if (P.fishing && !fv && P.alive) {   // cast: rod in hand (weapon put away), bobber out on the water
      const at = waterAhead(); if (!at) return;
      const hidden: THREE.Object3D[] = []; P.obj.traverse(o => { if (o !== P.obj && o.visible && /sword|bow|staff|weapon|shield/i.test(o.name)) { o.visible = false; hidden.push(o); } });
      P.obj.add(rod); scene.add(bobber, fishLine); bobber.position.copy(at); fv = { at, t0: now, end: now + P.fishing.t, hidden };
    }
    if (!fv) return;
    if (!P.fishing && fv.reel === undefined) { if (fishCaught) fv.reel = now; else { stopFishing(); return; } }
    fishCaught = false;
    if (fv.reel !== undefined) {   // the catch: the bobber flies back to the hand in a hop
      const k = Math.min(1, (now - fv.reel) / 0.45); rod.getWorldPosition(tipW);
      bobber.position.lerpVectors(fv.at, tipW, k).setY(THREE.MathUtils.lerp(0.05, tipW.y, k) + Math.sin(k * Math.PI) * 0.8);
      if (k >= 1) { stopFishing(); return; }
    } else {
      const left = fv.end - now, t = now - fv.t0;
      bobber.position.set(fv.at.x, 0.05 + Math.sin(t * 3) * 0.012, fv.at.z);
      if (left < 0.9) { bobber.position.y -= Math.abs(Math.sin(t * 16)) * 0.05; rod.rotation.z = Math.sin(t * 20) * 0.05; }   // a bite: the bobber jerks under, the rod tip twitches
      else rod.rotation.z = 0;
    }
    rodTip.getWorldPosition(tipW); const pts = lineGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < 16; i++) { const u = i / 15; mid.lerpVectors(tipW, bobber.position, u); mid.y -= Math.sin(u * Math.PI) * 0.25 * (fv.reel === undefined ? 1 : 0.3); pts.setXYZ(i, mid.x, mid.y, mid.z); }   // a little sag
    pts.needsUpdate = true;
  };
  let fishCaught = false;
  let fireT = 0;
  const updateFires = (dt: number) => {
    updateFishing();   // every frame: the bobber and line move smoothly
    const t = performance.now() / 1000; fireFlames.forEach((m, i) => { const k = 1 + Math.sin(t * 9 + i * 1.7) * 0.12 + Math.sin(t * 23 + i) * 0.06; m.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k)); });
    if ((fireT -= dt) > 0) return; fireT = 0.25; cookBtn.hidden = !(P.alive && nearFire()); refreshCooking();   // the button and the window follow the player
    const fishing = !!P.fishing; fishBtn.hidden = !(P.alive && (fishing || nearWater(P))); fishBtn.disabled = fishing; fishBtn.textContent = fishing ? "🎣 รอปลากินเบ็ด… (เดิน = ยกเลิก)" : "🎣 ตกปลา";
  };

  document.getElementById("sitbtn")!.addEventListener("click", api.sit); document.getElementById("cambtn")!.addEventListener("click", api.cameraReset);
  setupInput(act, renderer.domElement); setupOrientation();   // after setupInput: it marks touch devices
  let camZoom = 1; renderer.domElement.addEventListener("wheel", e => { camZoom = THREE.MathUtils.clamp(camZoom + Math.sign(e.deltaY) * 0.1, 0.7, 1.5); }, { passive: true });
  addEventListener("keydown", e => {
    if (chatFocused()) return;
    if (e.code === "Tab") { e.preventDefault(); cycleLock(); }
    if (e.code === "Escape") { api.target = null; attackTarget = null; }
    if (e.code === "KeyE") { const n = nearestNpc(2.2); if (n) openNpc(n); else if (nearFire()) toggleWindow("cook", true); }   // E: talk, or cook at a campfire
    if (e.code === "KeyR") api.mount();
    if (e.code === "KeyF") { const d = nearestDrop(); if (d && pickCd <= 0) { pickCd = 0.6; host.cmd("pickup", d.view.id); } }
  });
  sys(host.online ? "ออนไลน์ — ผู้เล่นคนอื่นในแมพเดียวกันมองเห็นกัน · คลิกผู้เล่นเพื่อขอแลกของ" : `โหมดออฟไลน์ (${host.reason === "already online" ? "ตัวละครนี้ออนไลน์อยู่แล้วในอีกแท็บ" : "ไม่พบ server"}) — เล่นคนเดียว ไม่บันทึก`, "lvl");

  // ---------------------------------------------------------------- mouse / tap
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitPt = new THREE.Vector3();
  let route: THREE.Vector3[] = [];   // the rest of a click-to-walk trip from the full-screen map
  /** A boss's red ring goes with its life: gone from the corpse, back when it respawns. */
  const bossAura = (m: Mob) => { const au = m.obj.getObjectByName("boss-aura"); if (au) au.visible = m.alive; };
  let pathGoal: THREE.Vector3 | null = null;
  const fairies = new Map<string, Fairy>();
  let mvStuck: { to: THREE.Vector3 | null; d: number; t: number } = { to: null, d: 0, t: 0 };
  let moveTarget: THREE.Vector3 | null = null, attackTarget: Mob | null = null, npcTarget: Npc | null = null, pickTarget: Drop | null = null, pickCd = 0;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xf3ead9, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.02; scene.add(marker);
  const nearestNpc = (r: number) => npcs.filter(n => n.pos.distanceTo(P.pos) < r).sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos))[0];
  const owner = <T extends { obj: THREE.Object3D }>(list: T[], o: THREE.Object3D | null) => list.find(x => { let p = o; while (p) { if (p === x.obj) return true; p = p.parent; } return false; });
  const visibleHit = (hits: THREE.Intersection[]) => hits.find(hit => {
    for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) if (!obj.visible) return false;
    return true;
  })?.object ?? null;
  /** A click that misses a small body by a little still takes it: the foe whose middle is nearest the pointer on
   *  screen, within PICK_PX (a finger gets more room than a mouse). */
  const PICK_PX = document.body.classList.contains("touch") ? 64 : 48, pv = new THREE.Vector3();
  const screenPick = <T extends { pos: THREE.Vector3; obj: THREE.Object3D }>(list: T[], x: number, y: number) => {
    let best: T | undefined, bd = PICK_PX;
    for (const m of list) { pv.copy(m.pos); pv.y += 0.5 * m.obj.scale.y; pv.project(camera); if (pv.z > 1) continue;
      const d = Math.hypot((pv.x + 1) / 2 * innerWidth - x, (1 - pv.y) / 2 * innerHeight - y); if (d < bd) { bd = d; best = m; } }
    return best;
  };
  function resolvePointer() {
    ndc.set(pointer.x / innerWidth * 2 - 1, -(pointer.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (pointer.fresh) {
      // only bodies in the scene: one past the fog is taken out of it with a stale matrix, and one never shown yet
      // sits at the world origin — the Pawhaven fountain — so a click there "hit" monsters far away and walked off to them
      const live = [...mobs.values()].filter(m => m.kind === "monster" && m.alive && m.obj.parent);
      const w = owner(live, visibleHit(ray.intersectObjects(live.map(m => m.obj), true))) ?? screenPick(live.filter(m => m.obj.visible), pointer.x, pointer.y);
      // a pick ends the press: held on, the hold-to-walk below took over next frame and walked off to the ground under
      // the cursor instead — the click seemed to miss
      if (w) { pointer.down = false; attackTarget = w; api.target = w; moveTarget = null; npcTarget = null; return; }
      const pcs = [...mobs.values()].filter(m => m.kind === "player" && m.obj.parent);
      const pc = owner(pcs, visibleHit(ray.intersectObjects(pcs.map(m => m.obj), true)));
      if (pc && pkFoe(pc)) { pointer.down = false; attackTarget = pc; api.target = pc; moveTarget = null; npcTarget = null; return; }   // PK: a click attacks
      if (pc) { api.target = pc; openPlayerMenu(pc.id, pc.name, pointer.x, pointer.y); return; }
      const near = npcs.filter(n => n.obj.parent), n = owner(near, visibleHit(ray.intersectObjects(near.map(n => n.obj), true)));   // only residents in the scene (a detached one keeps a stale matrix)
      if (n) { pointer.down = false; route = []; npcTarget = n; attackTarget = null; api.target = null; moveTarget = null; pickTarget = null; return; }
      const loot = [...drops.values()];
      const d = owner(loot.map(x => ({ obj: x.obj, d: x })), visibleHit(ray.intersectObjects(loot.map(x => x.obj), true)))?.d;
      if (d) { pointer.down = false; pickTarget = d; attackTarget = null; npcTarget = null; moveTarget = null; return; }
      attackTarget = null; npcTarget = null; pickTarget = null; api.target = null;
    }
    // the ground: walk the same A* route as the map (round the fountain, walls and trees, to the nearest free spot when
    // the click lands on one) — a straight line into an obstacle slid the body off along it, away from the click.
    // Held down, the route is only redrawn once the cursor has moved half a metre.
    // A click on the fountain aims where it was clicked, not at the ground
    // point the ray reaches behind it — that lay on the far side and sent the walk round the back.
    const solid = pointer.fresh ? ray.intersectObjects(clickables(), true)[0] : undefined;
    if (solid && solid.point.y > 0.1 && solid.distance < ray.ray.origin.y / Math.max(0.05, -ray.ray.direction.y)) hitPt.set(solid.point.x, 0, solid.point.z);
    else if (!ray.ray.intersectPlane(groundPlane, hitPt)) return;
    if (pointer.fresh || !pathGoal || pathGoal.distanceTo(hitPt) > 0.5) {
      pathGoal = hitPt.clone();
      if (!api.walkTo(hitPt.x, hitPt.z)) { moveTarget = hitPt.clone(); route = []; if (pointer.fresh) { marker.position.set(hitPt.x, groundY(hitPt, layout) + 0.03, hitPt.z); (marker.material as THREE.MeshBasicMaterial).opacity = 0.9; } }
    }
  }

  // mouse hover: the weapon in hand over a monster (or a PK foe), a hand over a drop — checked at most every 80 ms
  let hoverAt = 0, hoverCur = "";
  renderer.domElement.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" || e.timeStamp - hoverAt < 80) return; hoverAt = e.timeStamp;
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const foes = [...mobs.values()].filter(m => m.obj.parent && (m.kind === "monster" ? m.alive : m.kind === "player" && pkFoe(m)));
    const loot = [...drops.values()];
    const cur = owner(foes, visibleHit(ray.intersectObjects(foes.map(m => m.obj), true))) ?? screenPick(foes.filter(m => m.obj.visible), e.clientX, e.clientY) ? attackCursor(weaponOf(P.equip))
      : visibleHit(ray.intersectObjects(loot.map(x => x.obj), true)) ? PICK_CURSOR : "";
    if (cur !== hoverCur) renderer.domElement.style.cursor = hoverCur = cur;   // the browser rewrites url() values: compare our own copy
  });

  // ---------------------------------------------------------------- events from the sim (server or local)
  function onEvent(e: ReturnType<Host["tick"]>[number]) {
    switch (e.t) {
      case "anim": { const a = actorOf(e.id); if (!a) return; a.anim.play(e.clip as ClipName);
        if (e.clip === "Death" && a !== P) sfx.death(near(a)); if (e.clip === "Pick" && a === P) sfx.pickup();
        if (e.clip === "Hit") hitFlash(a); return; }
      // one skill = one clip + its own effect; both come from skills.json so a new skill needs no code here
      case "cast": { const a = actorOf(e.id); if (!a) return; const S0 = SKILLS[e.skill]; if (!S0) return;
        const r = e.rate ?? 1, S = r === 1 ? S0 : { ...S0, cast: S0.cast / r, hit: S0.hit / r };   // attack speed: clip and fx timings together
        a.anim.play(S.clip as ClipName, r); if (a === P && P.mounted) mountFor(P, "", false, 0);
        const k = near(a); if (a === P) combatT = 0;
        setTimeout(() => ({ slash: () => sfx.swing(k), punch: () => sfx.swing(k), special: () => (S.requires === "staff" ? sfx.zap(k) : S.requires === "bow" ? sfx.twang(k) : sfx.swing(k)), wave: () => sfx.swing(k), buff: () => sfx.chime(k), shock: () => sfx.swing(k), whirl: () => sfx.swing(k), dash: () => sfx.dash(k), heal: () => sfx.chime(k), healcircle: () => sfx.chime(k),
          arrow: () => sfx.twang(k), arrowrain: () => sfx.twang(k), bluefire: () => sfx.zap(k), meteor: () => sfx.rumble(k), frostnova: () => sfx.zap(k), slam: () => sfx.swing(k), lightning: () => sfx.zap(k), flameblade: () => sfx.swing(k) } as Record<string, () => void>)[S.fx]?.(), Math.max(0, S.hit - 0.08) * 1000);
        switch (S.fx) {
          case "slash": setTimeout(() => { if (a.alive) swingGlow(a, S.range!, S.coef ?? 1); }, S.hit * 1000); break;   // the basic swing: a glint on the blade, no arc drawn on the ground
          case "punch": setTimeout(() => { if (a.alive) swingGlow(a, S.range!, 0.6, 0xffe9c9); }, S.hit * 1000); break;   // a bonk: bare hands, an empty quiver, a staff out of MP
          case "buff": castRing(a, 0xffd070); break;
          case "special": { const c = parseInt((S.color ?? "#ffffff").slice(1), 16); if (S.kind === "melee") setTimeout(() => { if (a.alive) specialFx("cast", S, a); }, S.hit * 1000); else castRing(a, c); break; }   // boss-tome skills
          case "wave": slashTrail(a, 1.6, S.cone!, S.cast * 0.45); setTimeout(() => { if (a.alive) swordWave(a, S.range!); }, S.hit * 1000); break;   // a blade of light flies out to the skill's reach
          case "dash": for (let i = 0; i < 4; i++) dust(a.pos, 0.5); sparkBurst(a.pos, 0xcfe4ff, 8, 2.2, 1.2, 0.26, 0.35); flash(a.pos, 0xbcd8ff, 6, 0.3, a); break;
          case "shock": castRing(a, 0xffd48a); setTimeout(() => { if (a.alive) shockwave(a.pos, S.range!); }, S.hit * 1000); break;
          case "whirl": setTimeout(() => { if (a.alive) spinTrail(a, S.range!, S.cast - S.hit + 0.3); }, Math.max(0, S.hit - 0.25) * 1000); break;
          case "heal": castRing(a, 0x8ef0a8); setTimeout(() => { if (a.alive) healAura(a); }, S.hit * 1000); break;
          case "flameblade": setTimeout(() => { if (a.alive) flameBlade(a, S.range!, S.cone!); }, S.hit * 1000 - 60); break;
          case "healcircle": castRing(a, 0x8ef0a8); setTimeout(() => { if (a.alive) healCircle(a, S.radius!); }, S.hit * 1000); break;
          case "bluefire": castRing(a, 0x6fb4ff); break;
          case "meteor": castRing(a, 0xff8a3a); beam(a, 0xff7a2a, S.hit + 0.2); break;
          case "arrowrain": castRing(a, 0xffe0a0); break;
        }
        return; }
      case "dmg": { const a = actorOf(e.id); if (!a) return;
        if (a === P || e.by === P.id) combatT = 0;
        if (a === P && !api.target && e.by) { const m = mobs.get(e.by); if (m?.alive) api.target = m; }   // hit while unlocked: lock the attacker
        if (a === P && e.by) lastHitBy = mobs.get(e.by)?.name ?? lastHitBy;
        if (e.miss) { sfx.miss(near(a)); return floatText(a.pos, "MISS", "miss"); }
        if (a === P) sfx.hurt(); else sfx.hit(near(a), e.crit);
        if (a === P) { floatText(a.pos, "-" + e.n, "taken"); hitFlash(P); shake(0.2); sparkBurst(a.pos, 0xff8a6a, 6, 2, 1.6, 0.24, 0.35); }
        else { floatText(a.pos, e.n, e.crit ? "crit" : "hit"); hitFlash(a); sparkBurst(a.pos, e.crit ? 0xffd166 : 0xffe9c9, e.crit ? 10 : 5, e.crit ? 3 : 1.8, 2, e.crit ? 0.3 : 0.22, 0.4);
          if (e.crit) { flash(a.pos, 0xffc14d, 8, 0.25); if (e.by === P.id) shake(0.12); } } return; }
      case "heal": { const a = actorOf(e.id); if (a) floatText(a.pos, "+" + e.n, "heal"); return; }
      case "telegraph": { telegraph(e.x, e.z, e.radius, e.windup); bossSkillFx("windup", e.name, e.x, e.z, e.radius, e.windup); const a = actorOf(e.id);
        if (a) { floatText(a.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), e.name, "crit"); castRing(a, 0xff4a2a); }
        if (Math.hypot(e.x - P.x, e.z - P.z) < e.radius + 6) { toast(`⚠ ${e.name} — ออกจากวงแดง!`); sfx.rumble(0.8); } return; }
      case "fish": { if (e.id === P.id) fishCaught = true; const a = actorOf(e.id); if (a) sparkBurst(a.pos.clone().setY(0.9), new THREE.Color(RARITY[e.rarity as Rarity].color).getHex(), 20, 2.6, 2.4, 0.3, 0.9);
        if (e.id === P.id) toast(`🎣 ${INGREDIENTS[e.item].icon} ${INGREDIENTS[e.item].name} — ${RARITY[e.rarity as Rarity].name}`); return; }
      case "slam": { bossSkillFx("impact", e.name, e.x, e.z, e.radius); sfx.boom(nearXZ(e.x, e.z)); return; }
      case "shot": { const a = actorOf(e.id); if (!a) return; a.yaw = Math.atan2(e.x - a.pos.x, e.z - a.pos.z);
        if (SKILLS[e.skill]?.fx === "special") { specialFx("shot", SKILLS[e.skill], a, e.x, e.z, e.travel); setTimeout(() => sfx.boom(near(a) * 0.5), e.travel * 1000); return; }
        const blue = SKILLS[e.skill]?.fx === "bluefire", k = near(a);
        if (blue) blueFire(a, e.x, e.z, e.travel); else arrowShot(a, e.x, e.z, e.travel);
        setTimeout(() => blue ? sfx.frostBurst(k) : sfx.thunk(k), e.travel * 1000); return; }
      case "aoe": { const S = SKILLS[e.skill]; if (!S) return;
        const k = nearXZ(e.x, e.z);
        if (S.fx === "special") { const a = actorOf(e.id); if (a) specialFx("aoe", S, a, e.x, e.z, 0, e.delay); setTimeout(() => sfx.boom(k * 0.7), e.delay * 1000); }
        else if (S.fx === "meteor") { meteor(e.x, e.z, S.radius!, e.delay); setTimeout(() => sfx.boom(k), e.delay * 1000); }
        else if (S.fx === "frostnova") { frostNova(e.x, e.z, S.radius!); iceCrystals(e.x, e.z, S.radius!); sfx.frostBurst(k); }
        else if (S.fx === "lightning") { lightning(e.x, e.z, S.radius!, e.delay); setTimeout(() => sfx.boom(k * 0.8), e.delay * 1000); }
        else if (S.fx === "slam") { shockwave(new THREE.Vector3(e.x, 0, e.z), S.radius!); earthSpikes(e.x, e.z, S.radius!); sfx.boom(k * 0.6); }
        else { arrowRain(e.x, e.z, S.radius!, e.delay, S.waves); for (let w = 0; w < (S.waves ?? 1); w++) setTimeout(() => sfx.rain(k), (e.delay + w * 0.35 - 0.1) * 1000); }
        return; }
      case "slow": { const a = actorOf(e.id); if (a) chill(a, e.dur); return; }
      case "pick": { const a = actorOf(e.id), d = drops.get(e.gid); if (!a || !d) return;   // the drop flies up into the picker's hands instead of vanishing
        drops.delete(e.gid); picked.set(e.gid, performance.now() + 3000); if (pickTarget?.view.id === e.gid) pickTarget = null;
        flying.push({ obj: d.obj, a, from: d.obj.position.clone(), t: 0 }); return; }
      case "buff": { const a = actorOf(e.id); if (!a) return; buffAura(a); if (a === P) buffShown = { name: SKILLS[e.skill]?.name ?? "", icon: SKILLS[e.skill]?.icon ?? "✨", until: performance.now() + e.dur * 1000 }; return; }
      case "respawn": { const a = actorOf(e.id); if (!a) return; a.anim.revive(); if (a === P) P.pos.set(P.x, 0, P.z); return; }
      case "msg": return sys(e.text, e.cls);
      case "loot": toast(e.text); return sys("ได้ " + e.text, "loot");
      case "lvl": { const who = actorOf(e.pid); if (who) levelUpFx(who); } return void setTimeout(() => { sfx.levelUp(); toast(`Level Up! Lv ${e.level}`); sys(`Level Up! Lv ${e.level} — ได้แต้มสถานะเพิ่ม`, "lvl"); }, 500);
      case "kill": api.kills++; return;
      case "craft": api.crafted = true; return toast(`Craft สำเร็จ: ${itemName(e.item)}`);
      case "notice": toast(e.text); return sys(e.text, "lvl");
      case "fairy": fairies.get(e.id)?.fetch(e.x, e.z, e.back); return;
      case "drop": return;   // the puff is spawned when the model first appears, so the client needs nothing here
      case "dead": {
        // where it happened, by whom: shown on the death screen and pinned (💀) on the maps until walked back to
        const where = `${zoneName(P)} (${Math.round(P.x)}, ${Math.round(-P.z)})`;
        api.deathAt = { x: P.x, z: P.z, where, by: lastHitBy }; sys(`💀 ตายที่ ${where}${lastHitBy ? ` — โดน ${lastHitBy}` : ""} · ปักหมุดไว้บนแผนที่`, "dmg");
        toast(e.lost ? `คุณตาย — เสีย EXP ${e.lost}` : "คุณตาย"); return showDead(true, e.secs, e.lost);
      }
      case "tradeReq": return onTradeRequest(e.from, e.name);
      case "partyReq": return onPartyRequest(e.from, e.name);
      case "guildReq": return onGuildRequest(e.from, e.name, e.guild);
      case "guild": return onGuildView(e.view);
      case "guildList": return onGuildList(e.list);
      case "friends": return onFriends(e.view);
      case "friendReq": return onFriendRequest(e.from, e.name);
      case "ranking": return onRanking(e.players, e.guilds);
      case "market": return onMarket(e.list);
      case "trade": return onTradeView(e.view);
    }
  }

  // Preload the shaders: one throwaway copy of every model that appears later (monsters, mount, the other races) plus
  // the night light pool, so nothing compiles a program once the player is moving.
  {
    loadingPhase("กำลังเปิดประตูสู่อาณาจักร…", 0.88);
    const protos = [rangedSrc, batSrc, wolfSrc, alphaSrc, foxSrc, boarSrc, shroomSrc, bearSrc, slimeSrc, stumpSrc, horseSrc, knightSrc, catSrc, mouseSrc, ...BREED_IDS.map(id => RACE_SRC[id])].map(src => { const o = SkeletonUtils.clone(src); o.position.set(0, -60, 0); o.traverse((n: any) => { if (n.isMesh) { n.castShadow = true; n.material = toonFrom(n.material); } }); return o; });
    const here = new THREE.Vector3(P.x, 0, P.z);
    dust(here); slashTrail(P, SKILLS.SKILL_SLASH.range!, SKILLS.SKILL_SLASH.cone!, 0.01); castRing(P); sparkBurst(here, 0xffffff, 2, 0.1, 0.1, 0.01, 0.02); beam(P, 0x7ff0a0, 0.01); flash(here, 0xffffff, 0.01, 0.01);   // fx materials too (all with ~zero lifetime: the player must not see the warm-up)
    protos.push(makeGoldPile(50), makeItemDrop("HP_POTION"));   // loot: its first drop compiled the gold shader mid-fight
    forceLights(true); await warmup(protos, f => loadingPhase("", 0.88 + f * 0.08));
    loadingPhase("จัดเตรียมการเดินทางขั้นสุดท้าย…", 0.96); forceLights(false); await warmup([], f => loadingPhase("", 0.96 + f * 0.03));
  }
  enterWorld();

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock(); let stepT = 0, syncT = 0, boom = 1, camInit = false; const camAt = new THREE.Vector3();
  const smooth = host.online ? 14 : 1e9;   // facing eases toward the server's; offline it is exact (positions: follow)
  let animTick = 0;
  /** How often this actor's animation is stepped: everything near the player runs full rate, the far half of the map
   *  animates every third frame, and anything past the fog does not animate at all. 122 monsters cannot all be live. */
  function animBudget(m: Mob) {
    const d2 = (m.pos.x - P.pos.x) ** 2 + (m.pos.z - P.pos.z) ** 2;
    if (d2 < 18 * 18) return 1;
    if (d2 > 45 * 45) return 0;
    return animTick % 3 === 0 ? 1 / 3 : 0;
  }

  function follow(m: Mob, v: BodyView, dt: number) {
    const k = 1 - Math.exp(-dt * smooth);
    if (!host.online) { m.pos.x = v.x; m.pos.z = v.z; }
    else {
      // online, positions arrive ~20 Hz: glide at an even speed from where the body is drawn to the newest position,
      // over the time the last update took to arrive (easing toward it instead sped up and slowed down every 50 ms)
      const now = performance.now() / 1000, g = m.glide ??= { fx: v.x, fz: v.z, tx: v.x, tz: v.z, u: 1, span: 0.05, at: now };
      if (v.x !== g.tx || v.z !== g.tz) {
        g.span = Math.min(0.6, Math.max(0.03, now - g.at)); g.at = now; g.fx = m.pos.x; g.fz = m.pos.z; g.tx = v.x; g.tz = v.z; g.u = 0;
        if (Math.hypot(g.tx - g.fx, g.tz - g.fz) > 8) g.u = 1;   // a teleport or respawn: jump
      }
      g.u = Math.min(1, g.u + dt / g.span); m.pos.x = g.fx + (g.tx - g.fx) * g.u; m.pos.z = g.fz + (g.tz - g.fz) * g.u;
    }
    if (m.kind === "player" || !MONSTERS[(v as MonsterView).kind]?.fly) m.pos.y = groundY(m.pos, layout);   // walk up onto bridges
    let dy = v.yaw - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.yaw += dy * k;
    m.hp = v.hp; m.maxHP = v.maxHP; if (v.alive && !m.alive) { m.alive = true; m.anim.revive(); bossAura(m); } else if (!v.alive && m.alive) { m.alive = false; bossAura(m); }
    if (v.alive && m.anim.dead) m.anim.revive();
    animate(m, dt, v.moving && v.alive, animBudget(m), m.kind === "player" && !!(v as PlayerView).sitting, m.kind === "player" && !!(v as PlayerView).mounted);
    if (m.kind === "player") { const pv = v as PlayerView; mountFor(m, pv.mounted && v.alive ? pv.mountKind || "horse" : "", v.moving, dt); }
    else {
      const D = MONSTERS[(v as MonsterView).kind];
      // flyers hover and bob; a dead one drops to the ground. Night creatures fade out of the world once down
      if (D?.fly) { m.fly = (m.fly ?? 0) + dt; m.pos.y = v.alive ? D.fly + Math.sin(m.fly * 3.2 + m.id.length) * 0.12 : Math.max(0, m.pos.y - dt * 4); }
      if (D?.night) { m.gone = v.alive ? 0 : (m.gone ?? 0) + dt; m.obj.visible = m.gone < 1.4; }
    }
  }
  function frame() {
    perfStart();
    const dt = Math.min(0.1, clock.getDelta()); updateFountain(dt); updateLandscape(dt); (window as any).__tick?.();
    let { x: mx, z: mz } = move(); let ml = Math.hypot(mx, mz);
    if (P.alive) {
      if (pointer.down || pointer.fresh) resolvePointer(); pointer.fresh = false;
      if (AUTO.on && !autoWasOn) { autoHome.set(P.pos.x, 0, P.pos.z); ringShow.until = performance.now() + 2500; }   // switched on: this spot is the centre
      autoWasOn = AUTO.on;
      if (AUTO.on) {
        if (ml > 0.15) { autoHome.set(P.pos.x, 0, P.pos.z); autoSteered = true; }   // steering by hand: auto stays on and its circle comes along
        else if (autoSteered) { autoSteered = false; ringShow.until = performance.now() + 2500; }   // let go: show the circle where auto now works, then fade
        else {
          autoPotion(dt);
          // a monster close by (CLOSE) is fought first; otherwise the loot on the floor is gathered before walking off to
          // the next one — with monsters always respawning within AUTO.range, "every monster in range first" never looted.
          // A loot run is dropped only for a monster that comes close (checked twice a second: hunt() may search paths)
          if (AUTO.stay) { if (!attackTarget || attackTarget.pos.distanceTo(P.pos) > reachNow() + 0.2) attackTarget = nearestFoe(reachNow()); pickTarget = null; }   // stand still: only what walks into reach
          else if (!attackTarget && !pickTarget && !npcTarget && !moveTarget) { const foe = hunt(); if (foe && foe.pos.distanceTo(P.pos) < CLOSE) attackTarget = foe; else { pickTarget = lootNext(); if (!pickTarget) attackTarget = foe; } }
          else if (pickTarget && !attackTarget && (lootCheckT -= dt) <= 0) { lootCheckT = 0.5; const foe = hunt(); if (foe && foe.pos.distanceTo(P.pos) < CLOSE) { attackTarget = foe; pickTarget = null; } }
        }
      }
      if (ml > 0.15) { moveTarget = null; attackTarget = null; npcTarget = null; pickTarget = null; route = []; }
      else if (attackTarget) {
        if (!attackTarget.alive) attackTarget = null;
        else { const d = new THREE.Vector3().subVectors(attackTarget.pos, P.pos); const dist = d.length(); P.yaw = Math.atan2(d.x, d.z);
          // a bow stops at 9 m, a sword walks up
          const basic = SKILLS[attackSkill(P.equip, P.inv, P.mp)].range!, stand = basic;
          if (AUTO.on && AUTO.stay && dist > stand) { mx = mz = 0; attackTarget = null; }   // holding the spot: never walk after it
          else if (dist > stand - 0.2) {
            mx = d.x / dist; mz = d.z / dist; ml = 1;
            // auto battle: no closer after 1.5 s of walking at it (an edge, a wall in between) → give it up for a while
            if (headway.m !== attackTarget || dist < headway.d - 0.4) headway = { m: attackTarget, d: dist, t: 0 };
            else if (AUTO.on && (headway.t += dt) > 1.5) { shunned.set(attackTarget, performance.now() + 15000); attackTarget = null; api.target = null; headway.m = null; }
          }
          else { mx = mz = 0; if (!(AUTO.on && autoSkill(dist)) && (AUTO.on ? autoUsesBasic() && dist <= basic - 0.05 : api.autoMode === "melee")) act("SKILL_BASIC"); } }   // click a monster = walk up and keep swinging
      } else if (pickTarget) {
        const g = pickTarget.view; const dx = g.x - P.x, dz = g.z - P.z, dist = Math.hypot(dx, dz);
        // stop well inside the range: online, the server's copy of us trails the predicted position by a tick or two
        const reachPick = PICK_RANGE - (AUTO.on && !host.online ? 0.35 : 0.7);   // online the server's copy of us trails a little: stop further in
        if (dist > reachPick) { const st = AUTO.on ? steer(g.x, g.z, reachPick) : null; mx = st ? st.x : dx / dist; mz = st ? st.z : dz / dist; ml = 1; }   // auto walks round obstacles
        else if (pickCd > 0) { mx = mz = 0; }   // still cooling down: hold the target and ask next frame
        else {
          // picked on the move: auto heads straight for the next drop in the same frame. Stopping at each one (and the old
          // 0.6 s pause between pickups) flipped run → idle → run on every coin, a stutter all through a loot run.
          pickCd = 0.15; host.cmd("pickup", g.id); lootTried.set(g.id, performance.now() + 8000); pickTarget = AUTO.on ? lootNext() : null;
          const n = pickTarget?.view; if (n) { const nx = n.x - P.x, nz = n.z - P.z, nd = Math.hypot(nx, nz) || 1; mx = nx / nd; mz = nz / nd; ml = 1; } else { mx = mz = 0; P.yaw = Math.atan2(dx, dz); }
        }
      } else if (npcTarget) {
        const d = new THREE.Vector3().subVectors(npcTarget.pos, P.pos); const dist = d.length();
        if (dist > 1.8) { mx = d.x / dist; mz = d.z / dist; ml = 1; } else { P.yaw = Math.atan2(d.x, d.z); openNpc(npcTarget); npcTarget = null; }
      } else if (moveTarget) {
        const d = new THREE.Vector3().subVectors(moveTarget, P.pos); d.y = 0; const dist = d.length();
        // a waypoint against a tree or rock can't be reached (collision holds the body off it): pressing on slid the body
        // round and round it. No headway for 0.4 s → take the next waypoint, or stop.
        if (mvStuck.to !== moveTarget || dist < mvStuck.d - 0.05) mvStuck = { to: moveTarget, d: dist, t: 0 };
        const stuck = (mvStuck.t += dt) > 0.4;
        if (dist < 0.15 || stuck) { moveTarget = route.shift() ?? null; if (!moveTarget && AUTO.on) ringShow.until = performance.now() + 2500; } else { mx = d.x / dist; mz = d.z / dist; ml = 1; }
        if (AUTO.on) autoHome.set(P.pos.x, 0, P.pos.z);   // a click-walk under auto: the circle moves with it and auto carries on where it ends
      } else if (AUTO.on && !AUTO.stay) {   // nothing to fight or pick up: back to the spot auto was started on
        const st = Math.hypot(autoHome.x - P.x, autoHome.z - P.z) > 1.5 ? steer(autoHome.x, autoHome.z, 1.5) : null; if (st) { mx = st.x; mz = st.z; ml = 1; }
      }
    } else { mx = mz = 0; moveTarget = attackTarget = null; if (AUTO.on) setAuto(false); }
    perfMark("logic");
    host.input(ml > 0.15 ? mx : 0, ml > 0.15 ? mz : 0);
    const ev = host.tick(dt); perfMark("net");
    if (Math.hypot(P.x-P.pos.x,P.z-P.pos.z) > 20) {
      moveTarget = null; attackTarget = null; npcTarget = null; api.target = null; pointer.down = false;
      marker.material.opacity = 0; toast(`เดินทางถึง ${zoneName(P)}`);
    }
    refreshWorldMap(); updateLock(dt); updateAim(); updateFires(dt); perfMark("worldmap");
    stillT = P.moving || api.target ? 0 : stillT + dt;
    const stream = streamWorld(P.pos.x, P.pos.z, false, stillT > 0.4);   // maps next door build only while standing still
    if (stream.entered) {
      const z = stream.entered;
      enterZone(z.name, z.pk ? "⚔ เขต FREE PK — ผู้เล่นโจมตีกันได้" : z.kind === "route" ? "เส้นทาง" : "เมือง", stream.loaded);
      if (z.pk) { toast("⚔ เข้าเขต PK — ระวังผู้เล่นอื่น!"); sys(`⚔ ${z.name}: เขต Free PK — ผู้เล่นโจมตีกันได้ (ยกเว้นปาร์ตี้เดียวกัน)`, "dmg"); }
    }
    perfMark("stream");
    P.pos.set(P.x, groundY(P, layout), P.z); animate(P, dt, P.moving, 1, P.sitting, P.mounted); mountFor(P, P.mounted && P.alive ? P.mountKind || "horse" : "", P.moving, dt);
    if (P.moving) { stepT += dt; if (stepT > (P.dash > 0 ? 0.04 : 0.16)) { stepT = 0; dust(P.pos); } }
    const d = api.deathAt;
    showDead(!P.alive, P.deadT, undefined, countOf(P.inv, "REVIVE_SCROLL"), (P.towns ?? ["pawhaven"]).map(id => ({ id, name: CITIES.find(c => c.id === id)?.name ?? id })), P.home ?? "pawhaven",
      d ? `ตายที่ ${d.where}${d.by ? ` · โดน ${d.by}` : ""}` : "");
    if (P.alive && d && Math.hypot(P.x - d.x, P.z - d.z) < 4) api.deathAt = null;   // walked back to the spot: the pin is done
    if (P.alive && P.anim.dead) { P.anim.revive(); P.pos.set(P.x, groundY(P, layout), P.z); }   // same for a death pose the respawn event never cleared
    // remote players + monsters follow their host views; players who left are removed
    pickCd = Math.max(0, pickCd - dt); animTick++;
    syncDrops(host.ground(), dt); perfMark("me+drops");
    const seen = new Set<string>();
    const inHall = zoneAt(P).terrain === "hall";
    for (const v of host.players()) { seen.add(v.id); const m = mobFor(v, "player"); follow(m, v, dt); const pv = v as PlayerView; m.name = pv.name; m.level = pv.level;
      m.apart = inHall && (pv.guild ?? "") !== ((P as any).guildName ?? "");
      if (m.equipJson !== pv.equip || m.furColor !== pv.furColor) { m.equipJson = pv.equip; m.furColor = pv.furColor; applyEquipVisuals(m.obj, JSON.parse(pv.equip || "{}"), pv.furColor, pv.race); } }
    // only this map and its neighbours get a body
    // a new area brings dozens of monsters at once: give at most FRESH_PER_FRAME of them a body per frame
    let fresh = 0;
    for (const v of host.monsters()) { if (Math.hypot(v.x - P.x, v.z - P.z) > STREAM_R || (!mobs.has(v.id) && fresh++ >= FRESH_PER_FRAME)) continue; seen.add(v.id); const m = mobFor(v, "monster"); m.name = MONSTERS[(v as any).kind]?.name ?? ""; follow(m, v, dt); }
    // bodies past the fog leave the scene graph (they keep following their views for the maps): three.js walks every
    // bone of every skinned body in the scene each frame, seen or not — 250 bodies cost 15–30 ms of the frame
    for (const m of mobs.values()) { const far = m.apart || Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) > DRAW_R; if (far === !!m.obj.parent) far ? scene.remove(m.obj) : scene.add(m.obj); if (m.ride && far === !!m.ride.obj.parent) far ? scene.remove(m.ride.obj) : scene.add(m.ride.obj); }
    for (const [id, m] of mobs) if (!seen.has(id)) { scene.remove(m.obj); releaseMaterials(m.obj); mobs.delete(id); if (api.target === m) api.target = null; }
    // loot fairies (ทูตเก็บของ): one at the shoulder of every living player in sight wearing Faritel's Charm; the sim sends them on errands
    const winged = new Set<string>();
    for (const [id, a] of [[P.id, P] as [string, Actor], ...mobs]) {
      if (!a.alive || (a !== P && ((a as Mob).kind !== "player" || !a.obj.parent))) continue;
      if (a === P ? !hasFairy(P.equip) : !(a as Mob).equipJson?.includes(FAIRY_ITEM)) continue;   // only with Faritel's Charm on
      let f = fairies.get(id); if (!f) fairies.set(id, f = new Fairy());
      if (!f.obj.parent) scene.add(f.obj); f.update(dt, a); winged.add(id);
    }
    for (const [id, f] of fairies) if (!winged.has(id)) { scene.remove(f.obj); if (id !== P.id && !mobs.has(id)) fairies.delete(id); }
    // the locked foe died (or left): move the lock on to the next one nearby, so the fight keeps its flow
    if (api.target && (!api.target.alive || !mobs.has(api.target.id))) { const was = api.target as Mob; api.target = P.alive ? nearestFoe(CYCLE_RANGE, was) : null; }
    perfMark("bodies");
    for (const e of ev) onEvent(e); perfMark("events");
    syncT += dt; if (syncT > 0.1) { syncT = 0; refreshVisuals();
      // capes flutter (render/cape.ts): patch any newly seen cape, and let each blow harder while its wearer runs
      flutterCapes(P.obj); capeRunning(P.obj, P.moving, 0.1);
      for (const m of mobs.values()) if (m.kind === "player") { flutterCapes(m.obj); capeRunning(m.obj, !!(m.view as any).moving, 0.1); } }
    tickCapes(dt);
    // town residents far off leave the scene too: all 34 stood in it (every town's), each a full rig the renderer walked every frame
    for (const n of npcs) { const far = n.pos.distanceTo(P.pos) > DRAW_R; if (far === !!n.obj.parent) far ? scene.remove(n.obj) : scene.add(n.obj); if (!far) n.update(dt, P.pos); }
    for (const n of npcs) if (n.def.kind === "talk") { n.talkT -= dt; if (n.talkT <= 0) { n.talkT = 12 + Math.random() * 18; n.line = (n.line + 1) % n.def.lines.length; if (n.pos.distanceTo(P.pos) < 18) say(n.def.name, n.def.lines[n.line]); } }
    // music follows the situation: a fight in the last 6 s → battle, inside a town → town, anywhere else → field
    combatT += dt; setMood(combatT < 6 && P.alive ? "battle" : inTown(P) ? "town" : "field"); updateMusic();
    perfMark("npc+music");
    const sh = updateFx(dt); perfMark("fx");
    // the camera follows a smoothed copy of the player's position: online, the predicted position is eased toward the
    // server's many times a second, and a step onto a bridge lifts it at once — a camera nailed to it jittered with every
    // correction even with screen shake off. A teleport (respawn, a new map) is followed at once.
    if (!camInit || camAt.distanceToSquared(P.pos) > 25) { camAt.copy(P.pos); camInit = true; } else camAt.lerp(P.pos, 1 - Math.exp(-dt * 18));
    const cameraFollow = followCamera(camAt, camZoom, boom, dt, layout); boom = cameraFollow.boom;
    camera.position.set(camAt.x + sh.x, camAt.y + cameraFollow.y + sh.y, camAt.z + cameraFollow.z + sh.z);
    camera.lookAt(camAt.x + sh.x, camAt.y + cameraFollow.aimHeight + sh.y, camAt.z + sh.z);
    updateCameraOcclusion(camAt,camera.position);
    perfMark("camera");
    const h = host.hours(); if (h !== undefined) clockState.hours = h;
    updateDayNight(dt, P.pos); updateAtmosphere(dt, P.pos); updateLights(dt, P.pos);
    (marker.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (marker.material as THREE.MeshBasicMaterial).opacity - dt * 1.5); marker.scale.setScalar(1 + (0.9 - (marker.material as THREE.MeshBasicMaterial).opacity) * 0.6);
    perfMark("light");
    { const left = (ringShow.until - performance.now()) / 1000, c = AUTO.on ? autoHome : P.pos;   // shown while the slider moves (and as auto starts), then fades
      autoRing.visible = left > 0 && P.alive; if (autoRing.visible) { autoRing.position.set(c.x, groundY(c, layout) + 0.05, c.z); autoRing.scale.setScalar(AUTO.stay ? reachNow() : AUTO.range); (autoRing.material as THREE.MeshBasicMaterial).opacity = 0.3 * Math.min(1, left / 0.8); } }   // stay: the weapon's reach   // faint: a hint of the area, not a banner
    updateHud(dt); drawBuff(); perfMark("hud");
    render(); perfMark("render"); perfEnd();
    requestAnimationFrame(frame);
  }
  frame();
  /** Dev: every monster (bosses too) rendered on its own and laid out as one labelled contact sheet; returns a PNG
   *  data URL. Used to review the models — not reachable from the game UI. */
  async function gallery(size = 240, only?: string[], side = false, run = 0) {   // run > 0: that many seconds into the run cycle
    const kinds = only ?? Object.keys(MONSTERS).sort((a, b) => Number(!!MONSTERS[a].boss) - Number(!!MONSTERS[b].boss) || MONSTERS[a].level - MONSTERS[b].level);
    const cols = 6, rows = Math.ceil(kinds.length / cols), label = 46, sheet = document.createElement("canvas");
    sheet.width = cols * size; sheet.height = rows * (size + label);
    const g = sheet.getContext("2d")!; g.fillStyle = "#efe3c6"; g.fillRect(0, 0, sheet.width, sheet.height);
    const stage = new THREE.Scene(); stage.background = new THREE.Color(0xdfe8d2);
    stage.add(new THREE.HemisphereLight(0xfff4e0, 0x6b7a55, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 5); stage.add(sun);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 100), rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
    const px = new Uint8Array(size * size * 4), img = g.createImageData(size, size);
    for (const [n, kind] of kinds.entries()) {
      const def = MONSTERS[kind], a = makeActor(MODEL_SRC[def.model] ?? wolfSrc, { id: "g" + n, kind: "monster", name: def.name, maxHP: 1, level: def.level, equipJson: "", furColor: 0 }, def.clips ?? "", def.tint) as Mob;
      applyMonsterAppearance(a, def); a.obj.scale.setScalar(def.scale); if (def.boss) bossLook(a.obj, def.pk ? "pk" : def.night ? "night" : "tyrant");
      a.obj.getObjectByName("contact-shadow")?.removeFromParent(); a.obj.getObjectByName("boss-aura")?.removeFromParent();
      stage.add(a.obj); a.pos.set(0, 0, 0); a.yaw = -0.6; animate(a, run || 0.4, run > 0, 1, false, false); if (run) animate(a, run, true, 1, false, false);
      a.obj.updateMatrixWorld(true); const box = new THREE.Box3(), b = new THREE.Box3();
      a.obj.traverse((m: any) => { if (!m.isMesh) return; if (m.isSkinnedMesh) { m.skeleton?.update(); m.computeBoundingBox(); box.union(b.copy(m.boundingBox).applyMatrix4(m.matrixWorld)); } else box.expandByObject(m); });
      const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2 || 1, d = r / Math.sin(THREE.MathUtils.degToRad(14)) * 1.05;
      if (side) cam.position.set(c.x + d, c.y + d * 0.12, c.z + d * 0.08); else cam.position.set(c.x + d * 0.45, c.y + d * 0.35, c.z + d * 0.82); cam.lookAt(c);   // side: the profile, to judge posture
      renderer.setRenderTarget(rt); renderer.render(stage, cam); renderer.readRenderTargetPixels(rt, 0, 0, size, size, px); renderer.setRenderTarget(null);
      for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);   // GL rows run bottom-up
      const x0 = (n % cols) * size, y0 = Math.floor(n / cols) * (size + label);
      g.putImageData(img, x0, y0);
      g.fillStyle = def.boss ? "#a3140a" : "#3b2a16"; g.font = "bold 15px sans-serif"; g.textAlign = "center";
      g.fillText(`${def.boss ? "BOSS · " : ""}${def.name}`, x0 + size / 2, y0 + size + 18);
      g.fillStyle = "#6b5236"; g.font = "12px sans-serif"; g.fillText(`${kind} · Lv ${def.level} · ${def.model}${def.appearance ? " · " + def.appearance : ""}`, x0 + size / 2, y0 + size + 36);
      g.strokeStyle = "#c9ae7c"; g.strokeRect(x0 + 0.5, y0 + 0.5, size - 1, size + label - 1);
      stage.remove(a.obj);
    }
    rt.dispose(); return sheet.toDataURL("image/png");
  }
  return { P, mobs, npcs, act, api, camera, smith, openNpc, host, gallery };
}
