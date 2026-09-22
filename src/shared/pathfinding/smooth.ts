/**
 * Line-of-sight path smoothing ("string pulling").
 *
 * Grid planners return jagged cell-center paths. This post-process walks the
 * raw path and keeps only the waypoints that are actually needed: a waypoint
 * is dropped when the straight segment skipping it has clear line of sight
 * (no blocked cell intersects it). The result is what a real flight
 * controller would fly — long straight legs with turns only where obstacles
 * force them.
 */
import { isBlocked } from './grid'
import type { Cell, OccupancyGrid, Waypoint } from './types'

/** True if the straight segment between two cell centers stays in free cells. */
export function hasLineOfSight(grid: OccupancyGrid, a: Cell, b: Cell): boolean {
  // Sample along the segment at ~1/3-cell resolution; any blocked sample
  // (or either endpoint) means no line of sight.
  if (isBlocked(grid, a) || isBlocked(grid, b)) return false
  const dist = Math.hypot(b.r - a.r, b.c - a.c)
  const steps = Math.max(1, Math.ceil(dist * 3))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    const r = a.r + (b.r - a.r) * t
    const c = a.c + (b.c - a.c) * t
    // A sample point is safe if every cell it could plausibly touch is free.
    // Checking the floored cell plus a small epsilon neighborhood is enough
    // at this sampling density.
    const cells = [
      { r: Math.floor(r), c: Math.floor(c) },
      { r: Math.floor(r + 1e-6), c: Math.floor(c + 1e-6) },
    ]
    for (const cell of cells) {
      if (isBlocked(grid, cell)) return false
    }
  }
  return true
}

/** Greedy string pulling over a raw cell path. */
export function smoothCells(grid: OccupancyGrid, path: Cell[]): Cell[] {
  if (path.length <= 2) return path.map((c) => ({ ...c }))
  const out: Cell[] = [{ ...path[0] }]
  let anchor = 0
  while (anchor < path.length - 1) {
    // Farthest reachable waypoint from the anchor.
    let next = path.length - 1
    while (next > anchor + 1 && !hasLineOfSight(grid, path[anchor], path[next])) {
      next--
    }
    out.push({ ...path[next] })
    anchor = next
  }
  return out
}

function haversineM(a: Waypoint, b: Waypoint): number {
  const r = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(s))
}

/** Total length of a waypoint path in meters. */
export function pathLengthMeters(waypoints: Waypoint[]): number {
  let total = 0
  for (let i = 1; i < waypoints.length; i++) total += haversineM(waypoints[i - 1], waypoints[i])
  return total
}

/** Cumulative distances (meters) along a waypoint path; cum[0] = 0. */
export function cumulativeDistances(waypoints: Waypoint[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < waypoints.length; i++) {
    cum.push(cum[i - 1] + haversineM(waypoints[i - 1], waypoints[i]))
  }
  return cum
}

/** Interpolate a position along a waypoint path at a given distance. */
export function positionAlong(
  grid: OccupancyGrid,
  waypoints: Waypoint[],
  cum: number[],
  distM: number,
): Waypoint {
  if (waypoints.length === 0) {
    const { bounds } = grid
    return { lat: (bounds.minLat + bounds.maxLat) / 2, lng: (bounds.minLng + bounds.maxLng) / 2 }
  }
  if (distM <= 0) return waypoints[0]
  const total = cum[cum.length - 1]
  if (distM >= total) return waypoints[waypoints.length - 1]
  let i = 1
  while (i < cum.length - 1 && cum[i] < distM) i++
  const segLen = cum[i] - cum[i - 1] || 1
  const t = (distM - cum[i - 1]) / segLen
  const a = waypoints[i - 1]
  const b = waypoints[i]
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}
