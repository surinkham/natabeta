import { clearLink, googleToken, linkPending, takeLink } from "./auth";
// The game talks to a Host: either the Colyseus room (NetHost) or the same simulation run in-page (LocalHost, used by
// the single-file artifact and when no server answers). Both expose the same read model + command surface.
import { Client, Room } from "colyseus.js";
import { Creation, LOOT_OWNER_WINDOW, LOOT_TTL, SimEvent, SimPlayer, Sim, attackSkill, reconcile, stepPlayer } from "@shared/sim";
import { SKILLS } from "@shared/data";
import { applyMobs, type MobView, type MobsMsg } from "@shared/mobwire";
import { Layout } from "@shared/world";
import { layout } from "../world/world";

export interface BodyView { id: string; x: number; z: number; yaw: number; hp: number; maxHP: number; alive: boolean; moving: boolean }
export interface PlayerView extends BodyView { guild?: string; name: string; race: string; mounted: boolean; level: number; sitting: boolean; furColor: number; equip: string; party: string; mountKind: string }   // equip = JSON
export interface MonsterView extends BodyView { kind: string; level?: number }
export interface GroundView { id: string; itemId: string; count: number; gold: number; x: number; z: number; owner?: string; free?: boolean }   // owner/free: whose, and open to anyone yet
export type Cmd = "fish" | "cook" | "partyRules" | "mailClaim" | "mailDelete" | "act" | "learn" | "pickup" | "use" | "equipInst" | "unequipSlot" | "allocate" | "craft" | "buy" | "sell" | "restyle" | "sit" | "partyInvite" | "partyAccept" | "partyLeave" | "partyKick" | "respawnTown" | "reviveSelf" | "guildCreate" | "guildInvite" | "guildAccept" | "guildLeave" | "guildKick" | "guildPromote" | "guildDonate" | "guildUpgrade" | "guildLearn" | "guildBuy" | "guildEnter" | "guildExit" | "marketOpen" | "marketList" | "marketBuy" | "marketCancel" | "tradeReq" | "tradeAccept" | "tradeOffer" | "tradeConfirm" | "tradeCancel" | "questAccept" | "questTurnIn" | "questAbandon" | "guildList" | "guildApply" | "guildApprove" | "guildReject" | "friendAdd" | "friendAccept" | "friendDecline" | "friendRemove" | "friendList" | "ranking";
export type Chan = "say" | "world" | "party";

export interface Host {
  online: boolean; id: string; me: SimPlayer; L: Layout; reason?: string;   // reason: why we are offline
  channel?: number;            // online: which channel (world copy) we are in
  players(): PlayerView[];     // everyone except me
  monsters(): MonsterView[];
  ground(): GroundView[];
  input(mx: number, mz: number): void;
  cmd(name: Cmd, ...args: any[]): void;
  say(text: string, chan: Chan): void;
  onChat?: (who: string, text: string, chan: Chan) => void;
  /** Advance local state (sim or prediction) and return the events to render. */
  tick(dt: number): SimEvent[];
  hours(): number | undefined;   // server clock; undefined = client owns the clock
}

export class LocalHost implements Host {
  online = false; id = "me"; sim = new Sim(layout); me: SimPlayer; L = layout;
  constructor(c: Creation, public reason?: string) { this.sim.allowGM = true; this.me = this.sim.join(this.id, c); }   // offline play: the GM name works
  players() { return []; }
  monsters() { return this.sim.monsters; }
  ground(): GroundView[] { return this.sim.ground.map(g => Object.assign(g, { free: g.t <= LOOT_TTL - LOOT_OWNER_WINDOW })); }
  input(mx: number, mz: number) { this.sim.input(this.id, mx, mz); }
  cmd(name: Cmd, ...args: any[]) { (this.sim as any)[name](this.id, ...args); }
  say() {}
  tick(dt: number) { this.sim.tick(dt); return this.sim.drain(); }
  hours() { return undefined; }
}

