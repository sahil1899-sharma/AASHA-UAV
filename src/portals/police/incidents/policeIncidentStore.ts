import { create } from 'zustand'
import { useAuthStore } from '../../../shared/state/authStore'
import { useIncidentStore } from '../../../shared/state/incidentStore'
import type { ActiveIncident } from '../../../shared/state/incidentStore'
import { useNotificationsStore } from '../../../shared/state/notificationsStore'
import { emit, on } from '../../../shared/realtime/realtimeBus'
import type { SosTriggeredPayload } from '../../../shared/realtime/realtimeBus'
import {
  EVIDENCE_GENESIS,
  demoCorruptBytes,
  sealEvidenceLink,
} from '../../../shared/evidence/evidenceIntegrity'
import {
  DEFAULT_CELL_SIZE_M,
  DStarLite,
  JAMMU_GRID_BOUNDS,
  blockRect,
  createGrid,
  createNoFlyZones,
  cumulativeDistances,
  latLngToCell,
  nearestFreeCell,
  positionAlong,
} from '../../../shared/pathfinding'
import type {
  Cell,
  NoFlyZone,
  OccupancyGrid,
  PlanResult,
  Waypoint,
} from '../../../shared/pathfinding'

/**
 * Police / Security incident state.
 *
 * Holds the incident register: live SOS alerts plus mock history. The user's
 * own SOS (shared incidentStore, Phase 3) is ingested here automatically —
 * that subscription is the local stand-in for the Phase 6 realtime bus,
 * which will push cross-dashboard incidents from the dispatch server.
 */

export type IncidentStatus = 'new' | 'acknowledged' | 'responding' | 'resolved' | 'false-alarm'
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type UavDeployment = 'standby' | 'dispatched' | 'en-route' | 'on-scene' | 'returning'

/** Fleet-level airframe status (Phase 9, Part B). */
export type FleetUavStatus = 'idle' | 'dispatched' | 'returning' | 'charging'

export interface FleetUav {
  id: string
  lat: number
  lng: number
  battery: number
  status: FleetUavStatus
  /** Incident currently tasked to this airframe, if any. */
  incidentId: string | null
  /** Home staging position — the airframe returns here after a tasking. */
  base: [number, number]
}

/** Minimum battery (percent) for an airframe to be considered dispatchable. */
const MIN_DISPATCH_BATTERY = 35

/** Battery level at which a landed airframe is considered fully charged. */
const CHARGED_BATTERY = 80

export interface CommsMessage {
  id: string
  at: number
  /** 'hospital' lets the hospital dashboard coordinate on the same channel. */
  from: 'dispatch' | 'unit' | 'hospital'
  text: string
}

export interface EvidenceItem {
  id: string
  kind: 'photo' | 'video'
  capturedAt: number
  uavId: string
  lat: number
  lng: number
  label: string
  /**
   * Real SHA-256 of (prevHash || custody metadata || mock file bytes), computed
   * via SubtleCrypto at capture time. Empty until the item is sealed.
   */
  integrity: string
  /** Hash of the previous item in this incident's chain, or the genesis marker. */
  prevHash: string
  /** True once `integrity` has been computed. */
  sealed: boolean
  /** Demo-only tamper simulation: flipped bytes on the mock file content. */
  byteMutations?: { index: number; value: number }[]
}

export interface UavState {
  id: string
  deployment: UavDeployment
  battery: number
  lat: number
  lng: number
  altitude: number
  speed: number
}

export interface PoliceIncident {
  id: string
  userName: string
  userPhone: string
  lat: number
  lng: number
  area: string
  startedAt: number
  status: IncidentStatus
  severity: Severity
  /** 'auto' = escalated from a passive-detection pre-alert on the user's device. */
  triggerSource: 'manual' | 'auto'
  /** Human-readable detection reason when triggerSource is 'auto'. */
  autoReason?: string
  vitals: { heartRate: number | null; battery: number | null; simulated: boolean } | null
  assignedUnit: string | null
  officerStatus: 'En route' | 'On scene' | 'Returning' | null
  resolutionNote: string | null
  /**
   * Phase 12 — lifecycle timestamps. Recorded where each transition already
   * happens (no new event model); the incident replay view adapts these
   * plus the timestamped comms log and evidence captures.
   */
  acknowledgedAt?: number
  assignedAt?: number
  uavOnSceneAt?: number
  resolvedAt?: number
  comms: CommsMessage[]
  evidence: EvidenceItem[]
  uav: UavState
  /** True for the live SOS coming from the user dashboard this session. */
  live: boolean
}

export interface ResponseUnit {
  id: string
  callsign: string
  station: string
  lat: number
  lng: number
  status: 'available' | 'en-route' | 'on-scene'
}

/** Dispatch hub — UAVs stage from here. */
export const UAV_BASE: [number, number] = [32.7266, 74.8573]

/**
 * The mock deterrence fleet (Phase 9, Part B): four airframes staged at
 * different positions across Jammu so dispatch can pick the nearest
 * available one per incident instead of always tasking the same airframe.
 */
function seedFleet(): FleetUav[] {
  return [
    { id: 'UAV-01', lat: 32.7266, lng: 74.8573, battery: 92, status: 'idle', incidentId: null, base: [32.7266, 74.8573] },
    { id: 'UAV-02', lat: 32.705, lng: 74.835, battery: 88, status: 'idle', incidentId: null, base: [32.705, 74.835] },
    { id: 'UAV-03', lat: 32.748, lng: 74.885, battery: 64, status: 'idle', incidentId: null, base: [32.748, 74.885] },
    { id: 'UAV-04', lat: 32.682, lng: 74.868, battery: 28, status: 'charging', incidentId: null, base: [32.682, 74.868] },
    { id: 'UAV-05', lat: 32.735, lng: 74.872, battery: 86, status: 'idle', incidentId: null, base: [32.735, 74.872] },
  ]
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(s))
}

