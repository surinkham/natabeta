import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore, PgStore, accountId, characterKey, characterSummaries, linkCharacters, markDelete, DELETE_DELAY_MS } from "./store";
import { Sim, save } from "../shared/sim";

const sample = () => { const s = new Sim(); const p = s.join("p", { name: "Zed", color: 5 }); p.gold = 123; return save(p); };

describe("store", () => {
  it("accountId is stable and never the token", () => { expect(accountId("abc")).toBe(accountId("abc")); expect(accountId("abc")).not.toContain("abc"); expect(accountId("abc")).not.toBe(accountId("abd")); });
  it("FileStore round-trips and returns undefined for unknown ids", async () => {
    const st = new FileStore(mkdtempSync(join(tmpdir(), "bko-store-")));
    expect(await st.load("nope")).toBeUndefined(); const d = sample(); await st.save("a1", d); expect(await st.load("a1")).toEqual(d);
    d.gold = 9; await st.save("a1", d); expect((await st.load("a1"))!.gold).toBe(9);
  });
  it("keeps the legacy character in slot 1 and saves three independent slots", async () => {
    const st = new FileStore(mkdtempSync(join(tmpdir(), "bko-slots-"))), acc = "account1";
    const one = sample(), two = sample(), three = sample(); one.name = "Old Hero"; two.name = "Second"; two.level = 8; three.name = "Third"; three.level = 12;
    await st.save(acc, one); await st.save(characterKey(acc, 1), two); await st.save(characterKey(acc, 2), three);
    expect(characterKey(acc, 0)).toBe(acc);
    expect(await characterSummaries(st, acc)).toEqual([
      expect.objectContaining({ slot: 0, name: "Old Hero" }), expect.objectContaining({ slot: 1, name: "Second", level: 8 }), expect.objectContaining({ slot: 2, name: "Third", level: 12 })
    ]);
  });
  it("links every guest slot without overwriting an existing Google slot", async () => {
    const st = new FileStore(mkdtempSync(join(tmpdir(), "bko-link-slots-"))), guest = "guest", google = "google";
    const a = sample(), b = sample(), keep = sample(); a.name = "A"; b.name = "B"; keep.name = "Keep";
    await st.save(guest, a); await st.save(characterKey(guest, 1), b); await st.save(google, keep); await linkCharacters(st, guest, google);
    expect((await st.load(google))?.name).toBe("Keep"); expect((await st.load(characterKey(google, 1)))?.name).toBe("B");
  });
  // Runs only when a Postgres is reachable: TEST_DATABASE_URL=postgres://postgres:bko@localhost:5433/bko
  it.skipIf(!process.env.TEST_DATABASE_URL)("PgStore upserts", async () => {
    const st = new PgStore(process.env.TEST_DATABASE_URL!); const id = "t" + Date.now();
    expect(await st.load(id)).toBeUndefined(); const d = sample(); await st.save(id, d); expect(await st.load(id)).toEqual(d);
    d.level = 4; await st.save(id, d); expect((await st.load(id))!.level).toBe(4); await st.close();
  });
  it("deletes a character only after the 3-day wait, and the wait can be cancelled", async () => {
    const st = new FileStore(mkdtempSync(join(tmpdir(), "bko-del-"))), acc = "acc-del", key = characterKey(acc, 1), t = 1_000_000, gone: string[] = [];
    await st.save(key, sample()); await markDelete(st, acc, 1, false, t);
    expect((await characterSummaries(st, acc, s => gone.push(s.name), t + DELETE_DELAY_MS - 1))[1]?.deleteAt).toBe(t + DELETE_DELAY_MS);
    await markDelete(st, acc, 1, true, t); expect((await st.load(key))!.deleteAt).toBeUndefined();
    expect((await characterSummaries(st, acc, undefined, t + 10 * DELETE_DELAY_MS))[1]?.name).toBe("Zed");
    await markDelete(st, acc, 1, false, t); expect((await characterSummaries(st, acc, s => gone.push(s.name), t + DELETE_DELAY_MS))[1]).toBeNull();
    expect(await st.load(key)).toBeUndefined(); expect(gone).toEqual(["Zed"]);
  });
});
