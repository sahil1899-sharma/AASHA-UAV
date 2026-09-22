import { create } from 'zustand'
import { useAuthStore } from '../../../shared/state/authStore'
import { useIncidentStore } from '../../../shared/state/incidentStore'
import type { ActiveIncident } from '../../../shared/state/incidentStore'
import { useNotificationsStore } from '../../../shared/state/notificationsStore'
import { haversineKm, usePoliceStore } from '../../police/incidents/policeIncidentStore'
import type { MedicalProfile } from '../../user/profile/medicalStore'
import { on } from '../../../shared/realtime/realtimeBus'
import type { SosTriggeredPayload } from '../../../shared/realtime/realtimeBus'

/**
 * Hospital Authority health-alert state.
 *
 * Medical-response view of incidents: transmitted wearable vitals, trigger
 * type (manual SOS vs automatic fall detection), triage priority, ambulance
 * dispatch, pre-arrival triage notes, and a coordination channel shared with
 * the police incident (same comms log, posted as 'hospital').
 */

export type AlertStatus = 'incoming' | 'responding' | 'in-transit' | 'admitted' | 'cleared' | 'false-alarm'
export type TriagePriority = 'P1' | 'P2' | 'P3'

export interface TriggerInfo {
  type: 'manual' | 'automatic'
  detail: string
}

export interface TriageNote {
  id: string
  at: number
  author: string
  text: string
}

export interface PastVisit {
  id: string
  date: number
  kind: string
  summary: string
  facility: string
}

export interface EmergencyContactInfo {
  name: string
  relation: string
  phone: string
}

export interface HealthAlert {
  id: string
  /** Canonical incident id shared across dashboards (police uses it directly). */
  incidentId: string
  userName: string
  lat: number
  lng: number
  area: string
  startedAt: number
  status: AlertStatus
  triage: TriagePriority
  trigger: TriggerInfo
  vitals: {
    heartRate: number | null
    battery: number | null
    simulated: boolean
    connected: boolean
  }
  /** Linked police incident id for the shared coordination channel. */
  policeIncidentId: string | null
  ambulance: string | null
  triageNotes: TriageNote[]
  /** Mock clinical record for seeded patients. Null for the live SOS user (reads their real profile). */
  record: {
    profile: MedicalProfile
    emergencyContact: EmergencyContactInfo
    visits: PastVisit[]
  } | null
  live: boolean
}

export interface Ambulance {
  id: string
  callsign: string
  base: string
  lat: number
  lng: number
  status: 'available' | 'en-route' | 'at-scene' | 'off-duty'
}

export interface BedWard {
  name: string
  total: number
  occupied: number
}

/** Receiving facility for ETA estimates. */
export const HOSPITAL: { name: string; lat: number; lng: number } = {
  name: 'AASHA Trauma Centre',
  lat: 32.7550,
  lng: 74.8550,
}

/** Mock urban ambulance cruise speed for straight-line ETA estimates. */
export const AMBULANCE_KMH = 38

export function estimateEtaMinutes(lat: number, lng: number): { km: number; minutes: number } {
  const km = haversineKm(lat, lng, HOSPITAL.lat, HOSPITAL.lng)
  return { km, minutes: Math.max(1, Math.round((km / AMBULANCE_KMH) * 60)) }
}

const now = Date.now()
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

interface MockRecord {
  profile: MedicalProfile
  emergencyContact: EmergencyContactInfo
  visits: PastVisit[]
}

function record(
  bloodType: string,
  allergies: string[],
  conditions: string[],
  medications: string[],
  notes: string,
  ec: EmergencyContactInfo,
  visits: PastVisit[],
): MockRecord {
  return { profile: { bloodType, allergies, conditions, medications, notes }, emergencyContact: ec, visits }
}

const SEED_ALERTS: Array<
  Omit<HealthAlert, 'triageNotes' | 'live' | 'incidentId'> & { triageNotes?: TriageNote[] }
