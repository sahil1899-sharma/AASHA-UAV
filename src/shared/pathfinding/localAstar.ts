/**
 * Local A* — receding-horizon windowed search.
 *
 * Honest distinction from global A*: this planner never searches the whole
 * grid. It repeatedly runs a *bounded* A* inside a small window centered on
 * the UAV's current position, steering toward a local subgoal (the goal when
 * visible inside the window, otherwise the window-boundary cell closest to
 * the goal), advances a few cells along that segment, then replans from the
 * new position. That is the classic local-avoidance pattern: fast,
 * short-range, reactive — and greedy, so it can take a longer route than the
 * global optimum and may widen its window when it detects looping.
 */
import { cellIndex, cellsEqual, cellToLatLng, isBlocked, octile } from './grid'
import { astarRaw } from './astar'
import type { Cell, OccupancyGrid, PlanResult, Waypoint } from './types'
import { pathLengthMeters, smoothCells } from './smooth'

export interface LocalAStarOptions {
  /** Window half-size in cells around the current position. */
  windowRadius?: number
  /** Cells to advance along each local segment before replanning. */
  stepCells?: number
  maxIterations?: number
}

export function planLocalAStar(
  grid: OccupancyGrid,
  start: Cell,
  goal: Cell,
  opts: LocalAStarOptions = {},
): PlanResult {
  const t0 = performance.now()
  const R = opts.windowRadius ?? 14
  const STEP = opts.stepCells ?? 7
  const MAX_ITER = opts.maxIterations ?? 400

  const fail = (reason: string, expansions: number, path: Cell[]): PlanResult => {
    const smoothed = smoothCells(grid, path)
    const waypoints: Waypoint[] = smoothed.map((c) => cellToLatLng(grid, c))
    return {
      waypoints,
      stats: {
        nodesExpanded: expansions,
        pathLengthM: pathLengthMeters(waypoints),
        computeMs: performance.now() - t0,
        waypointCount: waypoints.length,
      },
      reachable: false,
      failReason: reason,
    }
  }

  if (isBlocked(grid, start)) return fail('Start cell is inside a no-fly zone.', 0, [])
  if (isBlocked(grid, goal)) return fail('Goal cell is inside a no-fly zone.', 0, [])

  let current: Cell = { ...start }
  const full: Cell[] = [{ ...start }]
  const visited = new Set<number>([cellIndex(grid, start.r, start.c)])
  let expansions = 0
  let radius = R

  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (cellsEqual(current, goal)) break

    const r0 = Math.max(0, current.r - radius)
    const r1 = Math.min(grid.rows - 1, current.r + radius)
    const c0 = Math.max(0, current.c - radius)
    const c1 = Math.min(grid.cols - 1, current.c + radius)
    const inWindow = (cell: Cell): boolean =>
      cell.r >= r0 && cell.r <= r1 && cell.c >= c0 && cell.c <= c1

    // Local subgoal: the goal itself when visible, else the window cell
    // closest (by octile distance) to the goal.
    let subgoal: Cell
    if (inWindow(goal)) {
      subgoal = goal
    } else {
      let best: Cell = { ...current }
      let bestD = Infinity
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const onEdge = r === r0 || r === r1 || c === c0 || c === c1
          if (!onEdge) continue
          const cand = { r, c }
          if (isBlocked(grid, cand)) continue
          const d = octile(cand, goal)
          if (d < bestD) {
            bestD = d
            best = cand
          }
        }
      }
      subgoal = best
    }

    const seg = astarRaw(grid, current, subgoal, { window: { r0, r1, c0, c1 } })
    expansions += seg.expansions
    if (!seg.reachable || seg.path.length < 2) {
      // Local minimum or walled-in window: widen the view and try again.
      const maxR = Math.max(grid.rows, grid.cols)
      if (radius >= maxR) return fail('Local planner is boxed in with no route.', expansions, full)
      radius = Math.min(radius * 2, maxR)
      continue
    }

    if (cellsEqual(subgoal, goal)) {
      for (let i = 1; i < seg.path.length; i++) full.push({ ...seg.path[i] })
      current = { ...goal }
      break
    }

    // Advance along the segment, but stop before stepping onto a cell we
    // have already committed to — that is the loop detector.
    const adv = Math.min(STEP, seg.path.length - 1)
    let cut = adv
    for (let i = 1; i <= adv; i++) {
      if (visited.has(cellIndex(grid, seg.path[i].r, seg.path[i].c))) {
        cut = i - 1
        break
      }
    }
    if (cut === 0) {
      const maxR = Math.max(grid.rows, grid.cols)
      if (radius >= maxR) return fail('Local planner is looping with no progress.', expansions, full)
      radius = Math.min(radius * 2, maxR)
      continue
    }
    for (let i = 1; i <= cut; i++) {
      current = { ...seg.path[i] }
      full.push({ ...current })
      visited.add(cellIndex(grid, current.r, current.c))
    }
    radius = R // reset the window once progress is made
  }

  if (!cellsEqual(current, goal)) {
    return fail('Local planner did not reach the goal in time.', expansions, full)
  }
  const smoothed = smoothCells(grid, full)
  const waypoints: Waypoint[] = smoothed.map((c) => cellToLatLng(grid, c))
  return {
    waypoints,
    stats: {
      nodesExpanded: expansions,
      pathLengthM: pathLengthMeters(waypoints),
      computeMs: performance.now() - t0,
      waypointCount: waypoints.length,
    },
    reachable: true,
  }
}
