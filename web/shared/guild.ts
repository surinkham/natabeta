// Guilds, pure (no sim, no network): the book of every guild on the server, shared by all channels and saved as one
// record. A guild is founded for GUILD_COST gold and starts with room for 20; members donate gold into its treasury,
// and the treasury raises its buildings — the Hall (more members), the Training Grounds (how far its skills can go),
// the Market (what its shop sells) — and levels its skills, bonuses every member carries. Donating also earns the
// donor contribution points to spend in the guild shop. Members are keyed by the player's stable uid.

export const GUILD_COST = 1000;
export type Rank = "leader" | "officer" | "member";
export type BuildingId = "hall" | "training" | "market";
export type GuildSkillId = "might" | "fortitude" | "warding" | "fortune";

export const BUILDINGS: Record<BuildingId, { name: string; max: number; cost: (lvl: number) => number; desc: (lvl: number) => string }> = {
  hall:     { name: "หอกิลด์", max: 6, cost: l => 4000 * (l + 1), desc: l => `รับสมาชิกได้ ${capacityAt(l)} คน` },
  training: { name: "ลานฝึก", max: 5, cost: l => 3000 * (l + 1), desc: l => `สกิลกิลด์อัปได้ถึง Lv ${l * 2 + 2}` },
  market:   { name: "ตลาดกิลด์", max: 3, cost: l => 5000 * (l + 1), desc: l => `ร้านกิลด์ขายของระดับ ${l + 1}` },
};
export const capacityAt = (hallLevel: number) => 20 + hallLevel * 10;

/** Guild skills: per level, a percentage every member gets (applied on top of their own stats). */
export const GUILD_SKILLS: Record<GuildSkillId, { name: string; icon: string; per: number; stat: "atk" | "hp" | "def" | "gain"; desc: string; cost: (lvl: number) => number }> = {
  might:     { name: "Might", icon: "⚔", per: 2, stat: "atk", desc: "ATK / MATK", cost: l => 2500 * (l + 1) },
  fortitude: { name: "Fortitude", icon: "❤", per: 3, stat: "hp", desc: "HP สูงสุด", cost: l => 2500 * (l + 1) },
  warding:   { name: "Warding", icon: "🛡", per: 2, stat: "def", desc: "DEF", cost: l => 2500 * (l + 1) },
  fortune:   { name: "Fortune", icon: "✨", per: 2, stat: "gain", desc: "EXP และทองที่ได้", cost: l => 3500 * (l + 1) },
};
export const skillCap = (trainingLevel: number) => trainingLevel * 2 + 2;

/** Guild shop: bought with the member's own contribution points; the Market's level opens higher tiers. */
export const GUILD_SHOP: { item: string; points: number; tier: number }[] = [
  { item: "REVIVE_SCROLL", points: 20, tier: 0 }, { item: "GREATER_HP_POTION", points: 8, tier: 0 }, { item: "GREATER_MP_POTION", points: 8, tier: 0 },
  { item: "GUILD_CAPE", points: 150, tier: 1 }, { item: "SKILLBOOK_LIGHTNING", points: 400, tier: 2 }, { item: "SKILLBOOK_FLAME_BLADE", points: 400, tier: 2 },
  { item: "MOUNT_DRAGON", points: 900, tier: 3 },
];
export const POINTS_PER_GOLD = 1 / 10;   // 10 gold donated = 1 contribution point

export interface Member { name: string; rank: Rank; contrib: number; points: number }
export interface Guild {
  id: string; name: string; funds: number; members: Record<string, Member>;   // uid -> member
  buildings: Record<BuildingId, number>; skills: Record<GuildSkillId, number>; created: number;
  apps?: Record<string, { name: string; level: number; t: number }>;   // uid -> applicant waiting for a leader/officer
}
/** One line of the guild finder. */
export interface GuildSummary { id: string; name: string; members: number; capacity: number; leader: string; hall: number; funds: number; applied: boolean }
export interface GuildBonus { atk: number; hp: number; def: number; gain: number }   // fractions, e.g. 0.06
export const NO_BONUS: GuildBonus = { atk: 0, hp: 0, def: 0, gain: 0 };

