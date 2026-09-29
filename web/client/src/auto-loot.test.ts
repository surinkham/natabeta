import { describe, expect, it } from "vitest";
import { pickLoot } from "./auto-loot";

describe("auto loot pick", () => {
  const me = { id: "me", x: 0, z: 0, party: "p1" }, party = (id: string) => (id === "mate" ? "p1" : undefined);
  const d = (id: string, x: number, extra: object = {}) => ({ view: { id, gold: 0, x, z: 0, owner: "me", ...extra } });
  const all = { items: true, gold: true, range: 12 };
  it("takes the nearest one this player may have", () => {
    const list = [d("far", 8), d("stranger", 1, { owner: "zz" }), d("near", 3)];
    expect(pickLoot(list, me, party, all, new Map(), 0)?.view.id).toBe("near");                 // not a stranger's, however close
    expect(pickLoot([d("mate", 2, { owner: "mate" })], me, party, all, new Map(), 0)?.view.id).toBe("mate");   // a party mate's
    expect(pickLoot([d("free", 2, { owner: "zz", free: true })], me, party, all, new Map(), 0)?.view.id).toBe("free");   // owner window over
  });
  it("only the ticked kinds, only in range, not one just tried", () => {
    const coins = d("coins", 2, { gold: 50 }), bag = d("bag", 4);
    expect(pickLoot([coins, bag], me, party, { ...all, gold: false }, new Map(), 0)?.view.id).toBe("bag");
    expect(pickLoot([coins, bag], me, party, { ...all, items: false }, new Map(), 0)?.view.id).toBe("coins");
    expect(pickLoot([coins, bag], me, party, { items: false, gold: false, range: 12 }, new Map(), 0)).toBeNull();
    expect(pickLoot([d("x", 20)], me, party, all, new Map(), 0)).toBeNull();
    expect(pickLoot([coins, bag], me, party, all, new Map([["coins", 5000]]), 1000)?.view.id).toBe("bag");
  });
});
