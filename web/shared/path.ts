// Click-to-walk on the full-screen map: A* over a 1 m grid of one map (zone), where a cell is blocked if collide()
// would push a body standing there. Cells are tested lazily, so a short trip only looks at the cells it needs.
import { collide, type Layout } from "./world";

type P = { x: number; z: number };

/** Waypoints from `from` to `to` (corners only, `to` last), staying inside the box (one map); null if unreachable. */
/** `nearGoal`: when the goal itself is blocked, go to the free cell nearest the goal (a drop on the far rim of the
 *  fountain), not the one nearest the walker (a click on the fountain, which should stop on the near side). */
export function findPath(L: Layout, from: P, to: P, box: { x0: number; x1: number; z0: number; z1: number }, r = 0.4, nearGoal = false, strict = false): P[] | null {
  const { x0, z0 } = box, nx = Math.ceil(box.x1 - x0) + 1, nz = Math.ceil(box.z1 - z0) + 1, near = L;
  const state = new Uint8Array(nx * nz);   // 0 untested, 1 free, 2 blocked
  const free = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
    const k = j * nx + i;
    if (!state[k]) { const p = { x: x0 + i, z: z0 + j }; collide(p, r, near); state[k] = Math.abs(p.x - x0 - i) + Math.abs(p.z - z0 - j) < 0.01 ? 1 : 2; }
    return state[k] === 1;
  };
  const cell = (p: P): [number, number] => [Math.max(0, Math.min(nx - 1, Math.round(p.x - x0))), Math.max(0, Math.min(nz - 1, Math.round(p.z - z0)))];
  // a click on a tree or wall aims for the nearest free cell; a body brushing a wall may step through the blocked
  // cells right around it (a free cell picked there could be a pocket sealed inside a building)
  // — on the side facing the walker: of the free cells in the first ring that has any (and the ring after it), the one
  // closest to `from`. Taking the first cell of the scan instead sent a click on the fountain round to its far side.
  const nearestFree = ([ci, cj]: [number, number]): [number, number] | null => {
    if (free(ci, cj)) return [ci, cj];
    let best: [number, number] | null = null, bd = Infinity, found = 0;
    for (let d = 1; d <= 12 && (!found || d <= found + 1); d++) for (let a = -d; a <= d; a++) for (const [i, j] of [[ci + a, cj - d], [ci + a, cj + d], [ci - d, cj + a], [ci + d, cj + a]]) {
      if (!free(i, j)) continue; found ||= d;
      const ref = nearGoal ? to : from, k = Math.hypot(x0 + i - ref.x, z0 + j - ref.z); if (k < bd) { bd = k; best = [i, j]; }
    }
    return best;
  };
  const [si, sj] = cell(from), t0 = nearestFree(cell(to)); if (!t0) return null;
  let [ti, tj] = t0;
  // `strict`: only free cells (and the start one) — for a walker that already got stuck brushing an obstacle
  const pass = (i: number, j: number) => free(i, j) || (i >= 0 && j >= 0 && i < nx && j < nz && Math.hypot(i - si, j - sj) <= (strict ? 0.5 : 2.5));
  // A* with a binary heap on f = g + octile distance
  const g = new Float32Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1), heap: [number, number][] = [];
  const h = (i: number, j: number) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const push = (f: number, k: number) => { heap.push([f, k]); let c = heap.length - 1; while (c) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const a = 2 * c + 1, b = a + 1; let m = c; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top[1]; };
  const start = sj * nx + si, goal = tj * nx + ti; g[start] = 0; push(h(si, sj), start);
  let found = false;
  for (let n = 0; heap.length && n < 60000; n++) {
    const k = pop(); if (k === goal) { found = true; break; }
    const i = k % nx, j = (k - i) / nx;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue; const a = i + di, b = j + dj;
      if (!pass(a, b) || (di && dj && (!pass(i + di, j) || !pass(i, j + dj)))) continue;   // no cutting corners
      const k2 = b * nx + a, cost = g[k] + (di && dj ? 1.414 : 1);
      if (cost < g[k2]) { g[k2] = cost; came[k2] = k; push(cost + h(a, b), k2); }
    }
  }
  if (!found) return null;
  const cells: P[] = [];
  for (let k = goal; k !== -1; k = came[k]) cells.push({ x: x0 + (k % nx), z: z0 + Math.floor(k / nx) });
  cells.reverse(); if (cells.length) cells[cells.length - 1] = ti === cell(to)[0] && tj === cell(to)[1] ? { x: to.x, z: to.z } : cells[cells.length - 1];
  // string-pull: from each anchor jump to the farthest cell still in straight sight
  const sight = (a: P, b: P) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2); for (let s = 1; s < n; s++) { const [i, j] = cell({ x: a.x + (b.x - a.x) * s / n, z: a.z + (b.z - a.z) * s / n }); if (!free(i, j)) return false; } return true; };
  const out: P[] = []; let anchor: P = from, idx = 0;
  while (idx < cells.length) { let far = idx; for (let k = cells.length - 1; k > idx; k--) if (sight(anchor, cells[k])) { far = k; break; } out.push(cells[far]); anchor = cells[far]; idx = far + 1; }
  return out;
}
