// Pure gameplay simulation (no DOM, no three). The Colyseus room runs it as the authority; the offline client runs
// the very same code in the browser. Everything visible (animations, floating numbers, loot) comes out as events.
import { claimMail, deliverSystemMail, hasAttachment, type Mail } from "./mail";
import { FISH_TIME, FOODS, HUNGER_MAX, HUNGER_RATE, HUNGRY_SLOW, INGREDIENTS, RARITY, buffText, hungerState, ingredientRolls, isIngredient, nearCampfire, nearWater, rollFish, type MealBuff } from "./cooking";
import { BLUEPRINT_OF, BOSS_LOOT, SKILLBOOK_CHANCE, SKILLBOOK_OF, UNIQUE_CHANCE, UNIQUE_OF, BossSkill, BREED_ALIAS, BREEDS, FORMULAS, MOUNTS, mountOfItem, MARKET_BAND, priceBand, refPrice, ITEMS, MAX_LEVEL, RACE_TRAITS, speciesOf, MONSTERS, NPCS, RECIPES, SKILLS, START_GOLD, STAT_POINTS_PER_LEVEL, SkillDef, expToNext, itemName } from "./data";
import { Derived, Primary, damage, derive } from "./formulas";
import { INV_SLOTS, Inventory, addItem, countOf, createInventory, removeItem } from "./inventory";
import { Equipment, equip, equippedIds, unequip } from "./equipment";
import { craft as craftItem } from "./crafting";
import { buy as shopBuy, sell as shopSell } from "./shop";
import { PRIMARY, allocate as allocPoints } from "./progression";
import { rollDrops } from "./loot";
import { BOSS_SPAWN, GUILD_HALL, Layout, SPAWN, SPAWNS, buildLayout, collide, inTown, randomSpot } from "./world";
import { BUILDINGS, GUILD_COST, GUILD_SKILLS, GuildBook, type GuildSummary, POINTS_PER_GOLD, type BuildingId, type GuildSkillId, type Member } from "./guild";
import { FriendBook } from "./friends";
import { CELL, CITIES, ZONES, cityAt, isPK, zoneAt, zoneAtCell } from "./regions";
import { QUESTS_PER_DAY, QuestLog, boardFor, logFor, questDay } from "./quests";
const PVP_MULT = 0.6;
const DEAD_WAIT = 60;   // seconds the fallen wait for a revive before going home on their own
const NPC_REACH = 4;   // metres from an NPC to use it (the client walks up to 1.8)
const PARTY_SHARE_R = 40, PARTY_EXP_BONUS = 0.15;   // metres to share a kill / a pile of gold; +15% EXP per extra member nearby
const WAKE_R = 120;   // metres (per axis): monsters farther than this from every player sleep   // player-vs-player hits land at 60%


export type ActKind = string;   // skill id
export { BREEDS, RACE_TRAITS, speciesOf, type Species } from "./data";
export type Race = string;
export const RACES: Race[] = Object.keys(BREEDS);
export const STARTER_EQUIPMENT = { MainWeapon: "WOODEN_SWORD", Chest: "STARTER_CHEST", Boots: "STARTER_BOOTS" };
export const STARTER_SKILLS = ["SKILL_BASIC", "SKILL_SLASH", "SKILL_DASH"];
/** Trial: every skill usable by everyone. The lent ones (SimPlayer.trialSkills) are never saved, so turning this off
 *  takes back only what was lent — a skill learned during the trial stays. */
export const TRIAL_ALL_SKILLS = true;
export interface Creation { name: string; color: number; race?: string; slot?: number }
export interface Body { id: string; x: number; z: number; yaw: number; hp: number; alive: boolean; moving: boolean }
export interface SimPlayer extends Body, Primary, Derived {
  name: string; race: Race; skills: string[]; mounted: boolean; exp: number; points: number; gold: number; inv: Inventory; eq: Equipment; equip: Record<string, string>;
  fairy?: { gid: string; t: number }; fairyCd?: number;
  mail?: Mail[]; mailGot?: string[];   // shared/mail.ts
  hunger?: number; pantry?: Record<string, number>;   // shared/cooking.ts: 0..HUNGER_MAX, and the ingredients kept apart from the bag
  meal?: MealBuff & { t: number }; fishing?: { t: number };   // a dish's buff (seconds left); a line in the water (seconds to a bite)
  trialSkills?: string[];   // lent by TRIAL_ALL_SKILLS: in `skills` while playing, left out of the save
  buff?: { atk?: number; def?: number; aspd?: number; t: number };   // War Cry and the like: seconds left, applied in sync()
  quests?: QuestLog; hallFrom?: string;   // guild quests taken (shared/quests.ts); the town the guild grounds were entered from   // the loot fairy's errand in flight, and its pause between errands
  cd: Record<ActKind, number>; itemCd: number; dash: number; busy: number; deadT: number; lostExp?: number; uid?: string; guildName?: string; sitting: boolean; furColor: number;
  /** Towns reached (city ids): the fallen may come back in any of them. `home` is the one they come back to by
   *  default — the last town they walked into (a checkpoint). */
  towns?: string[]; home?: string;
  in: { mx: number; mz: number }; dirty: boolean;
  mp: number;      // mana: skills spend it, it refills over time (faster resting or in town)
  mountKind: string;   // which MOUNTS entry the whistle called (valid while mounted)
  recipes: string[];   // secret recipes unlocked from boss blueprints
  party: string;   // party id ("" = solo); every member carries the same id, so views can group by it
  partyRule?: PartyRule;   // the party's sharing rules, copied onto every member (the HUD shows them)
}
export const PARTY_MAX = 5;
const MELEE_SLACK = 0.4, MELEE_HUG = 0.9;   // metres: see resolve()
/** How a party shares. exp — "share": the kill's EXP split among members nearby (+bonus); "each": the killer keeps it.
 *  loot — "party": any member may pick up the party's drops and gold is split; "own": drops are the killer's and gold
 *  goes to whoever picks it up; "random": each drop belongs to a random member nearby (gold still split). */
export interface PartyRule { exp: "share" | "each"; loot: "party" | "own" | "random" }
export const PARTY_RULE: PartyRule = { exp: "share", loot: "party" };
export interface Listing { id: string; seller: string; sellerUid: string; sellerName: string; itemId: string; count: number; price: number }   // price per unit; seller = session id, sellerUid = the account
export const MARKET_MAX_LISTINGS = 10;
export const GM = { level: 999, stat: 9999, gold: 9999999 };
export const DEATH_EXP_LOSS = 0.01;
export interface SimMonster extends Body, Primary, Derived {
  xp?: number;     // EXP it gives, set for its level at spawn
  roam?: string;   // a roaming boss: the map it reappears in (a new random spot each time)
  kind: string; home: { x: number; z: number }; targetId: string | null; mode: "wander" | "leash"; timer: number;
  wanderTo: { x: number; z: number } | null; bite: number; bit: boolean; dead: number; slowT?: number;
  cast?: { skill: BossSkill; t: number; x: number; z: number } | null;   // telegraphed attack in progress
  skillCd?: Record<string, number>;
}
// Ground loot: a kill leaves sacks and coins on the floor instead of teleporting them into the bag. The killer has
// them to themselves for a short while, then anyone may take them; they rot away after LOOT_TTL.
export interface GroundItem { id: string; itemId: string; count: number; gold: number; x: number; z: number; owner: string; t: number }
/** The accessory that brings the loot fairy (bought, dear, at the tool shops). */
export const FAIRY_ITEM = "FAIRY_CHARM", hasFairy = (equip: Record<string, string>) => Object.values(equip).includes(FAIRY_ITEM);
export const LOOT_TTL = 120, LOOT_OWNER_WINDOW = 60, PICK_RANGE = 1.7, FAIRY_RANGE = 7, FAIRY_SPEED = 9;   // 2 min on the ground, the killer's alone for the first 1

/** What a member sees of their guild. */
export interface GuildView { id: string; name: string; funds: number; capacity: number; buildings: Record<BuildingId, number>; skills: Record<GuildSkillId, number>; me: string; members: (Member & { uid: string; online: boolean })[]; apps?: { uid: string; name: string; level: number }[] }
/** One line of the rankings. */
export interface RankRow { name: string; level: number; race: string; guild: string }
export interface FriendView { friends: { uid: string; name: string; online: boolean; channel?: number }[]; pending: { uid: string; name: string }[] }
export type SimEvent =
  | { t: "anim"; id: string; clip: string }
  | { t: "cast"; id: string; skill: string; rate?: number }
  | { t: "slow"; id: string; dur: number }
  | { t: "pick"; id: string; gid: string; fairy: boolean }         // ground item gid went into id's bag: the client flies it to them
  | { t: "buff"; id: string; skill: string; dur: number }            // a buff skill took hold on id for dur s                           // frozen: moves at SLOW_MULT for dur s                       // skill started: play its clip + windup fx
  | { t: "dmg"; id: string; n: number; crit: boolean; miss: boolean; by: string }
  | { t: "heal"; id: string; n: number }
  | { t: "respawn"; id: string }
  | { t: "notice"; text: string }                                 // everyone (boss spawn / kill)
  | { t: "msg"; pid: string; text: string; cls?: string }        // owner only
  | { t: "loot"; pid: string; text: string }
  | { t: "fairy"; id: string; x: number; z: number; back: number }   // a player's loot fairy flies to (x, z), there in `back` s
  | { t: "lvl"; pid: string; level: number }
  | { t: "kill"; pid: string; mid: string }
  | { t: "craft"; pid: string; item: string }
  | { t: "drop"; id: string }                                     // something hit the floor (for a landing puff)
  | { t: "dead"; pid: string; secs: number; lost?: number }
  | { t: "tradeReq"; pid: string; from: string; name: string }
  | { t: "partyReq"; pid: string; from: string; name: string }
  | { t: "guildReq"; pid: string; from: string; name: string; guild: string }
  | { t: "guildList"; pid: string; list: GuildSummary[] }               // the guild finder's answer
  | { t: "friends"; pid: string; view: FriendView }
  | { t: "friendReq"; pid: string; from: string; name: string }        // someone asked to be friends
  | { t: "ranking"; pid: string; players: RankRow[]; guilds: GuildSummary[] }
  | { t: "guild"; pid: string; view: GuildView | null }                  // my guild changed (null: no guild)
  | { t: "market"; pid?: string; list: Listing[] }                       // market board: to one player (opened) or everyone (changed)
  | { t: "shot"; id: string; skill: string; x: number; z: number; travel: number }       // projectile from caster to (x,z)
  | { t: "aoe"; id: string; skill: string; x: number; z: number; delay: number }
  | { t: "telegraph"; id: string; name: string; x: number; z: number; radius: number; windup: number }   // red warning circle
  | { t: "fish"; id: string; item: string; rarity: string }   // a catch: its rarity colours the float text
  | { t: "slam"; id: string; name?: string; x: number; z: number; radius: number }                                        // the warned attack lands         // area spell lands at (x,z) after delay
  | { t: "trade"; pid: string; view: TradeView | null };

export interface TradeSide { items: Record<string, number>; gold: number; ok: boolean }   // items: instance id -> count
/** Reference value of what one side puts on the table (instance id -> count, looked up in that player's bag). */
export const offerValue = (p: { inv: Inventory }, s: TradeSide) => Object.entries(s.items).reduce((v, [inst, n]) => { const it = p.inv.items.find(i => i.id === inst); return v + (it ? refPrice(it.itemId) * n : 0); }, 0);
/** Same rule as the market: gold paid for items must sit within ±10% of their reference value. Swapping items, or
 *  giving items away, is always allowed; gold with nothing coming back is not (that is how RMT hides). */
export function tradeGoldBand(value: number) { return { min: Math.ceil(value * (1 - MARKET_BAND)), max: Math.floor(value * (1 + MARKET_BAND)) }; }
export function tradeFairness(A: { inv: Inventory }, sa: TradeSide, B: { inv: Inventory }, sb: TradeSide): string | null {
  for (const [payer, gold, value] of [["A", sa.gold, offerValue(B, sb)], ["B", sb.gold, offerValue(A, sa)]] as const) {
    if (!gold) continue;
    if (!value) return "ใส่ Gold ได้ก็ต่อเมื่ออีกฝ่ายใส่ของมาแลก";
    const band = tradeGoldBand(value);
    if (gold < band.min || gold > band.max) return `Gold ฝั่ง ${payer === "A" ? "ผู้ขอ" : "ผู้รับ"} ต้องอยู่ระหว่าง ${band.min}–${band.max} (±10% ของราคากลาง ${value})`;
  }
  return null;
}
export interface Trade { a: string; b: string; side: Record<string, TradeSide> }
export interface TradeView { withId: string; withName: string; mine: { items: { inst: string; itemId: string; count: number }[]; gold: number; ok: boolean }; theirs: { items: { inst: string; itemId: string; count: number }[]; gold: number; ok: boolean }; theirValue: number }   // theirValue: reference price of what they offer
export const TRADE_RANGE = 3;

/** Atomic two-way exchange: validated on copies, committed only when both sides fit. */
export function swap(A: SimPlayer, sa: TradeSide, B: SimPlayer, sb: TradeSide): boolean {
  const ia: Inventory = JSON.parse(JSON.stringify(A.inv)), ib: Inventory = JSON.parse(JSON.stringify(B.inv));
  const take = (inv: Inventory, s: TradeSide) => { const out: [string, number][] = []; for (const [inst, n] of Object.entries(s.items)) { const it = inv.items.find(i => i.id === inst); if (!it || it.count < n) return null; it.count -= n; if (!it.count) inv.items.splice(inv.items.indexOf(it), 1); out.push([it.itemId, n]); } return out; };
  const ga = take(ia, sa), gb = take(ib, sb); if (!ga || !gb || A.gold < sa.gold || B.gold < sb.gold) return false;
  for (const [it, n] of ga) if (!addItem(ib, it, n)) return false;
  for (const [it, n] of gb) if (!addItem(ia, it, n)) return false;
  A.inv = ia; B.inv = ib; A.gold += sb.gold - sa.gold; B.gold += sa.gold - sb.gold; return true;
}