> = [
  {
    id: 'H-301',
    userName: 'Rohan Verma',
    lat: 32.73,
    lng: 74.865,
    area: 'Raghunath Bazaar',
    startedAt: now - 12 * MIN,
    status: 'incoming',
    triage: 'P1',
    trigger: { type: 'manual', detail: 'SOS button held for 2 seconds' },
    vitals: { heartRate: 118, battery: 64, simulated: false, connected: true },
    policeIncidentId: 'INC-90412',
    ambulance: null,
    record: record(
      'O+', ['Penicillin'], ['Asthma'], ['Salbutamol inhaler'],
      'Carries inhaler in jacket pocket.',
      { name: 'Sunita Verma', relation: 'Mother', phone: '+91 98110 55667' },
      [
        { id: 'v1', date: now - 210 * DAY, kind: 'Emergency', summary: 'Asthma exacerbation, nebulised and discharged.', facility: 'AASHA Trauma Centre' },
        { id: 'v2', date: now - 400 * DAY, kind: 'Outpatient', summary: 'Routine respiratory review.', facility: 'City Clinic, CP' },
      ],
    ),
  },
  {
    id: 'H-298',
    userName: 'Amit Chauhan',
    lat: 32.697,
    lng: 74.858,
    area: 'Gandhi Nagar',
    startedAt: now - 48 * MIN,
    status: 'responding',
    triage: 'P1',
    trigger: { type: 'manual', detail: 'SOS button held for 2 seconds' },
    vitals: { heartRate: 104, battery: 72, simulated: false, connected: true },
    policeIncidentId: 'INC-90397',
    ambulance: 'AMB-02',
    triageNotes: [
      { id: 'H-298-n1', at: now - 30 * MIN, author: 'Dr. Rao (dispatch)', text: 'Tachycardic at 104 bpm. Possible chest trauma — keep spinal precautions until cleared.' },
    ],
    record: record(
      'B+', [], ['Hypertension'], ['Amlodipine 5mg daily'],
      'Monitor BP on arrival.',
      { name: 'Kavita Chauhan', relation: 'Wife', phone: '+91 98117 22334' },
      [
        { id: 'v1', date: now - 90 * DAY, kind: 'Outpatient', summary: 'Hypertension follow-up, BP 142/90.', facility: 'AASHA Trauma Centre' },
      ],
    ),
  },
  {
    id: 'H-295',
    userName: 'Pooja Nair',
    lat: 32.705,
    lng: 74.885,
    area: 'Channi Himmat',
    startedAt: now - 95 * MIN,
    status: 'incoming',
    triage: 'P1',
    trigger: { type: 'automatic', detail: 'Fall detected by wearable accelerometer — no response to check-in prompt' },
    vitals: { heartRate: 122, battery: 90, simulated: false, connected: true },
    policeIncidentId: 'INC-90388',
    ambulance: null,
    record: record(
      'A-', ['Sulfa drugs'], ['Type 1 diabetes'], ['Insulin glargine'],
      'Check blood glucose immediately on contact.',
      { name: 'Arun Nair', relation: 'Brother', phone: '+91 98990 44556' },
      [
        { id: 'v1', date: now - 45 * DAY, kind: 'Emergency', summary: 'Hypoglycaemic episode, stabilised.', facility: 'AASHA Trauma Centre' },
        { id: 'v2', date: now - 300 * DAY, kind: 'Outpatient', summary: 'Endocrine review, HbA1c 7.1%.', facility: 'City Clinic, Saket' },
      ],
    ),
  },
  {
    id: 'H-290',
    userName: 'Vikram Singh',
    lat: 32.745,
    lng: 74.845,
    area: 'Janipur',
    startedAt: now - 3 * HOUR,
    status: 'admitted',
    triage: 'P3',
    trigger: { type: 'manual', detail: 'SOS button held for 2 seconds' },
    vitals: { heartRate: 88, battery: 55, simulated: false, connected: false },
    policeIncidentId: 'INC-90371',
    ambulance: 'AMB-04',
    triageNotes: [
      { id: 'H-290-n1', at: now - 2 * HOUR, author: 'Dr. Rao (dispatch)', text: 'Vitals stable en route. Bed reserved in Emergency ward.' },
    ],
    record: record(
      'AB+', [], [], [], '',
      { name: 'Harpreet Singh', relation: 'Brother', phone: '+91 98103 77889' },
      [
        { id: 'v1', date: now - 3 * HOUR, kind: 'Emergency', summary: 'Admitted for observation after SOS event.', facility: 'AASHA Trauma Centre' },
      ],
    ),
  },
  {
    id: 'H-284',
    userName: 'Karan Malhotra',
    lat: 32.735,
    lng: 74.835,
    area: 'Talab Tillo',
    startedAt: now - 5 * HOUR,
    status: 'in-transit',
    triage: 'P2',
    trigger: { type: 'automatic', detail: 'Fall detected by wearable accelerometer — user confirmed distress via check-in' },
    vitals: { heartRate: 96, battery: 41, simulated: false, connected: true },
    policeIncidentId: 'INC-90340',
    ambulance: 'AMB-01',
    record: record(
      'O-', ['Latex'], ['Epilepsy'], ['Levetiracetam 500mg twice daily'],
      'Post-ictal confusion possible — reorient gently.',
      { name: 'Ritu Malhotra', relation: 'Sister', phone: '+91 98111 33445' },
      [
        { id: 'v1', date: now - 120 * DAY, kind: 'Emergency', summary: 'Seizure episode, observed 4h, discharged.', facility: 'AASHA Trauma Centre' },
      ],
    ),
  },
  {
    id: 'H-277',
    userName: 'Divya Reddy',
    lat: 32.728,
    lng: 74.862,
    area: 'Residency Road',
    startedAt: now - 1 * DAY - 6 * HOUR,
    status: 'cleared',
    triage: 'P2',
    trigger: { type: 'manual', detail: 'SOS button held for 2 seconds' },
    vitals: { heartRate: 110, battery: 77, simulated: false, connected: false },
    policeIncidentId: 'INC-90322',
    ambulance: 'AMB-03',
    record: record(
      'B-', [], [], [], '',
      { name: 'Sandeep Reddy', relation: 'Husband', phone: '+91 99481 66778' },
      [
        { id: 'v1', date: now - 1 * DAY - 6 * HOUR, kind: 'Emergency', summary: 'Evaluated and cleared on scene — no transport needed.', facility: 'Field assessment' },
      ],
    ),
  },
  {
    id: 'H-270',
    userName: 'Suresh Yadav',
    lat: 32.682,
    lng: 74.845,
    area: 'Satwari',
    startedAt: now - 2 * DAY,
    status: 'false-alarm',
    triage: 'P3',
    trigger: { type: 'automatic', detail: 'Fall detected by wearable accelerometer — user cancelled within 30 seconds' },
    vitals: { heartRate: 78, battery: 88, simulated: false, connected: false },
    policeIncidentId: 'INC-90301',
    ambulance: null,
    record: record(
      'A+', [], ['Arthritis'], ['Paracetamol as needed'],
      '',
      { name: 'Geeta Yadav', relation: 'Wife', phone: '+91 98104 99001' },
      [],
    ),
  },
]