const WIRE: Record<Cmd, (a: any[]) => [string, any]> = {
  act: a => ["act", a[2] === undefined ? { kind: a[0], yaw: a[1] } : { kind: a[0], yaw: a[1], x: a[2], z: a[3] }], learn: a => ["learn", a[0]], pickup: a => ["pickup", a[0]], use: a => ["use", a[0]], equipInst: a => ["equip", a[0]], unequipSlot: a => ["unequip", a[0]],
  allocate: a => ["allocate", { attr: a[0], n: a[1] }], craft: a => ["craft", a[0]], buy: a => ["buy", { item: a[0], n: a[1] }],
  fish: a => ["fish", a[0]], cook: a => ["cook", a[0]], partyRules: a => ["partyRules", { exp: a[0], loot: a[1] }], mailClaim: a => ["mailClaim", a[0]], mailDelete: a => ["mailDelete", a[0]],
  sell: a => ["sell", { item: a[0], n: a[1] }], restyle: a => ["restyle", a[0]], sit: () => ["sit", undefined],
  marketOpen: () => ["marketOpen", undefined], marketList: a => ["marketList", { inst: a[0], count: a[1], price: a[2] }], marketBuy: a => ["marketBuy", a[0]], marketCancel: a => ["marketCancel", a[0]],
  partyInvite: a => ["partyInvite", a[0]], partyAccept: () => ["partyAccept", undefined], partyLeave: () => ["partyLeave", undefined], partyKick: a => ["partyKick", a[0]], respawnTown: a => ["respawnTown", a[0]], reviveSelf: () => ["reviveSelf", undefined],
  guildCreate: a => ["guildCreate", a[0]], guildInvite: a => ["guildInvite", a[0]], guildAccept: () => ["guildAccept", undefined], guildLeave: () => ["guildLeave", undefined],
  guildKick: a => ["guildKick", a[0]], guildPromote: a => ["guildPromote", { uid: a[0], rank: a[1] }], guildDonate: a => ["guildDonate", a[0]], guildUpgrade: a => ["guildUpgrade", a[0]],
  guildLearn: a => ["guildLearn", a[0]], guildBuy: a => ["guildBuy", a[0]], guildEnter: () => ["guildEnter", undefined], guildExit: () => ["guildExit", undefined],
  tradeReq: a => ["tradeReq", a[0]], tradeAccept: () => ["tradeAccept", undefined], tradeOffer: a => ["tradeOffer", { items: a[0], gold: a[1] }], tradeConfirm: () => ["tradeConfirm", undefined], tradeCancel: () => ["tradeCancel", undefined],
  guildList: a => ["guildList", a[0] ?? ""], guildApply: a => ["guildApply", a[0]], guildApprove: a => ["guildApprove", a[0]], guildReject: a => ["guildReject", a[0]],
  friendAdd: a => ["friendAdd", a[0]], friendAccept: a => ["friendAccept", a[0]], friendDecline: a => ["friendDecline", a[0]], friendRemove: a => ["friendRemove", a[0]], friendList: () => ["friendList", undefined], ranking: () => ["ranking", undefined],
  questAccept: a => ["questAccept", a[0]], questTurnIn: a => ["questTurnIn", a[0]], questAbandon: a => ["questAbandon", a[0]],
};

/** The guest token this browser already has, if any (never makes one). A guest plays only here; moving devices takes Google. */
export const existingGuest = () => { try { return new URLSearchParams(location.search).get("token") ?? localStorage.getItem("bk.token") ?? undefined; } catch { return undefined; } };
/** Guest login (W3): a random secret kept in this browser; the server hashes it into the account id. Clear it = new character. */
export function guestToken() {
  const q = new URLSearchParams(location.search).get("token"); if (q) return q;   // dev: second account in the same browser
  let t = ""; try { t = localStorage.getItem("bk.token") ?? ""; if (!t) { t = crypto.randomUUID(); localStorage.setItem("bk.token", t); } } catch { t = "anon-" + Math.random().toString(36).slice(2); }
  return t;
}

export interface CharacterSummary { slot: number; name: string; race: string; color: number; level: number; deleteAt?: number }
/** Fetch the three server-owned slots after account selection, before entering a world room. */
export async function loadCharacterSlots(serverUrl: string, action?: { action: "delete" | "undelete"; slot: number }): Promise<Array<CharacterSummary | null>> {
  const endpoint = serverUrl.replace(/^ws/, "http").replace(/\/$/, "") + "/characters";
  const google = googleToken(), token = google ? existingGuest() : guestToken();
  const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, google, link: linkPending(), ...action }), cache: "no-store" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "โหลดตัวละครไม่สำเร็จ");
  const data = await r.json() as { characters?: Array<CharacterSummary | null> };
  if (google && linkPending()) clearLink();
  return Array.from({ length: 3 }, (_, i) => data.characters?.[i] ?? null);
}

