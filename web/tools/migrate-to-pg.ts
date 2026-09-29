// One-off: copy every FileStore save (BKO_DATA, one JSON per account) into Postgres (DATABASE_URL). Idempotent (upsert),
// read-only on the files; afterwards it reads every record back and compares. The guild book is "guilds.json" on disk
// (FileStore strips non-alphanumerics from ids) and "__guilds" in the table.
//   BKO_DATA=/var/lib/beastkingdom DATABASE_URL=postgresql://bko@/beastkingdom?host=/var/run/postgresql tsx tools/migrate-to-pg.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { PgStore } from "../server/store";

const dir = process.env.BKO_DATA!, url = process.env.DATABASE_URL!;
if (!dir || !url) throw new Error("set BKO_DATA and DATABASE_URL");
const pg = new PgStore(url);
const files = readdirSync(dir).filter(f => f.endsWith(".json"));
let bad = 0;
for (const f of files) {
  const id = f === "guilds.json" ? "__guilds" : f.slice(0, -5), data = JSON.parse(readFileSync(join(dir, f), "utf8"));
  await pg.save(id, data);
  const back = await pg.load(id);
  if (!isDeepStrictEqual(back, data)) { bad++; console.log("MISMATCH", id); }   // jsonb reorders keys: compare values, not text
}
console.log(`copied ${files.length} records, ${bad} mismatches`);
await pg.close();
process.exit(bad ? 1 : 0);
