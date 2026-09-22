/**
 * D* Lite — incremental replanning search (Koenig & Likhachev).
 *
 * Unlike A*, which plans from scratch every time, D* Lite searches
 * *backwards* from the goal to the start and remembers its search state
 * (g/rhs values). When grid costs change — e.g. a no-fly zone is toggled
 * mid-flight — only the vertices affected by the change are updated and the
 * search resumes from there instead of recomputing everything. The first
 * plan() call does a full search; updateBlocked() + replan() afterwards are
 * the incremental steps, and typically expand far fewer nodes.
 *
 * Honest distinction from the A* in astar.ts: this keeps persistent state
 * (g, rhs, priority queue, key modifier km) across replan calls, and the
 * stats it reports for a replan reflect only the incremental work done.
 */
import { cellIndex, cellToLatLng, indexToCell, octile } from './grid'
import type { Cell, OccupancyGrid, PlanResult, Waypoint } from './types'
import { pathLengthMeters, smoothCells } from './smooth'

const INF = Number.POSITIVE_INFINITY

interface HeapEntry {
  idx: number
  k1: number
  k2: number
}

/** Binary heap on lexicographic (k1, k2) keys, with decrease-key/remove. */
class KeyHeap {
  private heap: HeapEntry[] = []
  private pos = new Map<number, number>()

  get size(): number {
    return this.heap.length
  }

  peek(): HeapEntry {
    return this.heap[0]
  }

  private swap(i: number, j: number): void {
    const h = this.heap
    ;[h[i], h[j]] = [h[j], h[i]]
    this.pos.set(h[i].idx, i)
    this.pos.set(h[j].idx, j)
  }

  private less(a: HeapEntry, b: HeapEntry): boolean {
    return keyLess(a.k1, a.k2, b.k1, b.k2)
  }

  private up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(this.heap[i], this.heap[p])) break
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
      if (l < h.length && this.less(h[l], h[m])) m = l
      if (r < h.length && this.less(h[r], h[m])) m = r
      if (m === i) break
      this.swap(i, m)
      i = m
    }
  }

  remove(idx: number): void {
    const at = this.pos.get(idx)
    if (at === undefined) return
    const last = this.heap.pop()!
    this.pos.delete(idx)
    if (at < this.heap.length) {
      this.heap[at] = last
      this.pos.set(last.idx, at)
      this.up(at)
      this.down(at)
    }
  }

  push(idx: number, k1: number, k2: number): void {
    this.remove(idx)
    const e = { idx, k1, k2 }
    this.heap.push(e)
    this.pos.set(idx, this.heap.length - 1)
    this.up(this.heap.length - 1)
  }

  pop(): HeapEntry {
    const top = this.heap[0]
    this.remove(top.idx)
    return top
  }
}

const KEY_EPS = 1e-9

function keyLess(a1: number, a2: number, b1: number, b2: number): boolean {
  // Epsilon-tolerant lexicographic comparison. Diagonal moves cost sqrt(2),
  // so keys are floating point and exact ties (which the k2 tie-break must
  // resolve) routinely differ by 1 ulp. Without the epsilon, a vertex that
  // must propagate a cost increase can compare "greater" than the start by
  // rounding noise and never get processed.
  if (a1 < b1 - KEY_EPS) return true
  if (b1 < a1 - KEY_EPS) return false
  return a2 < b2 - KEY_EPS
}

export class DStarLite {
  private grid: OccupancyGrid
  private g: Float64Array
  private rhs: Float64Array
  private heap = new KeyHeap()
  /** Key modifier — accumulates heuristic distance as the start moves. */
  private km = 0
  private startIdx: number
  private lastStartIdx: number
  private goalIdx: number
  private expansionsLastRun = 0

  constructor(grid: OccupancyGrid, start: Cell, goal: Cell) {
    this.grid = grid
    const n = grid.rows * grid.cols
    this.g = new Float64Array(n).fill(INF)
    this.rhs = new Float64Array(n).fill(INF)
    this.startIdx = cellIndex(grid, start.r, start.c)
    this.lastStartIdx = this.startIdx
    this.goalIdx = cellIndex(grid, goal.r, goal.c)
    this.rhs[this.goalIdx] = 0
    const [k1, k2] = this.calcKey(this.goalIdx)
    this.heap.push(this.goalIdx, k1, k2)
  }

  /** Nodes expanded by the most recent plan()/replan() call. */
  get lastExpansions(): number {
    return this.expansionsLastRun
  }

  private rc(idx: number): Cell {
    return indexToCell(this.grid, idx)
  }

  private h(aIdx: number, bIdx: number): number {
    return octile(this.rc(aIdx), this.rc(bIdx))
  }

  private calcKey(idx: number): [number, number] {
    const v = Math.min(this.g[idx], this.rhs[idx])
    return [v + this.h(this.startIdx, idx) + this.km, v]
  }