const now = Date.now()
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

function ev(
  id: string,
  kind: 'photo' | 'video',
  capturedAt: number,
  uavId: string,
  lat: number,
  lng: number,
  label: string,
): EvidenceItem {
  // Sealed asynchronously right after creation via queueEvidenceSeal so the
  // SHA-256 (SubtleCrypto) work never blocks the store or the telemetry tick.
  return { id, kind, capturedAt, uavId, lat, lng, label, integrity: '', prevHash: '', sealed: false }
}

function uav(
  id: string,
  deployment: UavDeployment,
  lat: number,
  lng: number,
  battery = 92,
): UavState {
  return { id, deployment, battery, lat, lng, altitude: deployment === 'on-scene' ? 45 : 80, speed: deployment === 'en-route' ? 14 : 0 }
}

interface SeedSpec {
  id: string
  userName: string
  userPhone: string
  area: string
  lat: number
  lng: number
  agoMs: number
  status: IncidentStatus
  severity: Severity
  vitals?: { heartRate: number | null; battery: number | null; simulated: boolean }
  assignedUnit?: string
  officerStatus?: 'En route' | 'On scene' | 'Returning'
  resolutionNote?: string
  uavId?: string
  uavDeployment?: UavDeployment
  evidenceCount?: number
}

const SEEDS: SeedSpec[] = [
  { id: 'INC-90412', userName: 'Rohan Verma', userPhone: '+91 98110 22334', area: 'Raghunath Bazaar', lat: 32.73, lng: 74.865, agoMs: 12 * MIN, status: 'new', severity: 'critical', vitals: { heartRate: 118, battery: 64, simulated: false }, uavId: 'UAV-02', uavDeployment: 'en-route' },
  { id: 'INC-90408', userName: 'Sneha Iyer', userPhone: '+91 99201 44556', area: 'Trikuta Nagar', lat: 32.69, lng: 74.87, agoMs: 26 * MIN, status: 'new', severity: 'medium', vitals: { heartRate: 96, battery: 81, simulated: false } },
  { id: 'INC-90397', userName: 'Amit Chauhan', userPhone: '+91 98117 88990', area: 'Gandhi Nagar', lat: 32.697, lng: 74.858, agoMs: 48 * MIN, status: 'responding', severity: 'high', vitals: { heartRate: 104, battery: 72, simulated: false }, assignedUnit: 'D-07', officerStatus: 'On scene', uavId: 'UAV-03', uavDeployment: 'on-scene', evidenceCount: 5 },
  { id: 'INC-90388', userName: 'Pooja Nair', userPhone: '+91 98990 11223', area: 'Channi Himmat', lat: 32.705, lng: 74.885, agoMs: 95 * MIN, status: 'acknowledged', severity: 'medium', vitals: { heartRate: 88, battery: 90, simulated: false }, uavId: 'UAV-01', uavDeployment: 'dispatched' },
  { id: 'INC-90371', userName: 'Vikram Singh', userPhone: '+91 98103 33445', area: 'Janipur', lat: 32.745, lng: 74.845, agoMs: 3 * HOUR, status: 'resolved', severity: 'low', resolutionNote: 'Unit D-14 arrived; user safe, no threat found.', assignedUnit: 'D-14' },
  { id: 'INC-90355', userName: 'Anjali Gupta', userPhone: '+91 99580 66778', area: 'Bantalab', lat: 32.76, lng: 74.83, agoMs: 5 * HOUR, status: 'false-alarm', severity: 'low', resolutionNote: 'False alarm — accidental trigger during workout.', assignedUnit: 'D-03' },
  { id: 'INC-90340', userName: 'Karan Malhotra', userPhone: '+91 98111 99001', area: 'Talab Tillo', lat: 32.735, lng: 74.835, agoMs: 1 * DAY + 2 * HOUR, status: 'resolved', severity: 'medium', resolutionNote: 'Dispute de-escalated on scene.', assignedUnit: 'D-22' },
  { id: 'INC-90322', userName: 'Divya Reddy', userPhone: '+91 99481 22334', area: 'Residency Road', lat: 32.728, lng: 74.862, agoMs: 1 * DAY + 6 * HOUR, status: 'resolved', severity: 'high', resolutionNote: 'Suspect detained, evidence handed to IO.', assignedUnit: 'D-09' },
  { id: 'INC-90301', userName: 'Suresh Yadav', userPhone: '+91 98104 55667', area: 'Satwari', lat: 32.682, lng: 74.845, agoMs: 2 * DAY, status: 'false-alarm', severity: 'low', resolutionNote: 'False alarm — test trigger by user.', assignedUnit: 'D-21' },
  { id: 'INC-90287', userName: 'Meera Joshi', userPhone: '+91 98991 77889', area: 'Shastri Nagar', lat: 32.7, lng: 74.868, agoMs: 3 * DAY, status: 'resolved', severity: 'medium', resolutionNote: 'User escorted to safe zone.', assignedUnit: 'D-07' },
  { id: 'INC-90270', userName: 'Arjun Pillai', userPhone: '+91 98470 11223', area: 'Jewel Chowk', lat: 32.722, lng: 74.86, agoMs: 4 * DAY, status: 'resolved', severity: 'high', resolutionNote: 'UAV footage submitted as evidence.', assignedUnit: 'D-12' },
  { id: 'INC-90255', userName: 'Kavya Menon', userPhone: '+91 98102 33445', area: 'Digiana', lat: 32.685, lng: 74.86, agoMs: 5 * DAY, status: 'false-alarm', severity: 'low', resolutionNote: 'False alarm — duplicate of INC-90254.', assignedUnit: 'D-21' },
  { id: 'INC-90241', userName: 'Rahul Sharma', userPhone: '+91 98110 99002', area: 'Miran Sahib', lat: 32.65, lng: 74.8, agoMs: 6 * DAY, status: 'resolved', severity: 'medium', resolutionNote: 'Patrol deterred loitering group.', assignedUnit: 'D-14' },
  { id: 'INC-90230', userName: 'Nisha Kapoor', userPhone: '+91 99581 44556', area: 'Narwal', lat: 32.7, lng: 74.895, agoMs: 6 * DAY + 8 * HOUR, status: 'resolved', severity: 'low', resolutionNote: 'No incident found on arrival.', assignedUnit: 'D-03' },
]

