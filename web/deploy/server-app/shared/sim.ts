// Pure gameplay simulation (no DOM, no three). The Colyseus room runs it as the authority; the offline client runs
// the very same code in the browser. Everything visible (animations, floating numbers, loot) comes out as events.
import { ITEMS, MAX_LEVEL, MONSTERS, NPCS, RECIPES, SKILLS, START_GOLD, STAT_POINTS_PER_LEVEL, SkillDef, expToNext, itemName } from "./data";
import { Derived, Primary, damage, derive } from "./formulas";
import { Inventory, addItem, countOf, createInventory, removeItem } from "./inventory";
import { Equipment, equip, equippedIds, unequip } from "./equipment";
import { craft as craftItem } from "./crafting";
import { buy as shopBuy, sell as shopSell } from "./shop";
import { allocate as allocPoints } from "./progression";
import { rollDrops } from "./loot";
import { BOSS_SPAWN, Layout, SPAWN, SPAWNS, buildLayout, collide, inTown } from "./world";

export type ActKind = string;   // skill id
export type Race = "dog" | "cat" | "mouse";
export const RACES: Race[] = ["dog", "cat", "mouse"];
export const STARTER_SKILLS = ["SKILL_BASIC", "SKILL_SLASH", "SKILL_DASH"];
export interface Creation { name: string; color: number; race?: string }
export interface Body { id: string; x: number; z: number; yaw: number; hp: number; alive: boolean; moving: boolean }
export interface SimPlayer extends Body, Primary, Derived {
  name: string; race: Race; skills: string[]; mounted: boolean; exp: number; points: number; gold: number; inv: Inventory; eq: Equipment; equip: Record<string, string>;
  cd: Record<ActKind, number>; itemCd: number; dash: number; busy: number; deadT: number; sitting: boolean; furColor: number;
  in: { mx: number; mz: number }; dirty: boolean;
}
export interface SimMonster extends Body, Primary, Derived {
  kind: string; home: { x: number; z: number }; targetId: string | null; mode: "wander" | "leash"; timer: number;
  wanderTo: { x: number; z: number } | null; bite: number; bit: boolean; dead: number;
}
export type SimEvent =
  | { t: "anim"; id: string; clip: string }
  | { t: "cast"; id: string; skill: string }                       // skill started: play its clip + windup fx
  | { t: "dmg"; id: string; n: number; crit: boolean; miss: boolean; by: string }
  | { t: "heal"; id: string; n: number }
  | { t: "respawn"; id: string }
  | { t: "notice"; text: string }                                 // everyone (boss spawn / kill)
  | { t: "msg"; pid: string; text: string; cls?: string }        // owner only
  | { t: "loot"; pid: string; text: string }
  | { t: "lvl"; pid: string; level: number }
  | { t: "kill"; pid: string; mid: string }
  | { t: "craft"; pid: string; item: string }
  | { t: "dead"; pid: string; secs: number }
  | { t: "tradeReq"; pid: string; from: string; name: string }
  | { t: "trade"; pid: string; view: TradeView | null };

export interface TradeSide { items: Record<string, number>; gold: number; ok: boolean }   // items: instance id -> count
export interface Trade { a: string; b: string; side: Record<string, TradeSide> }
export interface TradeView { withId: string; withName: string; mine: { items: { inst: string; itemId: string; count: number }[]; gold: number; ok: boolean }; theirs: { items: { inst: string; itemId: string; count: number }[]; gold: number; ok: boolean } }
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

export const WALK = 4.2, MOUNT_SPEED = 1.8, PLAYER_R = 0.35, DAY_SECONDS = 720;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Move a body by (mx,mz) input for dt. Shared by the server tick and client prediction so both agree exactly. */
export function stepPlayer(p: SimPlayer, dt: number, L: Layout) {
  let { mx, mz } = p.in; const ml = Math.hypot(mx, mz);
  let moving = ml > 0.15 && p.busy <= 0;
  if (ml > 0.15) { p.sitting = false; p.yaw = Math.atan2(mx, mz); }
  let speed = moving ? WALK * (p.mounted ? MOUNT_SPEED : 1) : 0;
  if (p.dash > 0) { p.dash -= dt; speed = SKILLS.SKILL_DASH.speed!; moving = true; if (ml <= 0.15) { mx = Math.sin(p.yaw); mz = Math.cos(p.yaw); } else { mx /= ml; mz /= ml; } }
  if (moving) { p.x += mx * speed * dt; p.z += mz * speed * dt; collide(p, PLAYER_R, L); }
  p.moving = moving;
  for (const k in p.cd) p.cd[k as ActKind] = Math.max(0, p.cd[k as ActKind] - dt);
  p.itemCd = Math.max(0, p.itemCd - dt); p.busy = Math.max(0, p.busy - dt);
}

