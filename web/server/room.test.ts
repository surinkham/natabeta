import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { Server } from "@colyseus/core";
import { applyMobs, type MobView, type MobsMsg } from "../shared/mobwire";
import { MapRoom } from "./room";
import { FileStore, accountId } from "./store";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "bko-")); MapRoom.store = new FileStore(tmp);

let srv: ColyseusTestServer;
beforeAll(async () => { srv = await boot({ initializeGameServer: (s: Server) => { s.define("map", MapRoom); } }); });
afterAll(async () => { await srv.shutdown(); });

describe("MapRoom", () => {
  it("two clients see each other, both hit the same wolf, loot goes to one killer, reconnect keeps state", async () => {
    const room = (await srv.createRoom("map", {})) as unknown as MapRoom;
    const R = room as any; const a = await srv.connectTo(R, { name: "Ann", color: 1, token: "token-ann-12345" }), b = await srv.connectTo(R, { name: "Bob", color: 2, token: "token-bob-12345" });
    // wait for the patches rather than counting them: under load (the whole suite at once, a world of 2k monsters)
    // the first patch after a join can come a tick or two late
    const until = async (ok: () => boolean, patches = 60) => { for (let i = 0; i < patches && !ok(); i++) await R.waitForNextPatch(); };
    await until(() => a.state.players.size === 2 && b.state.players.get(a.sessionId)?.name === "Ann");
    expect(a.state.players.size).toBe(2); expect(b.state.players.get(a.sessionId)?.name).toBe("Ann");

    // teleport both next to wolf m0 (server side; there is no client teleport) and weaken it
    const m = room.sim.monsters[0]; m.hp = 6;
    for (const o of room.sim.monsters) if (o !== m && Math.hypot(o.x - m.x, o.z - m.z) < 30) { o.x = o.home.x = m.x + 500; }   // only the one wolf in reach (its pack would die to the same swing)
    for (const id of [a.sessionId, b.sessionId]) { const p = room.sim.players.get(id)!; p.x = m.x; p.z = m.z + 1; p.yaw = Math.PI; p.STR = 50; p.DEX = 200; (room.sim as any).sync(p); }
    const evA: any[] = [], evB: any[] = []; a.onMessage("ev", (e: any[]) => evA.push(...e)); b.onMessage("ev", (e: any[]) => evB.push(...e));
    const meA: any[] = [], meB: any[] = []; b.onMessage("me", (s: any) => meB.push(s));
    const mobsA = new Map<number, MobView>(); a.onMessage("mobs", (msg: MobsMsg) => applyMobs(mobsA, msg));   // A only gets monsters near it
    const hello = await new Promise<any>(res => { a.onMessage("me", (s: any) => { meA.push(s); res(s); }); a.send("hello"); }); expect(hello.name).toBe("Ann");
    const swing = async (c: typeof a) => { c.send("act", "SKILL_BASIC"); await R.waitForMessage("act"); for (let i = 0; i < 8; i++) await R.waitForNextPatch(); };   // the hit lands on the clip's contact frame
    await swing(a);
    await swing(b);
    expect(mobsA.get(0)?.kind).toBe(m.kind);   // the wolf next to A arrived in full after "hello"
    await until(() => mobsA.get(0)?.alive === false);
    expect(m.alive).toBe(false); expect(mobsA.get(0)!.alive).toBe(false);
    expect(mobsA.size).toBeLessThan(room.sim.monsters.length / 4);   // and only the neighbourhood, not the world
    const kills = [...evA, ...evB].filter(e => e.t === "kill"); expect(kills).toHaveLength(1);
    const killer = kills[0].pid, K = room.sim.players.get(killer)!, other = room.sim.players.get(killer === a.sessionId ? b.sessionId : a.sessionId)!;
    expect(K.exp).toBe(20); expect(other.exp).toBe(0);
    const meK = (killer === a.sessionId ? meA : meB).at(-1); expect(meK.exp).toBe(20);   // owner snapshot carried it
    expect(evA.some(e => e.t === "dmg") && evB.some(e => e.t === "dmg")).toBe(true);        // public events reach both

    // reconnect: drop A without consent, come back with the token, same player object
    K.gold = 999; const gold = K.gold, token = a.reconnectionToken;
    await a.leave(false); await new Promise(r => setTimeout(r, 100));
    expect(room.sim.players.has(a.sessionId)).toBe(true);
    const a2: any = await srv.sdk.reconnect(token); await R.waitForNextPatch();
    const me2 = await new Promise<any>(res => { a2.onMessage("me", res); a2.send("hello"); }); expect(me2.gold).toBe(gold);
    expect(a2.sessionId).toBe(a.sessionId); expect(room.sim.players.get(a2.sessionId)!.gold).toBe(gold); expect(a2.state.players.size).toBe(2);
    await a2.leave(true); await b.leave(true);
  }, 15000);

  it("guest token: state survives leave + rejoin, one session per account, no token rejected", async () => {
    const room = (await srv.createRoom("map", {})) as unknown as MapRoom; const R = room as any;
    const c1 = await srv.connectTo(R, { name: "Cat", color: 3, token: "token-cat-12345" });
    const p1 = room.sim.players.get(c1.sessionId)!; p1.gold = 4321; p1.level = 7;
    await expect(srv.connectTo(R, { name: "Cat2", color: 3, token: "token-cat-12345" })).rejects.toThrow();   // already online
    await expect(srv.connectTo(R, { name: "NoTok", color: 3 })).rejects.toThrow();
    await c1.leave(true); await new Promise(r => setTimeout(r, 100));
    expect((await MapRoom.store!.load(accountId("token-cat-12345")))?.gold).toBe(4321);
    const c2 = await srv.connectTo(R, { name: "Renamed", color: 9, token: "token-cat-12345" });
    const p2 = room.sim.players.get(c2.sessionId)!; expect(p2.gold).toBe(4321); expect(p2.level).toBe(7); expect(p2.name).toBe("Cat");
    await c2.leave(true);
  }, 15000);
  it("with Google sign-in on, a guest keeps the character it has but cannot start a new one", async () => {
    const room = (await srv.createRoom("map", {})) as unknown as MapRoom; const R = room as any;
    const old = await srv.connectTo(R, { name: "Olde", color: 3, token: "token-olde-12345" }); await old.leave(true); await new Promise(r => setTimeout(r, 100));
    process.env.GOOGLE_CLIENT_ID = "test-client"; process.env.REQUIRE_GOOGLE_SIGNUP = "1";
    try {
      const back = await srv.connectTo(R, { name: "Olde", color: 3, token: "token-olde-12345" });   // this browser's character: still in
      expect(room.sim.players.get(back.sessionId)?.name).toBe("Olde"); await back.leave(true);
      await expect(srv.connectTo(R, { name: "Newbie", color: 3, token: "token-newb-12345" })).rejects.toThrow(/Google/);
    } finally { delete process.env.GOOGLE_CLIENT_ID; delete process.env.REQUIRE_GOOGLE_SIGNUP; }
  }, 15000);
  it("names may repeat but not pass for staff; markup is stripped; a returning player keeps theirs", async () => {
    const room = (await srv.createRoom("map", {})) as unknown as MapRoom; const R = room as any;
    const a = await srv.connectTo(R, { name: "Kiwi", color: 1, token: "token-kiwi-11111" });
    const twin = await srv.connectTo(R, { name: "Kiwi", color: 1, token: "token-kiwi-22222" });                          // players are told apart by account
    await expect(srv.connectTo(R, { name: " ADMIN ", color: 1, token: "token-admin-3333" })).rejects.toThrow(/ใช้ชื่อนี้ไม่ได้/);   // reserved
    const b = await srv.connectTo(R, { name: "<b>Mo</b>", color: 1, token: "token-mo-444444" });
    expect(room.sim.players.get(b.sessionId)!.name).toBe("bMo/b");   // markup characters are stripped
    await a.leave(true); await new Promise(r => setTimeout(r, 100));
    const a2 = await srv.connectTo(R, { name: "Other", color: 1, token: "token-kiwi-11111" });                            // returning: no check, saved name
    expect(room.sim.players.get(a2.sessionId)!.name).toBe("Kiwi");
    await a2.leave(true); await b.leave(true); await twin.leave(true);
  }, 15000);
  it("trade over the wire: request → accept → offers → confirms → swap", async () => {
    const room = (await srv.createRoom("map", {})) as unknown as MapRoom; const R = room as any;
    const a = await srv.connectTo(R, { name: "Ta", color: 1, token: "token-ta-12345" }), b = await srv.connectTo(R, { name: "Tb", color: 2, token: "token-tb-12345" });
    const A = room.sim.players.get(a.sessionId)!, B = room.sim.players.get(b.sessionId)!; A.gold = B.gold = 150; A.z = -4; B.z = -3; A.x = B.x = 0;
    room.sim.buy(a.sessionId, "MERCHANT_SEAL", 1); room.sim.buy(b.sessionId, "MERCHANT_SEAL", 1);
    const evB: any[] = []; b.onMessage("ev", (l: any[]) => evB.push(...l)); a.onMessage("ev", () => {}); a.onMessage("me", () => {}); b.onMessage("me", () => {});
    a.send("tradeReq", b.sessionId); await R.waitForMessage("tradeReq"); await R.waitForNextPatch(); await R.waitForNextPatch();
    expect(evB.some(e => e.t === "tradeReq" && e.from === a.sessionId)).toBe(true);
    b.send("tradeAccept"); await R.waitForMessage("tradeAccept");
    const potion = A.inv.items.find(s => s.itemId === "HP_POTION")!;
    a.send("tradeOffer", { items: { [potion.id]: 3 }, gold: 0 }); await R.waitForMessage("tradeOffer");
    b.send("tradeOffer", { items: {}, gold: 60 }); await R.waitForMessage("tradeOffer");   // 3 potions: reference price 60, band 54–66
    for (let i = 0; i < 20 && ![...room.sim.trades.values()].some((t: any) => Object.values(t.side).some((x: any) => x.gold === 60)); i++) await R.waitForNextPatch();
    a.send("tradeConfirm"); await R.waitForMessage("tradeConfirm"); b.send("tradeConfirm"); await R.waitForMessage("tradeConfirm");
    expect(A.gold).toBe(160); expect(B.gold).toBe(40); expect(A.inv.items.some(s => s.itemId === "HP_POTION")).toBe(false); expect(B.inv.items.find(s => s.itemId === "HP_POTION")!.count).toBe(6);
    await a.leave(true); await b.leave(true);
  }, 15000);
  it("one account has three independent characters and each returns to its saved slot", async () => {
    const room = (await srv.createRoom("map", {})) as unknown as MapRoom, R = room as any, token = "token-three-slots";
    for (const [slot, name, level] of [[0, "First", 3], [1, "Second", 7], [2, "Third", 11]] as const) {
      const c = await srv.connectTo(R, { name, race: "golden", color: slot + 1, slot, token });
      room.sim.players.get(c.sessionId)!.level = level; await c.leave(true); await new Promise(r => setTimeout(r, 60));
    }
    for (const [slot, name, level] of [[0, "First", 3], [1, "Second", 7], [2, "Third", 11]] as const) {
      const c = await srv.connectTo(R, { name: "Ignored", race: "golden", color: 0, slot, token }), p = room.sim.players.get(c.sessionId)!;
      expect(p.name).toBe(name); expect(p.level).toBe(level); await c.leave(true); await new Promise(r => setTimeout(r, 60));
    }
  }, 15000);
});