type Result = { ok: true; guild: Guild } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export class GuildBook {
  guilds = new Map<string, Guild>();
  private byMember = new Map<string, string>();   // uid -> guild id
  constructor(data?: Guild[]) { for (const g of data ?? []) this.put(g); }
  private put(g: Guild) { this.guilds.set(g.id, g); for (const uid of Object.keys(g.members)) this.byMember.set(uid, g.id); }
  toJSON(): Guild[] { return [...this.guilds.values()]; }

  of(uid: string) { const id = this.byMember.get(uid); return id ? this.guilds.get(id) : undefined; }
  capacity(g: Guild) { return capacityAt(g.buildings.hall); }
  bonus(uid: string): GuildBonus {
    const g = this.of(uid); if (!g) return NO_BONUS;
    const b = { ...NO_BONUS };
    for (const [id, lvl] of Object.entries(g.skills) as [GuildSkillId, number][]) b[GUILD_SKILLS[id].stat] += GUILD_SKILLS[id].per * lvl / 100;
    return b;
  }
  private can(uid: string, g: Guild, rank: Rank[]) { return rank.includes(g.members[uid]?.rank); }

  /** Found a guild (the caller has already taken GUILD_COST gold). Names are 3–16 characters and unique. */
  create(uid: string, who: string, name: string, now = Date.now()): Result {
    name = name.trim().replace(/\s+/g, " ");
    if (this.of(uid)) return fail("อยู่ในกิลด์อยู่แล้ว");
    if (name.length < 3 || name.length > 16) return fail("ชื่อกิลด์ 3–16 ตัวอักษร");
    if ([...this.guilds.values()].some(g => g.name.toLowerCase() === name.toLowerCase())) return fail("ชื่อนี้มีคนใช้แล้ว");
    const g: Guild = { id: `gd${now.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, name, funds: 0, members: { [uid]: { name: who, rank: "leader", contrib: 0, points: 0 } },
      buildings: { hall: 0, training: 0, market: 0 }, skills: { might: 0, fortitude: 0, warding: 0, fortune: 0 }, created: now };
    this.put(g); return { ok: true, guild: g };
  }
  join(guildId: string, uid: string, who: string): Result {
    const g = this.guilds.get(guildId); if (!g) return fail("ไม่พบกิลด์");
    if (this.of(uid)) return fail("อยู่ในกิลด์อื่นอยู่แล้ว");
    if (Object.keys(g.members).length >= this.capacity(g)) return fail(`กิลด์เต็ม (${this.capacity(g)} คน) — อัปหอกิลด์เพื่อรับเพิ่ม`);
    g.members[uid] = { name: who, rank: "member", contrib: 0, points: 0 }; this.byMember.set(uid, g.id); return { ok: true, guild: g };
  }
  /** Leave; a leaving leader hands over to the top contributor, and the last member out disbands the guild. */
  leave(uid: string): Result {
    const g = this.of(uid); if (!g) return fail("ไม่ได้อยู่ในกิลด์");
    const wasLeader = g.members[uid].rank === "leader"; delete g.members[uid]; this.byMember.delete(uid);
    const rest = Object.entries(g.members);
    if (!rest.length) { this.guilds.delete(g.id); return { ok: true, guild: g }; }
    if (wasLeader) rest.sort((a, b) => b[1].contrib - a[1].contrib)[0][1].rank = "leader";
    return { ok: true, guild: g };
  }
  kick(uid: string, target: string): Result {
    const g = this.of(uid); if (!g || !g.members[target] || uid === target) return fail("ทำไม่ได้");
    const me = g.members[uid].rank, them = g.members[target].rank;
    if (!(me === "leader" || (me === "officer" && them === "member"))) return fail("ไม่มีสิทธิ์เชิญออก");
    delete g.members[target]; this.byMember.delete(target); return { ok: true, guild: g };
  }
  promote(uid: string, target: string, rank: "officer" | "member"): Result {
    const g = this.of(uid); if (!g || !g.members[target] || uid === target) return fail("ทำไม่ได้");
    if (g.members[uid].rank !== "leader") return fail("หัวหน้ากิลด์เท่านั้น");
    g.members[target].rank = rank; return { ok: true, guild: g };
  }
  /** Gold into the treasury (the caller has taken it from the donor); the donor earns contribution and shop points. */
  donate(uid: string, gold: number): Result {
    const g = this.of(uid); if (!g) return fail("ไม่ได้อยู่ในกิลด์");
    if (!Number.isInteger(gold) || gold < 1) return fail("จำนวนไม่ถูกต้อง");
    g.funds += gold; const m = g.members[uid]; m.contrib += gold; m.points += Math.floor(gold * POINTS_PER_GOLD); return { ok: true, guild: g };
  }
  upgrade(uid: string, b: BuildingId): Result {
    const g = this.of(uid); if (!g || !BUILDINGS[b]) return fail("ทำไม่ได้");
    if (!this.can(uid, g, ["leader", "officer"])) return fail("หัวหน้า/รองหัวหน้าเท่านั้น");
    const lvl = g.buildings[b]; if (lvl >= BUILDINGS[b].max) return fail("เลเวลสูงสุดแล้ว");
    const cost = BUILDINGS[b].cost(lvl); if (g.funds < cost) return fail(`คลังกิลด์ไม่พอ (ต้องใช้ ${cost})`);
    g.funds -= cost; g.buildings[b] = lvl + 1; return { ok: true, guild: g };
  }
  learn(uid: string, s: GuildSkillId): Result {
    const g = this.of(uid); if (!g || !GUILD_SKILLS[s]) return fail("ทำไม่ได้");
    if (!this.can(uid, g, ["leader", "officer"])) return fail("หัวหน้า/รองหัวหน้าเท่านั้น");
    const lvl = g.skills[s]; if (lvl >= skillCap(g.buildings.training)) return fail("ต้องอัปลานฝึกก่อน");
    const cost = GUILD_SKILLS[s].cost(lvl); if (g.funds < cost) return fail(`คลังกิลด์ไม่พอ (ต้องใช้ ${cost})`);
    g.funds -= cost; g.skills[s] = lvl + 1; return { ok: true, guild: g };
  }
  /** Spend contribution points on a shop entry; returns the item to hand over. */
  buy(uid: string, item: string): { ok: true; guild: Guild; item: string } | { ok: false; error: string } {
    const g = this.of(uid); if (!g) return fail("ไม่ได้อยู่ในกิลด์") as { ok: false; error: string };
    const e = GUILD_SHOP.find(e => e.item === item); if (!e) return { ok: false, error: "ไม่มีของนี้" };
    if (e.tier > g.buildings.market) return { ok: false, error: "ต้องอัปตลาดกิลด์ก่อน" };
    const m = g.members[uid]; if (m.points < e.points) return { ok: false, error: `แต้มกิลด์ไม่พอ (ต้องใช้ ${e.points})` };
    m.points -= e.points; return { ok: true, guild: g, item };
  }
  /** Refund points if the item could not be handed over (a full bag). */
  refund(uid: string, item: string) { const g = this.of(uid), e = GUILD_SHOP.find(e => e.item === item); if (g && e) g.members[uid].points += e.points; }
  rename(uid: string, name: string) { const g = this.of(uid); if (g?.members[uid]) g.members[uid].name = name; }

  // ---- the guild finder: look guilds up, apply, and let a leader or officer take or turn down the applicants
  list(uid: string, q = ""): GuildSummary[] {
    const key = q.trim().toLowerCase();
    return [...this.guilds.values()].filter(g => !key || g.name.toLowerCase().includes(key)).map(g => ({ id: g.id, name: g.name, members: Object.keys(g.members).length, capacity: this.capacity(g),
      leader: Object.values(g.members).find(m => m.rank === "leader")?.name ?? "", hall: g.buildings.hall, funds: g.funds, applied: !!g.apps?.[uid] }))
      .sort((a, b) => b.members - a.members || b.hall - a.hall || a.name.localeCompare(b.name));
  }
  apply(guildId: string, uid: string, who: string, level: number, now = Date.now()): Result {
    const g = this.guilds.get(guildId); if (!g) return fail("ไม่พบกิลด์");
    if (this.of(uid)) return fail("อยู่ในกิลด์อยู่แล้ว");
    if (Object.keys(g.members).length >= this.capacity(g)) return fail("กิลด์นี้เต็มแล้ว");
    for (const o of this.guilds.values()) delete o.apps?.[uid];   // one application at a time
    (g.apps ??= {})[uid] = { name: who, level, t: now }; return { ok: true, guild: g };
  }
  approve(uid: string, applicant: string): Result {
    const g = this.of(uid); if (!g) return fail("ไม่ได้อยู่ในกิลด์");
    if (!this.can(uid, g, ["leader", "officer"])) return fail("หัวหน้า/รองหัวหน้าเท่านั้น");
    const a = g.apps?.[applicant]; if (!a) return fail("ไม่มีใบสมัครนี้");
    delete g.apps![applicant]; return this.join(g.id, applicant, a.name);
  }
  reject(uid: string, applicant: string): Result {
    const g = this.of(uid); if (!g) return fail("ไม่ได้อยู่ในกิลด์");
    if (!this.can(uid, g, ["leader", "officer"])) return fail("หัวหน้า/รองหัวหน้าเท่านั้น");
    delete g.apps?.[applicant]; return { ok: true, guild: g };
  }
}