const UNITS: ResponseUnit[] = [
  { id: 'u-12', callsign: 'D-12', station: 'Jewel Chowk', lat: 32.722, lng: 74.86, status: 'available' },
  { id: 'u-07', callsign: 'D-07', station: 'Gandhi Nagar', lat: 32.697, lng: 74.858, status: 'en-route' },
  { id: 'u-21', callsign: 'D-21', station: 'Satwari', lat: 32.682, lng: 74.845, status: 'available' },
  { id: 'u-03', callsign: 'D-03', station: 'Bantalab', lat: 32.76, lng: 74.83, status: 'available' },
  { id: 'u-14', callsign: 'D-14', station: 'Janipur', lat: 32.745, lng: 74.845, status: 'available' },
  { id: 'u-09', callsign: 'D-09', station: 'Residency Road', lat: 32.728, lng: 74.862, status: 'on-scene' },
]

function seedIncidents(): PoliceIncident[] {
  return SEEDS.map((s, i) => {
    const startedAt = now - s.agoMs
    const uavId = s.uavId ?? `UAV-0${(i % 4) + 1}`
    const deployment = s.uavDeployment ?? 'standby'
    const evidence: EvidenceItem[] = []
    const count = s.evidenceCount ?? 0
    for (let k = 0; k < count; k++) {
      const at = startedAt + (k + 1) * 3 * MIN
      evidence.push(
        ev(
          `${s.id}-EV${k + 1}`,
          k % 3 === 2 ? 'video' : 'photo',
          at,
          uavId,
          s.lat + (k % 2 === 0 ? 0.0004 : -0.0003),
          s.lng + (k % 2 === 0 ? -0.0005 : 0.0004),
          k % 3 === 2 ? 'Overhead sweep clip' : 'Scene still',
        ),
      )
    }
    return {
      id: s.id,
      userName: s.userName,
      userPhone: s.userPhone,
      lat: s.lat,
      lng: s.lng,
      area: s.area,
      startedAt,
      status: s.status,
      severity: s.severity,
      triggerSource: 'manual',
      vitals: s.vitals ?? null,
      assignedUnit: s.assignedUnit ?? null,
      officerStatus: s.officerStatus ?? null,
      resolutionNote: s.resolutionNote ?? null,
      // Phase 12: backfill lifecycle timestamps for the mock register in the
      // same style as the seeded comms log (startedAt + fixed offsets).
      acknowledgedAt: s.status === 'new' ? undefined : startedAt + 90_000,
      assignedAt: s.assignedUnit ? startedAt + 2 * MIN : undefined,
      uavOnSceneAt: deployment === 'on-scene' ? startedAt + 2 * MIN : undefined,
      resolvedAt:
        s.status === 'resolved' || s.status === 'false-alarm' ? startedAt + 30 * MIN : undefined,
      comms:
        s.status === 'responding'
          ? [
              { id: `${s.id}-c1`, at: startedAt + 2 * MIN, from: 'dispatch', text: 'D-07, respond to Karol Bagh SOS. UAV-03 tasked overhead.' },
              { id: `${s.id}-c2`, at: startedAt + 4 * MIN, from: 'unit', text: 'Copy, en route. ETA 6 minutes.' },
              { id: `${s.id}-c3`, at: startedAt + 9 * MIN, from: 'unit', text: 'On scene. UAV visual confirms one individual near the user.' },
            ]
          : [],
      evidence,
      uav: uav(uavId, deployment, deployment === 'standby' ? UAV_BASE[0] : s.lat + 0.004, deployment === 'standby' ? UAV_BASE[1] : s.lng + 0.004),
      live: false,
    }
  })
}

/** A computed flight plan for a tasked UAV. */
export interface FlightPlan {
  incidentId: string
  waypoints: Waypoint[]
  /** Cumulative meters along the route at each waypoint. */
  cumM: number[]
  progressM: number
  totalM: number
  nodesExpanded: number
  computeMs: number
  pathLengthM: number
  replanCount: number
  lastReplanNodes: number
  lastReplanMs: number
  reachable: boolean
}