export class Sim {
  players = new Map<string, SimPlayer>();
  monsters: SimMonster[] = [];
  events: SimEvent[] = [];
  hours = 9;
  constructor(public L: Layout = buildLayout(), private rng: () => number = Math.random) {
    let id = 0;
    for (const sp of SPAWNS) for (let k = 0; k < sp.n; k++) {
      const spread = sp.spread ?? 2, a = (k / sp.n) * Math.PI * 2;
      this.monsters.push(this.spawnMonster(`m${id++}`, sp.kind, sp.x + Math.cos(a) * spread, sp.z + Math.sin(a) * spread * 0.7));
    }
    this.monsters.push(this.spawnMonster("boss", "MON_ALPHA_WOLF", BOSS_SPAWN.x, BOSS_SPAWN.z));
  }
  private spawnMonster(id: string, kind: string, x: number, z: number): SimMonster {
    const d = MONSTERS[kind];
    const m = derive({ id, kind, x, z, yaw: 0, hp: 0, alive: true, moving: false, level: d.level, STR: d.STR, AGI: d.AGI, VIT: d.VIT, INT: d.INT, DEX: d.DEX, LUK: d.LUK,
      home: { x, z }, targetId: null, mode: "wander", timer: 0, wanderTo: null, bite: 0, bit: false, dead: 0, equip: {} } as any) as SimMonster;
    m.hp = m.maxHP; return m;
  }
  private emit(e: SimEvent) { this.events.push(e); }
  private msg(pid: string, text: string, cls?: string) { this.emit({ t: "msg", pid, text, cls }); }

  // ---------------------------------------------------------------- players
  join(id: string, c: Creation, saved?: Saved) {
    const race: Race = RACES.includes(c.race as Race) ? c.race as Race : "dog";
    const p: SimPlayer = derive({ id, name: c.name.slice(0, 16) || "Dog Knight", race, skills: [...STARTER_SKILLS], mounted: false, x: SPAWN.x, z: SPAWN.z, yaw: 0, hp: 0, alive: true, moving: false,
      level: 1, exp: 0, STR: 5, AGI: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5, points: 5, gold: START_GOLD, inv: createInventory(30), eq: {}, equip: {},
      cd: {}, itemCd: 0, dash: 0, busy: 0, deadT: 0, sitting: false, furColor: c.color, in: { mx: 0, mz: 0 }, dirty: true } as any) as SimPlayer;
    if (saved) { Object.assign(p, JSON.parse(JSON.stringify(saved))); p.skills = [...new Set([...STARTER_SKILLS, ...(p.skills ?? [])])]; this.sync(p); p.hp = Math.min(p.maxHP, Math.max(1, saved.hp)); if (!inTown(p)) { p.x = SPAWN.x; p.z = SPAWN.z; } }
    else {
      for (const it of ["WOODEN_SWORD", "STARTER_CHEST", "STARTER_BOOTS"]) { addItem(p.inv, it, 1); equip(p.inv, p.eq, p.inv.items[p.inv.items.length - 1].id); }
      addItem(p.inv, "HP_POTION", 3); this.sync(p); p.hp = p.maxHP;
    }
    this.players.set(id, p);
    this.msg(id, saved ? `ยินดีต้อนรับกลับ ${p.name} (Lv ${p.level})` : `สวัสดี ${p.name}! คุณได้ ${p.points} แต้มสถานะ — เปิด Status แล้วกด +`, "lvl");
    return p;
  }
  leave(id: string) { this.tradeCancel(id, "อีกฝ่ายออกจากเกม"); this.players.delete(id); for (const m of this.monsters) if (m.targetId === id) m.targetId = null; }
  private sync(p: SimPlayer) { p.equip = equippedIds(p.eq); derive(p); p.dirty = true; }
  input(id: string, mx: number, mz: number) { const p = this.players.get(id); if (!p) return; const l = Math.hypot(mx, mz); if (!Number.isFinite(l)) return; p.in.mx = l > 1 ? mx / l : mx; p.in.mz = l > 1 ? mz / l : mz; }

