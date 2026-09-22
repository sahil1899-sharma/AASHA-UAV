/**
 * Mock airspace model over Jammu.
 *
 * A small set of no-fly zones (restricted airspace, tall-structure
 * corridors) that can be toggled on/off. Toggling a zone mid-flight is what
 * exercises D* Lite's incremental replan on the police dashboard.
 */
import type { LatLngBounds } from './types'

export interface NoFlyZone {
  id: string
  name: string
  reason: string
  bounds: LatLngBounds
  active: boolean
}

/** Grid coverage: all Jammu incident areas plus the UAV staging base. */
export const JAMMU_GRID_BOUNDS: LatLngBounds = {
  minLat: 32.62,
  maxLat: 32.78,
  minLng: 74.78,
  maxLng: 74.94,
}

/** Default grid resolution. `createGrid` accepts any cell size in meters. */
export const DEFAULT_CELL_SIZE_M = 200

const ZONE_DEFS: Omit<NoFlyZone, 'active'>[] = [
  {
    id: 'nfz-airport',
    name: 'Jammu Airport',
    reason: 'Restricted airspace — civil aviation',
    bounds: { minLat: 32.668, maxLat: 32.696, minLng: 74.818, maxLng: 74.852 },
  },
  {
    id: 'nfz-cantonment',
    name: 'Cantonment area',
    reason: 'Military restricted zone',
    bounds: { minLat: 32.735, maxLat: 32.755, minLng: 74.795, maxLng: 74.822 },
  },
  {
    id: 'nfz-heritage',
    name: 'Bahu Fort heritage exclusion',
    reason: 'Heritage site overflight ban',
    bounds: { minLat: 32.71, maxLat: 32.73, minLng: 74.866, maxLng: 74.888 },
  },
]

/** Fresh zone list; all zones start inactive. */
export function createNoFlyZones(): NoFlyZone[] {
  return ZONE_DEFS.map((z) => ({ ...z, bounds: { ...z.bounds }, active: false }))
}