interface PoliceState {
  incidents: PoliceIncident[]
  units: ResponseUnit[]
  /** The deterrence airframe fleet (Phase 9, Part B). */
  fleet: FleetUav[]
  /** The most recent fleet dispatch decision, surfaced in the UI. */
  dispatchDecision: { uavId: string; incidentId: string; reason: string; at: number } | null
  selectedId: string | null
  /** Toggleable mock airspace restrictions for the UAV grid. */
  zones: NoFlyZone[]
  /** Simulation speed multiplier for UAV movement. */
  timeScale: 1 | 4 | 16
  /** Active flight plans by incident id. */
  plans: Record<string, FlightPlan>
  select: (id: string | null) => void
  acknowledge: (id: string) => void
  setSeverity: (id: string, severity: Severity) => void
  assignNearestUnit: (id: string) => void
  assignUnit: (id: string, callsign: string) => void
  setOfficerStatus: (id: string, status: 'En route' | 'On scene' | 'Returning') => void
  sendComms: (id: string, text: string) => void
  /** Post a message on an incident channel as any participant. */
  postComms: (id: string, from: 'dispatch' | 'unit' | 'hospital', text: string) => void
  resolve: (id: string, note: string) => void
  markFalseAlarm: (id: string, reason: string) => void
  tickTelemetry: () => void
  setTimeScale: (ts: 1 | 4 | 16) => void
  toggleNoFlyZone: (zoneId: string) => void
  /** Compute (or recompute) the flight plan for an incident's tasked UAV. */
  planFlight: (incidentId: string) => void
  /**
   * Phase 10 demo: flip bytes on a mock evidence item's content so tamper
   * detection can be shown firing. Clearly a demonstration affordance.
   */
  tamperEvidenceItem: (incidentId: string, itemId: string) => void
  /** Phase 10 demo: restore an item's original mock bytes. */
  restoreEvidenceItem: (incidentId: string, itemId: string) => void
}

function withIncident(
  incidents: PoliceIncident[],
  id: string,
  fn: (inc: PoliceIncident) => PoliceIncident,
): PoliceIncident[] {
  return incidents.map((inc) => (inc.id === id ? fn(inc) : inc))
}

/* ------------------------------------------------------------------ */
/* Flight planning (Phase 8)                                           */
/* ------------------------------------------------------------------ */

/** UAV cruise speed along a planned route, metres per second. */
const CRUISE_MPS = 14

/** Arrival radius — within this many metres of the route end counts as on-scene. */
const ARRIVE_RADIUS_M = 25

/** Shared coarse airspace grid. Mutated in place so warm D* Lite instances stay valid. */
let flightGrid: OccupancyGrid | null = null

function getFlightGrid(): OccupancyGrid {
  if (!flightGrid) flightGrid = createGrid(JAMMU_GRID_BOUNDS, DEFAULT_CELL_SIZE_M)
  return flightGrid
}

/** Warm D* Lite search state per incident — retained between mid-flight replans. */
const dstarByIncident = new Map<string, DStarLite>()

function freeCell(grid: OccupancyGrid, lat: number, lng: number): Cell {
  return nearestFreeCell(grid, latLngToCell(grid, lat, lng))
}

function makeFlightPlan(incidentId: string, result: PlanResult): FlightPlan {
  const cumM = cumulativeDistances(result.waypoints)
  return {
    incidentId,
    waypoints: result.waypoints,
    cumM,
    progressM: 0,
    totalM: cumM.length > 0 ? cumM[cumM.length - 1] : 0,
    nodesExpanded: result.stats.nodesExpanded,
    computeMs: result.stats.computeMs,
    pathLengthM: result.stats.pathLengthM,
    replanCount: 0,
    lastReplanNodes: 0,
    lastReplanMs: 0,
    reachable: result.reachable,
  }
}

/**
 * Mark fleet airframes as dispatched when seed incidents already have them
 * tasked, so the fleet view and the incident register agree from the start.
 */
function reconcileFleet(incidents: PoliceIncident[], fleet: FleetUav[]): FleetUav[] {
  const tasked = new Map<string, PoliceIncident>()
  for (const inc of incidents) {
    if (inc.uav.deployment !== 'standby') tasked.set(inc.uav.id, inc)
  }
  return fleet.map((f) => {
    const inc = tasked.get(f.id)
    if (!inc) return f
    return { ...f, status: 'dispatched' as const, incidentId: inc.id, lat: inc.uav.lat, lng: inc.uav.lng, battery: inc.uav.battery }
  })
}

/**
 * Fleet dispatch selection (Phase 9, Part B): the nearest airframe that is
 * idle AND has enough battery. Returns the airframe plus a human-readable
 * reason so the decision is visible in the UI, not opaque.
 */
function selectFleetUav(
  fleet: FleetUav[],
  lat: number,
  lng: number,
): { uav: FleetUav; reason: string } | null {
  // Phase 9, Part B: nearest AVAILABLE airframe only — never double-task a
  // busy one or pull a charging one off its pad. Returns null when the whole
  // fleet is committed so the UI can say so honestly.
  const available = fleet.filter((f) => f.status === 'idle' && f.battery >= MIN_DISPATCH_BATTERY)
  if (available.length === 0) return null
  const nearest = available.reduce((best, f) =>
    haversineKm(lat, lng, f.lat, f.lng) < haversineKm(lat, lng, best.lat, best.lng) ? f : best,
  )
  const distKm = haversineKm(lat, lng, nearest.lat, nearest.lng).toFixed(1)
  const reason = `${nearest.id} selected — nearest available, ${Math.round(nearest.battery)}% battery, ${distKm} km away`
  return { uav: nearest, reason }
}

const seededIncidents = seedIncidents()