/** Night-only monsters are out between 19:00 and 05:30. */
/** Walking speed in m/s: base × horse × race trait (mice +15%). The Status window shows exactly this. */
export const moveSpeed = (p: { mounted: boolean; race: string; mountKind?: string; hunger?: number; meal?: MealBuff & { t: number } }) => WALK * (p.mounted ? MOUNTS[p.mountKind || "horse"]?.speed ?? MOUNT_SPEED : 1) * (RACE_TRAITS[speciesOf(p.race)].speedMult ?? 1)
  * (hungerState(p.hunger) === "ok" ? 1 : HUNGRY_SLOW) * (1 + (p.meal && p.meal.t > 0 ? p.meal.move ?? 0 : 0));   // hungry: dragging its feet; a fish dish: lighter on them
export const isNight = (hours: number) => hours >= 19 || hours < 5.5;
export const WALK = 3.3, MOUNT_SPEED = 1.8, PLAYER_R = 0.35, DAY_SECONDS = 1800;   // deliberate exploration pace; one in-game day = 30 real minutes
export const SLOW_MULT = 0.45;
/** Damage per second of one player of level L: points spent on STR, a weapon of the level, swings and skills, after
 *  a boss's DEF. A rough yardstick, used only to size raid bosses. */
export const playerDps = (L: number) => { const atk = 2 * (5 + (L - 1) * STAT_POINTS_PER_LEVEL * 0.6) + 6 + 3 * L; return atk * 1.7 * 0.8; };
/** A raid boss's HP: about ten players of its level hitting it for four minutes. */
export const RAID_PLAYERS = 10, RAID_SECONDS = 240;
export const raidHP = (L: number) => Math.round(RAID_PLAYERS * playerDps(L) * RAID_SECONDS);
export const MONSTER_CHASE_SPEED = 2.6, MONSTER_RETURN_SPEED = 2.8, MONSTER_WANDER_SPEED = 1.0;   // every monster stays slower than an unmounted player
/** World time from the wall clock: one real hour is one game day, the same on every server and browser (no drift). */
export const gameHours = (ms = Date.now()) => ((ms / 1000) % DAY_SECONDS) / DAY_SECONDS * 24;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Client prediction vs the server: the server's position is a round trip old, so it is measured against where the
 *  player was lately (`trail`, the last TRAIL_S seconds of predicted positions), not where it is now — comparing with
 *  "now" read every step of latency as an error and tugged a walking player back. Only a real disagreement (a wall the
 *  prediction missed, a knock-back) is corrected: eased in when small, snapped when large. */
export const TRAIL_S = 0.6;
export function reconcile(p: { x: number; z: number }, trail: { x: number; z: number; t: number }[], s: { x: number; z: number }, dt: number, now: number) {
  trail.push({ x: p.x, z: p.z, t: now }); while (trail.length > 2 && now - trail[0].t > TRAIL_S) trail.shift();
  let best = trail[0], bd = Infinity;
  for (const h of trail) { const d = Math.hypot(s.x - h.x, s.z - h.z); if (d < bd) { bd = d; best = h; } }
  if (bd > 3) { p.x = s.x; p.z = s.z; trail.length = 0; return "snap"; }
  if (bd < 0.25) return "ok";
  const k = 1 - Math.exp(-dt * 8), ox = (s.x - best.x) * k, oz = (s.z - best.z) * k;
  p.x += ox; p.z += oz; for (const h of trail) { h.x += ox; h.z += oz; }   // the history moves with the correction
  return "ease";
}

/** Move a body by (mx,mz) input for dt. Shared by the server tick and client prediction so both agree exactly. */
export function stepPlayer(p: SimPlayer, dt: number, L: Layout) {
  if (!p.alive) return;
  let { mx, mz } = p.in; const ml = Math.hypot(mx, mz);
  let moving = ml > 0.15 && p.busy <= 0;
  if (ml > 0.15) { p.sitting = false; p.yaw = Math.atan2(mx, mz); }
  let speed = moving ? moveSpeed(p) : 0;
  if (p.dash > 0) { p.dash -= dt; speed = SKILLS.SKILL_DASH.speed!; moving = true; if (ml <= 0.15) { mx = Math.sin(p.yaw); mz = Math.cos(p.yaw); } else { mx /= ml; mz /= ml; } }
  if (moving) { p.x += mx * speed * dt; p.z += mz * speed * dt; collide(p, PLAYER_R, L); }
  p.moving = moving;
  for (const k in p.cd) p.cd[k as ActKind] = Math.max(0, p.cd[k as ActKind] - dt);
  p.itemCd = Math.max(0, p.itemCd - dt); p.busy = Math.max(0, p.busy - dt);
}

export class Sim {
  players = new Map<string, SimPlayer>();
  monsters: SimMonster[] = [];
  ground: GroundItem[] = [];
  private nextDrop = 1;
  events: SimEvent[] = [];
  clock: () => number = () => gameHours();   // tests pin it; the game never does
  now: () => number = () => Date.now();      // real time (the quest day); tests pin it
  /** GM test character: a player named "admin" starts maxed out. Off unless the host opts in (offline play, or a
   *  server started with BKO_ALLOW_GM=1) — on a public server anyone could type that name. */
  allowGM = false;
  hours = gameHours();
  constructor(public L: Layout = buildLayout(), private rng: () => number = Math.random) {
    let id = 0;
    const placed = new Map<string, { x: number; z: number }[]>();   // per map: where its monsters stand
    for (const sp of SPAWNS) for (let k = 0; k < sp.n; k++) {
      if (sp.zone) {   // a roaming boss: somewhere new in its map every time it appears
        const z = ZONES.find(z => z.id === sp.zone)!, at = randomSpot(this.L, z, this.rng);
        const m = this.spawnMonster(`m${id++}`, sp.kind, at.x, at.z); m.roam = z.id; this.monsters.push(m); continue;
      }
      // spread over the whole map, not in a knot round the spawn point: of a few free spots (randomSpot keeps clear of
      // walls, the town square and the map's gaps) the one farthest from the monsters already placed in that map
      const z = zoneAt(sp), mine = placed.get(z.id) ?? placed.set(z.id, []).get(z.id)!;
      let at = { x: sp.x, z: sp.z }, far = -1;
      for (let t = 0; t < 8; t++) { const q = randomSpot(this.L, z, this.rng), d = mine.reduce((m, o) => Math.min(m, Math.hypot(o.x - q.x, o.z - q.z)), 1e9); if (d > far) { far = d; at = q; } }
      mine.push(at); this.monsters.push(this.spawnMonster(`m${id++}`, sp.kind, at.x, at.z));
    }
    this.monsters.push(this.spawnMonster("boss", "MON_ALPHA_WOLF", BOSS_SPAWN.x, BOSS_SPAWN.z));
  }
  /** A monster at its map's level (shared/regions.ts Zone.level) — never below its own: far from Pawhaven the same
   *  beasts come back stronger, up to Lv 99, with stats grown per level and EXP to match the level curve. */
  private spawnMonster(id: string, kind: string, x: number, z: number): SimMonster {
    const d = MONSTERS[kind], jitter = (Number(id.replace(/\D/g, "")) || 0) % 3 - 1;   // ±1 level, fixed per monster
    const L = Math.min(MAX_LEVEL, Math.max(d.level, zoneAt({ x, z }).level + jitter)), up = L - d.level, boss = d.boss ? 1 : 0;
    const grow = (base: number, per: number) => Math.round(base + up * per);
    const m = derive({ id, kind, x, z, yaw: 0, hp: 0, alive: true, moving: false, level: L, STR: grow(d.STR, 1.6 + boss), AGI: grow(d.AGI, 0.7), VIT: grow(d.VIT, 1.8 + boss * 4), INT: grow(d.INT, 0.5), DEX: grow(d.DEX, 1.2), LUK: grow(d.LUK, 0.4),
      home: { x, z }, targetId: null, mode: "wander", timer: 0, wanderTo: null, bite: 0, bit: false, dead: 0, equip: {} } as any) as SimMonster;
    // monsters use the player formula for HP/DEF, which is far too tanky for them — scale down from formulas.json
    const F = FORMULAS as any;
    m.maxHP = Math.max(1, Math.round(m.maxHP * (d.boss ? F.Boss_HP_Mult ?? 1 : F.Monster_HP_Mult ?? 1)));
    m.DEF = Math.round(m.DEF * (F.Monster_DEF_Mult ?? 1) * (d.boss ? F.Boss_DEF_Mult ?? 1 : 1));
    if (d.raid) m.maxHP = raidHP(L);   // a raid boss: sized for ten players, not one
    m.xp = up > 0 ? Math.max(d.exp, Math.round(expToNext(L) / 45 * (d.boss ? 15 : 1))) : d.exp;
    m.hp = m.maxHP; return m;
  }
  private emit(e: SimEvent) { this.events.push(e); }
  private msg(pid: string, text: string, cls?: string) { this.emit({ t: "msg", pid, text, cls }); }