  /** Start a skill: the clip plays now, the effect lands on its contact frame (`hit`), the character is locked for `cast`. */
  act(id: string, kind: ActKind) {
    const p = this.players.get(id), S = SKILLS[kind]; if (!p || !p.alive || !S || !p.skills.includes(kind)) return;
    if ((p.cd[kind] ?? 0) > 0 || p.busy > 0) return;
    p.cd[kind] = S.cooldown; p.sitting = false; p.mounted = false; p.busy = S.cast; p.dirty = true;
    this.emit({ t: "cast", id, skill: kind });
    if (S.kind === "dash") { p.dash = S.duration!; return; }
    if (S.hit > 0) this.pending.push({ t: S.hit, id, skill: kind }); else this.resolve(p, S, kind);
  }
  private pending: { t: number; id: string; skill: string }[] = [];
  private resolve(p: SimPlayer, S: SkillDef, kind: string) {
    if (!p.alive) return;
    if (S.kind === "heal") { const n = Math.floor(p.maxHP * (S.heal ?? 0)); p.hp = Math.min(p.maxHP, p.hp + n); p.dirty = true; this.emit({ t: "heal", id: p.id, n }); return; }
    const targets = this.monsters.filter(m => m.alive && inCone(p, m, S.range!, S.cone!)).sort((a, b) => dist(a, p) - dist(b, p)).slice(0, S.targets);
    for (const m of targets) this.hit(p, m, S.coef!);
  }
  private hit(p: SimPlayer, m: SimMonster, coef: number) {
    const r = damage(p, m, coef, this.rng);
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
    const got = rollDrops(d.dropTable, this.rng); const lines: string[] = [];
    for (const [it, n] of Object.entries(got.items)) lines.push(addItem(p.inv, it, n) ? `${itemName(it)} +${n}` : `${itemName(it)} +${n} (กระเป๋าเต็ม)`);
    if (got.gold) { p.gold += got.gold; lines.push(`Gold +${got.gold}`); }
    if (lines.length) this.emit({ t: "loot", pid: p.id, text: lines.join("  ·  ") });
    p.dirty = true; this.gainExp(p, d.exp);
  }
  private gainExp(p: SimPlayer, n: number) {
    p.exp += n; p.dirty = true;
    while (p.exp >= expToNext(p.level) && p.level < MAX_LEVEL) { p.exp -= expToNext(p.level); p.level++; p.points += STAT_POINTS_PER_LEVEL; this.sync(p); p.hp = p.maxHP; this.emit({ t: "lvl", pid: p.id, level: p.level }); }
  }
  private bite(m: SimMonster, p: SimPlayer) {
    const r = damage(m, p, 1, this.rng); this.emit({ t: "dmg", id: p.id, n: r.dmg, crit: r.crit, miss: r.miss, by: m.id }); if (r.miss) return;
    p.hp -= r.dmg; p.sitting = false; if (p.mounted) { p.mounted = false; p.dirty = true; } this.msg(p.id, `โดน ${MONSTERS[m.kind].name} กัด ${r.dmg}`, "dmg");
    if (p.hp <= 0) { p.hp = 0; p.alive = false; p.deadT = 3; p.dirty = true; this.emit({ t: "anim", id: p.id, clip: "Death" }); this.emit({ t: "dead", pid: p.id, secs: 3 }); this.msg(p.id, "คุณตาย — กลับเมืองใน 3 วินาที", "lvl"); }
    else this.emit({ t: "anim", id: p.id, clip: "Hit" });
  }