export const usePoliceStore = create<PoliceState>((set, get) => ({
  incidents: seededIncidents,
  units: UNITS,
  fleet: reconcileFleet(seededIncidents, seedFleet()),
  dispatchDecision: null,
  selectedId: 'INC-90412',
  zones: createNoFlyZones(),
  timeScale: 1,
  plans: {},

  select: (id) => set({ selectedId: id }),

  setTimeScale: (ts) => set({ timeScale: ts }),

  planFlight: (incidentId) => {
    const s = get()
    const inc = s.incidents.find((i) => i.id === incidentId)
    if (!inc) return
    if (inc.uav.deployment !== 'dispatched' && inc.uav.deployment !== 'en-route') return
    const grid = getFlightGrid()
    const start = freeCell(grid, inc.uav.lat, inc.uav.lng)
    const goal = freeCell(grid, inc.lat, inc.lng)
    // The product always plans with D* Lite: provably optimal routes plus
    // incremental replanning when airspace restrictions change mid-flight.
    const dstar = new DStarLite(grid, start, goal)
    const result = dstar.plan()
    dstarByIncident.set(incidentId, dstar)
    set((st) => ({ plans: { ...st.plans, [incidentId]: makeFlightPlan(incidentId, result) } }))
  },

  toggleNoFlyZone: (zoneId) => {
    const zone = get().zones.find((z) => z.id === zoneId)
    if (!zone) return
    const next = !zone.active
    const grid = getFlightGrid()
    const changed = blockRect(grid, zone.bounds, next)
    set((s) => ({
      zones: s.zones.map((z) => (z.id === zoneId ? { ...z, active: next } : z)),
    }))
    if (changed.length === 0) return
    // Incrementally replan every airborne flight from retained D* Lite state.
    let touched = false
    set((s) => {
      const plans: Record<string, FlightPlan> = { ...s.plans }
      for (const inc of s.incidents) {
        if (inc.uav.deployment !== 'en-route' && inc.uav.deployment !== 'dispatched') continue
        const dstar = dstarByIncident.get(inc.id)
        const prev = plans[inc.id]
        if (!dstar || !prev) continue
        dstar.updateBlockedCells(changed)
        const from = freeCell(grid, inc.uav.lat, inc.uav.lng)
        const re = dstar.replan(from)
        const cumM = cumulativeDistances(re.waypoints)
        plans[inc.id] = {
          ...prev,
          waypoints: re.waypoints,
          cumM,
          progressM: 0,
          totalM: cumM.length > 0 ? cumM[cumM.length - 1] : 0,
          replanCount: prev.replanCount + 1,
          lastReplanNodes: re.stats.nodesExpanded,
          lastReplanMs: re.stats.computeMs,
          pathLengthM: re.stats.pathLengthM,
          reachable: re.reachable,
        }
        touched = true
      }
      return touched ? { plans } : s
    })
  },

  acknowledge: (id) => {
    const inc = get().incidents.find((i) => i.id === id)
    const wasNew = inc?.status === 'new'
    set((s) => ({
      incidents: withIncident(s.incidents, id, (cur) =>
        // Phase 12: record when the acknowledgment happened for replay.
        cur.status === 'new' ? { ...cur, status: 'acknowledged', acknowledgedAt: Date.now() } : cur,
      ),
    }))
    // Phase 6: the user's incident timeline advances live.
    if (wasNew && inc?.live) emit('police:ack', { id })
  },

  setSeverity: (id, severity) =>
    set((s) => ({ incidents: withIncident(s.incidents, id, (inc) => ({ ...inc, severity })) })),

  assignNearestUnit: (id) => {
    const s = get()
    const inc = s.incidents.find((i) => i.id === id)
    if (!inc) return
    const available = s.units.filter((u) => u.status === 'available')
    if (available.length === 0) return
    const nearest = available.reduce((best, u) =>
      haversineKm(inc.lat, inc.lng, u.lat, u.lng) < haversineKm(inc.lat, inc.lng, best.lat, best.lng) ? u : best,
    )
    get().assignUnit(id, nearest.callsign)
  },

  assignUnit: (id, callsign) => {
    const inc = get().incidents.find((i) => i.id === id)
    set((s) => ({
      units: s.units.map((u) =>
        u.callsign === callsign ? { ...u, status: 'en-route' } : u,
      ),
      incidents: withIncident(s.incidents, id, (cur) => ({
        ...cur,
        assignedUnit: callsign,
        officerStatus: 'En route',
        // Phase 12: record when the unit was tasked for replay.
        assignedAt: Date.now(),
        status: cur.status === 'new' || cur.status === 'acknowledged' ? 'responding' : cur.status,
        comms: [
          ...cur.comms,
          {
            id: `${id}-dispatch-${Date.now()}`,
            at: Date.now(),
            from: 'dispatch',
            text: `${callsign}, respond to ${cur.area} SOS (${cur.id}). Nearest available unit.`,
          },
        ],
      })),
    }))
    // Phase 6: the user's incident timeline advances live.
    if (inc?.live) emit('police:responding', { id, unit: callsign })
  },

  setOfficerStatus: (id, status) =>
    set((s) => ({
      incidents: withIncident(s.incidents, id, (inc) => ({ ...inc, officerStatus: status })),
    })),

  postComms: (id, from, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    set((s) => ({
      incidents: withIncident(s.incidents, id, (inc) => ({
        ...inc,
        comms: [...inc.comms, { id: `${id}-${from}-${Date.now()}`, at: Date.now(), from, text: trimmed }],
      })),
    }))
  },

  sendComms: (id, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    get().postComms(id, 'dispatch', trimmed)
    // Mock unit reply.
    const replies = [
      'Copy that.',
      'Copy, ETA 4 minutes.',
      'On scene, securing the area.',
      'UAV visual received, moving in.',
      'Standing by for instructions.',
    ]
    window.setTimeout(() => {
      const inc = get().incidents.find((i) => i.id === id)
      if (!inc || inc.status === 'resolved' || inc.status === 'false-alarm') return
      const reply = replies[Math.floor(Math.random() * replies.length)]
      set((s) => ({
        incidents: withIncident(s.incidents, id, (cur) => ({
          ...cur,
          comms: [...cur.comms, { id: `${id}-u-${Date.now()}`, at: Date.now(), from: 'unit', text: reply }],
        })),
      }))
    }, 2500 + Math.random() * 1500)
  },

  resolve: (id, note) => {
    const inc = get().incidents.find((i) => i.id === id)
    // Release the retained D* Lite search state — the flight is over.
    dstarByIncident.delete(id)
    const taskedUavId = inc && inc.uav.deployment !== 'standby' ? inc.uav.id : null
    set((s) => ({
      units: s.units.map((u) => {
        const cur = s.incidents.find((i) => i.id === id)
        return cur && u.callsign === cur.assignedUnit ? { ...u, status: 'available' as const } : u
      }),
      incidents: withIncident(s.incidents, id, (cur) => ({
        ...cur,
        status: 'resolved',
        resolutionNote: note.trim() || 'Resolved.',
        // Phase 12: record when the incident closed for replay.
        resolvedAt: Date.now(),
        uav: { ...cur.uav, deployment: cur.uav.deployment === 'standby' ? 'standby' : 'returning' },
      })),
      // Phase 9, Part B: the airframe flies home to its own base.
      fleet: taskedUavId
        ? s.fleet.map((f) =>
            f.id === taskedUavId ? { ...f, status: 'returning' as const, incidentId: null } : f,
          )
        : s.fleet,
    }))
    if (inc?.live) emit('police:resolved', { id, kind: 'resolved' })
  },

  markFalseAlarm: (id, reason) => {
    const inc = get().incidents.find((i) => i.id === id)
    // Release the retained D* Lite search state — the flight is over.
    dstarByIncident.delete(id)
    const taskedUavId = inc && inc.uav.deployment !== 'standby' ? inc.uav.id : null
    set((s) => ({
      units: s.units.map((u) => {
        const cur = s.incidents.find((i) => i.id === id)
        return cur && u.callsign === cur.assignedUnit ? { ...u, status: 'available' as const } : u
      }),
      incidents: withIncident(s.incidents, id, (cur) => ({
        ...cur,
        status: 'false-alarm',
        resolutionNote: reason,
        // Phase 12: record when the incident closed for replay.
        resolvedAt: Date.now(),
        uav: { ...cur.uav, deployment: cur.uav.deployment === 'standby' ? 'standby' : 'returning' },
      })),
      // Phase 9, Part B: the airframe flies home to its own base.
      fleet: taskedUavId
        ? s.fleet.map((f) =>
            f.id === taskedUavId ? { ...f, status: 'returning' as const, incidentId: null } : f,
          )
        : s.fleet,
    }))
    if (inc?.live) emit('police:resolved', { id, kind: 'false-alarm' })
  },

  tamperEvidenceItem: (incidentId, itemId) => {
    set((s) => ({
      incidents: withIncident(s.incidents, incidentId, (cur) => ({
        ...cur,
        evidence: cur.evidence.map((e) =>
          e.id === itemId ? { ...e, byteMutations: demoCorruptBytes(itemId) } : e,
        ),
      })),
    }))
  },

  restoreEvidenceItem: (incidentId, itemId) => {
    set((s) => ({
      incidents: withIncident(s.incidents, incidentId, (cur) => ({
        ...cur,
        evidence: cur.evidence.map((e) =>
          e.id === itemId ? { ...e, byteMutations: undefined } : e,
        ),
      })),
    }))
  },

  tickTelemetry: () => {
    // Live incidents whose UAV reaches the scene this tick — broadcast after the update.
    const arrivedOnScene: string[] = []
    // Accumulated route progress per flight plan this tick (flushed into state below).
    const planProgress: Record<string, number> = {}
    set((s) => {
      const incidents = s.incidents.map((inc) => {
        const u = inc.uav
        if (u.deployment === 'standby') return inc
        let { lat, lng, battery, altitude, speed } = u
        let deployment: UavDeployment = u.deployment
        const dLat = inc.lat - lat
        const dLng = inc.lng - lng
        const dist = Math.hypot(dLat, dLng)
        // Phase 9, Part B: a tasked airframe returns to its own fleet base.
        const fleetUav = s.fleet.find((f) => f.id === u.id)
        const home: [number, number] = fleetUav?.base ?? UAV_BASE

        if (deployment === 'dispatched') {
          deployment = 'en-route'
          speed = 14
          altitude = 80
        } else if (deployment === 'en-route') {
          // Phase 8: follow the computed flight plan along real route distance.
          const plan = s.plans[inc.id]
          if (plan && plan.reachable && plan.waypoints.length >= 2) {
            const dt = 2 * s.timeScale
            const progressM = Math.min(plan.totalM, plan.progressM + CRUISE_MPS * dt)
            const pos = positionAlong(getFlightGrid(), plan.waypoints, plan.cumM, progressM)
            lat = pos.lat
            lng = pos.lng
            planProgress[inc.id] = progressM
            battery = Math.max(5, battery - 0.25 * s.timeScale)
            speed = 14
            altitude = 80
            if (plan.totalM - progressM <= ARRIVE_RADIUS_M) {
              deployment = 'on-scene'
              speed = 0
              altitude = 45
              lat = inc.lat
              lng = inc.lng
              // Phase 6: the user's incident timeline advances live.
              if (inc.live) arrivedOnScene.push(inc.id)
            }
          } else {
            const step = 0.18
            lat += dLat * step
            lng += dLng * step
            battery = Math.max(5, battery - 0.25)
            if (dist < 0.0008) {
              deployment = 'on-scene'
              speed = 0
              altitude = 45
              // Phase 6: the user's incident timeline advances live.
              if (inc.live) arrivedOnScene.push(inc.id)
            }
          }
        } else if (deployment === 'on-scene') {
          battery = Math.max(5, battery - 0.12)
          // Slow holding orbit around the scene.
          const t = Date.now() / 1000
          lat = inc.lat + 0.0006 * Math.cos(t / 9)
          lng = inc.lng + 0.0006 * Math.sin(t / 9)
        } else if (deployment === 'returning') {
          const bLat = home[0] - lat
          const bLng = home[1] - lng
          const bDist = Math.hypot(bLat, bLng)
          lat += bLat * 0.25
          lng += bLng * 0.25
          battery = Math.max(5, battery - 0.2)
          speed = 14
          altitude = 80
          if (bDist < 0.001) {
            deployment = 'standby'
            speed = 0
          }
        }

        // Mock evidence capture while on scene.
        let evidence = inc.evidence
        if (
          deployment === 'on-scene' &&
          (inc.status === 'responding' || inc.status === 'acknowledged' || inc.status === 'new') &&
          evidence.length < 12 &&
          Math.random() < 0.3
        ) {
          const n = evidence.length + 1
          const item = ev(
            `${inc.id}-EV${n}`,
            n % 4 === 0 ? 'video' : 'photo',
            Date.now(),
            u.id,
            inc.lat + (Math.random() - 0.5) * 0.001,
            inc.lng + (Math.random() - 0.5) * 0.001,
            n % 4 === 0 ? 'Overhead sweep clip' : 'Scene still',
          )
          evidence = [...evidence, item]
          // Phase 10: seal the new item's hash chain link asynchronously.
          void queueEvidenceSeal(inc.id, item)
        }

        return {
          ...inc,
          evidence,
          // Phase 12: record when the UAV reached the scene for replay.
          uavOnSceneAt:
            deployment === 'on-scene' && u.deployment !== 'on-scene' ? Date.now() : inc.uavOnSceneAt,
          uav: { ...u, lat, lng, battery, deployment, altitude, speed },
        }
      })

      // Phase 9, Part B: mirror tasked airframes into the fleet view and
      // trickle-charge idle airframes on their pads.
      const fleet = s.fleet.map((f) => {
        const inc = incidents.find((i) => i.uav.id === f.id && i.uav.deployment !== 'standby')
        if (inc) {
          const dep = inc.uav.deployment
          return {
            ...f,
            lat: inc.uav.lat,
            lng: inc.uav.lng,
            battery: Math.round(inc.uav.battery),
            status: (dep === 'returning' ? 'returning' : 'dispatched') as FleetUavStatus,
            incidentId: inc.id,
          }
        }
        if (f.status === 'returning') {
          // Touched down at its base — charge if the battery is too low to dispatch.
          return {
            ...f,
            lat: f.base[0],
            lng: f.base[1],
            status: (f.battery < MIN_DISPATCH_BATTERY ? 'charging' : 'idle') as FleetUavStatus,
            incidentId: null,
          }
        }
        if (f.status === 'charging') {
          const battery = Math.min(100, f.battery + 2)
          return {
            ...f,
            battery,
            status: (battery >= CHARGED_BATTERY ? 'idle' : 'charging') as FleetUavStatus,
          }
        }
        return f
      })

      return {
        incidents,
        fleet,
        plans:
          Object.keys(planProgress).length === 0
            ? s.plans
            : Object.fromEntries(
                Object.entries(s.plans).map(([id, p]) =>
                  planProgress[id] !== undefined ? [id, { ...p, progressM: planProgress[id] }] : [id, p],
                ),
              ),
      }
    })
    for (const id of arrivedOnScene) emit('police:uav-onscene', { id })
  },
}))

