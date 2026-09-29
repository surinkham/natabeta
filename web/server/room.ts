import { Client, Room, ServerError } from "@colyseus/core";   // colyseus itself re-exports these in a way Node ESM cannot see
import { LOOT_OWNER_WINDOW, LOOT_TTL, Saved, Sim, SimEvent, SimPlayer, save, type RankRow } from "../shared/sim";
import { RESERVED_NAMES, Store, accountId, characterKey, cleanSlot, linkCharacters, nameKey, openStore } from "./store";
import { NEW_NEEDS_GOOGLE, googleAccount, googleRequired } from "./auth";
import { GuildBook } from "../shared/guild";
import { FriendBook } from "../shared/friends";
const GUILD_KEY = "__guilds";   // the store record holding every guild
const FRIEND_KEY = "__friends";   // … and every friend list
const MARKET_KEY = "__market";   // + channel: the store record holding that channel's listings and unpaid sale gold
import { GroundSchema, MapState, PlayerSchema } from "./schema";
import { MOB_FAR, MOB_FAR_EVERY, MOB_NEAR, mobFields, type MobsMsg } from "../shared/mobwire";

export const TICK_MS = 50, SAVE_MS = 30_000;   // 20 Hz sim, autosave every 30 s (+ on leave/dispose)
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 64) : "");
/** A character name as stored: 2–16 characters, spacing tidied, no markup characters (names end up in HTML). */
export const cleanName = (v: unknown) => { const n = str(v).normalize("NFC").replace(/[<>&"'`\\]/g, "").trim().replace(/\s+/g, " ").slice(0, 16).trim(); return n.length >= 2 ? n : ""; };
export const NAME_RESERVED = "ใช้ชื่อนี้ไม่ได้";

/** Owner-only snapshot: everything the HUD/windows need that is not in the public schema. */
export function meSnapshot(p: SimPlayer) {
  const { meal, fishing, hunger, pantry, partyRule, mail, id, name, race, skills, mounted, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, maxHP, maxMP, mp, ATK, MATK, DEF, Crit, Dodge, Hit, ASPD, CDR, HPR, MPR, hp, gold, inv, eq, equip, cd, itemCd, sitting, alive, deadT, furColor, x, z, party, recipes, mountKind, towns, home, quests, guildName } = p;
  return { meal, fishing, hunger, pantry, partyRule, mail, id, name, race, skills, mounted, level, exp, points, STR, AGI, VIT, INT, DEX, LUK, maxHP, maxMP, mp, ATK, MATK, DEF, Crit, Dodge, Hit, ASPD, CDR, HPR, MPR, hp, gold, inv, eq, equip, cd, itemCd, sitting, alive, deadT, furColor, x, z, party, recipes, mountKind, towns, home, quests, guildName };
}

/** Players per channel (a channel is one room, its own copy of the world); a full channel sends newcomers to the next. */
export const MAX_PER_CHANNEL = 80;
export class MapRoom extends Room<MapState> {
  maxClients = MAX_PER_CHANNEL;
  channel = 1;
  // process-wide, across every channel: an account plays in one channel at a time, and a channel switch waits for the
  // save the old channel is still writing before the new one loads it
  static online = new Map<string, MapRoom>();
  static saving = new Map<string, Promise<unknown>>();
  // the guild book is one for the whole server (every channel shares it), loaded once and saved with the players
  static guilds?: GuildBook; static guildsLoad?: Promise<GuildBook>;
  static friends?: FriendBook; static friendsLoad?: Promise<FriendBook>;
  // rankings: every saved character, read from the store at most every five minutes (Store.all)
  static ranks: RankRow[] = []; static ranksAt = 0;
  sim = Object.assign(new Sim(), { allowGM: process.env.BKO_ALLOW_GM === "1" });   // GM name only where the operator opted in
  store: Store = (this as any).constructor.store ?? openStore();   // tests inject a store via MapRoom.store
  static store?: Store;
  accounts = new Map<string, string>();   // sessionId -> account id
  characters = new Map<string, string>(); // sessionId -> persistence key for the selected slot
  // monster sync (shared/mobwire.ts): the last sent fields of each monster and the tick they last changed; per client,
  // the tick each monster was last sent to it (0 = not in its view: the next send is a full record)
  private mobLast: number[][] = []; private mobVer = new Uint32Array(0); private tickN = 1;
  private mobSent = new Map<string, Uint32Array>();

  async onCreate(options: any) {
    MapRoom.guildsLoad ??= this.store.load(GUILD_KEY).then(d => (MapRoom.guilds = new GuildBook(Array.isArray(d) ? d as any : undefined)));
    this.sim.guilds = await MapRoom.guildsLoad;
    MapRoom.friendsLoad ??= this.store.load(FRIEND_KEY).then(d => (MapRoom.friends = new FriendBook(d && !Array.isArray(d) ? d as any : undefined)));
    this.sim.friends = await MapRoom.friendsLoad;
    // which channel a friend plays in: every room of this server, by the uid its sim gave the player
    this.sim.onlineWhere = uid => { for (const r of MapRoom.rooms) for (const p of r.sim.players.values()) if (p.uid === uid) return r.channel; return undefined; };
    this.sim.rankSource = () => { this.refreshRanks(); return MapRoom.ranks; };
    MapRoom.rooms.add(this);
    this.channel = Math.max(1, Math.min(99, Math.floor(num(options?.channel, 1)))); this.setMetadata({ channel: this.channel });
    const market = await this.store.load(this.marketKey); if (market) this.sim.loadMarket(market as any);   // each channel keeps its own market
    this.setState(new MapState()); this.autoDispose = this.channel > 1;   // channel 1 persists while the server runs; extra channels close when empty (accessor: set here, not as a class field)
    this.mobLast = this.sim.monsters.map(mobFields); this.mobVer = new Uint32Array(this.sim.monsters.length);
    this.onMessage("input", (c, d: any) => this.sim.input(c.sessionId, num(d?.mx), num(d?.mz)));
    this.onMessage("act", (c, d) => typeof d === "string" ? this.sim.act(c.sessionId, str(d)) : this.sim.act(c.sessionId, str(d?.kind), num(d?.yaw, NaN), num(d?.x, NaN), num(d?.z, NaN)));           // sim checks the skill exists and is learned
    this.onMessage("learn", (c, d) => this.sim.learn(c.sessionId, str(d)));
    this.onMessage("use", (c, d) => this.sim.use(c.sessionId, str(d)));
    this.onMessage("equip", (c, d) => this.sim.equipInst(c.sessionId, str(d)));
    this.onMessage("unequip", (c, d) => this.sim.unequipSlot(c.sessionId, str(d)));
    this.onMessage("allocate", (c, d: any) => this.sim.allocate(c.sessionId, str(d?.attr), num(d?.n)));
    this.onMessage("craft", (c, d) => this.sim.craft(c.sessionId, str(d)));
    this.onMessage("buy", (c, d: any) => this.sim.buy(c.sessionId, str(d?.item), num(d?.n)));
    this.onMessage("fish", (c, d) => this.sim.fish(c.sessionId, num(d, NaN)));
    this.onMessage("cook", (c, d) => this.sim.cook(c.sessionId, str(d)));
    this.onMessage("partyRules", (c, d: any) => this.sim.partyRules(c.sessionId, str(d?.exp), str(d?.loot)));
    this.onMessage("mailClaim", (c, d) => this.sim.mailClaim(c.sessionId, str(d)));
    this.onMessage("mailDelete", (c, d) => this.sim.mailDelete(c.sessionId, str(d)));
    this.onMessage("sell", (c, d: any) => this.sim.sell(c.sessionId, str(d?.item), num(d?.n)));
    this.onMessage("restyle", (c, d) => this.sim.restyle(c.sessionId, num(d)));
    this.onMessage("sit", c => this.sim.sit(c.sessionId));
    this.onMessage("pickup", (c, d) => this.sim.pickup(c.sessionId, str(d)));
    this.onMessage("tradeReq", (c, d) => this.sim.tradeReq(c.sessionId, str(d)));
    this.onMessage("tradeAccept", c => this.sim.tradeAccept(c.sessionId));
    this.onMessage("partyInvite", (c, d) => this.sim.partyInvite(c.sessionId, str(d)));
    this.onMessage("partyAccept", c => this.sim.partyAccept(c.sessionId));
    this.onMessage("partyLeave", c => this.sim.partyLeave(c.sessionId));
    this.onMessage("partyKick", (c, d) => this.sim.partyKick(c.sessionId, str(d)));
    this.onMessage("respawnTown", (c, d) => this.sim.respawnTown(c.sessionId, str(d) || undefined));
    this.onMessage("guildCreate", (c, d) => this.sim.guildCreate(c.sessionId, str(d)));
    this.onMessage("guildInvite", (c, d) => this.sim.guildInvite(c.sessionId, str(d)));
    this.onMessage("guildAccept", c => this.sim.guildAccept(c.sessionId));
    this.onMessage("guildLeave", c => this.sim.guildLeave(c.sessionId));
    this.onMessage("guildKick", (c, d) => this.sim.guildKick(c.sessionId, str(d)));
    this.onMessage("guildPromote", (c, d: any) => this.sim.guildPromote(c.sessionId, str(d?.uid), str(d?.rank)));
    this.onMessage("guildDonate", (c, d) => this.sim.guildDonate(c.sessionId, num(d)));
    this.onMessage("guildUpgrade", (c, d) => this.sim.guildUpgrade(c.sessionId, str(d)));
    this.onMessage("guildLearn", (c, d) => this.sim.guildLearn(c.sessionId, str(d)));
    this.onMessage("guildBuy", (c, d) => this.sim.guildBuy(c.sessionId, str(d)));
    this.onMessage("guildList", (c, d) => this.sim.guildList(c.sessionId, str(d)));
    this.onMessage("guildApply", (c, d) => this.sim.guildApply(c.sessionId, str(d)));
    this.onMessage("guildApprove", (c, d) => this.sim.guildApprove(c.sessionId, str(d)));
    this.onMessage("guildReject", (c, d) => this.sim.guildReject(c.sessionId, str(d)));
    this.onMessage("friendAdd", (c, d) => this.sim.friendAdd(c.sessionId, str(d)));
    this.onMessage("friendAccept", (c, d) => this.sim.friendAccept(c.sessionId, str(d)));
    this.onMessage("friendDecline", (c, d) => this.sim.friendDecline(c.sessionId, str(d)));
    this.onMessage("friendRemove", (c, d) => this.sim.friendRemove(c.sessionId, str(d)));
    this.onMessage("friendList", c => this.sim.friendList(c.sessionId));
    this.onMessage("ranking", c => this.sim.ranking(c.sessionId));
    this.onMessage("guildEnter", c => this.sim.guildEnter(c.sessionId));
    this.onMessage("questAccept", (c, d) => this.sim.questAccept(c.sessionId, str(d)));
    this.onMessage("questTurnIn", (c, d) => this.sim.questTurnIn(c.sessionId, str(d)));
    this.onMessage("questAbandon", (c, d) => this.sim.questAbandon(c.sessionId, str(d)));
    this.onMessage("guildExit", c => this.sim.guildExit(c.sessionId));
    this.onMessage("reviveSelf", c => this.sim.reviveSelf(c.sessionId));
    this.onMessage("marketOpen", c => this.sim.marketOpen(c.sessionId));
    this.onMessage("marketList", (c, d) => this.sim.marketList(c.sessionId, str(d?.inst), num(d?.count), num(d?.price)));
    this.onMessage("marketBuy", (c, d) => this.sim.marketBuy(c.sessionId, str(d)));
    this.onMessage("marketCancel", (c, d) => this.sim.marketCancel(c.sessionId, str(d)));
    this.onMessage("tradeOffer", (c, d: any) => this.sim.tradeOffer(c.sessionId, typeof d?.items === "object" && d.items ? d.items : {}, num(d?.gold)));
    this.onMessage("tradeConfirm", c => this.sim.tradeConfirm(c.sessionId));
    this.onMessage("tradeCancel", c => this.sim.tradeCancel(c.sessionId));
    this.onMessage("hello", c => { c.send("channel", this.channel); this.mobSent.set(c.sessionId, new Uint32Array(this.sim.monsters.length)); const p = this.sim.players.get(c.sessionId); if (p) { c.send("me", meSnapshot(p)); p.dirty = false; } });   // client handlers are ready (also after reconnect)
    this.onMessage("say", (c, d: any) => { const p = this.sim.players.get(c.sessionId); const text = str(d?.text).slice(0, 200).trim(); if (!p || !text) return;
      // party chat reaches only the sender's party; say and world reach the whole channel
      if (d?.chan === "party") { if (!p.party) return; for (const o of this.clients) if (o !== c && this.sim.players.get(o.sessionId)?.party === p.party) o.send("chat", { who: p.name, text, chan: "party" }); return; }
      this.broadcast("chat", { who: p.name, text, chan: d?.chan === "world" ? "world" : "say" }, { except: c }); });
    this.setSimulationInterval(dt => this.tick(dt / 1000), TICK_MS);
    this.clock.setInterval(() => this.saveAll(), SAVE_MS);
  }

  /** Login: a Google account, or a guest (the hash of the browser's token) — only guests that already have a character
   *  once Google is on. One session per account. Loads the saved player. */
  async onAuth(client: Client, options: any) {
    // a Google ID token signs in to the Google account; otherwise the browser's guest token is the account. "link"
    // (a guest choosing to sign in with Google) moves the guest's progress onto a Google account that has none yet.
    const token = str(options?.token), idToken = typeof options?.google === "string" ? options.google.slice(0, 4096) : "";   // ID tokens are ~1 KB
    let acc: string;
    if (idToken) {
      const g = await googleAccount(idToken); if (!g) throw new ServerError(401, "google sign-in failed");
      acc = g.acc;
      if (options?.link && token.length >= 8) await linkCharacters(this.store, accountId(token), acc);
    } else { if (token.length < 8) throw new ServerError(400, "token required"); acc = accountId(token); }
    for (const [sid, a] of this.accounts) if (a === acc && sid !== client.sessionId) throw new ServerError(409, "already online");
    const other = MapRoom.online.get(acc); if (other && other !== this) throw new ServerError(409, "already online");
    await MapRoom.saving.get(acc);   // just left another channel: let that save land first
    const slot = cleanSlot(options?.slot), key = characterKey(acc, slot), saved = await this.store.load(key);
    if (saved?.deleteAt) throw new ServerError(403, "ตัวละครนี้รอการลบอยู่ — ยกเลิกการลบก่อนเข้าเล่น");
    if (saved) return { acc, key, slot, saved };
    if (!idToken && googleRequired()) throw new ServerError(403, NEW_NEEDS_GOOGLE);   // existing guests play on; new ones sign in
    // a new character: names may repeat (players are told apart by account, never by name), but not pass for staff
    // (the GM name only where the operator allows GM)
    const name = cleanName(options?.name) || "Dog Knight", normalizedName = nameKey(name);
    if (!(this.sim.allowGM && normalizedName === "admin") && RESERVED_NAMES.has(normalizedName)) throw new ServerError(409, NAME_RESERVED);
    return { acc, key, slot, name };
  }
  onJoin(client: Client, options: any) {
    const { acc, key, saved, name } = client.auth as { acc: string; key: string; saved?: Saved; name?: string }; this.accounts.set(client.sessionId, acc); this.characters.set(client.sessionId, key); MapRoom.online.set(acc, this);
    const p = this.sim.join(client.sessionId, { name: name ?? "", color: num(options?.color, 0xe8963a), race: str(options?.race) }, saved);
    this.state.players.set(client.sessionId, new PlayerSchema());
    this.pushPlayer(p);
  }
  async onLeave(client: Client, consented: boolean) {
    const p = this.sim.players.get(client.sessionId); if (p) p.in = { mx: 0, mz: 0 };
    if (!consented) {
      // open the reconnection window first: a page refresh can come back faster than the save below is written, and a
      // token that is not registered yet is "invalid or expired" (the player then lands as "already online")
      const back = this.allowReconnection(client, 20);
      void this.persist(client.sessionId);
      try { await back; return; } catch {}
    }
    const acc = this.accounts.get(client.sessionId), saving = this.persist(client.sessionId);
    if (acc) { MapRoom.saving.set(acc, saving); saving.finally(() => { if (MapRoom.saving.get(acc) === saving) MapRoom.saving.delete(acc); }); }
    await saving;
    this.sim.leave(client.sessionId); this.state.players.delete(client.sessionId); this.accounts.delete(client.sessionId); this.characters.delete(client.sessionId); this.mobSent.delete(client.sessionId);
    if (acc && MapRoom.online.get(acc) === this) MapRoom.online.delete(acc);
  }
  async onDispose() { MapRoom.rooms.delete(this); await this.saveAll(); }
  static rooms = new Set<MapRoom>();
  /** A character deleted for good: out of its guild and every friend list, and both books saved. */
  static forget(s: Saved) {
    const uid = s.uid; if (!uid || !MapRoom.store) return;
    if (MapRoom.guilds?.of(uid)) { MapRoom.guilds.leave(uid); void MapRoom.store.save(GUILD_KEY, MapRoom.guilds.toJSON() as any).catch(() => {}); }
    const f = MapRoom.friends; if (f) { for (const o of Object.keys(f.people.get(uid)?.friends ?? {})) f.remove(uid, o); f.people.delete(uid); for (const e of f.people.values()) delete e.pending[uid]; void MapRoom.store.save(FRIEND_KEY, f.toJSON() as any).catch(() => {}); }
  }
  private refreshRanks() {
    if (Date.now() - MapRoom.ranksAt < 300_000 || !this.store.all) return; MapRoom.ranksAt = Date.now();
    this.store.all().then(list => { MapRoom.ranks = list.filter(s => s?.name && !s.name.startsWith("__")).map(s => ({ name: s.name, level: s.level ?? 1, race: s.race ?? "", guild: MapRoom.guilds?.of(s.uid ?? "")?.name ?? "", exp: s.exp ?? 0 }))
      .sort((a, b) => b.level - a.level || b.exp - a.exp).slice(0, 100).map(({ exp: _e, ...r }) => r); }).catch(e => console.error("ranking failed", e));
  }
  private async persist(sid: string) { const p = this.sim.players.get(sid), key = this.characters.get(sid); if (p && key) await this.store.save(key, save(p)).catch(e => console.error("save failed", key, e)); }
  get marketKey() { return MARKET_KEY + this.channel; }
  saveAll() {
    const friends = this.sim.friendsDirty && MapRoom.friends ? (this.sim.friendsDirty = false, this.store.save(FRIEND_KEY, MapRoom.friends.toJSON() as any).catch(e => console.error("friend save failed", e))) : undefined;
    const guilds = this.sim.guildsDirty && MapRoom.guilds ? (this.sim.guildsDirty = false, this.store.save(GUILD_KEY, MapRoom.guilds.toJSON() as any).catch(e => console.error("guild save failed", e))) : undefined;
    // the market is saved in the same tick as the players, so a crash never keeps an item both listed and in a bag
    const market = this.sim.marketDirty ? (this.sim.marketDirty = false, this.store.save(this.marketKey, JSON.parse(JSON.stringify(this.sim.marketState()))).catch(e => console.error("market save failed", e))) : undefined;
    return Promise.all([guilds, friends, market, ...[...this.accounts.keys()].map(sid => this.persist(sid))]);
  }

  private pushPlayer(p: SimPlayer) {
    const s = this.state.players.get(p.id); if (!s) return;
    s.name = p.name; s.race = p.race; s.mounted = p.mounted; s.x = p.x; s.z = p.z; s.yaw = p.yaw; s.hp = p.hp; s.maxHP = p.maxHP; s.level = p.level; s.alive = p.alive; s.moving = p.moving; s.sitting = p.sitting; s.furColor = p.furColor; s.party = p.party; s.guild = p.guildName ?? ""; s.mp = Math.floor(p.mp); s.maxMP = p.maxMP; s.mountKind = p.mountKind;
    const eq = JSON.stringify(p.equip); if (s.equip !== eq) s.equip = eq;
  }
  /** Send each client the monsters near it that changed since it last heard of them (see shared/mobwire.ts). */
  private syncMobs() {
    const ms = this.sim.monsters, t = ++this.tickN, near2 = MOB_NEAR ** 2, far2 = MOB_FAR ** 2;
    for (let i = 0; i < ms.length; i++) {
      const f = mobFields(ms[i]), l = this.mobLast[i];
      if (f[0] !== l[0] || f[1] !== l[1] || f[2] !== l[2] || f[3] !== l[3] || f[4] !== l[4]) { this.mobLast[i] = f; this.mobVer[i] = t; }
    }
    // ponytail: every client scans every monster (clients × 2k per tick, a few ms at 80); bucket monsters by map if it shows
    for (const c of this.clients) {
      const p = this.sim.players.get(c.sessionId), sent = this.mobSent.get(c.sessionId); if (!p || !sent) continue;
      const full: MobsMsg[0] = [], upd: number[] = [], farTurn = t % MOB_FAR_EVERY === 0;
      for (let i = 0; i < ms.length; i++) {
        const m = ms[i], dx = m.x - p.x, dz = m.z - p.z, d2 = dx * dx + dz * dz;
        if (d2 > far2) { sent[i] = 0; continue; }
        if (!sent[i]) { full.push([i, ...this.mobLast[i], m.maxHP, m.level, m.kind, m.id]); sent[i] = t; }
        else if (this.mobVer[i] > sent[i] && (d2 < near2 || farTurn)) { upd.push(i, ...this.mobLast[i]); sent[i] = t; }
      }
      if (full.length || upd.length) c.send("mobs", [full, upd] satisfies MobsMsg);
    }
  }
  private tick(dt: number) {
    this.sim.tick(dt); this.state.hours = this.sim.hours;
    for (const p of this.sim.players.values()) { this.pushPlayer(p); if (p.dirty) { p.dirty = false; this.clients.find(c => c.sessionId === p.id)?.send("me", meSnapshot(p)); } }
    // ground loot: add what appeared, drop what was taken — the sim list is the truth
    const live = new Set<string>();
    for (const g of this.sim.ground) {
      live.add(g.id);
      let s = this.state.ground.get(g.id);
      if (!s) { s = new GroundSchema(); s.assign({ id: g.id, itemId: g.itemId, count: g.count, gold: g.gold, x: g.x, z: g.z, owner: g.owner, free: false } as any); this.state.ground.set(g.id, s); }
      const free = g.t <= LOOT_TTL - LOOT_OWNER_WINDOW; if (s.free !== free) s.free = free;
    }
    this.state.ground.forEach((_, id) => { if (!live.has(id)) this.state.ground.delete(id); });
    this.syncMobs();
    const ev = this.sim.drain(); if (!ev.length) return;
    const pub: SimEvent[] = [], own = new Map<string, SimEvent[]>();
    for (const e of ev) { if ("pid" in e) (own.get(e.pid) ?? own.set(e.pid, []).get(e.pid)!).push(e); else pub.push(e); }
    if (pub.length) this.broadcast("ev", pub);
    for (const [pid, list] of own) this.clients.find(c => c.sessionId === pid)?.send("ev", list);
  }
}
