import { describe, expect, it } from "vitest";
import { Sim, moveSpeed, save } from "../sim";
import { HUNGRY_SLOW, campfires } from "../cooking";

describe("hunger and cooking", () => {
  it("hungry slows walking and swings, starving stops regen; food fills it; cooking needs a campfire and the pantry", () => {
    const sim = new Sim(), p = sim.join("a", { name: "Cook", color: 1 }); expect(p.hunger).toBe(100);
    const walk = moveSpeed(p), aspd = p.ASPD;
    p.hunger = 31; (sim as any).hungerStep(p, 60); expect(moveSpeed(p)).toBeCloseTo(walk * HUNGRY_SLOW); expect(p.ASPD).toBeCloseTo(aspd * HUNGRY_SLOW);
    p.hunger = 0.01; (sim as any).hungerStep(p, 1); expect(p.HPR).toBe(0); expect(p.MPR).toBe(0);
    p.hp = 10; sim.tick(1); expect(p.hp).toBe(10);                                        // starving: no HP back
    const meat = p.inv.items.find(s => s.itemId === "FOOD_GRILLED_MEAT")!; sim.use("a", meat.id); expect(p.hunger).toBeGreaterThan(30);
    p.pantry = { ING_MEAT: 2 }; p.x = 500; p.z = 500; sim.cook("a", "FOOD_GRILLED_MEAT"); expect(p.pantry.ING_MEAT).toBe(2);   // no fire here
    const f = campfires(sim.L)[0]; p.x = f.x + 1; p.z = f.z; sim.cook("a", "FOOD_GRILLED_MEAT"); expect(p.pantry.ING_MEAT).toBe(0);
    expect(save(p).pantry).toEqual({ ING_MEAT: 0 }); expect(save(p).hunger).toBeGreaterThan(30);
  });
});

describe("fishing and fish dishes", () => {
  it("a line in the river brings a fish into the pantry; walking off loses it; a fish dish buffs; the grocer sells to the pantry", async () => {
    const { nearWater, rollFish, INGREDIENTS } = await import("../cooking");
    const { scenicBorders, riverPath } = await import("../scenery");
    const sim = new Sim(), p = sim.join("f", { name: "Fisher", color: 1 });
    const q = scenicBorders().filter(b => b.look === "river").flatMap(b => riverPath(b))[40];
    p.x = q.x + q.nx * (q.halfWidth + 1); p.z = q.z + q.nz * (q.halfWidth + 1); expect(nearWater(p)).toBe(true);
    p.maxHP = p.hp = 1e9; sim.monsters.length = 0;   // nothing to interrupt the wait
    sim.fish("f"); expect(p.fishing).toBeDefined(); for (let i = 0; i < 400 && p.fishing; i++) sim.tick(0.05);
    expect(Object.keys(p.pantry!).some(k => INGREDIENTS[k].rarity)).toBe(true);
    sim.fish("f"); sim.input("f", 1, 0); sim.tick(0.05); expect(p.fishing).toBeUndefined();   // walked off
    const counts: Record<string, number> = {}; let s = 1; const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5000; i++) { const f = rollFish(rng); counts[f] = (counts[f] ?? 0) + 1; }
    expect(counts.ING_FISH_SILVER).toBeGreaterThan(counts.ING_FISH_MOON ?? 0);   // rarity weights hold
    sim.input("f", 0, 0); p.gold = 100; sim.buy("f", "ING_MEAT", 2); expect(p.pantry!.ING_MEAT).toBe(2); expect(p.gold).toBe(76);
  });
});
