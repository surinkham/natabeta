// Player persistence. FileStore (one JSON per account under server/data/) is the zero-setup default; PgStore when
// DATABASE_URL is set (table auto-created). Both are keyed by the account id derived from the guest token.
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import type { Saved } from "../shared/sim";

export interface Store { load(id: string): Promise<Saved | undefined>; save(id: string, data: Saved): Promise<void>; close?(): Promise<void> }

/** Guest token (random string kept in the browser) → stable account id. The token itself is never stored. */
export const accountId = (token: string) => createHash("sha256").update(token).digest("hex").slice(0, 24);

export class FileStore implements Store {
  constructor(private dir: string) {}
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
  async close() { await this.pool.end(); }
}

export const openStore = (): Store => process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore(process.env.BKO_DATA ?? join(process.cwd(), "server", "data"));