/* ---------- Phase 10: tamper-evident evidence sealing ---------- */

/**
 * Per-incident promise chain tracking the latest sealed hash (the chain head).
 * Sealing is async (SubtleCrypto), so each new item queues behind the previous
 * item's seal — chain order is preserved no matter how fast captures arrive.
 */
const chainHeads = new Map<string, Promise<string>>()

function patchSealedItem(incidentId: string, itemId: string, prevHash: string, integrity: string) {
  usePoliceStore.setState((s) => ({
    incidents: s.incidents.map((i) =>
      i.id === incidentId
        ? {
            ...i,
            evidence: i.evidence.map((e) =>
              e.id === itemId ? { ...e, prevHash, integrity, sealed: true } : e,
            ),
          }
        : i,
    ),
  }))
}

/* ---------- Phase 12: incident replay ---------- */

/**
 * Historical UAV position for the incident replay view. Reuses the recorded
 * flight plan (waypoints + cumulative distances) and the lifecycle
 * timestamps: the airframe is assumed to fly the planned route at cruise
 * speed from dispatch until the recorded on-scene time. Returns null when
 * the incident has no flyable recorded route.
 */
export function replayFlightSnapshot(
  incidentId: string,
  at: number,
): { lat: number; lng: number; progressM: number } | null {
  const s = usePoliceStore.getState()
  const inc = s.incidents.find((i) => i.id === incidentId)
  const plan = s.plans[incidentId]
  if (!inc || !plan || !plan.reachable || plan.waypoints.length < 2) return null
  const dispatchT = inc.startedAt
  if (at <= dispatchT) {
    const w0 = plan.waypoints[0]
    return { lat: w0.lat, lng: w0.lng, progressM: 0 }
  }
  if (inc.uavOnSceneAt && at >= inc.uavOnSceneAt) {
    return { lat: inc.lat, lng: inc.lng, progressM: plan.totalM }
  }
  const progressM = Math.min(plan.totalM, (CRUISE_MPS * (at - dispatchT)) / 1000)
  const pos = positionAlong(getFlightGrid(), plan.waypoints, plan.cumM, progressM)
  return { lat: pos.lat, lng: pos.lng, progressM }
}