  /** Cost of moving from cell a into cell b (INF when blocked / corner-cut). */
  private cost(aIdx: number, bIdx: number): number {
    if (this.grid.blocked[bIdx] === 1) return INF
    const a = this.rc(aIdx)
    const b = this.rc(bIdx)
    const dr = Math.abs(a.r - b.r)
    const dc = Math.abs(a.c - b.c)
    if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return INF
    if (dr === 1 && dc === 1) {
      // No corner cutting — same rule as the grid neighbors() helper.
      const o1 = cellIndex(this.grid, a.r + (b.r - a.r), a.c)
      const o2 = cellIndex(this.grid, a.r, a.c + (b.c - a.c))
      if (this.grid.blocked[o1] === 1 || this.grid.blocked[o2] === 1) return INF
      return Math.SQRT2
    }
    return 1
  }

  /** 8-neighborhood (predecessors == successors on this undirected grid). */
  private adjacent(idx: number): number[] {
    const { r, c } = this.rc(idx)
    const out: number[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= this.grid.rows || nc < 0 || nc >= this.grid.cols) continue
        out.push(cellIndex(this.grid, nr, nc))
      }
    }
    return out
  }

  private updateVertex(idx: number): void {
    if (idx !== this.goalIdx) {
      let best = INF
      for (const s of this.adjacent(idx)) {
        const v = this.cost(idx, s) + this.g[s]
        if (v < best) best = v
      }
      this.rhs[idx] = best
    }
    this.heap.remove(idx)
    if (this.g[idx] !== this.rhs[idx]) {
      const [k1, k2] = this.calcKey(idx)
      this.heap.push(idx, k1, k2)
    }
  }

  private computeShortestPath(): void {
    this.expansionsLastRun = 0
    for (;;) {
      if (this.heap.size === 0) break
      const top = this.heap.peek()
      const [sk1, sk2] = this.calcKey(this.startIdx)
      if (!keyLess(top.k1, top.k2, sk1, sk2) && this.rhs[this.startIdx] === this.g[this.startIdx]) {
        break
      }
      const u = this.heap.pop()
      const [nk1, nk2] = this.calcKey(u.idx)
      if (keyLess(u.k1, u.k2, nk1, nk2)) {
        this.heap.push(u.idx, nk1, nk2)
      } else if (this.g[u.idx] > this.rhs[u.idx]) {
        this.g[u.idx] = this.rhs[u.idx]
        for (const p of this.adjacent(u.idx)) this.updateVertex(p)
      } else {
        this.g[u.idx] = INF
        for (const p of this.adjacent(u.idx)) this.updateVertex(p)
        this.updateVertex(u.idx)
      }
      this.expansionsLastRun++
      // Safety cap: a full grid sweep is the worst honest case.
      if (this.expansionsLastRun > this.grid.rows * this.grid.cols * 4) break
    }
  }

  private extract(t0: number, incremental: boolean): PlanResult {
    const stats = {
      nodesExpanded: this.expansionsLastRun,
      pathLengthM: 0,
      computeMs: performance.now() - t0,
      waypointCount: 0,
    }
    if (this.g[this.startIdx] === INF) {
      return { waypoints: [], stats, reachable: false, failReason: 'No flyable route to the goal.' }
    }
    const pathIdx: number[] = [this.startIdx]
    let cur = this.startIdx
    const cap = this.grid.rows * this.grid.cols
    for (let guard = 0; guard < cap && cur !== this.goalIdx; guard++) {
      let best = -1
      let bestVal = INF
      for (const s of this.adjacent(cur)) {
        const v = this.cost(cur, s) + this.g[s]
        if (v < bestVal) {
          bestVal = v
          best = s
        }
      }
      if (best === -1 || bestVal === INF) {
        return { waypoints: [], stats, reachable: false, failReason: 'No flyable route to the goal.' }
      }
      cur = best
      pathIdx.push(cur)
    }
    if (cur !== this.goalIdx) {
      return { waypoints: [], stats, reachable: false, failReason: 'Path extraction did not converge.' }
    }
    const cells = pathIdx.map((i) => this.rc(i))
    const smoothed = smoothCells(this.grid, cells)
    const waypoints: Waypoint[] = smoothed.map((c) => cellToLatLng(this.grid, c))
    stats.pathLengthM = pathLengthMeters(waypoints)
    stats.waypointCount = waypoints.length
    void incremental
    return { waypoints, stats, reachable: true }
  }

  /** Initial full plan from the construction start to the goal. */
  plan(): PlanResult {
    const t0 = performance.now()
    this.computeShortestPath()
    return this.extract(t0, false)
  }

  /**
   * Tell the planner that these cells changed blocked state (the caller
   * mutates the shared grid first). Only the affected vertices are queued —
   * this is the incremental update, not a recompute.
   */
  updateBlockedCells(cells: Cell[]): void {
    for (const cell of cells) {
      const idx = cellIndex(this.grid, cell.r, cell.c)
      for (const p of this.adjacent(idx)) this.updateVertex(p)
      this.updateVertex(idx)
    }
  }

  /**
   * Incremental replan from a new start cell (e.g. the UAV's current
   * position). Applies the key modifier for the moved start, then resumes
   * the search from the retained state.
   */
  replan(newStart: Cell): PlanResult {
    const t0 = performance.now()
    const ns = cellIndex(this.grid, newStart.r, newStart.c)
    this.km += this.h(this.lastStartIdx, ns)
    this.lastStartIdx = ns
    this.startIdx = ns
    this.computeShortestPath()
    return this.extract(t0, true)
  }
}