  // ---------------------------------------------------------------- players
  join(id: string, c: Creation, saved?: Saved) {
    const picked = BREED_ALIAS[c.race ?? ""] ?? c.race;
    const race: Race = RACES.includes(picked as Race) ? picked as Race : "dog";
    const p: SimPlayer = derive({ id, name: c.name.slice(0, 16) || "Dog Knight", race, skills: [...STARTER_SKILLS], mounted: false, x: SPAWN.x, z: SPAWN.z, yaw: 0, hp: 0, alive: true, moving: false,
      level: 1, exp: 0, STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, points: 5, gold: START_GOLD, inv: createInventory(), eq: {}, equip: {},
      cd: {}, itemCd: 0, dash: 0, busy: 0, deadT: 0, sitting: false, furColor: c.color, party: "", recipes: [], mountKind: "", mp: 0, in: { mx: 0, mz: 0 }, dirty: true } as any) as SimPlayer;
    p.mp = p.maxMP;
    // (bags grew to INV_SLOTS: an older save gets the new size)
    if (saved) { Object.assign(p, JSON.parse(JSON.stringify(saved))); p.inv.capacity = Math.max(p.inv.capacity ?? 0, INV_SLOTS); p.skills = [...new Set([...STARTER_SKILLS, ...(p.skills ?? [])])]; if (RACES.includes(race) && c.race) p.race = race; else if (BREED_ALIAS[p.race]) p.race = BREED_ALIAS[p.race];   // the breed picked on the creator card wins over the saved one
      this.sync(p); p.hp = Math.min(p.maxHP, Math.max(1, saved.hp)); p.mp = Math.min(p.maxMP, saved.mp ?? p.maxMP);
      // back where they left (a refresh or a crash must not throw the player to town); a spot off the map goes to town,
      // one inside a wall or tree is pushed clear
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !zoneAtCell(Math.round(p.x / CELL), Math.round(p.z / CELL))) { p.x = SPAWN.x; p.z = SPAWN.z; } else collide(p, 0.4, this.L); }
    else {
      for (const it of Object.values(STARTER_EQUIPMENT)) { addItem(p.inv, it, 1); equip(p.inv, p.eq, p.inv.items[p.inv.items.length - 1].id); }
      addItem(p.inv, "HP_POTION", 3); addItem(p.inv, "FOOD_GRILLED_MEAT", 3); this.sync(p); p.hp = p.maxHP;
    }
    // after the save is restored, so the GM stats win over whatever the account had
    if (this.allowGM && c.name.trim().toLowerCase() === "admin") {
      Object.assign(p, { name: "admin", level: GM.level, STR: GM.stat, AGI: GM.stat, VIT: GM.stat, INT: GM.stat, DEX: GM.stat, LUK: GM.stat, points: 0, gold: GM.gold });
      p.skills = [...new Set([...p.skills, ...Object.keys(SKILLS).filter(k => SKILLS[k].price)])];
      this.sync(p); p.hp = p.maxHP; p.mp = p.maxMP; this.msg(id, "🛡 GM mode: Lv 999 · สเตตัส 9999 · Gold 9,999,999 · สกิลครบ", "lvl");
    }
    deliverSystemMail(p); p.hunger ??= HUNGER_MAX; p.pantry ??= {};
    if (TRIAL_ALL_SKILLS) { p.trialSkills = Object.keys(SKILLS).filter(k => !p.skills.includes(k)); p.skills.push(...p.trialSkills); }
    // a stable id across sessions (the sim id is the connection): what the guild book knows the player by
    p.uid ||= `u${Date.now().toString(36)}${Math.floor(this.rng() * 1e8).toString(36)}`;
    this.guilds.rename(p.uid, p.name);
    this.players.set(id, p); this.marketRejoin(p); this.guildRefresh(p);
    this.msg(id, saved ? `ยินดีต้อนรับกลับ ${p.name} (Lv ${p.level})` : `สวัสดี ${p.name}! คุณได้ ${p.points} แต้มสถานะ — เปิด Status แล้วกด +`, "lvl");
    return p;
  }
  leave(id: string) { this.guildReqs.delete(id); this.partyLeave(id); this.tradeCancel(id, "อีกฝ่ายออกจากเกม"); this.players.delete(id); for (const m of this.monsters) if (m.targetId === id) m.targetId = null; }
  private sync(p: SimPlayer) {
    p.equip = equippedIds(p.eq); derive(p);
    const b = this.guilds.bonus(p.uid ?? "");   // guild skills: percentages on top of the player's own stats
    if (b.hp) p.maxHP = Math.round(p.maxHP * (1 + b.hp)); if (b.atk) { p.ATK = Math.round(p.ATK * (1 + b.atk)); p.MATK = Math.round(p.MATK * (1 + b.atk)); } if (b.def) p.DEF = Math.round(p.DEF * (1 + b.def));
    const u = p.buff; if (u && u.t > 0) { p.ATK = Math.round(p.ATK * (1 + (u.atk ?? 0))); p.MATK = Math.round(p.MATK * (1 + (u.atk ?? 0))); p.DEF = Math.round(p.DEF * (1 + (u.def ?? 0))); p.ASPD *= 1 + (u.aspd ?? 0); }   // a buff skill (War Cry) on top
    const m = p.meal; if (m && m.t > 0) { p.ATK = Math.round(p.ATK * (1 + (m.atk ?? 0))); p.MATK = Math.round(p.MATK * (1 + (m.atk ?? 0))); p.DEF = Math.round(p.DEF * (1 + (m.def ?? 0))); p.ASPD *= 1 + (m.aspd ?? 0); }   // a dish's buff
    const hs = hungerState(p.hunger); if (hs !== "ok") p.ASPD *= HUNGRY_SLOW; if (hs === "starving") { p.HPR = 0; p.MPR = 0; }   // hungry: slow swings; starving: no regen
    p.hp = Math.min(p.hp, p.maxHP); p.dirty = true;
  }
  input(id: string, mx: number, mz: number) { const p = this.players.get(id); if (!p) return; const l = Math.hypot(mx, mz); if (!Number.isFinite(l)) return; p.in.mx = l > 1 ? mx / l : mx; p.in.mz = l > 1 ? mz / l : mz; }

  /** Start a skill: the clip plays now, the effect lands on its contact frame (`hit`), the character is locked for `cast`.
   *  SKILL_BASIC follows the weapon: a bow shoots (SKILL_SHOOT), a staff throws blue fire (SKILL_BOLT). */
  act(id: string, slot: ActKind, yaw?: number, ax?: number, az?: number) {
    const p = this.players.get(id); if (!p || !p.alive || !SKILLS[slot] || !p.skills.includes(slot)) return;
    if (Number.isFinite(yaw)) p.yaw = yaw!;   // soft lock: the client turns the character to its target; only the facing, never the position
    const kind = slot === "SKILL_BASIC" ? attackSkill(p.equip, p.inv, p.mp) : slot, S = SKILLS[kind];
    if ((p.cd[slot] ?? 0) > 0 || p.busy > 0) return;
    if (S.requires && weaponOf(p.equip) !== S.requires) return this.msg(id, `ต้องถือ${WEAPON_TH[S.requires]}ก่อน`);
    if (S.mana && p.mp < S.mana) return this.msg(id, `MP ไม่พอ (ต้องใช้ ${S.mana})`);
    if (S.ammo && !removeItem(p.inv, "ARROW", S.ammo)) return this.msg(id, `ลูกธนูไม่พอ (ต้องใช้ ${S.ammo} ดอก) — ซื้อที่ร้านเครื่องมือ`);
    p.mp -= S.mana ?? 0;
    const rate = slot === "SKILL_BASIC" ? p.ASPD : 1;   // AGI speeds up the basic attack only: cooldown, lock and contact frame
    p.cd[slot] = slot === "SKILL_BASIC" ? S.cooldown / rate : S.cooldown * (1 - p.CDR);   // DEX shortens every other skill's cooldown
    p.sitting = false; p.mounted = false; p.busy = S.cast / rate; p.dirty = true;
    this.emit(rate === 1 ? { t: "cast", id, skill: kind } : { t: "cast", id, skill: kind, rate });
    if (S.kind === "dash") { p.dash = S.duration!; return; }
    // an aimed area skill lands where it was placed (never past its reach); unaimed, it finds its own spot
    let aim: { x: number; z: number } | undefined;
    if (Number.isFinite(ax) && Number.isFinite(az)) { const dx = ax! - p.x, dz = az! - p.z, d = Math.hypot(dx, dz), k = d > (S.range ?? 0) ? (S.range ?? 0) / d : 1; aim = { x: p.x + dx * k, z: p.z + dz * k }; }
    this.later(S.hit / rate, () => this.resolve(p, S, kind, aim));
  }
  private pending: { t: number; fn: () => void }[] = [];
  private later(t: number, fn: () => void) { if (t > 0) this.pending.push({ t, fn }); else fn(); }
  private resolve(p: SimPlayer, S: SkillDef, kind: string, aim?: { x: number; z: number }) {
    if (!p.alive || !this.players.has(p.id)) return;
    if (S.kind === "revive") {   // Resurrection: the nearest fallen player in reach
      const q = [...this.players.values()].filter(q => q !== p && !q.alive && dist(q, p) <= (S.range ?? 4)).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (!q) return this.msg(p.id, "ไม่มีผู้เล่นที่ล้มอยู่ใกล้ ๆ");
      this.revive(q, 0.4, `${p.name} ชุบชีวิตให้`); this.msg(p.id, `✨ ชุบชีวิต ${q.name} แล้ว`, "heal"); return;
    }
    if (S.kind === "buff") {   // War Cry: the caster and party members within the radius
      const who = [...this.players.values()].filter(q => q.alive && (q === p || (p.party && q.party === p.party)) && dist(q, p) <= (S.radius ?? 0));
      for (const q of who) { q.buff = { ...S.buff, t: S.duration ?? 10 }; this.sync(q); this.emit({ t: "buff", id: q.id, skill: kind, dur: S.duration ?? 10 }); }
      return;
    }
    if (S.kind === "heal") {
      // Healing Circle reaches party members in range; Mend (no radius) is self only
      const who = S.radius ? [...this.players.values()].filter(q => q.alive && (q === p || (p.party && q.party === p.party)) && dist(q, p) <= S.radius!) : [p];
      for (const q of who) { const n = Math.floor(q.maxHP * (S.heal ?? 0)); q.hp = Math.min(q.maxHP, q.hp + n); q.dirty = true; this.emit({ t: "heal", id: q.id, n }); }
      if (S.radius && who.length > 1) this.msg(p.id, `ฮีลเพื่อน ${who.length - 1} คน`, "heal");
      return;
    }
    const ahead = (r: number) => ({ x: p.x + Math.sin(p.yaw) * r, z: p.z + Math.cos(p.yaw) * r });
    const foes = this.foes(p);
    const nearestInCone = () => foes.filter(m => inCone(p, m, S.range!, S.cone!)).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (S.kind === "ranged") {
      // the projectile flies for real: damage lands when it arrives, splash (staff) around the impact point
      const m = nearestInCone(), at = m ? { x: m.x, z: m.z } : ahead(S.range!), travel = Math.hypot(at.x - p.x, at.z - p.z) / S.speed!;
      this.emit({ t: "shot", id: p.id, skill: kind, x: at.x, z: at.z, travel });
      if (!m) return;
      this.later(travel, () => {
        if (!m.alive || !this.players.has(p.id)) return;
        const hits = S.radius ? this.foes(p).filter(o => dist(o, m) <= S.radius!).sort((a, b) => dist(a, m) - dist(b, m)).slice(0, S.targets) : [m];
        for (const o of hits) this.strike(p, o, S);
      });
      return;
    }
    if (S.kind === "aoe") {
      const m = S.self || aim ? undefined : nearestInCone(), at = S.self ? { x: p.x, z: p.z } : aim ?? (m ? { x: m.x, z: m.z } : ahead(S.range! * 0.6));
      this.emit({ t: "aoe", id: p.id, skill: kind, x: at.x, z: at.z, delay: S.delay ?? 0 });
      for (let w = 0; w < (S.waves ?? 1); w++) this.later((S.delay ?? 0) + w * 0.35, () => {
        if (!this.players.has(p.id)) return;
        for (const o of this.foes(p).filter(o => dist(o, at) <= S.radius!).slice(0, S.targets)) this.strike(p, o, S);
      });
      return;
    }
    // melee lands on the contact frame, a beat after the swing began: a monster that stepped a little out of reach or
    // round the side in the meantime (or sits a tick off on the server) still takes it — the slack, and anything
    // hugging the body whatever the angle
    const facing = (m: SimMonster | SimPlayer) => inCone(p, m, S.range! + MELEE_SLACK, S.cone!);   // what the swing faces comes first
    const targets = foes.filter(m => facing(m) || dist(m, p) < MELEE_HUG).sort((a, b) => +facing(b) - +facing(a) || dist(a, p) - dist(b, p)).slice(0, S.targets);
    for (const m of targets) this.strike(p, m, S);
  }
  /** A skill landing on one target: the damage, then its ice (S.slow) if the target is a monster still standing. */
  private strike(p: SimPlayer, o: SimMonster | SimPlayer, S: SkillDef) {
    this.hit(p, o, S.coef!, S.magic);
    if (S.slow && o.alive && !this.players.has(o.id)) { (o as SimMonster).slowT = S.slow; this.emit({ t: "slow", id: o.id, dur: S.slow }); }
  }
  /** What p's attacks can land on: live monsters, plus other players when both stand in a free-PK map (never a party
   *  mate, never inside a town's walls). */
  private foes(p: SimPlayer): (SimMonster | SimPlayer)[] {
    const list: (SimMonster | SimPlayer)[] = this.monsters.filter(m => m.alive);
    const pk = (q: SimPlayer) => isPK(q) && !inTown(q);
    if (pk(p)) for (const q of this.players.values()) if (q !== p && q.alive && pk(q) && !(p.party && q.party === p.party)) list.push(q);
    return list;
  }
  private hit(p: SimPlayer, o: SimMonster | SimPlayer, coef: number, magic = false) {
    if (this.players.get(o.id) === o) return this.hitPlayer(p, o as SimPlayer, coef, magic);
    this.hitMonster(p, o as SimMonster, coef, magic);
  }
  /** PK: player against player, at PVP_MULT of the damage (fights last long enough to be a fight). */
  private hitPlayer(p: SimPlayer, q: SimPlayer, coef: number, magic: boolean) {
    if (!q.alive || !this.players.has(q.id)) return;
    const r = damage(p, q, coef, this.rng, magic), n = Math.max(1, Math.round(r.dmg * PVP_MULT));
    this.emit({ t: "dmg", id: q.id, n, crit: r.crit, miss: r.miss, by: p.id }); if (r.miss) return;
    this.msg(p.id, `ตี ${q.name} ${n}${r.crit ? " CRIT" : ""}`, "dmg");
    this.hurt(q, n, `⚔ โดน ${p.name} ตี ${n}`);
    if (!q.alive) this.emit({ t: "notice", text: `⚔ ${p.name} ล้ม ${q.name} ที่ ${zoneAt(q).name}` });
  }
  private hitMonster(p: SimPlayer, m: SimMonster, coef: number, magic = false) {
    const r = damage(p, m, coef, this.rng, magic);
    this.emit({ t: "dmg", id: m.id, n: r.dmg, crit: r.crit, miss: r.miss, by: p.id });
    if (r.miss) return;
    m.hp -= r.dmg; if (m.mode !== "leash") m.targetId = p.id;
    this.msg(p.id, `ตี ${MONSTERS[m.kind].name} ${r.dmg}${r.crit ? " CRIT" : ""}`, "dmg");
    if (m.hp <= 0) this.kill(p, m); else this.emit({ t: "anim", id: m.id, clip: "Hit" });
  }
  private kill(p: SimPlayer, m: SimMonster) {
    const d = MONSTERS[m.kind]; m.alive = false; m.hp = 0; m.dead = d.respawn; m.targetId = null; this.emit({ t: "anim", id: m.id, clip: "Death" });
    if (d.boss) this.emit({ t: "notice", text: `${p.name} ปราบ ${d.name} แล้ว! เกิดใหม่ใน ${Math.round(d.respawn / 60)} นาที` });
    this.emit({ t: "kill", pid: p.id, mid: m.id });
    for (const q of this.nearbyParty(p)) this.questCount(q, m.kind);   // a party hunting together all get the tally
    const got = rollDrops(d.dropTable, this.rng); const lines: string[] = [];
    // its own unique material; a boss may also drop the blueprint for its divine gear
    const uq = UNIQUE_OF[m.kind], bp = BLUEPRINT_OF[m.kind];
    if (uq && this.rng() < (d.boss ? UNIQUE_CHANCE.boss : UNIQUE_CHANCE.normal)) got.items[uq] = (got.items[uq] ?? 0) + 1;
    if (bp && this.rng() < UNIQUE_CHANCE.blueprint) got.items[bp] = (got.items[bp] ?? 0) + 1;
    for (const t of SKILLBOOK_OF[m.kind] ?? []) if (this.rng() < SKILLBOOK_CHANCE) got.items[t] = (got.items[t] ?? 0) + 1;   // special-skill tomes: bosses only
    for (const e of BOSS_LOOT[m.kind] ?? []) if (this.rng() < e.chance) got.items[e.item] = (got.items[e.item] ?? 0) + 1;   // the retired Tyrants' blueprints and souls
    if (d.pk) {   // a PK warlord: a sure blueprint, and often a piece of divine gear
      const bps = Object.values(BLUEPRINT_OF), gear = Object.keys(ITEMS).filter(k => k.startsWith("DIVINE_"));
      const bp = bps[Math.floor(this.rng() * bps.length)]; if (bp) got.items[bp] = (got.items[bp] ?? 0) + 1;
      if (gear.length && this.rng() < 0.3) { const g = gear[Math.floor(this.rng() * gear.length)]; got.items[g] = (got.items[g] ?? 0) + 1; }
    }
    if (d.boss && d.base) for (let i = 0; i < 2; i++) { const more = rollDrops(d.dropTable, this.rng); got.gold += more.gold * 5; for (const [it, n] of Object.entries(more.items)) got.items[it] = (got.items[it] ?? 0) + n; }   // a boss pays out three rolls
    const rule = this.ruleOf(p), near = rule.loot === "random" ? this.nearbyParty(p) : [p];
    for (const [it, n] of Object.entries(got.items)) { const to = near[Math.floor(this.rng() * near.length)] ?? p; this.drop(m, to.id, it, n, 0); lines.push(`${itemName(it)} ×${n}${to !== p ? ` → ${to.name}` : ""}`); }
    got.gold = Math.round(got.gold * (1 + Math.max(0, m.level - d.level) * 0.08));   // stronger beasts carry more
    if (got.gold) { this.drop(m, p.id, "", 0, got.gold); lines.push(`${got.gold} Gold`); }
    if (lines.length) this.emit({ t: "loot", pid: p.id, text: `ของตก: ${lines.join("  ·  ")} — เดินไปเก็บ` });
    for (const it of Object.keys(got.items)) if (ITEMS[it]?.rare) this.emit({ t: "notice", text: `✨ ${p.name} ได้ของหายาก ${itemName(it)} จาก ${d.name}!` });
    for (const [it, n] of Object.entries(ingredientRolls(m.kind, this.rng))) { this.drop(m, p.id, it, n, 0); lines.push(`${itemName(it)} ×${n}`); }   // for the pot (shared/cooking.ts)
    p.dirty = true; this.shareExp(p, m.xp ?? d.exp);
  }

  /** Put one stack on the floor near `at`, scattered so two drops do not overlap. */
  private drop(at: { x: number; z: number }, owner: string, itemId: string, count: number, gold: number) {
    const a = this.rng() * Math.PI * 2, r = 0.25 + this.rng() * 0.55;
    const g: GroundItem = { id: `g${this.nextDrop++}`, itemId, count, gold, x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r, owner, t: LOOT_TTL };
    collide(g, 0.2, this.L); this.ground.push(g); this.emit({ t: "drop", id: g.id });
  }

  /** Walk-up-and-take. The sim owns the range check; the client only asks. */
  pickup(id: string, groundId: string) { const p = this.players.get(id); if (p) this.take(p, groundId, PICK_RANGE, false); }
  /** Whether p may have g: the killer's (or their party's) at first, anyone's once LOOT_OWNER_WINDOW has passed. */
  private mayTake(p: SimPlayer, g: GroundItem) {
    const owner = this.players.get(g.owner);
    return g.owner === p.id || (!!p.party && owner?.party === p.party && this.ruleOf(p).loot === "party") || g.t <= LOOT_TTL - LOOT_OWNER_WINDOW;   // a party's drops are the party's (rule "party")
  }
  /** Take one stack into p's bag (by hand, or `fairy`: fetched from afar, silently skipping what cannot be had). */
  private take(p: SimPlayer, groundId: string, reach: number, fairy: boolean) {
    const id = p.id; if (!p.alive) return;
    const i = this.ground.findIndex(g => g.id === groundId); if (i < 0) return;
    const g = this.ground[i];
    if (dist(p, g) > reach) return fairy ? undefined : this.msg(id, "อยู่ไกลเกินไป");
    if (!this.mayTake(p, g)) return fairy ? undefined : this.msg(id, `ของคนอื่น — เก็บได้ในอีก ${Math.ceil(g.t - (LOOT_TTL - LOOT_OWNER_WINDOW))} วิ`);
    const tag = fairy ? "🧚 " : "";
    if (g.gold) {   // gold is split evenly among the party members nearby; the odd coins go to whoever picked it up
      const who = this.ruleOf(p).loot === "own" ? [p] : this.nearbyParty(p), each = Math.floor(g.gold / who.length);
      for (const q of who) { const n = Math.round((q === p ? g.gold - each * (who.length - 1) : each) * (1 + this.guilds.bonus(q.uid ?? "").gain)); q.gold += n; q.dirty = true; this.msg(q.id, who.length > 1 ? `Gold ปาร์ตี้ +${n}` : `${tag}เก็บ Gold +${n}`, "loot"); }
    }
    else if (isIngredient(g.itemId)) {   // ingredients go to the pantry, never filling the bag
      const pan = (p.pantry ??= {}); pan[g.itemId] = (pan[g.itemId] ?? 0) + g.count; this.msg(id, `${tag}เก็บวัตถุดิบ ${itemName(g.itemId)} ×${g.count}`, "loot");
    }
    else {
      if (!addItem(p.inv, g.itemId, g.count)) return fairy ? undefined : this.msg(id, "กระเป๋าเต็ม");
      this.msg(id, `${tag}เก็บ ${itemName(g.itemId)} ×${g.count}`, "loot");
    }
    this.ground.splice(i, 1); p.dirty = true; this.emit({ t: "pick", id, gid: g.id, fairy });
    if (!fairy) { p.busy = Math.max(p.busy, 0.55); this.emit({ t: "anim", id, clip: "Pick" }); }
  }
  /** The loot fairy (ทูตเก็บของ), the companion Faritel's Charm brings: she flies to the nearest drop within FAIRY_RANGE that the
   *  player may take and that fits the bag, and brings it back once she gets there — the hand-pickup rules, from afar. */
  private fairyStep(p: SimPlayer, dt: number) {
    if (!hasFairy(p.equip)) { p.fairy = undefined; return; }   // only while Faritel's Charm is worn
    const f = p.fairy;
    if (f) { f.t -= dt; if (f.t > 0) return; p.fairy = undefined; p.fairyCd = 0.3; this.take(p, f.gid, FAIRY_RANGE + 4, true); return; }   // the player may have walked on a little
    if ((p.fairyCd = (p.fairyCd ?? 0) - dt) > 0) return; p.fairyCd = 0.5;
    const near = this.ground.filter(g => dist(p, g) < FAIRY_RANGE && this.mayTake(p, g)).sort((a, b) => dist(p, a) - dist(p, b));
    const g = near.find(g => g.gold || isIngredient(g.itemId) || addItem(structuredClone(p.inv), g.itemId, g.count)); if (!g) return;   // a full bag: leave it lying
    p.fairy = { gid: g.id, t: 0.2 + dist(p, g) / FAIRY_SPEED }; this.emit({ t: "fairy", id: p.id, x: g.x, z: g.z, back: p.fairy.t });
  }
  /** Party members alive within PARTY_SHARE_R of p (p included) — who shares a kill's EXP and a pile of gold. */
  private nearbyParty(p: SimPlayer) {
    if (!p.party) return [p];
    return (this.parties.get(p.party) ?? [p.id]).map(id => this.players.get(id)!).filter(q => q && q.alive && (q === p || dist(q, p) <= PARTY_SHARE_R));
  }
  /** A kill's EXP: alone, all of it; in a party, the members nearby split it plus PARTY_EXP_BONUS per extra member. */
  private shareExp(p: SimPlayer, n: number) {
    const who = this.ruleOf(p).exp === "each" ? [p] : this.nearbyParty(p); if (who.length === 1) return this.gainExp(p, n);
    const each = Math.max(1, Math.round(n * (1 + PARTY_EXP_BONUS * (who.length - 1)) / who.length));
    for (const q of who) { this.gainExp(q, each); q.dirty = true; if (q !== p) this.msg(q.id, `EXP ปาร์ตี้ +${each}`, "lvl"); }
  }
  private gainExp(p: SimPlayer, n: number) {
    n = Math.round(n * (1 + this.guilds.bonus(p.uid ?? "").gain));   // guild Fortune
    p.exp += n; p.dirty = true;
    while (p.exp >= expToNext(p.level) && p.level < MAX_LEVEL) { p.exp -= expToNext(p.level); p.level++; p.points += STAT_POINTS_PER_LEVEL; this.sync(p); p.hp = p.maxHP; p.mp = p.maxMP; this.emit({ t: "lvl", pid: p.id, level: p.level }); }
  }
  private bite(m: SimMonster, p: SimPlayer) {
    const r = damage(m, p, 1, this.rng); this.emit({ t: "dmg", id: p.id, n: r.dmg, crit: r.crit, miss: r.miss, by: m.id }); if (r.miss) return;
    this.hurt(p, r.dmg, `โดน ${MONSTERS[m.kind].name} กัด ${r.dmg}`);
  }
  private hurt(p: SimPlayer, n: number, why: string) {
    p.hp -= n; p.sitting = false; if (p.mounted) { p.mounted = false; p.dirty = true; } this.msg(p.id, why, "dmg");
    if (p.hp <= 0) {
      // death penalty: 1% of this level's EXP bar, never below zero and never a lost level
      const lost = Math.min(p.exp, Math.ceil(expToNext(p.level) * DEATH_EXP_LOSS));
      // the fallen wait where they fell for DEAD_WAIT s: go home now, read a revive scroll, or be raised by a friend's
      // Resurrection (either way the lost EXP comes back); nobody choosing sends them home
      p.exp -= lost; p.lostExp = lost; p.hp = 0; p.alive = false; p.deadT = DEAD_WAIT; p.dirty = true;
      this.emit({ t: "anim", id: p.id, clip: "Death" }); this.emit({ t: "dead", pid: p.id, secs: DEAD_WAIT, lost });
      this.msg(p.id, `คุณตาย${lost ? ` — เสีย EXP ${lost} (1%)` : ""} · กลับเมือง / ใช้ใบชุบ / รอเพื่อนชุบ`, "dmg");
    }
    else this.emit({ t: "anim", id: p.id, clip: "Hit" });
  }

  use(id: string, instId: string) {
    const p = this.players.get(id); if (!p) return; const inst = p.inv.items.find(s => s.id === instId); if (!inst) return this.msg(id, "ไม่มีไอเทม"); const d = ITEMS[inst.itemId];
    if (d.type === "Consumable" && d.food) {   // food: always edible (hunger is the point), HP/MP on top
      if (p.itemCd > 0) return this.msg(id, "รอก่อน");
      if ((p.hunger ?? HUNGER_MAX) >= HUNGER_MAX - 1 && (!d.heal || p.hp >= p.maxHP) && (!d.mana || p.mp >= p.maxMP)) return this.msg(id, "อิ่มแล้ว");
      const was = hungerState(p.hunger); removeItem(p.inv, inst.itemId, 1); p.hunger = Math.min(HUNGER_MAX, (p.hunger ?? HUNGER_MAX) + d.food);
      p.hp = Math.min(p.maxHP, p.hp + (d.heal ?? 0)); p.mp = Math.min(p.maxMP, p.mp + (d.mana ?? 0)); p.itemCd = d.cooldown ?? 1; p.dirty = true;
      const buff = FOODS[inst.itemId]?.buff; if (buff) { p.meal = { ...buff, t: buff.dur }; this.msg(id, `✨ บัพอาหาร: ${buffText(buff)}`, "lvl"); }   // a new dish replaces the last one's buff
      if (buff || was !== hungerState(p.hunger)) this.sync(p);
      if (d.heal) this.emit({ t: "heal", id, n: d.heal }); return this.msg(id, `🍽 กิน ${d.name} — อิ่ม ${Math.round(p.hunger)}%`, "heal");
    }
    if (d.type === "Consumable") {
      if (p.itemCd > 0) return this.msg(id, "รอก่อน");
      if ((!d.heal || p.hp >= p.maxHP) && (!d.mana || p.mp >= p.maxMP)) return this.msg(id, d.mana && !d.heal ? "MP เต็มแล้ว" : "HP เต็มแล้ว");
      removeItem(p.inv, inst.itemId, 1); p.hp = Math.min(p.maxHP, p.hp + (d.heal ?? 0)); p.mp = Math.min(p.maxMP, p.mp + (d.mana ?? 0)); p.itemCd = d.cooldown ?? 1; p.dirty = true;
      if (d.heal) this.emit({ t: "heal", id, n: d.heal }); if (d.mana) this.msg(id, `ฟื้น MP ${d.mana}`, "heal"); return;
    }
    if (d.type === "Book" && d.teaches) {
      if (p.skills.includes(d.teaches) && !p.trialSkills?.includes(d.teaches)) return this.msg(id, "เรียนสกิลนี้แล้ว");
      removeItem(p.inv, inst.itemId, 1); own(p, d.teaches); p.dirty = true; return this.msg(id, `📘 เรียนสกิล ${SKILLS[d.teaches].name} แล้ว — ลากลง hotbar จากหน้าต่าง Skills`, "lvl");
    }
    if (d.resetStats) {   // the reset scroll: every primary stat back to its starting 5, the points returned to spend again
      const back = PRIMARY.reduce((n, k) => n + Math.max(0, p[k] - 5), 0); if (!back) return this.msg(id, "ยังไม่ได้แจกแต้มสเตตัส");
      removeItem(p.inv, inst.itemId, 1); for (const k of PRIMARY) p[k] = Math.min(p[k], 5); p.points += back;
      const f = p.hp / p.maxHP; this.sync(p); p.hp = Math.max(1, Math.round(p.maxHP * f)); p.mp = Math.min(p.mp, p.maxMP); p.dirty = true;
      return this.msg(id, `🔄 รีสเตตัสแล้ว — ได้แต้มคืน ${back} แต้ม เปิด Status เพื่อแจกใหม่`, "lvl");
    }
    if (d.type === "Scroll" && d.unlocks) {
      if (p.recipes.includes(d.unlocks)) return this.msg(id, "รู้สูตรนี้แล้ว");
      removeItem(p.inv, inst.itemId, 1); p.recipes.push(d.unlocks); p.dirty = true; return this.msg(id, `📜 ปลดล็อกสูตร ${itemName(RECIPES[d.unlocks].result)} — คราฟได้ที่ช่างตีเหล็ก`, "lvl");
    }
    if (d.slot) return this.equipInst(id, instId);
    const mk = mountOfItem(inst.itemId);
    if (mk) {
      if (!p.alive || this.trades.has(id)) return;
      if (p.itemCd > 0) return;   // a double-click would mount and dismount in the same breath
      p.itemCd = 1; const off = p.mounted && p.mountKind === mk; p.mounted = !off; p.mountKind = mk; p.sitting = false; p.dirty = true;
      return this.msg(id, off ? `ลงจาก${MOUNTS[mk].name}` : `ขึ้น${MOUNTS[mk].name} — เร็วขึ้น ${MOUNTS[mk].speed} เท่า · โจมตี/โดนกัดจะลงเอง`);
    }
    this.msg(id, "ใช้ไม่ได้");
  }
  learn(id: string, skillId: string) {
    const p = this.players.get(id), S = SKILLS[skillId]; if (!p || !S || !S.price) return;
    if (p.skills.includes(skillId) && !p.trialSkills?.includes(skillId)) return this.msg(id, "เรียนท่านี้แล้ว"); if (p.gold < S.price) return this.msg(id, "Gold ไม่พอ");
    p.gold -= S.price; own(p, skillId); p.dirty = true; this.msg(id, `เรียน ${S.name} แล้ว — ลากลง hotbar จากหน้าต่าง Skills`, "lvl");
  }
  equipInst(id: string, instId: string) { const p = this.players.get(id); if (!p) return; const err = equip(p.inv, p.eq, instId); if (err) this.msg(id, err); this.sync(p); }
  unequipSlot(id: string, slot: string) { const p = this.players.get(id); if (!p) return; const err = unequip(p.inv, p.eq, slot); if (err) this.msg(id, err); this.sync(p); }
  allocate(id: string, attr: string, n: number) { const p = this.players.get(id); if (!p) return; if (allocPoints(p, attr, n)) { const f = p.hp / p.maxHP; this.sync(p); p.hp = Math.round(p.maxHP * f); } }
  craft(id: string, recipeId: string) {
    const p = this.players.get(id); if (!p || !RECIPES[recipeId]) return;
    if (RECIPES[recipeId].secret && !p.recipes.includes(recipeId)) return this.msg(id, "ยังไม่รู้สูตรนี้ — ต้องใช้ Blueprint จากบอส");
    const gold = craftItem(p.inv, p.gold, recipeId);
    if (gold < 0) return this.msg(id, "craft ไม่ได้ — วัตถุดิบ/Gold ไม่พอ หรือกระเป๋าเต็ม");
    p.gold = gold; p.dirty = true; this.emit({ t: "craft", pid: id, item: RECIPES[recipeId].result });
  }
  buy(id: string, itemId: string, n: number) {
    const p = this.players.get(id); if (!p || !ITEMS[itemId] || !Number.isInteger(n) || n < 1) return;
    if (isIngredient(itemId)) {   // bought ingredients go to the pantry like caught ones
      const cost = (ITEMS[itemId].buy ?? 0) * n; if (!ITEMS[itemId].buy || p.gold < cost) return this.msg(id, "ซื้อไม่ได้ — Gold ไม่พอ");
      p.gold -= cost; const pan = (p.pantry ??= {}); pan[itemId] = (pan[itemId] ?? 0) + n; p.dirty = true; return this.msg(id, `ซื้อ ${itemName(itemId)} ×${n} (เก็บในวัตถุดิบ)`, "loot");
    }
    const g = shopBuy(p.inv, p.gold, itemId, n);
    if (g < 0) return this.msg(id, "ซื้อไม่ได้ — Gold ไม่พอหรือกระเป๋าเต็ม"); p.gold = g; p.dirty = true; this.msg(id, `ซื้อ ${itemName(itemId)} ×${n}`, "loot");
  }
  sell(id: string, itemId: string, n: number) {
    const p = this.players.get(id); if (!p || !ITEMS[itemId] || !Number.isInteger(n) || n < 1) return; const g = shopSell(p.inv, p.gold, itemId, n);
    if (g < 0) return this.msg(id, "ขายไม่ได้"); p.gold = g; p.dirty = true; this.msg(id, `ขาย ${itemName(itemId)} ×${n} ได้ ${ITEMS[itemId].sell * n} Gold`, "loot");
  }
  /** Cast a line at a river bank: a bite comes in FISH_TIME seconds unless the player walks off. */
  fish(id: string, yaw?: number) {
    const p = this.players.get(id); if (!p || !p.alive) return;
    if (p.fishing) return this.msg(id, "กำลังตกปลาอยู่ — รอปลากินเบ็ด");
    if (!nearWater(p)) return this.msg(id, "ต้องยืนริมแม่น้ำถึงจะตกปลาได้");
    p.fishing = { t: FISH_TIME[0] + this.rng() * (FISH_TIME[1] - FISH_TIME[0]) }; p.sitting = false; p.dirty = true; if (Number.isFinite(yaw)) p.yaw = yaw!;   // faces the water
    this.emit({ t: "anim", id, clip: "Cast" }); this.msg(id, "🎣 เหวี่ยงเบ็ด… อยู่นิ่ง ๆ รอปลากินเบ็ด");
  }
  private fishStep(p: SimPlayer, dt: number) {
    if (!p.fishing) return;
    if (Math.hypot(p.in.mx, p.in.mz) > 0.15) { p.fishing = undefined; p.dirty = true; return this.msg(p.id, "เดินออก — ปลาหลุดเบ็ด"); }
    if ((p.fishing.t -= dt) > 0) return;
    p.fishing = undefined; const fish = rollFish(this.rng, p.LUK), rarity = INGREDIENTS[fish].rarity!;
    const pan = (p.pantry ??= {}); pan[fish] = (pan[fish] ?? 0) + 1; p.dirty = true;
    this.emit({ t: "fish", id: p.id, item: fish, rarity }); this.emit({ t: "anim", id: p.id, clip: "Pick" });
    this.msg(p.id, `🎣 ได้ ${INGREDIENTS[fish].icon} ${INGREDIENTS[fish].name} (${RARITY[rarity].name})`, "loot");
    if (rarity === "legendary") this.emit({ t: "notice", text: `🐋 ${p.name} ตกได้ ${INGREDIENTS[fish].name} ระดับตำนาน!` });
  }
  /** Cook one dish at a campfire from the pantry. */
  cook(id: string, foodId: string) {
    const p = this.players.get(id), f = FOODS[foodId]; if (!p || !f) return;
    if (!nearCampfire(p, this.L, 1)) return this.msg(id, "ต้องอยู่ใกล้กองไฟถึงจะทำอาหารได้ — มีในทุกเมืองและทุกแผนที่");
    const pan = (p.pantry ??= {}), miss = Object.entries(f.needs).filter(([k, n]) => (pan[k] ?? 0) < n);
    if (miss.length) return this.msg(id, `วัตถุดิบไม่พอ: ${miss.map(([k, n]) => `${INGREDIENTS[k].name} ${pan[k] ?? 0}/${n}`).join(", ")}`);
    if (!addItem(p.inv, foodId, 1)) return this.msg(id, "กระเป๋าเต็ม");
    for (const [k, n] of Object.entries(f.needs)) pan[k] -= n;
    p.dirty = true; this.emit({ t: "craft", pid: id, item: foodId });
  }
  /** Hunger runs down; crossing into hungry / starving (or back) changes the stats and is said once. */
  private hungerStep(p: SimPlayer, dt: number) {
    const before = hungerState(p.hunger), h0 = Math.floor(p.hunger ?? HUNGER_MAX);
    p.hunger = Math.max(0, (p.hunger ?? HUNGER_MAX) - dt * HUNGER_RATE); if (Math.floor(p.hunger) !== h0) p.dirty = true;
    const now = hungerState(p.hunger); if (now === before) return; this.sync(p);
    if (now === "hungry") this.msg(p.id, "🍗 หิวแล้ว — เดินและตีช้าลงมาก หาอะไรกินหรือทำอาหารที่กองไฟ", "dmg");
    if (now === "starving") this.msg(p.id, "⚠ หิวโหย — HP และ MP ไม่ฟื้นเองแล้ว กินอาหารด่วน!", "dmg");
  }
  mailClaim(id: string, mailId: string) {
    const p = this.players.get(id); if (!p) return; const m = p.mail?.find(x => x.id === mailId), err = claimMail(p, mailId);
    if (err) return this.msg(id, err); p.dirty = true;
    this.msg(id, `📬 รับของจากจดหมาย${m?.gold ? ` · ${m.gold.toLocaleString()} Gold` : ""}${m?.items?.length ? ` · ${m.items.map(([it, n]) => `${itemName(it)} ×${n}`).join(", ")}` : ""}`, "loot");
  }
  mailDelete(id: string, mailId: string) {
    const p = this.players.get(id); if (!p?.mail) return; const m = p.mail.find(x => x.id === mailId); if (!m) return;
    if (hasAttachment(m) && !m.claimed) return this.msg(id, "รับของในจดหมายก่อนแล้วค่อยลบ");
    p.mail = p.mail.filter(x => x !== m); p.dirty = true;
  }
  restyle(id: string, color: number) {
    const p = this.players.get(id); if (!p) return; const price = NPCS.NPC_STYLIST.price ?? 0;
    if (p.gold < price) return this.msg(id, "Gold ไม่พอ"); p.gold -= price; p.furColor = color & 0xffffff; p.dirty = true;
  }
  sit(id: string) { const p = this.players.get(id); if (!p || !p.alive) return; p.sitting = !p.sitting; p.dirty = true; this.msg(id, p.sitting ? "นั่งพัก — ฟื้น HP เร็วขึ้น" : "ลุกขึ้น"); }

  // ---------------------------------------------------------------- trade (W3): request → accept → both offer → both confirm → atomic swap
  trades = new Map<string, Trade>();          // both participants map to the same Trade
  private reqs = new Map<string, string>();   // target -> requester

  // ---------------------------------------------------------------- market (player listings, price within ±10% of refPrice)
  market: Listing[] = [];
  // Sellers are known by uid, never by name: names were shared before they had to be unique, and a player who shared a
  // seller's name took over that seller's listings and sale gold whenever the seller was away (a crash, a reconnect).
  private proceeds = new Map<string, number>();   // seller uid -> gold earned while they were away
  /** Set when listings or proceeds changed, so the host can save them (they must survive a restart: the items and
   *  the gold exist nowhere else). */
  marketDirty = false;
  private nextListing = 1;
  private marketPush() { this.emit({ t: "market", list: this.market }); }
  marketOpen(id: string) { this.emit({ t: "market", pid: id, list: this.market }); }
  marketList(id: string, instId: string, count: number, price: number) {
    const p = this.players.get(id), s = p?.inv.items.find(i => i.id === instId); if (!p || !s) return;
    const d = ITEMS[s.itemId]; count = Math.floor(count); price = Math.floor(price);
    if (d.bound) return this.msg(id, "ของชิ้นนี้ขายไม่ได้");
    if (!(count >= 1 && count <= s.count)) return this.msg(id, "จำนวนไม่ถูกต้อง");
    const band = priceBand(s.itemId);
    if (!(price >= band.min && price <= band.max)) return this.msg(id, `ราคาต้องอยู่ระหว่าง ${band.min}–${band.max} Gold ต่อชิ้น (ราคากลาง ${refPrice(s.itemId)})`);
    if (this.market.filter(l => l.seller === id).length >= MARKET_MAX_LISTINGS) return this.msg(id, `ลงขายได้สูงสุด ${MARKET_MAX_LISTINGS} รายการ`);
    s.count -= count; if (!s.count) p.inv.items.splice(p.inv.items.indexOf(s), 1);
    this.market.push({ id: `L${this.nextListing++}`, seller: id, sellerUid: p.uid!, sellerName: p.name, itemId: s.itemId, count, price }); p.dirty = true; this.marketDirty = true;
    this.msg(id, `ลงขาย ${itemName(s.itemId)} ×${count} ราคา ${price} Gold/ชิ้น`, "loot"); this.marketPush();
  }
  marketBuy(id: string, listingId: string) {
    const p = this.players.get(id), i = this.market.findIndex(l => l.id === listingId), l = this.market[i]; if (!p || !l) return this.msg(id, "รายการนี้ขายไปแล้ว");
    if (l.seller === id) return this.msg(id, "ซื้อของตัวเองไม่ได้ — กดยกเลิกแทน");
    const total = l.count * l.price; if (p.gold < total) return this.msg(id, "Gold ไม่พอ");
    if (!addItem(p.inv, l.itemId, l.count)) return this.msg(id, "กระเป๋าเต็ม");
    p.gold -= total; p.dirty = true; this.market.splice(i, 1); this.marketDirty = true;
    const seller = this.players.get(l.seller);
    if (seller && seller.uid === l.sellerUid) { seller.gold += total; seller.dirty = true; this.msg(seller.id, `💰 ${p.name} ซื้อ ${itemName(l.itemId)} ×${l.count} — ได้ ${total} Gold`, "loot"); }
    else this.proceeds.set(l.sellerUid, (this.proceeds.get(l.sellerUid) ?? 0) + total);
    this.msg(id, `ซื้อ ${itemName(l.itemId)} ×${l.count} จาก ${l.sellerName} (${total} Gold)`, "loot"); this.marketPush();
  }
  marketCancel(id: string, listingId: string) {
    const p = this.players.get(id), i = this.market.findIndex(l => l.id === listingId && l.seller === id), l = this.market[i]; if (!p || !l) return;
    if (!addItem(p.inv, l.itemId, l.count)) return this.msg(id, "กระเป๋าเต็ม — เคลียร์ช่องก่อน");
    this.market.splice(i, 1); p.dirty = true; this.marketDirty = true; this.msg(id, `ยกเลิกการขาย ${itemName(l.itemId)}`); this.marketPush();
  }
  /** On join: gold from sales made while away, and listings re-bound to the new session id. */
  private marketRejoin(p: SimPlayer) {
    const g = this.proceeds.get(p.uid!); if (g) { p.gold += g; this.proceeds.delete(p.uid!); this.marketDirty = true; this.msg(p.id, `💰 ระหว่างที่ไม่อยู่ ขายของได้ ${g} Gold`, "loot"); }
    for (const l of this.market) if (l.sellerUid === p.uid) { l.seller = p.id; l.sellerName = p.name; }
  }
  /** The market as saved: listings and the gold waiting for sellers who were away. */
  marketState() { return { market: this.market, proceeds: Object.fromEntries(this.proceeds), nextListing: this.nextListing }; }
  loadMarket(d: { market?: Listing[]; proceeds?: Record<string, number>; nextListing?: number }) {
    // listings from before sellers had a uid cannot be told apart by name: they are dropped (none were ever saved)
    this.market = (d.market ?? []).filter(l => l.sellerUid).map(l => ({ ...l, seller: "" }));   // sessions are gone; rejoin rebinds
    this.proceeds = new Map(Object.entries(d.proceeds ?? {})); this.nextListing = Math.max(this.nextListing, d.nextListing ?? 1);
  }

  // ---------------------------------------------------------------- guilds (the book is shared by every channel)
  guilds = new GuildBook();
  /** Set when the book changed, so the host can save it. */
  guildsDirty = false;
  private guildReqs = new Map<string, { from: string; guild: string }>();   // invitee sim id -> inviter + guild id
  guildView(p: SimPlayer): GuildView | null {
    const g = this.guilds.of(p.uid ?? ""); if (!g) return null;
    const online = new Set([...this.players.values()].map(q => q.uid));
    return { id: g.id, name: g.name, funds: g.funds, capacity: this.guilds.capacity(g), buildings: { ...g.buildings }, skills: { ...g.skills }, me: p.uid!,
      members: Object.entries(g.members).map(([uid, m]) => ({ uid, ...m, online: online.has(uid) })).sort((a, b) => b.contrib - a.contrib),
      apps: g.members[p.uid!]?.rank !== "member" ? Object.entries(g.apps ?? {}).map(([uid, a]) => ({ uid, name: a.name, level: a.level })) : undefined };
  }
  /** After any change: every online member (and anyone just out) gets the new view, fresh bonuses and tag. */
  private guildRefresh(...ps: SimPlayer[]) {
    const g = ps.length ? this.guilds.of(ps[0].uid ?? "") : undefined;
    const who = new Set(ps); if (g) for (const q of this.players.values()) if (g.members[q.uid ?? ""]) who.add(q);
    for (const q of who) { q.guildName = this.guilds.of(q.uid ?? "")?.name ?? ""; this.sync(q); this.emit({ t: "guild", pid: q.id, view: this.guildView(q) }); }
  }
  private guildDone(p: SimPlayer, r: { ok: boolean; error?: string }, ok?: string) {
    if (!r.ok) { this.msg(p.id, r.error!, "dmg"); return false; }
    this.guildsDirty = true; if (ok) this.msg(p.id, ok, "lvl"); return true;
  }
  guildCreate(id: string, name: string) {
    const p = this.players.get(id); if (!p) return;
    if (p.gold < GUILD_COST) return this.msg(id, `ต้องใช้ ${GUILD_COST} Gold เพื่อก่อตั้งกิลด์`, "dmg");
    const r = this.guilds.create(p.uid!, p.name, String(name ?? "").slice(0, 32));
    if (this.guildDone(p, r, `🏰 ก่อตั้งกิลด์ "${(r as any).guild?.name}" แล้ว`)) { p.gold -= GUILD_COST; this.guildRefresh(p); this.emit({ t: "notice", text: `🏰 ${p.name} ก่อตั้งกิลด์ ${(r as any).guild.name}` }); }
  }
  guildInvite(id: string, targetId: string) {
    const p = this.players.get(id), q = this.players.get(targetId), g = p && this.guilds.of(p.uid!); if (!p || !q || !g || p === q) return;
    if (g.members[p.uid!].rank === "member") return this.msg(id, "หัวหน้า/รองหัวหน้าเท่านั้นที่ชวนได้");
    if (this.guilds.of(q.uid!)) return this.msg(id, `${q.name} อยู่ในกิลด์แล้ว`);
    this.guildReqs.set(targetId, { from: id, guild: g.id }); this.msg(id, `ชวน ${q.name} เข้ากิลด์`); this.emit({ t: "guildReq", pid: targetId, from: id, name: p.name, guild: g.name });
  }
  guildAccept(id: string) {
    const req = this.guildReqs.get(id); this.guildReqs.delete(id); const p = this.players.get(id); if (!p || !req) return;
    const r = this.guilds.join(req.guild, p.uid!, p.name);
    if (this.guildDone(p, r, `เข้าร่วมกิลด์ ${(r as any).guild?.name} แล้ว`)) this.guildRefresh(p);
  }
  guildLeave(id: string) {
    const p = this.players.get(id); if (!p) return; const g = this.guilds.of(p.uid!);
    const mates = g ? [...this.players.values()].filter(q => q !== p && g.members[q.uid ?? ""]) : [];
    if (this.guildDone(p, this.guilds.leave(p.uid!), "ออกจากกิลด์แล้ว")) { this.guildRefresh(p); if (mates.length) this.guildRefresh(mates[0]); }
  }
  guildKick(id: string, uid: string) {
    const p = this.players.get(id); if (!p) return; const out = [...this.players.values()].find(q => q.uid === uid);
    if (this.guildDone(p, this.guilds.kick(p.uid!, uid), "เชิญออกจากกิลด์แล้ว")) { this.guildRefresh(p); if (out) { this.guildRefresh(out); this.msg(out.id, "คุณถูกเชิญออกจากกิลด์", "dmg"); } }
  }
  guildPromote(id: string, uid: string, rank: string) {
    const p = this.players.get(id); if (!p || (rank !== "officer" && rank !== "member")) return;
    if (this.guildDone(p, this.guilds.promote(p.uid!, uid, rank), rank === "officer" ? "แต่งตั้งรองหัวหน้าแล้ว" : "ปลดตำแหน่งแล้ว")) this.guildRefresh(p);
  }
  guildDonate(id: string, gold: number) {
    const p = this.players.get(id); if (!p || !Number.isInteger(gold) || gold < 1) return;
    if (gold > p.gold) return this.msg(id, "Gold ไม่พอ", "dmg");
    if (this.guildDone(p, this.guilds.donate(p.uid!, gold), `บริจาค ${gold} Gold เข้าคลังกิลด์ (+${Math.floor(gold * POINTS_PER_GOLD)} แต้มกิลด์)`)) { p.gold -= gold; this.guildRefresh(p); }
  }
  guildUpgrade(id: string, b: string) {
    const p = this.players.get(id); if (!p || !(b in BUILDINGS)) return;
    if (this.guildDone(p, this.guilds.upgrade(p.uid!, b as BuildingId), `อัป${BUILDINGS[b as BuildingId].name}แล้ว`)) this.guildRefresh(p);
  }
  guildLearn(id: string, s: string) {
    const p = this.players.get(id); if (!p || !(s in GUILD_SKILLS)) return;
    if (this.guildDone(p, this.guilds.learn(p.uid!, s as GuildSkillId), `อัปสกิลกิลด์ ${GUILD_SKILLS[s as GuildSkillId].name}`)) this.guildRefresh(p);
  }
  guildBuy(id: string, item: string) {
    const p = this.players.get(id); if (!p) return; const r = this.guilds.buy(p.uid!, item);
    if (r.ok === false) return this.msg(id, r.error, "dmg");
    if (!addItem(p.inv, item, 1)) { this.guilds.refund(p.uid!, item); return this.msg(id, "กระเป๋าเต็ม", "dmg"); }
    this.guildsDirty = true; p.dirty = true; this.msg(id, `แลก ${itemName(item)} ด้วยแต้มกิลด์`, "loot"); this.guildRefresh(p);
  }
  /** The guild grounds: a map of its own, reached only through the guild stewards. */
  /** The guild grounds have no road in: a town's guild keeper takes members there, and back to that town. */
  // ---- the guild finder
  guildList(id: string, q = "") { const p = this.players.get(id); if (p) this.emit({ t: "guildList", pid: id, list: this.guilds.list(p.uid ?? "", String(q ?? "").slice(0, 32)) }); }
  guildApply(id: string, guildId: string) {
    const p = this.players.get(id); if (!p) return; const r = this.guilds.apply(String(guildId ?? ""), p.uid!, p.name, p.level);
    if (this.guildDone(p, r, `ส่งใบสมัครเข้ากิลด์ ${(r as any).guild?.name} แล้ว — รอหัวหน้าอนุมัติ`)) {
      this.guildList(id); const g = (r as any).guild as { members: Record<string, { rank: string }> };
      for (const q of this.players.values()) if (g.members[q.uid ?? ""] && g.members[q.uid!].rank !== "member") { this.msg(q.id, `📨 ${p.name} (Lv ${p.level}) สมัครเข้ากิลด์ — เปิดหน้ากิลด์เพื่ออนุมัติ`, "lvl"); this.emit({ t: "guild", pid: q.id, view: this.guildView(q) }); }
    }
  }
  guildApprove(id: string, uid: string) {
    const p = this.players.get(id); if (!p) return; const who = [...this.players.values()].find(q => q.uid === uid);
    if (this.guildDone(p, this.guilds.approve(p.uid!, String(uid)), "รับสมาชิกใหม่แล้ว")) { this.guildRefresh(p); if (who) { this.msg(who.id, `🏰 ได้รับการอนุมัติเข้ากิลด์ ${this.guilds.of(uid)?.name} แล้ว`, "lvl"); this.guildRefresh(who); } }
  }
  guildReject(id: string, uid: string) { const p = this.players.get(id); if (p && this.guildDone(p, this.guilds.reject(p.uid!, String(uid)), "ปฏิเสธใบสมัครแล้ว")) this.guildRefresh(p); }

  // ---------------------------------------------------------------- friends (one book for the server, like the guilds)
  friends = new FriendBook();
  friendsDirty = false;
  /** Set by the server: which channel a uid is playing in (any channel), undefined when offline. */
  onlineWhere?: (uid: string) => number | undefined;
  friendView(p: SimPlayer): FriendView {
    const e = this.friends.entry(p.uid!, p.name), here = new Set([...this.players.values()].map(q => q.uid));
    const friends = Object.entries(e.friends).map(([uid, name]) => { const ch = this.onlineWhere?.(uid); return { uid, name, online: ch !== undefined || here.has(uid), channel: ch }; })
      .sort((a, b) => +b.online - +a.online || a.name.localeCompare(b.name));
    return { friends, pending: Object.entries(e.pending).map(([uid, name]) => ({ uid, name })) };
  }
  friendList(id: string) { const p = this.players.get(id); if (p?.uid) this.emit({ t: "friends", pid: id, view: this.friendView(p) }); }
  friendAdd(id: string, targetId: string) {
    const p = this.players.get(id), q = this.players.get(targetId); if (!p?.uid || !q?.uid) return;
    const err = this.friends.request(p.uid, p.name, q.uid, q.name); this.friendsDirty = true;
    if (err) return this.msg(id, err, "dmg");
    if (this.friends.entry(p.uid).friends[q.uid]) { this.msg(id, `🤝 เป็นเพื่อนกับ ${q.name} แล้ว`, "lvl"); this.msg(q.id, `🤝 เป็นเพื่อนกับ ${p.name} แล้ว`, "lvl"); this.friendList(q.id); }
    else { this.msg(id, `ส่งคำขอเป็นเพื่อนถึง ${q.name} แล้ว`); this.emit({ t: "friendReq", pid: q.id, from: p.uid, name: p.name }); }
    this.friendList(id);
  }
  friendAccept(id: string, uid: string) {
    const p = this.players.get(id); if (!p?.uid) return; const err = this.friends.accept(p.uid, p.name, String(uid)); this.friendsDirty = true;
    if (err) this.msg(id, err, "dmg"); else { this.msg(id, "🤝 รับเป็นเพื่อนแล้ว", "lvl"); const q = [...this.players.values()].find(q => q.uid === uid); if (q) { this.msg(q.id, `🤝 ${p.name} รับเป็นเพื่อนแล้ว`, "lvl"); this.friendList(q.id); } }
    this.friendList(id);
  }
  friendDecline(id: string, uid: string) { const p = this.players.get(id); if (!p?.uid) return; this.friends.decline(p.uid, String(uid)); this.friendsDirty = true; this.friendList(id); }
  friendRemove(id: string, uid: string) { const p = this.players.get(id); if (!p?.uid) return; this.friends.remove(p.uid, String(uid)); this.friendsDirty = true; this.msg(id, "ลบเพื่อนแล้ว"); this.friendList(id); }

  // ---------------------------------------------------------------- rankings
  /** Set by the server: every saved character (refreshed every few minutes); offline, only the players here count. */
  rankSource?: () => RankRow[];
  ranking(id: string) {
    const rows = this.rankSource?.() ?? [...this.players.values()].map(p => ({ name: p.name, level: p.level, race: p.race, guild: this.guilds.of(p.uid ?? "")?.name ?? "" }));
    this.emit({ t: "ranking", pid: id, players: rows.slice(0, 50), guilds: this.guilds.list("").slice(0, 20) });
  }

  guildEnter(id: string) {
    const p = this.players.get(id); if (!p?.alive) return;
    const town = cityAt(p), keeper = town && Object.values(NPCS).some(n => n.kind === "guild" && dist(p, { x: n.pos[0], z: n.pos[1] }) < NPC_REACH);
    if (!keeper) return this.msg(id, "ไปลานกิลด์ได้จากผู้ดูแลกิลด์ในเมือง", "dmg");
    if (!this.guilds.of(p.uid!)) return this.msg(id, "ต้องอยู่ในกิลด์ก่อน — ก่อตั้งหรือขอเข้ากิลด์", "dmg");
    p.hallFrom = town!.id; p.x = GUILD_HALL.x; p.z = GUILD_HALL.z + 6; p.mounted = false; p.dirty = true; this.emit({ t: "respawn", id }); this.msg(id, "🏰 เข้าสู่ลานกิลด์", "lvl");
  }
  guildExit(id: string) {
    const p = this.players.get(id); if (!p?.alive || zoneAt(p).terrain !== "hall") return;
    const at = this.townSpawn(p.hallFrom ?? p.home); p.x = at.x; p.z = at.z; p.dirty = true; this.emit({ t: "respawn", id });
  }

  // ---------------------------------------------------------------- guild quests (the board in the guild grounds)
  private atBoard(p: SimPlayer) { return Object.values(NPCS).some(n => n.kind === "quest" && dist(p, { x: n.pos[0], z: n.pos[1] }) < NPC_REACH); }
  /** Take a job off today's board: QUESTS_PER_DAY a day, and no more than that many open at once. */
  questAccept(id: string, qid: string) {
    const p = this.players.get(id); if (!p?.alive) return;
    if (!this.atBoard(p)) return this.msg(id, "รับเควสได้ที่กระดานเควสในลานกิลด์", "dmg");
    const day = questDay(this.now()), log = p.quests = logFor(p.quests, day);
    if (log.taken >= QUESTS_PER_DAY) return this.msg(id, `วันนี้รับเควสครบ ${QUESTS_PER_DAY} แล้ว — พรุ่งนี้มาใหม่`, "dmg");
    if (log.active.length >= QUESTS_PER_DAY) return this.msg(id, "ถือเควสเต็มแล้ว — ส่งหรือทิ้งก่อน", "dmg");
    const q = boardFor(day, p.level).find(q => q.id === qid); if (!q) return this.msg(id, "เควสนี้ไม่อยู่บนกระดานแล้ว", "dmg");
    if (log.active.some(a => a.id === qid)) return;
    log.active.push({ ...q, have: 0 }); log.taken++; p.dirty = true;
    this.msg(id, `📜 รับเควส: ล่า ${MONSTERS[q.kind].name} ${q.need} ตัว (${log.taken}/${QUESTS_PER_DAY} วันนี้)`, "lvl");
  }
  /** Hand a finished job in at the board for its gold. */
  questTurnIn(id: string, qid: string) {
    const p = this.players.get(id); if (!p?.alive || !p.quests) return;
    if (!this.atBoard(p)) return this.msg(id, "ส่งเควสได้ที่กระดานเควสในลานกิลด์", "dmg");
    const i = p.quests.active.findIndex(a => a.id === qid), q = p.quests.active[i]; if (!q) return;
    if (q.have < q.need) return this.msg(id, `ยังไม่ครบ — ${q.have}/${q.need}`, "dmg");
    p.quests.active.splice(i, 1); p.gold += q.gold; p.dirty = true;
    this.msg(id, `💰 ส่งเควสสำเร็จ +${q.gold} Gold`, "loot");
  }
  /** Drop a job (the day's count is not given back). */
  questAbandon(id: string, qid: string) {
    const p = this.players.get(id); if (!p?.quests) return;
    const n = p.quests.active.length; p.quests.active = p.quests.active.filter(a => a.id !== qid); if (p.quests.active.length !== n) p.dirty = true;
  }
  private questCount(p: SimPlayer, kind: string) {
    for (const q of p.quests?.active ?? []) if (q.kind === kind && q.have < q.need) {
      q.have++; p.dirty = true;
      if (q.have === q.need) this.msg(p.id, `✅ เควสล่า ${MONSTERS[kind].name} ครบแล้ว — กลับไปส่งที่กระดานเควสในลานกิลด์`, "lvl");
    }
  }

  // ---------------------------------------------------------------- death: go home, or be revived where you fell
  /** Dead, go back now — to `town` if it is one they have reached, else their home town (as when the wait runs out). */
  respawnTown(id: string, town?: string) {
    const p = this.players.get(id); if (!p || p.alive) return;
    if (town && p.towns?.includes(town)) p.home = town;
    p.deadT = 0;
  }
  /** Where a town takes the fallen back: Pawhaven's spawn, or in front of another town's landmark, clear of walls. */
  private townSpawn(town?: string) {
    const c = CITIES.find(c => c.id === town);
    if (!c || c.id === "pawhaven") return { x: SPAWN.x, z: SPAWN.z };
    const at = { x: c.x, z: c.z - 4.5 }; collide(at, 0.4, this.L); return at;
  }
  /** Walking into a town records it: the death screen offers it, and it becomes the default place to come back. */
  private visitTowns(p: SimPlayer) {
    const c = cityAt(p); if (!c || p.home === c.id) return;
    p.towns ??= ["pawhaven"]; p.home = c.id; p.dirty = true;
    if (!p.towns.includes(c.id)) { p.towns.push(c.id); this.msg(p.id, `📍 บันทึกจุดเกิดใหม่: ${c.name} — ตายแล้วเลือกกลับมาเกิดที่นี่ได้`, "lvl"); }
  }
  /** Dead, read a revive scroll: back on your feet where you fell. */
  reviveSelf(id: string) {
    const p = this.players.get(id); if (!p || p.alive) return;
    if (!removeItem(p.inv, "REVIVE_SCROLL", 1)) return this.msg(id, "ไม่มีใบชุบชีวิต — ซื้อได้ที่ร้านเสบียง");
    this.revive(p, 0.5, "ใช้ใบชุบชีวิต");
  }
  private revive(p: SimPlayer, hp: number, why: string) {
    p.alive = true; p.deadT = 0; p.hp = Math.max(1, Math.round(p.maxHP * hp)); p.mp = Math.max(p.mp, Math.round(p.maxMP * hp));
    p.exp += p.lostExp ?? 0; p.lostExp = 0; p.dirty = true;
    this.emit({ t: "respawn", id: p.id }); this.emit({ t: "heal", id: p.id, n: p.hp }); this.msg(p.id, `✨ ${why} — ฟื้นแล้ว (คืน EXP ที่เสีย)`, "heal");
  }

  // ---------------------------------------------------------------- party (up to PARTY_MAX, same map)
  parties = new Map<string, string[]>();      // party id -> member ids, leader first
  private partyReqs = new Map<string, string>();   // invitee -> inviter
  private ruleOf(p: SimPlayer): PartyRule { return (p.party && p.partyRule) || PARTY_RULE; }
  /** Put the party's rules on every member (after a change, a join, or a new leader). */
  private spreadRule(pid: string, rule: PartyRule) { for (const m of this.parties.get(pid) ?? []) { const q = this.players.get(m); if (q) { q.partyRule = { ...rule }; q.dirty = true; } } }
  /** The leader sets how EXP and loot are shared. */
  partyRules(id: string, exp: string, loot: string) {
    const p = this.players.get(id); if (!p?.party) return;
    if (this.parties.get(p.party)?.[0] !== id) return this.msg(id, "หัวหน้าปาร์ตี้เท่านั้นที่ตั้งค่าได้");
    if (exp !== "share" && exp !== "each" || loot !== "party" && loot !== "own" && loot !== "random") return;
    this.spreadRule(p.party, { exp, loot });
    const text = `ตั้งค่าปาร์ตี้: EXP ${exp === "share" ? "แบ่งเท่ากัน" : "ใครฆ่าได้คนนั้น"} · ของ ${loot === "party" ? "ของส่วนกลาง" : loot === "own" ? "ของคนฆ่า" : "สุ่มเจ้าของ"}`;
    for (const m of this.parties.get(p.party)!) this.msg(m, text, "lvl");
  }
  partyInvite(id: string, targetId: string) {
    const p = this.players.get(id), q = this.players.get(targetId); if (!p || !q || p === q) return;
    if (q.party && q.party === p.party) return this.msg(id, `${q.name} อยู่ในปาร์ตี้แล้ว`);
    if (q.party) return this.msg(id, `${q.name} อยู่ในปาร์ตี้อื่น`);
    if ((this.parties.get(p.party)?.length ?? 1) >= PARTY_MAX) return this.msg(id, `ปาร์ตี้เต็มแล้ว (${PARTY_MAX} คน)`);
    this.partyReqs.set(targetId, id); this.msg(id, `ชวน ${q.name} เข้าปาร์ตี้`); this.emit({ t: "partyReq", pid: targetId, from: id, name: p.name });
  }
  partyAccept(id: string) {
    const from = this.partyReqs.get(id); this.partyReqs.delete(id);
    const p = this.players.get(id), q = from ? this.players.get(from) : undefined; if (!p || !q) return this.msg(id, "คำชวนหมดอายุ");
    if (p.party) this.partyLeave(id);
    if (!q.party) { q.party = q.id; this.parties.set(q.id, [q.id]); q.partyRule = { ...PARTY_RULE }; q.dirty = true; }
    const members = this.parties.get(q.party)!; if (members.length >= PARTY_MAX) return this.msg(id, "ปาร์ตี้เต็มแล้ว");
    members.push(id); p.party = q.party; p.partyRule = { ...(q.partyRule ?? PARTY_RULE) }; p.dirty = true;
    for (const m of members) this.msg(m, `${p.name} เข้าร่วมปาร์ตี้ (${members.length}/${PARTY_MAX})`, "lvl");
  }
  /** The leader removes a member. */
  partyKick(id: string, targetId: string) {
    const p = this.players.get(id), q = this.players.get(targetId); if (!p?.party || !q || q.party !== p.party || id === targetId) return;
    if (this.parties.get(p.party)?.[0] !== id) return this.msg(id, "หัวหน้าปาร์ตี้เท่านั้นที่เชิญออกได้");
    this.partyLeave(targetId); this.msg(targetId, `${p.name} เชิญคุณออกจากปาร์ตี้`, "dmg");
  }
  partyLeave(id: string) {
    const p = this.players.get(id); if (!p?.party) return;
    const members = this.parties.get(p.party) ?? []; const rest = members.filter(m => m !== id);
    const rule = p.partyRule ?? PARTY_RULE; this.parties.delete(p.party); p.party = ""; p.partyRule = undefined; p.dirty = true; this.msg(id, "ออกจากปาร์ตี้แล้ว");
    if (rest.length <= 1) { for (const m of rest) { const q = this.players.get(m); if (q) { q.party = ""; q.dirty = true; this.msg(m, "ปาร์ตี้ถูกยุบ"); } } return; }
    const pid = rest[0]; this.parties.set(pid, rest); this.spreadRule(pid, rule);   // the next member leads; the id follows the leader; the rules stay
    for (const m of rest) { const q = this.players.get(m)!; q.party = pid; q.dirty = true; this.msg(m, `${p.name} ออกจากปาร์ตี้`); }
  }
  private tradeView(t: Trade, id: string): TradeView {
    const me = t.side[id], other = t.side[t.a === id ? t.b : t.a], op = this.players.get(t.a === id ? t.b : t.a)!;
    const rows = (p: SimPlayer, s: TradeSide) => Object.entries(s.items).map(([inst, count]) => ({ inst, itemId: p.inv.items.find(i => i.id === inst)?.itemId ?? "?", count }));
    return { withId: op.id, withName: op.name, mine: { items: rows(this.players.get(id)!, me), gold: me.gold, ok: me.ok }, theirs: { items: rows(op, other), gold: other.gold, ok: other.ok }, theirValue: offerValue(op, other) };
  }
  private tradePush(t: Trade) { for (const id of [t.a, t.b]) this.emit({ t: "trade", pid: id, view: this.tradeView(t, id) }); }
  tradeReq(id: string, targetId: string) {
    const p = this.players.get(id), q = this.players.get(targetId); if (!p || !q || p === q) return;
    if (!p.alive || !q.alive) return this.msg(id, "แลกของไม่ได้ตอนนี้");
    if (dist(p, q) > TRADE_RANGE) return this.msg(id, "อยู่ไกลเกินไป (ต้องอยู่ห่างไม่เกิน 3 m)");
    if (!countOf(p.inv, SEAL)) return this.msg(id, "ต้องมี Merchant Seal (ซื้อที่ร้านเครื่องมือ 50 Gold)");
    if (!countOf(q.inv, SEAL)) return this.msg(id, `${q.name} ยังไม่มี Merchant Seal`);
    if (this.trades.has(id) || this.trades.has(targetId)) return this.msg(id, "มีการแลกของค้างอยู่");
    this.reqs.set(targetId, id); this.msg(id, `ส่งคำขอแลกของถึง ${q.name}`); this.emit({ t: "tradeReq", pid: targetId, from: id, name: p.name });
  }
  tradeAccept(id: string) {
    const from = this.reqs.get(id); this.reqs.delete(id); const p = this.players.get(id), q = from ? this.players.get(from) : undefined;
    if (!p || !q || this.trades.has(id) || this.trades.has(q.id) || dist(p, q) > TRADE_RANGE) return this.msg(id, "คำขอหมดอายุ");
    const t: Trade = { a: q.id, b: id, side: { [q.id]: { items: {}, gold: 0, ok: false }, [id]: { items: {}, gold: 0, ok: false } } };
    this.trades.set(id, t); this.trades.set(q.id, t); this.tradePush(t);
  }
  tradeOffer(id: string, items: Record<string, number>, gold: number) {
    const t = this.trades.get(id), p = this.players.get(id); if (!t || !p) return;
    const clean: Record<string, number> = {};
    for (const [inst, n] of Object.entries(items ?? {})) { const s = p.inv.items.find(i => i.id === inst); if (!s || ITEMS[s.itemId]?.bound || !Number.isInteger(n) || n < 1) continue; clean[inst] = Math.min(n, s.count); }
    gold = Math.max(0, Math.min(Math.floor(Number(gold) || 0), p.gold));
    t.side[id] = { items: clean, gold, ok: false }; t.side[t.a === id ? t.b : t.a].ok = false;   // any change un-confirms both
    this.tradePush(t);
  }
  tradeConfirm(id: string) {
    const t = this.trades.get(id); if (!t) return; t.side[id].ok = true;
    if (!(t.side[t.a].ok && t.side[t.b].ok)) return this.tradePush(t);
    const A = this.players.get(t.a)!, B = this.players.get(t.b)!;
    const unfair = tradeFairness(A, t.side[t.a], B, t.side[t.b]);
    if (unfair) { t.side[t.a].ok = t.side[t.b].ok = false; for (const pid of [t.a, t.b]) this.msg(pid, `แลกไม่ได้: ${unfair}`); return this.tradePush(t); }
    const done = swap(A, t.side[t.a], B, t.side[t.b]);
    this.trades.delete(t.a); this.trades.delete(t.b);
    for (const id of [t.a, t.b]) { this.emit({ t: "trade", pid: id, view: null }); this.msg(id, done ? "แลกของสำเร็จ" : "แลกของล้มเหลว — กระเป๋าเต็มหรือของไม่ครบ", done ? "loot" : undefined); }
    A.dirty = B.dirty = true;
  }
  tradeCancel(id: string, why = "ยกเลิกการแลกของ") {
    for (const [to, from] of this.reqs) if (to === id || from === id) this.reqs.delete(to);
    const t = this.trades.get(id); if (!t) return;
    this.trades.delete(t.a); this.trades.delete(t.b);
    for (const pid of [t.a, t.b]) if (this.players.has(pid)) { this.emit({ t: "trade", pid, view: null }); this.msg(pid, why); }
  }

  // ---------------------------------------------------------------- tick
  tick(dt: number) {
    for (let i = this.ground.length - 1; i >= 0; i--) { const g = this.ground[i]; g.t -= dt; if (g.t <= 0) this.ground.splice(i, 1); }
    for (let i = this.pending.length - 1; i >= 0; i--) {          // skill effects land on their animation's contact frame
      const e = this.pending[i]; e.t -= dt; if (e.t > 0) continue;
      this.pending.splice(i, 1); e.fn();
    }
    for (const t of new Set(this.trades.values())) { const A = this.players.get(t.a), B = this.players.get(t.b); if (!A || !B || !A.alive || !B.alive || dist(A, B) > TRADE_RANGE + 2) this.tradeCancel(t.a, "การแลกของถูกยกเลิก (ห่างกันเกินไป)"); }
    this.hours = this.clock();
    for (const p of this.players.values()) {
      if (p.alive) {
        stepPlayer(p, dt, this.L); this.visitTowns(p); this.fairyStep(p, dt);
        if (p.buff && (p.buff.t -= dt) <= 0) { p.buff = undefined; this.sync(p); this.msg(p.id, "บัพหมดเวลา"); }
        this.hungerStep(p, dt); this.fishStep(p, dt);
        if (p.meal && (p.meal.t -= dt) <= 0) { p.meal = undefined; this.sync(p); this.msg(p.id, "บัพอาหารหมดแล้ว"); }
        const fed = hungerState(p.hunger) !== "starving";   // starving: nothing comes back, not even resting
        if (fed && p.hp < p.maxHP) p.hp = Math.min(p.maxHP, p.hp + dt * (p.HPR + (p.sitting ? 24 : inTown(p) ? 12 : 0)));   // VIT regen always, resting on top
        if (fed && p.mp < p.maxMP) p.mp = Math.min(p.maxMP, p.mp + dt * p.MPR * (inTown(p) || p.sitting ? FORMULAS.MP_Regen_RestMult : 1));
      } else { p.moving = false; p.deadT -= dt; if (p.deadT <= 0) { const at = this.townSpawn(p.home); p.alive = true; p.hp = p.maxHP; p.mp = p.maxMP; p.x = at.x; p.z = at.z; p.dirty = true; this.emit({ t: "respawn", id: p.id }); } }
    }
    // Monsters with no player within WAKE_R sleep where they stand: no AI, no movement, so nothing to compute and no
    // state change to send. The world has hundreds of them; only the ones near someone need to be alive. (Dead ones
    // still count down to their respawn; night creatures still keep the clock, fleeing at dawn.)
    const ps = [...this.players.values()];
    for (const m of this.monsters) {
      if (m.alive && !m.targetId && !m.cast && !MONSTERS[m.kind].night && !ps.some(p => Math.abs(p.x - m.x) < WAKE_R && Math.abs(p.z - m.z) < WAKE_R)) { m.moving = false; continue; }
      this.tickMonster(m, dt);
    }
  }
  private tickMonster(m: SimMonster, dt: number) {
    const D = MONSTERS[m.kind]; m.moving = false; if (m.slowT) m.slowT = Math.max(0, m.slowT - dt);
    if (D.night && !isNight(this.hours)) {
      // dawn: night creatures flee (no loot, no EXP) and stay gone all day; at dusk they return a few seconds apart
      if (m.alive) { m.alive = false; m.hp = 0; m.targetId = null; this.emit({ t: "anim", id: m.id, clip: "Death" }); }
      m.dead = 1 + this.rng() * 5; return;
    }
    if (!m.alive) { m.dead -= dt; if (m.dead <= 0) { if (m.roam) m.home = randomSpot(this.L, ZONES.find(z => z.id === m.roam)!, this.rng); m.alive = true; m.hp = m.maxHP; m.x = m.home.x; m.z = m.home.z; m.mode = "wander"; this.emit({ t: "respawn", id: m.id }); if (D.boss) this.emit({ t: "notice", text: `${D.night ? "🌙 " : ""}${D.name} ปรากฏตัวที่ ${m.roam ? ZONES.find(z => z.id === m.roam)?.name : "Dark Forest"}!` }); } return; }
    const dH = dist(m, m.home);
    // keep the current target while valid, else the nearest player in aggro range (never inside town)
    let T = m.targetId ? this.players.get(m.targetId) : undefined;
    if (!T || !T.alive || inTown(T) || m.mode === "leash") T = undefined;
    if (!T && m.mode !== "leash") { let best = D.aggro; for (const p of this.players.values()) if (p.alive && !inTown(p)) { const d = dist(m, p); if (d < best) { best = d; T = p; } } }
    m.targetId = T?.id ?? null;
    if (T && dH > D.leash) { m.mode = "leash"; m.targetId = null; T = undefined; }
    if (m.mode === "leash") { if (dH < 0.5) { m.mode = "wander"; if (!D.boss) m.hp = m.maxHP; } else this.stepTo(m, m.home, MONSTER_RETURN_SPEED, dt); }   // a boss keeps its wounds
    else if (m.cast) {
      // winding up a telegraphed attack: rooted in place until it lands
      m.cast.t -= dt;
      if (m.cast.t <= 0) {
        const c = m.cast; m.cast = null; this.emit({ t: "slam", id: m.id, name: c.skill.name, x: c.x, z: c.z, radius: c.skill.radius });
        for (const p of this.players.values()) if (p.alive && dist(p, c) <= c.skill.radius) {
          const n = Math.max(1, Math.floor((m.ATK * c.skill.coef - p.DEF) * (0.95 + this.rng() * 0.1)));   // no dodge roll: stepping out was the dodge
          this.emit({ t: "dmg", id: p.id, n, crit: false, miss: false, by: m.id }); this.hurt(p, n, `โดน ${c.skill.name} ${n}`);
        }
      }
    }
    else if (T) {
      const dP = dist(m, T); m.yaw = Math.atan2(T.x - m.x, T.z - m.z); const b = D.bite;
      for (const k of Object.keys(m.skillCd ?? {})) m.skillCd![k] -= dt;
      const sk = m.bite <= 0 ? D.skills?.find(s => (m.skillCd?.[s.id] ?? 0) <= 0 && dP <= s.range) : undefined;
      if (sk) {
        const at = sk.at === "self" ? { x: m.x, z: m.z } : { x: T.x, z: T.z };
        (m.skillCd ??= {})[sk.id] = sk.cooldown; m.cast = { skill: sk, t: sk.windup, ...at };
        this.emit({ t: "telegraph", id: m.id, name: sk.name, x: at.x, z: at.z, radius: sk.radius, windup: sk.windup }); this.emit({ t: "anim", id: m.id, clip: "Attack" });
        return;
      }
      if (m.bite > 0) { m.bite -= dt; if (!m.bit && m.bite < b.recovery + b.active && m.bite > b.recovery) { m.bit = true; if (dP < b.reach + 0.3 && T.alive) this.bite(m, T); } }
      else if (dP < b.reach) { m.bite = b.windup + b.active + b.recovery; m.bit = false; this.emit({ t: "anim", id: m.id, clip: "Attack" }); }
      else this.stepTo(m, T, MONSTER_CHASE_SPEED, dt);
    } else {
      m.timer -= dt;
      if (m.timer <= 0) { m.timer = 2 + this.rng() * 3; m.wanderTo = this.rng() < 0.5 ? null : { x: m.home.x + (this.rng() - 0.5) * 6, z: m.home.z + (this.rng() - 0.5) * 6 }; }
      if (m.wanderTo && dist(m, m.wanderTo) > 0.3) this.stepTo(m, m.wanderTo, MONSTER_WANDER_SPEED, dt);
    }
  }
  private stepTo(m: SimMonster, to: { x: number; z: number }, speed: number, dt: number) {
    const dx = to.x - m.x, dz = to.z - m.z, l = Math.hypot(dx, dz); if (l < 0.05) return;
    if ((m.slowT ?? 0) > 0) speed *= SLOW_MULT;   // chilled by an ice skill
    m.yaw = Math.atan2(dx, dz); const s = Math.min(l, speed * dt) / l; m.x += dx * s; m.z += dz * s; collide(m, 0.3 * MONSTERS[m.kind].scale, this.L); m.moving = true;
  }
  /** Take and clear the events produced since the last call. */
  drain() { const e = this.events; this.events = []; return e; }
}

