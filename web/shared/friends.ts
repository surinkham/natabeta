// Friends, pure (no sim, no network): one book for the whole server, saved as one record like the guild book. Keyed by
// the player's stable uid; each entry keeps the names it last saw. A request waits in the other player's `pending`
// until they accept (both sides then list each other) or decline.
export const MAX_FRIENDS = 100;
export interface FriendEntry { name: string; friends: Record<string, string>; pending: Record<string, string> }   // uid -> name

export class FriendBook {
  people = new Map<string, FriendEntry>();
  constructor(data?: Record<string, FriendEntry>) { for (const [uid, e] of Object.entries(data ?? {})) this.people.set(uid, { name: e.name, friends: { ...e.friends }, pending: { ...e.pending } }); }
  toJSON() { return Object.fromEntries(this.people); }
  entry(uid: string, name = "") { let e = this.people.get(uid); if (!e) this.people.set(uid, e = { name, friends: {}, pending: {} }); else if (name) e.name = name; return e; }
  /** Ask `to` to be friends; returns an error, or undefined when the request is waiting. */
  request(from: string, fromName: string, to: string, toName: string): string | undefined {
    if (!from || !to || from === to) return "ทำไม่ได้";
    const me = this.entry(from, fromName), them = this.entry(to, toName);
    if (me.friends[to]) return `${toName} เป็นเพื่อนอยู่แล้ว`;
    if (Object.keys(me.friends).length >= MAX_FRIENDS) return `เพื่อนเต็ม (${MAX_FRIENDS} คน)`;
    if (me.pending[to]) return this.accept(from, fromName, to);   // they asked first: this makes it mutual
    them.pending[from] = fromName; return undefined;
  }
  accept(uid: string, name: string, from: string): string | undefined {
    const me = this.entry(uid, name), fromName = me.pending[from]; if (!fromName) return "ไม่มีคำขอนี้";
    const them = this.entry(from, fromName); delete me.pending[from];
    if (Object.keys(me.friends).length >= MAX_FRIENDS) return `เพื่อนเต็ม (${MAX_FRIENDS} คน)`;
    me.friends[from] = them.name; them.friends[uid] = me.name; return undefined;
  }
  decline(uid: string, from: string) { delete this.entry(uid).pending[from]; }
  remove(uid: string, other: string) { delete this.entry(uid).friends[other]; delete this.entry(other).friends[uid]; }
  rename(uid: string, name: string) { const e = this.people.get(uid); if (!e) return; e.name = name; for (const f of Object.keys(e.friends)) { const o = this.people.get(f); if (o?.friends[uid]) o.friends[uid] = name; } }
}