const AMBULANCES: Ambulance[] = [
  { id: 'a1', callsign: 'AMB-01', base: 'Talab Tillo depot', lat: 32.735, lng: 74.835, status: 'en-route' },
  { id: 'a2', callsign: 'AMB-02', base: 'Gandhi Nagar depot', lat: 32.697, lng: 74.858, status: 'en-route' },
  { id: 'a3', callsign: 'AMB-03', base: 'Trauma Centre bay', lat: 32.755, lng: 74.855, status: 'available' },
  { id: 'a4', callsign: 'AMB-04', base: 'Janipur depot', lat: 32.745, lng: 74.845, status: 'at-scene' },
  { id: 'a5', callsign: 'AMB-05', base: 'Trikuta Nagar depot', lat: 32.69, lng: 74.87, status: 'available' },
]

const BEDS: BedWard[] = [
  { name: 'ICU', total: 24, occupied: 19 },
  { name: 'Emergency', total: 40, occupied: 33 },
  { name: 'General', total: 120, occupied: 96 },
  { name: 'Pediatric', total: 36, occupied: 21 },
]

function withAlert(alerts: HealthAlert[], id: string, fn: (a: HealthAlert) => HealthAlert): HealthAlert[] {
  return alerts.map((a) => (a.id === id ? fn(a) : a))
}

interface HealthState {
  alerts: HealthAlert[]
  ambulances: Ambulance[]
  beds: BedWard[]
  selectedId: string | null
  select: (id: string | null) => void
  setTriage: (id: string, triage: TriagePriority) => void
  addTriageNote: (id: string, author: string, text: string) => void
  dispatchAmbulance: (id: string) => void
  setAlertStatus: (id: string, status: AlertStatus) => void
  markFalseAlarm: (id: string) => void
}

