import { describe, expect, it } from "vitest";
import { Sim, save } from "../sim";

describe("mail", () => {
  it("every character gets the welcome mail once, claims it once, and can then delete it", () => {
    const sim = new Sim(), p = sim.join("a", { name: "Mia", color: 1 }), g0 = p.gold;
    const m = p.mail!.find(x => x.id === "welcome-500k")!; expect(m.gold).toBe(500000);
    sim.mailDelete("a", m.id); expect(p.mail).toContain(m);   // unclaimed gifts can't be thrown away
    sim.mailClaim("a", m.id); expect(p.gold).toBe(g0 + 500000);
    sim.mailClaim("a", m.id); expect(p.gold).toBe(g0 + 500000);   // no second helping
    const again = new Sim().join("b", { name: "Mia", color: 1 }, save(p)); expect(again.mail!.filter(x => x.id === m.id)).toHaveLength(1);
    sim.mailDelete("a", m.id); expect(p.mail).not.toContain(m);
    expect(new Sim().join("c", { name: "Mia", color: 1 }, save(p)).mail!.some(x => x.id === m.id)).toBe(false);   // gone for good
  });
});