/** Queue an evidence item for sealing; resolves with its integrity hash. */
export function queueEvidenceSeal(incidentId: string, item: EvidenceItem): Promise<string> {  const head = chainHeads.get(incidentId) ?? Promise.resolve(EVIDENCE_GENESIS)
  const next = head.then(async (prevHash) => {
    const integrity = await sealEvidenceLink({ ...item, prevHash })
    patchSealedItem(incidentId, item.id, prevHash, integrity)
    return integrity
  })
  chainHeads.set(incidentId, next)
  return next
}

// Seal the seeded evidence chains (oldest first) right after store creation.
for (const inc of usePoliceStore.getState().incidents) {
  if (inc.evidence.length > 0) {
    for (const item of inc.evidence) void queueEvidenceSeal(inc.id, item)
  }
}

/* ---------- Flight plans for seeded airborne incidents ---------- */

for (const inc of usePoliceStore.getState().incidents) {
  if (inc.uav.deployment === 'dispatched' || inc.uav.deployment === 'en-route') {
    usePoliceStore.getState().planFlight(inc.id)
  }
}

/* ---------- Live sync: the user dashboard's SOS appears here ---------- */

let liveSyncInit = false

function toPoliceIncident(a: ActiveIncident, userName: string): PoliceIncident {
  const lat = a.location?.lat ?? 32.7266
  const lng = a.location?.lng ?? 74.8573
  // Phase 9, Part B: task the nearest available fleet airframe, not a random one.
  const fleet = usePoliceStore.getState().fleet
  const selection = selectFleetUav(fleet, lat, lng)
  if (selection) {
    usePoliceStore.setState((s) => ({
      fleet: s.fleet.map((f) =>
        f.id === selection.uav.id ? { ...f, status: 'dispatched' as const, incidentId: a.id } : f,
      ),
      dispatchDecision: { uavId: selection.uav.id, incidentId: a.id, reason: selection.reason, at: Date.now() },
    }))
  } else {
    // Whole fleet committed — say so honestly instead of double-tasking.
    usePoliceStore.setState({
      dispatchDecision: {
        uavId: 'none',
        incidentId: a.id,
        reason: 'No fleet unit currently available — all airframes tasked or charging',
        at: Date.now(),
      },
    })
  }
  return {
    id: a.id,
    userName,
    userPhone: '—',
    lat,
    lng,
    area: a.location ? 'Live position' : 'Location unavailable',
    startedAt: a.startedAt,
    status: 'new',
    severity: 'critical',
    triggerSource: a.triggerSource ?? 'manual',
    autoReason: a.autoReason,
    vitals: { heartRate: a.vitals.heartRate, battery: a.vitals.battery, simulated: a.vitals.simulated },
    assignedUnit: null,
    officerStatus: null,
    resolutionNote: null,
    comms: [],
    evidence: [],
    uav: selection
      ? uav(selection.uav.id, 'dispatched', selection.uav.lat, selection.uav.lng, Math.round(selection.uav.battery))
      : uav('NO-UAV', 'standby', lat, lng),
    live: true,
  }
}

