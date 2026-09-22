/**
 * Shared types for the UAV path-planning module.
 *
 * The police dashboard plans each UAV's flight on a coarse occupancy grid
 * over Jammu. Every planner below consumes the same grid representation
 * and returns the same result shape: an ordered list of waypoints plus
 * honest stats about the search that produced them.
 */

export interface LatLngBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export interface Cell {
  r: number
  c: number
}

export interface Waypoint {
  lat: number
  lng: number
}

/**
 * A coarse occupancy grid over a lat/lng bounding box.
 * `blocked` is row-major (index = r * cols + c): 0 = flyable, 1 = no-fly.
 */
export interface OccupancyGrid {
  rows: number
  cols: number
  bounds: LatLngBounds
  /** Approximate meters per cell edge at the grid's mid latitude. */
  cellM: number
  blocked: Uint8Array
}

export interface PlanStats {
  /** Search nodes expanded (popped from the frontier). */
  nodesExpanded: number
  /** Length of the final smoothed path, meters. */
  pathLengthM: number
  /** Wall-clock compute time, milliseconds. */
  computeMs: number
  /** Waypoint count in the returned path. */
  waypointCount: number
}

export interface PlanResult {
  /** Ordered waypoints from start to goal (cell centers, smoothed). */
  waypoints: Waypoint[]
  stats: PlanStats
  reachable: boolean
  /** Human-readable reason when unreachable. */
  failReason?: string
}

export type PlannerKind = 'astar' | 'dstar-lite' | 'local-astar'

export const PLANNER_META: Record<PlannerKind, { label: string; blurb: string }> = {
  astar: {
    label: 'A*',
    blurb: 'Global optimal search over the full grid',
  },
  'dstar-lite': {
    label: 'D* Lite',
    blurb: 'Incremental replanning — reacts to airspace changes without a full recompute',
  },
  'local-astar': {
    label: 'Local A*',
    blurb: 'Receding-horizon windowed search for short-range avoidance',
  },
}