/** Channels: every channel is a separate copy of the world holding up to MAX_PER_CHANNEL players. The channel asked for
 *  (a switch from the channel list, remembered for this tab) if it has room, else the first one that does. */
export const MAX_PER_CHANNEL = 80;
export async function channelList(client: Client) {
  const rooms = await client.getAvailableRooms("map").catch(() => []);
  return rooms.map(r => ({ channel: Number((r.metadata as any)?.channel ?? 1), clients: r.clients })).sort((a, b) => a.channel - b.channel);
}
async function pickChannel(client: Client) {
  const list = await channelList(client), want = Number(sessionStorage.getItem("bk.ch")) || 0;
  const free = (n: number) => (list.find(r => r.channel === n)?.clients ?? 0) < MAX_PER_CHANNEL;
  if (want && free(want)) return want;
  for (let n = 1; ; n++) if (free(n)) return n;
}
export class NetHost implements Host {
  online = true; id: string; me: SimPlayer; L = layout; onChat?: Host["onChat"];
  private events: SimEvent[] = []; private sent = { mx: 0, mz: 0, t: 0 }; private trail: { x: number; z: number; t: number }[] = [];

  private constructor(public room: Room, first: any) {
    this.id = room.sessionId;
    this.me = { ...first, x: 0, z: -4.5, yaw: 0, moving: false, dash: 0, busy: 0, in: { mx: 0, mz: 0 }, dirty: false };
    room.onMessage("me", (s: any) => Object.assign(this.me, s));
    room.onMessage("ev", (l: SimEvent[]) => this.events.push(...l));
    room.onMessage("chat", (m: any) => this.onChat?.(m.who, m.text, m.chan));
    try { sessionStorage.setItem("bk.rt", room.reconnectionToken); } catch {}   // page refresh → reconnect() keeps the same player (20 s window)
    // dropped (the server restarting for a deploy, the network gone): the server has saved us; wait until it answers
    // again, then reload into the same character instead of playing on against a dead connection
    room.onLeave(() => {
      if (NetHost.leaving) return;
      const card = netCard(`<b>ขาดการเชื่อมต่อ server</b><small>ตัวละครถูกบันทึกไว้แล้ว — กำลังเชื่อมต่อใหม่…</small>`);
      const retry = async () => { try { if ((await fetch(location.href, { cache: "no-store" })).ok) return location.reload(); } catch {} card.querySelector("small")!.textContent += "."; setTimeout(retry, 2000); };
      setTimeout(retry, 2000);
    });
  }
  static leaving = false;
  /** Leave on purpose (the server saves and frees the account at once), then reload. */
  static async leaveAndReload() { NetHost.leaving = true; await NetHost.current?.room.leave(true).catch(() => {}); location.reload(); }
  get channel() { return (this.room as any).channel ?? 1; }
  static url = "";
  /** Channels with their head counts, for the channel picker. */
  static channels() { return channelList(new Client(NetHost.url)); }
  /** Move to another channel: forget the reconnect token and come back in through the front door. */
  static current?: NetHost;
  static async switchTo(n: number) {
    try { sessionStorage.setItem("bk.ch", String(n)); sessionStorage.removeItem("bk.rt"); } catch {}
    // leave on purpose (the server saves and frees the account at once) — a bare reload would hold the old channel for
    // its 20 s reconnect window and the new one would refuse us as "already online"
    await NetHost.leaveAndReload();
  }
  /** Reconnect with the stored token (page refresh) or join fresh. Rejects when the server is unreachable. */
  static async connect(url: string, c: Creation, timeoutMs = 8000) {
    const client = new Client(url); let room: Room | undefined;
    const token = sessionStorage.getItem("bk.slot") === String(c.slot) ? sessionStorage.getItem("bk.rt") : null;
    // signed in with Google: send only a guest token this browser already has (to link it), never mint one
  const join = async () => { if (token) { try { return await client.reconnect(token); } catch {} } return client.joinOrCreate("map", { ...c, token: googleToken() ? existingGuest() : guestToken(), google: googleToken() ?? undefined, link: takeLink(), channel: await pickChannel(client) }); };
    // a join that lands after we gave up must not linger: it would hold the account "already online" for the retry
    const joining = join(); let gaveUp = false;
    joining.then(r => { if (gaveUp) r.leave(true).catch(() => {}); }, () => {});
    try { room = await Promise.race([joining, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]); }
    catch (e) { gaveUp = true; throw e; }
    room.onMessage("channel", (n: number) => { (room as any).channel = n; });
    // monsters come per client (shared/mobwire.ts), from the tick after "hello"; listen before saying it
    const mobs = new Map<number, MobView>(); let mobList: MobView[] = [];
    room.onMessage("mobs", (m: MobsMsg) => { if (applyMobs(mobs, m)) mobList = [...mobs.values()]; });
    NetHost.url = url;
    const first = await new Promise<any>((res, rej) => { room!.onMessage("me", res); room!.onError((_, m) => rej(new Error(m))); setTimeout(() => rej(new Error("no state")), timeoutMs); room!.send("hello"); })
      .catch(e => { room!.leave(true).catch(() => {}); throw e; });
    return NetHost.current = Object.assign(new NetHost(room, first), { mobList: () => mobList });
  }
  private get S() { return this.room.state; }
  players() { const out: PlayerView[] = []; this.S.players.forEach((p: any, id: string) => { if (id !== this.id) out.push(Object.assign(p, { id })); }); return out; }
  private mobList: () => MonsterView[] = () => [];
  monsters() { return this.mobList(); }
  ground() { const out: GroundView[] = []; this.S.ground.forEach((g: any) => out.push(g)); return out; }
  input(mx: number, mz: number) { this.me.in.mx = mx; this.me.in.mz = mz; }
  cmd(name: Cmd, ...args: any[]) {
    const [type, data] = WIRE[name](args); this.room.send(type, data);
    if (name === "act" && SKILLS[args[0]]) this.me.cd[args[0]] = SKILLS[args[0] === "SKILL_BASIC" ? attackSkill(this.me.equip, this.me.inv, this.me.mp) : args[0]].cooldown * (args[0] === "SKILL_BASIC" ? 1 / (this.me.ASPD ?? 1) : 1 - (this.me.CDR ?? 0));   // predict the cooldown; the server still validates
    if (name === "sit") this.me.sitting = !this.me.sitting;
  }
  say(text: string, chan: Chan) { this.room.send("say", { text, chan }); }
  tick(dt: number) {
    const me = this.me, s = this.S.players.get(this.id);
    // send input at 20 Hz when it changed, plus a slow heartbeat
    this.sent.t += dt; if ((me.in.mx !== this.sent.mx || me.in.mz !== this.sent.mz) && this.sent.t > 0.05 || this.sent.t > 0.5) { this.sent = { mx: me.in.mx, mz: me.in.mz, t: 0 }; this.room.send("input", { mx: me.in.mx, mz: me.in.mz }); }
    if (me.alive) { me.deadT = 0; stepPlayer(me, dt, this.L); } else { me.moving = false; me.deadT = Math.max(0, me.deadT - dt); }
    if (s) {
      if (!me.alive) { me.x = s.x; me.z = s.z; this.trail.length = 0; } else reconcile(me, this.trail, s, dt, performance.now() / 1000);
      me.hp = s.hp; me.mp = s.mp; me.maxMP = s.maxMP; if (s.alive !== me.alive) { me.alive = s.alive; if (s.alive) { me.x = s.x; me.z = s.z; } }
    }
    const ev = this.events; this.events = []; return ev;
  }
  hours() { return this.S.hours as number; }
}

/** A centred notice over the game (connecting, connection lost). */
export function netCard(html: string) {
  document.getElementById("net-card")?.remove();
  const el = Object.assign(document.createElement("div"), { id: "net-card", className: "hud frame", innerHTML: html });
  el.style.cssText = "position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:10000;padding:18px 22px;display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;max-width:min(90vw,380px)";
  document.body.append(el); return el;
}