function ingestRemoteSOS(a: ActiveIncident, userName: string) {
  const store = usePoliceStore.getState()
  if (a.status === 'active') {
    const exists = store.incidents.some((i) => i.id === a.id)
    if (!exists) {
      const inc = toPoliceIncident(a, userName)
      usePoliceStore.setState((s) => ({
        incidents: [inc, ...s.incidents],
        selectedId: inc.id,
      }))
      // Phase 8: compute the UAV's flight plan on dispatch.
      usePoliceStore.getState().planFlight(inc.id)
      useNotificationsStore.getState().push({
        title: 'New SOS alert',
        body: `${inc.userName} triggered an emergency alert — UAV tasked.`,
        kind: 'sos',
      })
    }
  } else if (a.status === 'stood-down') {
    const target = store.incidents.find((i) => i.id === a.id)
    if (target && target.live && target.status !== 'resolved' && target.status !== 'false-alarm') {
      store.resolve(a.id, 'Stood down by user from their dashboard.')
    }
  }
}

/** Idempotent — call from the dashboard mount (StrictMode-safe). */
export function initLiveSync() {
  if (liveSyncInit) return
  liveSyncInit = true
  // Same-tab sync: the user dashboard's SOS in this tab appears here.
  const ingestLocal = (a: ActiveIncident | null) => {
    if (!a) return
    ingestRemoteSOS(a, a.userName || useAuthStore.getState().identity?.name?.trim() || 'Unknown user')
  }
  ingestLocal(useIncidentStore.getState().activeIncident)
  useIncidentStore.subscribe((s) => ingestLocal(s.activeIncident))
  // Phase 6 cross-tab sync: SOS from the user dashboard in another tab/window.
  on('sos:triggered', (p: SosTriggeredPayload) => ingestRemoteSOS(p.incident, p.userName))
  on('sos:stood-down', (p: { id: string }) => {
    const store = usePoliceStore.getState()
    const target = store.incidents.find((i) => i.id === p.id)
    if (target && target.live && target.status !== 'resolved' && target.status !== 'false-alarm') {
      store.resolve(p.id, 'Stood down by user from their dashboard.')
    }
  })
}