  use(id: string, instId: string) {
    const p = this.players.get(id); if (!p) return; const inst = p.inv.items.find(s => s.id === instId); if (!inst) return this.msg(id, "ไม่มีไอเทม"); const d = ITEMS[inst.itemId];
    if (d.type === "Consumable") {
      if (p.itemCd > 0) return this.msg(id, "รอก่อน"); if (p.hp >= p.maxHP) return this.msg(id, "HP เต็มแล้ว");
      removeItem(p.inv, inst.itemId, 1); p.hp = Math.min(p.maxHP, p.hp + (d.heal ?? 0)); p.itemCd = d.cooldown ?? 1; p.dirty = true; this.emit({ t: "heal", id, n: d.heal ?? 0 }); return;
    }
    if (d.slot) return this.equipInst(id, instId);
    if (inst.itemId === "MOUNT_HORSE") { if (!p.alive || this.trades.has(id)) return; p.mounted = !p.mounted; p.sitting = false; p.dirty = true; return this.msg(id, p.mounted ? "ขึ้นม้า — วิ่งเร็วขึ้น โจมตี/โดนกัดจะลงจากม้า" : "ลงจากม้า"); }
    this.msg(id, "ใช้ไม่ได้");
  }
  learn(id: string, skillId: string) {
    const p = this.players.get(id), S = SKILLS[skillId]; if (!p || !S || !S.price) return;
    if (p.skills.includes(skillId)) return this.msg(id, "เรียนท่านี้แล้ว"); if (p.gold < S.price) return this.msg(id, "Gold ไม่พอ");
    p.gold -= S.price; p.skills.push(skillId); p.dirty = true; this.msg(id, `เรียน ${S.name} แล้ว — ลากลง hotbar จากหน้าต่าง Skills`, "lvl");
  }
  equipInst(id: string, instId: string) { const p = this.players.get(id); if (!p) return; const err = equip(p.inv, p.eq, instId); if (err) this.msg(id, err); this.sync(p); }
  unequipSlot(id: string, slot: string) { const p = this.players.get(id); if (!p) return; const err = unequip(p.inv, p.eq, slot); if (err) this.msg(id, err); this.sync(p); }
  allocate(id: string, attr: string, n: number) { const p = this.players.get(id); if (!p) return; if (allocPoints(p, attr, n)) { const f = p.hp / p.maxHP; this.sync(p); p.hp = Math.round(p.maxHP * f); } }
  craft(id: string, recipeId: string) {
    const p = this.players.get(id); if (!p || !RECIPES[recipeId]) return; const gold = craftItem(p.inv, p.gold, recipeId);
    if (gold < 0) return this.msg(id, "craft ไม่ได้ — วัตถุดิบ/Gold ไม่พอ หรือกระเป๋าเต็ม");
    p.gold = gold; p.dirty = true; this.emit({ t: "craft", pid: id, item: RECIPES[recipeId].result });
  }
  buy(id: string, itemId: string, n: number) {
    const p = this.players.get(id); if (!p || !ITEMS[itemId] || !Number.isInteger(n) || n < 1) return; const g = shopBuy(p.inv, p.gold, itemId, n);
    if (g < 0) return this.msg(id, "ซื้อไม่ได้ — Gold ไม่พอหรือกระเป๋าเต็ม"); p.gold = g; p.dirty = true; this.msg(id, `ซื้อ ${itemName(itemId)} ×${n}`, "loot");
  }
  sell(id: string, itemId: string, n: number) {
    const p = this.players.get(id); if (!p || !ITEMS[itemId] || !Number.isInteger(n) || n < 1) return; const g = shopSell(p.inv, p.gold, itemId, n);
    if (g < 0) return this.msg(id, "ขายไม่ได้"); p.gold = g; p.dirty = true; this.msg(id, `ขาย ${itemName(itemId)} ×${n} ได้ ${ITEMS[itemId].sell * n} Gold`, "loot");
  }
  restyle(id: string, color: number) {
    const p = this.players.get(id); if (!p) return; const price = NPCS.NPC_STYLIST.price ?? 0;
    if (p.gold < price) return this.msg(id, "Gold ไม่พอ"); p.gold -= price; p.furColor = color & 0xffffff; p.dirty = true;
  }
  sit(id: string) { const p = this.players.get(id); if (!p || !p.alive) return; p.sitting = !p.sitting; p.dirty = true; this.msg(id, p.sitting ? "นั่งพัก — ฟื้น HP เร็วขึ้น" : "ลุกขึ้น"); }

