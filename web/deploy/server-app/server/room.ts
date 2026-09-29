import { Client, Room, ServerError } from "@colyseus/core";   // colyseus itself re-exports these in a way Node ESM cannot see
import { Saved, Sim, SimEvent, SimPlayer, save } from "../shared/sim";
import { Store, accountId, openStore } from "./store";
import { MapState, MonsterSchema, PlayerSchema } from "./schema";

export const TICK_MS = 50, SAVE_MS = 30_000;   // 20 Hz sim, autosave every 30 s (+ on leave/dispose)
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 64) : "");

/** Owner-only snapshot: everything the HUD/windows need that is not in the public schema. */
export function meSnapshot(p: SimPlayer) {
  const { id, name, race, skills, mounted, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, maxHP, ATK, DEF, Crit, Dodge, Hit, hp, gold, inv, eq, equip, cd, itemCd, sitting, alive, deadT, furColor, x, z } = p;
  return { id, name, race, skills, mounted, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, maxHP, ATK, DEF, Crit, Dodge, Hit, hp, gold, inv, eq, equip, cd, itemCd, sitting, alive, deadT, furColor, x, z };
}

export class MapRoom extends Room<MapState> {
  maxClients = 64;
  sim = new Sim();
  store: Store = (this as any).constructor.store ?? openStore();   // tests inject a store via MapRoom.store
  static store?: Store;
  accounts = new Map<string, string>();   // sessionId -> account id

  onCreate() {
    this.setState(new MapState()); this.autoDispose = false;   // the map persists while the server runs (accessor: set here, not as a class field)
    for (const m of this.sim.monsters) { const s = new MonsterSchema(); s.id = m.id; s.kind = m.kind; this.state.monsters.push(s); }
    this.onMessage("input", (c, d: any) => this.sim.input(c.sessionId, num(d?.mx), num(d?.mz)));
    this.onMessage("act", (c, d) => this.sim.act(c.sessionId, str(d)));           // sim checks the skill exists and is learned
    this.onMessage("learn", (c, d) => this.sim.learn(c.sessionId, str(d)));
    this.onMessage("use", (c, d) => this.sim.use(c.sessionId, str(d)));
    this.onMessage("equip", (c, d) => this.sim.equipInst(c.sessionId, str(d)));
    this.onMessage("unequip", (c, d) => this.sim.unequipSlot(c.sessionId, str(d)));
    this.onMessage("allocate", (c, d: any) => this.sim.allocate(c.sessionId, str(d?.attr), num(d?.n)));
    this.onMessage("craft", (c, d) => this.sim.craft(c.sessionId, str(d)));
    this.onMessage("buy", (c, d: any) => this.sim.buy(c.sessionId, str(d?.item), num(d?.n)));
    this.onMessage("sell", (c, d: any) => this.sim.sell(c.sessionId, str(d?.item), num(d?.n)));
    this.onMessage("restyle", (c, d) => this.sim.restyle(c.sessionId, num(d)));
    this.onMessage("sit", c => this.sim.sit(c.sessionId));
    this.onMessage("tradeReq", (c, d) => this.sim.tradeReq(c.sessionId, str(d)));
    this.onMessage("tradeAccept", c => this.sim.tradeAccept(c.sessionId));
    this.onMessage("tradeOffer", (c, d: any) => this.sim.tradeOffer(c.sessionId, typeof d?.items === "object" && d.items ? d.items : {}, num(d?.gold)));
    this.onMessage("tradeConfirm", c => this.sim.tradeConfirm(c.sessionId));
    this.onMessage("tradeCancel", c => this.sim.tradeCancel(c.sessionId));
    this.onMessage("hello", c => { const p = this.sim.players.get(c.sessionId); if (p) { c.send("me", meSnapshot(p)); p.dirty = false; } });   // client handlers are ready (also after reconnect)
    this.onMessage("say", (c, d: any) => { const p = this.sim.players.get(c.sessionId); const text = str(d?.text).slice(0, 200).trim(); if (p && text) this.broadcast("chat", { who: p.name, text, chan: d?.chan === "world" ? "world" : "say" }, { except: c }); });
    this.setSimulationInterval(dt => this.tick(dt / 1000), TICK_MS);
    this.clock.setInterval(() => this.saveAll(), SAVE_MS);
  }

  /** Guest login: the account is the hash of the browser's token; one session per account. Loads the saved player. */
  async onAuth(client: Client, options: any) {
    const token = str(options?.token); if (token.length < 8) throw new ServerError(400, "token required");
    const acc = accountId(token);
    for (const [sid, a] of this.accounts) if (a === acc && sid !== client.sessionId) throw new ServerError(409, "already online");
    return { acc, saved: await this.store.load(acc) };
  }
  onJoin(client: Client, options: any) {
    const { acc, saved } = client.auth as { acc: string; saved?: Saved }; this.accounts.set(client.sessionId, acc);
    const p = this.sim.join(client.sessionId, { name: str(options?.name), color: num(options?.color, 0xe8963a), race: str(options?.race) }, saved);
    this.state.players.set(client.sessionId, new PlayerSchema());
    this.pushPlayer(p);
  }
  async onLeave(client: Client, consented: boolean) {
    const p = this.sim.players.get(client.sessionId); if (p) { p.in = { mx: 0, mz: 0 }; await this.persist(client.sessionId); }
    if (!consented) { try { await this.allowReconnection(client, 20); return; } catch {} }
    await this.persist(client.sessionId);
    this.sim.leave(client.sessionId); this.state.players.delete(client.sessionId); this.accounts.delete(client.sessionId);
  }
  async onDispose() { await this.saveAll(); }
  private async persist(sid: string) { const p = this.sim.players.get(sid), acc = this.accounts.get(sid); if (p && acc) await this.store.save(acc, save(p)).catch(e => console.error("save failed", acc, e)); }
  saveAll() { return Promise.all([...this.accounts.keys()].map(sid => this.persist(sid))); }

  private pushPlayer(p: SimPlayer) {
    const s = this.state.players.get(p.id); if (!s) return;
    s.name = p.name; s.race = p.race; s.mounted = p.mounted; s.x = p.x; s.z = p.z; s.yaw = p.yaw; s.hp = p.hp; s.maxHP = p.maxHP; s.level = p.level; s.alive = p.alive; s.moving = p.moving; s.sitting = p.sitting; s.furColor = p.furColor;
    const eq = JSON.stringify(p.equip); if (s.equip !== eq) s.equip = eq;
  }
  private tick(dt: number) {
    this.sim.tick(dt); this.state.hours = this.sim.hours;
    for (const p of this.sim.players.values()) { this.pushPlayer(p); if (p.dirty) { p.dirty = false; this.clients.find(c => c.sessionId === p.id)?.send("me", meSnapshot(p)); } }
    this.sim.monsters.forEach((m, i) => { const s = this.state.monsters[i]; s.x = m.x; s.z = m.z; s.yaw = m.yaw; s.hp = m.hp; s.maxHP = m.maxHP; s.alive = m.alive; s.moving = m.moving; });
    const ev = this.sim.drain(); if (!ev.length) return;
    const pub: SimEvent[] = [], own = new Map<string, SimEvent[]>();
    for (const e of ev) { if ("pid" in e) (own.get(e.pid) ?? own.set(e.pid, []).get(e.pid)!).push(e); else pub.push(e); }
    if (pub.length) this.broadcast("ev", pub);
    for (const [pid, list] of own) this.clients.find(c => c.sessionId === pid)?.send("ev", list);
  }
}
