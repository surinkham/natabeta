import { describe, expect, it } from "vitest";
import { rollDrops } from "../loot";
import { validateData } from "../validate";

describe("drops (spec §5.14)", () => {
  it("chance 0.6 lands within 55–65% over 10000 rolls; counts within [min,max]", () => {
    let s = 12345; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let fang = 0;
    for (let i = 0; i < 10000; i++) {
      const r = rollDrops("DROP_WOLF", rng); if (r.items.WOLF_FANG) { fang++; expect(r.items.WOLF_FANG).toBeGreaterThanOrEqual(1); expect(r.items.WOLF_FANG).toBeLessThanOrEqual(2); }
      expect(r.gold).toBeGreaterThanOrEqual(5); expect(r.gold).toBeLessThanOrEqual(15);
    }
    expect(fang / 10000).toBeGreaterThan(0.55); expect(fang / 10000).toBeLessThan(0.65);
  });
});
describe("data tables", () => { it("validate: no dangling references", () => { expect(validateData()).toEqual([]); }); });