/** The kind of weapon in hand; undefined bare-handed (it used to default to "sword", so empty hands could use sword skills). */
export const weaponOf = (equip: Record<string, string>) => ITEMS[equip.MainWeapon]?.weapon as "sword" | "bow" | "staff" | undefined;
export const WEAPON_TH: Record<string, string> = { bow: "ธนู", staff: "คทา", sword: "ดาบ" };
/** Whether the weapon in hand lets a skill be used (a skill without `requires` works with any). */
export const skillFits = (id: string, equip: Record<string, string>) => { const r = SKILLS[id]?.requires; return !r || weaponOf(equip) === r; };
/** "ใช้กับดาบ" / "ใช้ได้ทุกอาวุธ" — what a skill needs in hand, for its descriptions. */
export const skillWeaponText = (id: string) => { const r = SKILLS[id]?.requires; return r ? `ใช้กับ${WEAPON_TH[r]}` : "ใช้ได้ทุกอาวุธ"; };
/** What the plain attack button does with this weapon in hand. */
/** The basic attack for what is in hand: a sword swings, a bow shoots, a staff throws blue fire (MP 2). Bare hands, a bow
 *  with an empty quiver (`inv` given) or a staff short of MP (`mp` given) fall back to a plain bonk — the same way out of
 *  arrows and out of mana, so auto never stands frozen. */
