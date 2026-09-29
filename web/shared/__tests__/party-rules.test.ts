import { describe, expect, it } from "vitest";
import { Sim } from "../sim";

describe("party rules", () => {
  it("the leader sets EXP/loot sharing for everyone; EXP 'each' keeps a kill's EXP with the killer", () => {
    const sim = new Sim(), a = sim.join("a", { name: "A", color: 1 }), b = sim.join("b", { name: "B", color: 1 }), c = sim.join("c", { name: "C", color: 1 });
    sim.partyInvite("a", "b"); sim.partyAccept("b"); sim.partyInvite("a", "c"); sim.partyAccept("c");
    expect(b.partyRule).toEqual({ exp: "share", loot: "party" });
    sim.partyRules("b", "each", "own"); expect(a.partyRule!.exp).toBe("share");   // only the leader
    sim.partyRules("a", "each", "own"); expect([a, b, c].map(p => p.partyRule!.loot)).toEqual(["own", "own", "own"]);
    const e0 = b.exp; (sim as any).shareExp(a, 10); expect(b.exp).toBe(e0);
    sim.partyRules("a", "share", "party"); (sim as any).shareExp(a, 10); expect(b.exp).toBeGreaterThan(e0);
    sim.partyRules("a", "each", "random"); sim.partyLeave("a"); expect(b.partyRule).toEqual({ exp: "each", loot: "random" }); expect(a.partyRule).toBeUndefined();
  });
});
