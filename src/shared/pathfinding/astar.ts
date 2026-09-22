/**
 * Global A* — standard optimal best-first search over the full grid.
 *
 * This is the baseline planner: it expands from the start toward the goal
 * guided by the octile heuristic until the goal is popped from the open
 * set, which guarantees an optimal (shortest) grid path. It has no memory
 * between runs — any change to the grid means planning from scratch.
 */
import {
  cellIndex,
  cellsEqual,
  cellToLatLng,
  indexToCell,
  isBlocked,
  neighbors,
  octile,
} from './grid'
import type { Cell, OccupancyGrid, PlanResult, Waypoint } from './types'
import { pathLengthMeters, smoothCells } from './smooth'

interface HeapNode {
  idx: number
  f: number
}

/** Minimal binary heap keyed on f-score, with decrease-key support. */
class BinaryHeap {
  private heap: HeapNode[] = []
  private pos = new Map<number, number>()

  get size(): number {
    return this.heap.length
  }

  private swap(i: number, j: number): void {
    const h = this.heap
    ;[h[i], h[j]] = [h[j], h[i]]
    this.pos.set(h[i].idx, i)
    this.pos.set(h[j].idx, j)
  }

  private up(i: number): void {
    const h = this.heap
    while (i > 0) {
      const p = (i - 1) >> 1
      if (h[p].f <= h[i].f) break
      this.swap(i, p)
      i = p
    }
  }

  private down(i: number): void {
    const h = this.heap
    for (;;) {
      const l = 2 * i + 1
      const r = l + 1
      let m = i
      if (l < h.length && h[l].f < h[m].f) m = l
      if (r < h.length && h[r].f < h[m].f) m = r
      if (m === i) break
      this.swap(i, m)
      i = m
    }
  }

  pushOrDecrease(idx: number, f: number): void {
    const at = this.pos.get(idx)
    if (at === undefined) {
      this.heap.push({ idx, f })
      this.pos.set(idx, this.heap.length - 1)
      this.up(this.heap.length - 1)
    } else if (f < this.heap[at].f) {
      this.heap[at].f = f
      this.up(at)
    }
  }

  pop(): number {
    const top = this.heap[0].idx
    const last = this.heap.pop()!
    this.pos.delete(top)
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.pos.set(last.idx, 0)
      this.down(0)
    }
    return top
  }
}

export interface AStarOptions {
  /** Optional window (row/col bounds) restricting expansion — used by Local A*. */
  window?: { r0: number; r1: number; c0: number; c1: number }
  maxExpansions?: number
}

export interface AStarRaw {
  path: Cell[]
  expansions: number
  reachable: boolean
}

/** Core A* returning the raw cell path (unsmoothed). */
export function astarRaw(
  grid: OccupancyGrid,
  start: Cell,
  goal: Cell,
  opts: AStarOptions = {},
): AStarRaw {
  const n = grid.rows * grid.cols
  const g = new Float64Array(n).fill(Infinity)
  const came = new Int32Array(n).fill(-1)
  const closed = new Uint8Array(n)
  const open = new BinaryHeap()

  const sIdx = cellIndex(grid, start.r, start.c)
  const gIdx = cellIndex(grid, goal.r, goal.c)
  g[sIdx] = 0
  open.pushOrDecrease(sIdx, octile(start, goal))

  const inWindow = (r: number, c: number): boolean =>
    !opts.window || (r >= opts.window.r0 && r <= opts.window.r1 && c >= opts.window.c0 && c <= opts.window.c1)

  let expansions = 0
  const maxExp = opts.maxExpansions ?? n * 4

  while (open.size > 0 && expansions < maxExp) {
    const cur = open.pop()
    if (closed[cur] === 1) continue
    closed[cur] = 1
    expansions++
    if (cur === gIdx) {
      const path: Cell[] = []
      let at = cur
      while (at !== -1) {
        path.push(indexToCell(grid, at))
        at = came[at]
      }
      path.reverse()
      return { path, expansions, reachable: true }
    }
    const cell = indexToCell(grid, cur)
    for (const nb of neighbors(grid, cell)) {
      if (!inWindow(nb.cell.r, nb.cell.c)) continue
      const ni = cellIndex(grid, nb.cell.r, nb.cell.c)
      if (closed[ni] === 1) continue
      const tentative = g[cur] + nb.cost
      if (tentative < g[ni]) {
        g[ni] = tentative
        came[ni] = cur
        open.pushOrDecrease(ni, tentative + octile(nb.cell, goal))
      }
    }
  }
  return { path: [], expansions, reachable: false }
}

/**
 * Global A*: full-grid optimal plan from start to goal.
 * The raw grid path is post-processed with line-of-sight smoothing so the
 * rendered flight line looks like a flown route rather than grid steps.
 */
export function planAStar(
  grid: OccupancyGrid,
  start: Cell,
  goal: Cell,
  opts: AStarOptions = {},
): PlanResult {
  const t0 = performance.now()
  const fail = (reason: string, expansions: number): PlanResult => ({
    waypoints: [],
    stats: { nodesExpanded: expansions, pathLengthM: 0, computeMs: performance.now() - t0, waypointCount: 0 },
    reachable: false,
    failReason: reason,
  })
  if (isBlocked(grid, start)) return fail('Start cell is inside a no-fly zone.', 0)
  if (isBlocked(grid, goal)) return fail('Goal cell is inside a no-fly zone.', 0)
  if (cellsEqual(start, goal)) {
    const { lat, lng } = cellToLatLng(grid, start)
    return {
      waypoints: [{ lat, lng }],
      stats: { nodesExpanded: 0, pathLengthM: 0, computeMs: performance.now() - t0, waypointCount: 1 },
      reachable: true,
    }
  }
  const raw = astarRaw(grid, start, goal, opts)
  if (!raw.reachable) return fail('No flyable route to the goal.', raw.expansions)
  const smoothed = smoothCells(grid, raw.path)
  const waypoints: Waypoint[] = smoothed.map((c) => cellToLatLng(grid, c))
  const lengthM = pathLengthMeters(waypoints)
  return {
    waypoints,
    stats: {
      nodesExpanded: raw.expansions,
      pathLengthM: lengthM,
      computeMs: performance.now() - t0,
      waypointCount: waypoints.length,
    },
    reachable: true,
  }
}