export const useHealthStore = create<HealthState>((set, get) => ({
  alerts: SEED_ALERTS.map((s) => ({
    ...s,
    incidentId: s.policeIncidentId ?? s.id,
    triageNotes: s.triageNotes ?? [],
    live: false,
  })),
  ambulances: AMBULANCES,
  beds: BEDS,
  selectedId: 'H-301',

  select: (id) => set({ selectedId: id }),

  setTriage: (id, triage) =>
    set((s) => ({ alerts: withAlert(s.alerts, id, (a) => ({ ...a, triage })) })),

  addTriageNote: (id, author, text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    set((s) => ({
      alerts: withAlert(s.alerts, id, (a) => ({
        ...a,
        triageNotes: [...a.triageNotes, { id: `${id}-n${Date.now()}`, at: Date.now(), author, text: trimmed }],
      })),
    }))
  },

  dispatchAmbulance: (id) => {
    const s = get()
    const alert = s.alerts.find((a) => a.id === id)
    if (!alert || alert.ambulance) return
    const available = s.ambulances.filter((a) => a.status === 'available')
    if (available.length === 0) return
    const nearest = available.reduce((best, a) =>
      haversineKm(alert.lat, alert.lng, a.lat, a.lng) < haversineKm(alert.lat, alert.lng, best.lat, best.lng) ? a : best,
    )
    set((st) => ({
      ambulances: st.ambulances.map((a) => (a.id === nearest.id ? { ...a, status: 'en-route' as const } : a)),
      alerts: withAlert(st.alerts, id, (a) => ({
        ...a,
        ambulance: nearest.callsign,
        status: a.status === 'incoming' ? 'responding' : a.status,
      })),
    }))
    // Log the dispatch on the shared coordination channel when linked.
    if (alert.policeIncidentId) {
      usePoliceStore
        .getState()
        .postComms(alert.policeIncidentId, 'hospital', `${nearest.callsign} dispatched to ${alert.area} — ETA ${estimateEtaMinutes(alert.lat, alert.lng).minutes} min.`)
    }
  },

  setAlertStatus: (id, status) =>
    set((s) => ({
      alerts: withAlert(s.alerts, id, (a) => ({ ...a, status })),
      ambulances:
        status === 'admitted' || status === 'cleared' || status === 'false-alarm'
          ? s.ambulances.map((am) => {
              const alert = s.alerts.find((x) => x.id === id)
              return alert && am.callsign === alert.ambulance ? { ...am, status: 'available' as const } : am
            })
          : s.ambulances,
    })),

  markFalseAlarm: (id) => get().setAlertStatus(id, 'false-alarm'),
}))

/* ---------- Live sync: the user dashboard's SOS becomes a health alert ---------- */

let liveSyncInit = false

function toHealthAlert(a: ActiveIncident, userName: string): HealthAlert {
  const hr = a.vitals.heartRate
  const isAuto = a.triggerSource === 'auto'
  return {
    id: `H-${a.id.replace('inc-', '').toUpperCase()}`,
    incidentId: a.id,
    userName,
    lat: a.location?.lat ?? HOSPITAL.lat,
    lng: a.location?.lng ?? HOSPITAL.lng,
    area: a.location ? 'Live position' : 'Location unavailable',
    startedAt: a.startedAt,
    status: 'incoming',
    triage: hr != null && hr > 110 ? 'P1' : 'P2',
    trigger: isAuto
      ? { type: 'automatic', detail: `Passive anomaly detection — ${a.autoReason ?? 'pre-alert not cancelled'}` }
      : { type: 'manual', detail: 'SOS button held for 2 seconds' },
    vitals: {
      heartRate: a.vitals.heartRate,
      battery: a.vitals.battery,
      simulated: a.vitals.simulated,
      connected: true,
    },
    policeIncidentId: a.id,
    ambulance: null,
    triageNotes: [],
    // The live user's real profile is read from the shared medical store —
    // same underlying record they maintain on the user dashboard.
    record: null,
    live: true,
  }
}

/** Idempotent — call from the dashboard mount (StrictMode-safe). */
export function initHealthSync() {
  if (liveSyncInit) return
  liveSyncInit = true
  const ingestSOS = (a: ActiveIncident, userName: string) => {
    const store = useHealthStore.getState()
    const id = `H-${a.id.replace('inc-', '').toUpperCase()}`
    if (a.status === 'active') {
      if (!store.alerts.some((x) => x.id === id)) {
        const alert = toHealthAlert(a, userName)
        useHealthStore.setState((s) => ({ alerts: [alert, ...s.alerts], selectedId: alert.id }))
        useNotificationsStore.getState().push({
          title: 'Incoming health alert',
          body: `${alert.userName} triggered an SOS — vitals transmitted.`,
          kind: 'sos',
        })
      }
    } else if (a.status === 'stood-down') {
      const target = store.alerts.find((x) => x.id === id)
      if (target && target.status !== 'cleared' && target.status !== 'false-alarm') {
        store.setAlertStatus(id, 'cleared')
      }
    }
  }
  const ingestLocal = (a: ActiveIncident | null) => {
    if (!a) return
    ingestSOS(a, a.userName || useAuthStore.getState().identity?.name?.trim() || 'Unknown user')
  }
  // Same-tab sync.
  ingestLocal(useIncidentStore.getState().activeIncident)
  useIncidentStore.subscribe((s) => ingestLocal(s.activeIncident))
  // Phase 6 cross-tab sync: SOS from the user dashboard in another tab/window.
  on('sos:triggered', (p: SosTriggeredPayload) => ingestSOS(p.incident, p.userName))
  on('sos:stood-down', (p: { id: string }) => {
    const id = `H-${p.id.replace('inc-', '').toUpperCase()}`
    const store = useHealthStore.getState()
    const target = store.alerts.find((x) => x.id === id)
    if (target && target.live && target.status !== 'cleared' && target.status !== 'false-alarm') {
      store.setAlertStatus(id, 'cleared')
    }
  })
}