export const attackSkill = (equip: Record<string, string>, inv?: Inventory, mp?: number) => {
  const w = weaponOf(equip);
  if (w === "bow") return inv && !countOf(inv, "ARROW") ? "SKILL_PUNCH" : "SKILL_SHOOT";
  if (w === "staff") return mp !== undefined && mp < (SKILLS.SKILL_BOLT.mana ?? 0) ? "SKILL_PUNCH" : "SKILL_BOLT";
  return w === "sword" ? "SKILL_BASIC" : "SKILL_PUNCH";
};
export function inCone(a: { x: number; z: number; yaw: number }, b: { x: number; z: number }, range: number, deg: number) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); if (l > range || l === 0) return false;
  if (deg >= 360) return true;
  const cos = (Math.sin(a.yaw) * dx + Math.cos(a.yaw) * dz) / l;
  return Math.acos(Math.max(-1, Math.min(1, cos))) < (deg / 2) * Math.PI / 180;
}

// ---------------------------------------------------------------- persistence (W3)
export const SEAL = "MERCHANT_SEAL";
export interface Saved { hunger?: number; pantry?: Record<string, number>; mail?: Mail[]; mailGot?: string[]; deleteAt?: number; quests?: QuestLog; towns?: string[]; home?: string; uid?: string; name: string; race?: Race; skills?: string[]; level: number; exp: number; points: number; STR: number; AGI: number; VIT: number; INT: number; DEX: number; LUK: number; hp: number; mp?: number; recipes?: string[]; gold: number; inv: Inventory; eq: Equipment; furColor: number; x: number; z: number }
/** Learn a skill for good (one only lent by the trial becomes the player's own). */
function own(p: SimPlayer, skill: string) { if (p.trialSkills?.includes(skill)) p.trialSkills = p.trialSkills.filter(k => k !== skill); else if (!p.skills.includes(skill)) p.skills.push(skill); }
export function save(p: SimPlayer): Saved {
  const { name, race, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, hp, mp, recipes, gold, inv, eq, furColor, x, z, uid, towns, home, quests, mail, mailGot, hunger, pantry } = p;
  const skills = p.skills.filter(k => !p.trialSkills?.includes(k));   // lent trial skills are not the player's
  return JSON.parse(JSON.stringify({ name, race, skills, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, hp, mp, recipes, gold, inv, eq, furColor, x, z, uid, towns, home, quests, mail, mailGot, hunger, pantry }));
}
