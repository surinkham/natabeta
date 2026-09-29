// Auto battle's loot pick (pure, tested): of the drops on the floor, the nearest within `range` that this player may
// take — its own, its party's, or one past the owner window — and of a ticked kind (items / gold), skipping any it
// tried and failed to take a moment ago (a full bag), so auto never circles one.
export interface LootView { id: string; gold: number; x: number; z: number; owner?: string; free?: boolean }
export function pickLoot<T extends { view: LootView }>(drops: Iterable<T>, me: { id: string; x: number; z: number; party?: string },
  partyOf: (id: string) => string | undefined, opts: { items: boolean; gold: boolean; range: number }, tried: Map<string, number>, now: number): T | null {
  if (!opts.items && !opts.gold) return null;
  let best: T | null = null, bd = opts.range;
  for (const d of drops) {
    const g = d.view; if ((g.gold ? !opts.gold : !opts.items) || (tried.get(g.id) ?? 0) > now) continue;
    const mine = !g.owner || g.owner === me.id || !!g.free || (!!me.party && partyOf(g.owner) === me.party);
    const dist = Math.hypot(g.x - me.x, g.z - me.z); if (mine && dist < bd) { bd = dist; best = d; }
  }
  return best;
}
