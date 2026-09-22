/**
 * Occupancy grid over a lat/lng bounding box.
 *
 * The grid is the shared world model for every planner: free cells are
 * flyable, blocked cells are no-fly (restricted airspace, tall structures).
 * Coordinates use a local equirectangular projection, which is accurate to
 * well under a percent for a city-sized area like Jammu.
 */
import type { Cell, LatLngBounds, OccupancyGrid } from './types'

const M_PER_DEG_LAT = 111_320

export function createGrid(bounds: LatLngBounds, cellSizeM: number): OccupancyGrid {
  const midLat = (bounds.minLat + bounds.maxLat) / 2
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180)
  const widthM = (bounds.maxLng - bounds.minLng) * mPerDegLng
  const heightM = (bounds.maxLat - bounds.minLat) * M_PER_DEG_LAT
  const cols = Math.max(8, Math.round(widthM / cellSizeM))
  const rows = Math.max(8, Math.round(heightM / cellSizeM))
  // Recompute the realized cell size so cells tile the bounds exactly.
  const cellM = Math.max(widthM / cols, heightM / rows)
  return { rows, cols, bounds, cellM, blocked: new Uint8Array(rows * cols) }
}

export function cellIndex(grid: OccupancyGrid, r: number, c: number): number {
  return r * grid.cols + c
}

export function indexToCell(grid: OccupancyGrid, idx: number): Cell {
  return { r: Math.floor(idx / grid.cols), c: idx % grid.cols }
}

export function inBounds(grid: OccupancyGrid, r: number, c: number): boolean {
  return r >= 0 && r < grid.rows && c >= 0 && c < grid.cols
}

export function isBlocked(grid: OccupancyGrid, cell: Cell): boolean {
  if (!inBounds(grid, cell.r, cell.c)) return true
  return grid.blocked[cellIndex(grid, cell.r, cell.c)] === 1
}

export function setBlocked(grid: OccupancyGrid, cell: Cell, blocked: boolean): void {
  if (!inBounds(grid, cell.r, cell.c)) return
  grid.blocked[cellIndex(grid, cell.r, cell.c)] = blocked ? 1 : 0
}

/** Block (or unblock) every cell intersecting a lat/lng rectangle. Returns the touched cells. */
export function blockRect(grid: OccupancyGrid, bounds: LatLngBounds, blocked: boolean): Cell[] {
  const touched: Cell[] = []
  const tl = latLngToCell(grid, bounds.maxLat, bounds.minLng)
  const br = latLngToCell(grid, bounds.minLat, bounds.maxLng)
  for (let r = tl.r; r <= br.r; r++) {
    for (let c = tl.c; c <= br.c; c++) {
      if (!inBounds(grid, r, c)) continue
      const idx = cellIndex(grid, r, c)
      const want = blocked ? 1 : 0
      if (grid.blocked[idx] !== want) {
        grid.blocked[idx] = want
        touched.push({ r, c })
      }
    }
  }
  return touched
}

export function latLngToCell(grid: OccupancyGrid, lat: number, lng: number): Cell {
  const { bounds } = grid
  const r = Math.floor(((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * grid.rows)
  const c = Math.floor(((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * grid.cols)
  return {
    r: Math.max(0, Math.min(grid.rows - 1, r)),
    c: Math.max(0, Math.min(grid.cols - 1, c)),
  }
}

/** Center of the cell in lat/lng. */
export function cellToLatLng(grid: OccupancyGrid, cell: Cell): { lat: number; lng: number } {
  const { bounds } = grid
  return {
    lat: bounds.maxLat - ((cell.r + 0.5) / grid.rows) * (bounds.maxLat - bounds.minLat),
    lng: bounds.minLng + ((cell.c + 0.5) / grid.cols) * (bounds.maxLng - bounds.minLng),
  }
}

/**
 * Nearest free cell to the given cell (spiral search). Used when a start or
 * goal lands inside a no-fly zone so planning can still proceed.
 */
export function nearestFreeCell(grid: OccupancyGrid, cell: Cell): Cell {
  if (!isBlocked(grid, cell)) return { ...cell }
  const maxR = Math.max(grid.rows, grid.cols)
  for (let ring = 1; ring < maxR; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue
        const cand = { r: cell.r + dr, c: cell.c + dc }
        if (!isBlocked(grid, cand)) return cand
      }
    }
  }
  return { ...cell }
}

/** Octile distance heuristic in cell units (admissible for 8-connected grids). */
export function octile(a: Cell, b: Cell): number {
  const dx = Math.abs(a.c - b.c)
  const dy = Math.abs(a.r - b.r)
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
}

export interface Neighbor {
  cell: Cell
  /** Movement cost in cell units: 1 orthogonal, sqrt(2) diagonal. */
  cost: number
}

/**
 * 8-connected neighbors with no corner cutting: a diagonal move is only
 * allowed when both orthogonal cells it passes between are free.
 */
export function neighbors(grid: OccupancyGrid, cell: Cell): Neighbor[] {
  const out: Neighbor[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const n = { r: cell.r + dr, c: cell.c + dc }
      if (!inBounds(grid, n.r, n.c) || isBlocked(grid, n)) continue
      if (dr !== 0 && dc !== 0) {
        if (
          isBlocked(grid, { r: cell.r + dr, c: cell.c }) ||
          isBlocked(grid, { r: cell.r, c: cell.c + dc })
        ) {
          continue
        }
        out.push({ cell: n, cost: Math.SQRT2 })
      } else {
        out.push({ cell: n, cost: 1 })
      }
    }
  }
  return out
}

export function cellsEqual(a: Cell, b: Cell): boolean {
  return a.r === b.r && a.c === b.c
}

export function countBlocked(grid: OccupancyGrid): number {
  let n = 0
  for (let i = 0; i < grid.blocked.length; i++) if (grid.blocked[i] === 1) n++
  return n
}
