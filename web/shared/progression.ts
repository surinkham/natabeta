// Stat allocation (spec §5.15 Server_AllocateStat) — pure, validates like the server will.
export const PRIMARY = ["STR", "AGI", "VIT", "INT", "DEX", "LUK"] as const;
export type PrimaryKey = typeof PRIMARY[number];
export function allocate(u: Record<PrimaryKey, number> & { points: number }, attr: string, n: number): boolean {
  if (!PRIMARY.includes(attr as PrimaryKey) || !Number.isInteger(n) || n < 1 || n > u.points) return false;
  u[attr as PrimaryKey] += n; u.points -= n; return true;
}
