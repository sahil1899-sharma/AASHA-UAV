/**
 * Mock hotspot / safe-zone data for the user risk map.
 *
 * Zones are generated as degree-offsets from the user's position so the map
 * works anywhere on earth. Phase 6 replaces this with the real dispatch
 * server's hotspot feed — the shapes below already match that feed's
 * contract (id, name, severity, polygon).
 */

export type Severity = 'high' | 'medium' | 'low'

export interface HotspotZone {
  id: string
  name: string
  severity: Severity
  polygon: [number, number][]
}

export interface SafeZone {
  id: string
  kind: 'police' | 'hospital'
  name: string
  position: [number, number]
  distance: string
}

export const SEVERITY_STYLE: Record<Severity, { color: string; fill: string; label: string }> = {
  high: { color: '#ff3b47', fill: 'rgba(255,59,71,0.22)', label: 'High risk' },
  medium: { color: '#ff9f1c', fill: 'rgba(255,159,28,0.18)', label: 'Medium risk' },
  low: { color: '#ffd166', fill: 'rgba(255,209,102,0.14)', label: 'Low risk' },
}

interface ZoneSpec {
  id: string
  name: string
  severity: Severity
  /** [dLat, dLng] offsets in degrees forming the polygon. */
  offsets: [number, number][]
}

const ZONE_SPECS: ZoneSpec[] = [
  {
    id: 'hz-1',
    name: 'Raghunath Bazaar',
    severity: 'high',
    offsets: [
      [0.012, 0.014],
      [0.02, 0.03],
      [0.008, 0.042],
      [-0.004, 0.03],
      [-0.002, 0.016],
    ],
  },
  {
    id: 'hz-2',
    name: 'Railway Station Yard',
    severity: 'medium',
    offsets: [
      [-0.018, -0.022],
      [-0.008, -0.01],
      [-0.016, 0.002],
      [-0.028, -0.008],
    ],
  },
  {
    id: 'hz-3',
    name: 'Tawi Riverfront',
    severity: 'low',
    offsets: [
      [0.004, -0.034],
      [0.014, -0.026],
      [0.01, -0.014],
      [-0.002, -0.02],
    ],
  },
]

export function buildHotspots(center: [number, number]): HotspotZone[] {
  return ZONE_SPECS.map((z) => ({
    id: z.id,
    name: z.name,
    severity: z.severity,
    polygon: z.offsets.map(
      ([dLat, dLng]) => [center[0] + dLat, center[1] + dLng] as [number, number],
    ),
  }))
}

const SAFE_SPECS: (Omit<SafeZone, 'position'> & { dLat: number; dLng: number })[] = [
  { id: 'sz-1', kind: 'police', name: 'Gandhi Nagar Police Station', distance: '0.8 km', dLat: 0.009, dLng: -0.012 },
  { id: 'sz-2', kind: 'hospital', name: 'GMC Jammu', distance: '1.2 km', dLat: -0.011, dLng: 0.016 },
  { id: 'sz-3', kind: 'police', name: 'Satwari Police Post', distance: '1.9 km', dLat: 0.024, dLng: -0.004 },
  { id: 'sz-4', kind: 'hospital', name: 'ASCOMS Hospital, Sidhra', distance: '2.4 km', dLat: -0.02, dLng: -0.028 },
]

export function buildSafeZones(center: [number, number]): SafeZone[] {
  return SAFE_SPECS.map(({ dLat, dLng, ...rest }) => ({
    ...rest,
    position: [center[0] + dLat, center[1] + dLng] as [number, number],
  }))
}