  // ---------------------------------------------------------------- trade (W3): request → accept → both offer → both confirm → atomic swap
  trades = new Map<string, Trade>();          // both participants map to the same Trade
  private reqs = new Map<string, string>();   // target -> requester
  private tradeView(t: Trade, id: string): TradeView {
    const me = t.side[id], other = t.side[t.a === id ? t.b : t.a], op = this.players.get(t.a === id ? t.b : t.a)!;
    const rows = (p: SimPlayer, s: TradeSide) => Object.entries(s.items).map(([inst, count]) => ({ inst, itemId: p.inv.items.find(i => i.id === inst)?.itemId ?? "?", count }));
    return { withId: op.id, withName: op.name, mine: { items: rows(this.players.get(id)!, me), gold: me.gold, ok: me.ok }, theirs: { items: rows(op, other), gold: other.gold, ok: other.ok } };
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
    for (let i = this.pending.length - 1; i >= 0; i--) {          // skill effects land on their animation's contact frame
      const e = this.pending[i]; e.t -= dt; if (e.t > 0) continue;
      this.pending.splice(i, 1); const p = this.players.get(e.id); if (p) this.resolve(p, SKILLS[e.skill], e.skill);
    }
    for (const t of new Set(this.trades.values())) { const A = this.players.get(t.a), B = this.players.get(t.b); if (!A || !B || !A.alive || !B.alive || dist(A, B) > TRADE_RANGE + 2) this.tradeCancel(t.a, "การแลกของถูกยกเลิก (ห่างกันเกินไป)"); }
    this.hours = (this.hours + dt / DAY_SECONDS * 24) % 24;
    for (const p of this.players.values()) {
      if (p.alive) {
        stepPlayer(p, dt, this.L);
        if (p.hp < p.maxHP && (inTown(p) || p.sitting)) p.hp = Math.min(p.maxHP, p.hp + dt * (p.sitting ? 24 : 12));
      } else { p.moving = false; p.deadT -= dt; if (p.deadT <= 0) { p.alive = true; p.hp = p.maxHP; p.x = SPAWN.x; p.z = SPAWN.z; p.dirty = true; this.emit({ t: "respawn", id: p.id }); } }
    }
    for (const m of this.monsters) this.tickMonster(m, dt);
  }
  private tickMonster(m: SimMonster, dt: number) {
    const D = MONSTERS[m.kind]; m.moving = false;
    if (!m.alive) { m.dead -= dt; if (m.dead <= 0) { m.alive = true; m.hp = m.maxHP; m.x = m.home.x; m.z = m.home.z; m.mode = "wander"; this.emit({ t: "respawn", id: m.id }); if (D.boss) this.emit({ t: "notice", text: `${D.name} ปรากฏตัวที่ Dark Forest!` }); } return; }
    const dH = dist(m, m.home);
    // keep the current target while valid, else the nearest player in aggro range (never inside town)
    let T = m.targetId ? this.players.get(m.targetId) : undefined;
    if (!T || !T.alive || inTown(T) || m.mode === "leash") T = undefined;
    if (!T && m.mode !== "leash") { let best = D.aggro; for (const p of this.players.values()) if (p.alive && !inTown(p)) { const d = dist(m, p); if (d < best) { best = d; T = p; } } }
    m.targetId = T?.id ?? null;
    if (T && dH > D.leash) { m.mode = "leash"; m.targetId = null; T = undefined; }
    if (m.mode === "leash") { if (dH < 0.5) { m.mode = "wander"; m.hp = m.maxHP; } else this.stepTo(m, m.home, 4.5, dt); }
    else if (T) {
      const dP = dist(m, T); m.yaw = Math.atan2(T.x - m.x, T.z - m.z); const b = D.bite;
      if (m.bite > 0) { m.bite -= dt; if (!m.bit && m.bite < b.recovery + b.active && m.bite > b.recovery) { m.bit = true; if (dP < b.reach + 0.3 && T.alive) this.bite(m, T); } }
      else if (dP < b.reach) { m.bite = b.windup + b.active + b.recovery; m.bit = false; this.emit({ t: "anim", id: m.id, clip: "Attack" }); }
      else this.stepTo(m, T, 3.6, dt);
    } else {
      m.timer -= dt;
      if (m.timer <= 0) { m.timer = 2 + this.rng() * 3; m.wanderTo = this.rng() < 0.5 ? null : { x: m.home.x + (this.rng() - 0.5) * 6, z: m.home.z + (this.rng() - 0.5) * 6 }; }
      if (m.wanderTo && dist(m, m.wanderTo) > 0.3) this.stepTo(m, m.wanderTo, 1.4, dt);
    }
  }
  private stepTo(m: SimMonster, to: { x: number; z: number }, speed: number, dt: number) {
    const dx = to.x - m.x, dz = to.z - m.z, l = Math.hypot(dx, dz); if (l < 0.05) return;
    m.yaw = Math.atan2(dx, dz); const s = Math.min(l, speed * dt) / l; m.x += dx * s; m.z += dz * s; collide(m, 0.3 * MONSTERS[m.kind].scale, this.L); m.moving = true;
  }
  /** Take and clear the events produced since the last call. */
  drain() { const e = this.events; this.events = []; return e; }
}

export function inCone(a: { x: number; z: number; yaw: number }, b: { x: number; z: number }, range: number, deg: number) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz); if (l > range || l === 0) return false;
  if (deg >= 360) return true;
  const cos = (Math.sin(a.yaw) * dx + Math.cos(a.yaw) * dz) / l;
  return Math.acos(Math.max(-1, Math.min(1, cos))) < (deg / 2) * Math.PI / 180;
}

// ---------------------------------------------------------------- persistence (W3)
export const SEAL = "MERCHANT_SEAL";
export interface Saved { name: string; race?: Race; skills?: string[]; level: number; exp: number; points: number; STR: number; AGI: number; VIT: number; INT: number; DEX: number; LUK: number; hp: number; gold: number; inv: Inventory; eq: Equipment; furColor: number; x: number; z: number }
export function save(p: SimPlayer): Saved {
  const { name, race, skills, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, hp, gold, inv, eq, furColor, x, z } = p;
  return JSON.parse(JSON.stringify({ name, race, skills, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, hp, gold, inv, eq, furColor, x, z }));
}
