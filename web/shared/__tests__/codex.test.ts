import { describe, expect, it } from "vitest";
import { codexIds, itemSources, monsterInfo, skillSources } from "../codex";
import { MONSTERS } from "../data";

// The codex reads the game data: if an item can no longer be got anywhere, or a beast lives nowhere, it shows here.
describe("codex", () => {
  it("every weapon, piece of gear and item can be got somewhere", () => {
    const none = [...codexIds("weapon"), ...codexIds("gear"), ...codexIds("item")].filter(id => !itemSources(id).length);
    expect(none).toEqual([]);
  });
  it("every ordinary monster lives in some map and drops something", () => {
    for (const k of codexIds("monster").filter(k => !MONSTERS[k].boss && !(MONSTERS[k] as { night?: boolean }).night)) {
      const m = monsterInfo(k); expect(m.zones.length, k).toBeGreaterThan(0); expect(m.drops.length, k).toBeGreaterThan(0);
    }
  });
  it("skills name where they are learned", () => {
    expect(skillSources("SKILL_SLASH")[0].kind).toBe("start");
    expect(skillSources("SKILL_LIGHTNING").some(s => s.kind === "book" || s.kind === "shop")).toBe(true);
  });
});
