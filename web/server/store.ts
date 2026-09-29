// Player persistence. FileStore (one JSON per account under server/data/) is the zero-setup default; PgStore when
// DATABASE_URL is set (table auto-created). Both are keyed by the account id derived from the guest token.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import type { Saved } from "../shared/sim";

export interface Store {
  load(id: string): Promise<Saved | undefined>; save(id: string, data: Saved): Promise<void>; close?(): Promise<void>;
  /** Every saved character (for the rankings); records whose id starts with "__" are server books, not players. */
  all?(): Promise<Saved[]>;
  /** Remove a record for good (a character whose deletion came due). */
  remove?(id: string): Promise<void>;
}

/** Names compare without case or spacing differences ("Admin", " admin ", "ADMIN" are one name). */
export const nameKey = (n: string) => n.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
/** Names nobody may take (a player called "admin" would pass for staff). */
export const RESERVED_NAMES = new Set(["admin", "administrator", "gm", "system", "ระบบ", "แอดมิน"]);

/** Guest token (random string kept in the browser) → stable account id. The token itself is never stored. */
export const accountId = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 24);
export const CHARACTER_SLOTS = 3;
/** Slot 0 deliberately keeps the old account key, so every existing character becomes slot 1 without a migration. */
export const characterKey = (account: string, slot: number) => slot === 0 ? account : `${account}_c${slot + 1}`;
export const cleanSlot = (slot: unknown) => Math.max(0, Math.min(CHARACTER_SLOTS - 1, Number.isInteger(slot) ? Number(slot) : 0));
export interface CharacterSummary { slot: number; name: string; race: string; color: number; level: number; deleteAt?: number }
/** A deleted character waits this long (and can be taken back) before it is gone for good. */
export const DELETE_DELAY_MS = 3 * 24 * 3600 * 1000;
/** The account's slots. A character whose deletion came due is removed here, for good (`forget` drops it from the
 *  server's guild and friend books). */
export async function characterSummaries(store: Store, account: string, forget?: (s: Saved) => void, now = Date.now()): Promise<Array<CharacterSummary | null>> {
  return Promise.all(Array.from({ length: CHARACTER_SLOTS }, async (_, slot) => {
    const key = characterKey(account, slot), s = await store.load(key);
    if (s?.deleteAt && s.deleteAt <= now && store.remove) { await store.remove(key); forget?.(s); return null; }
    return s ? { slot, name: s.name, race: s.race, color: s.furColor ?? 0, level: s.level ?? 1, ...(s.deleteAt ? { deleteAt: s.deleteAt } : {}) } : null;
  }));
}
/** Ask for a slot's character to be deleted in DELETE_DELAY_MS, or (`cancel`) take the request back. */
export async function markDelete(store: Store, account: string, slot: number, cancel: boolean, now = Date.now()) {
  const key = characterKey(account, cleanSlot(slot)), s = await store.load(key); if (!s) return false;
  if (cancel) delete s.deleteAt; else s.deleteAt = now + DELETE_DELAY_MS;
  await store.save(key, s); return true;
}
export async function linkCharacters(store: Store, from: string, to: string) {
  for (let slot = 0; slot < CHARACTER_SLOTS; slot++) {
    const target = characterKey(to, slot);
    if (!(await store.load(target))) { const source = await store.load(characterKey(from, slot)); if (source) await store.save(target, source); }
  }
}

export class FileStore implements Store {
  constructor(private dir: string) {}
  async remove(id: string) { await fs.rm(this.file(id), { force: true }); }
  async all() { const out: Saved[] = []; for (const f of await fs.readdir(this.dir).catch(() => [] as string[])) if (f.endsWith(".json") && !f.startsWith("__") && !f.startsWith("guilds")) { try { out.push(JSON.parse(await fs.readFile(join(this.dir, f), "utf8"))); } catch {} } return out; }
  private file(id: string) { return join(this.dir, `${id.replace(/[^a-z0-9]/gi, "")}.json`); }
  async load(id: string) { try { return JSON.parse(await fs.readFile(this.file(id), "utf8")) as Saved; } catch { return undefined; } }
  async save(id: string, data: Saved) { await fs.mkdir(this.dir, { recursive: true }); const tmp = this.file(id) + ".tmp"; await fs.writeFile(tmp, JSON.stringify(data)); await fs.rename(tmp, this.file(id)); }
}

export class PgStore implements Store {
  private pool: pg.Pool; private ready: Promise<unknown>;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url });
    this.ready = this.pool.query("CREATE TABLE IF NOT EXISTS players (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  }
  async load(id: string) { await this.ready; const r = await this.pool.query("SELECT data FROM players WHERE id = $1", [id]); return r.rows[0]?.data as Saved | undefined; }
  async save(id: string, data: Saved) { await this.ready; await this.pool.query("INSERT INTO players (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [id, JSON.stringify(data)]); }
  async all() { await this.ready; const r = await this.pool.query("SELECT data FROM players WHERE id NOT LIKE '\\_\\_%'"); return r.rows.map(x => x.data as Saved); }
  async remove(id: string) { await this.ready; await this.pool.query("DELETE FROM players WHERE id = $1", [id]); }
  async close() { await this.pool.end(); }
}

export const openStore = (): Store => process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore(process.env.BKO_DATA ?? join(process.cwd(), "server", "data"));
