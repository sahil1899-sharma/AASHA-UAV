/**
 * UAV path-planning module.
 *
 * Three honest, distinct planners over a shared occupancy-grid world model:
 * - planAStar      — global optimal search (full recompute every time)
 * - DStarLite      — incremental replanning; cheap reaction to airspace changes
 * - planLocalAStar — receding-horizon windowed search for short-range avoidance
 */
export type { Cell, LatLngBounds, OccupancyGrid, PlanResult, PlanStats, PlannerKind, Waypoint } from './types'
export { PLANNER_META } from './types'
export {
  blockRect,
  cellsEqual,
  cellIndex,
  cellToLatLng,
  countBlocked,
  createGrid,
  inBounds,
  indexToCell,
  isBlocked,
  latLngToCell,
  nearestFreeCell,
  neighbors,
  octile,
  setBlocked,
} from './grid'
export { planAStar, astarRaw } from './astar'
export { DStarLite } from './dstarLite'
export { planLocalAStar } from './localAstar'
export { hasLineOfSight, smoothCells, pathLengthMeters, cumulativeDistances, positionAlong } from './smooth'
export { createNoFlyZones, JAMMU_GRID_BOUNDS, DEFAULT_CELL_SIZE_M } from './airspace'
export type { NoFlyZone } from './airspace'
