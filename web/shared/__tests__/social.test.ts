import { describe, expect, it } from "vitest";
import { FriendBook } from "../friends";
import { GuildBook } from "../guild";
import { Sim } from "../sim";

describe("friends", () => {
  it("request → accept makes both friends; asking back accepts; remove clears both", () => {
    const f = new FriendBook();
    expect(f.request("a", "Ann", "b", "Bob")).toBeUndefined(); expect(f.entry("b").pending.a).toBe("Ann");
    expect(f.accept("b", "Bob", "a")).toBeUndefined(); expect(f.entry("a").friends.b).toBe("Bob"); expect(f.entry("b").friends.a).toBe("Ann");
    f.remove("a", "b"); expect(f.entry("b").friends.a).toBeUndefined();
    f.request("a", "Ann", "b", "Bob"); expect(f.request("b", "Bob", "a", "Ann")).toBeUndefined(); expect(f.entry("a").friends.b).toBe("Bob");   // mutual request
    expect(new FriendBook(JSON.parse(JSON.stringify(f.toJSON()))).entry("b").friends.a).toBe("Ann");   // survives the store
  });
  it("in the sim: friendAdd from the player menu, the view lists who is online", () => {
    const sim = new Sim() as any, a = sim.join("a", { name: "Ann", color: 1 }), b = sim.join("b", { name: "Bob", color: 1 }); a.uid = "ua"; b.uid = "ub";
    sim.friendAdd("a", "b"); sim.drain(); sim.friendAccept("b", "ua"); const ev = sim.drain().filter((e: any) => e.t === "friends" && e.pid === "b");
    expect(ev.at(-1).view.friends[0]).toMatchObject({ name: "Ann", online: true });
  });
});
describe("guild finder", () => {
  it("apply, then a leader approves; one application at a time", () => {
    const g = new GuildBook(), r = g.create("L", "Leader", "Wolves") as any, r2 = g.create("M", "Other", "Foxes") as any;
    expect(g.list("x").map(s => s.name).sort()).toEqual(["Foxes", "Wolves"]);
    expect(g.apply(r.guild.id, "x", "Newbie", 5).ok).toBe(true); expect(g.apply(r2.guild.id, "x", "Newbie", 5).ok).toBe(true);
    expect(g.guilds.get(r.guild.id)!.apps?.x).toBeUndefined();   // moved to the second guild
    expect(g.approve("L", "x").ok).toBe(false); expect(g.approve("M", "x").ok).toBe(true); expect(g.of("x")?.name).toBe("Foxes");
  });
});
