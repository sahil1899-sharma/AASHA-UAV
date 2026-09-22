import { create } from 'zustand'
import { useNotificationsStore } from './notificationsStore'
import { useAuthStore } from './authStore'
import { emit, on } from '../realtime/realtimeBus'
import type { PoliceRespondingPayload, PoliceResolvedPayload } from '../realtime/realtimeBus'

/**
 * Shared active-incident state for the AASHA-UAV platform.
 *
 * PHASE 6 SEAM: this store is the single source of truth for the live
 * incident. In Phase 6 it gets broadcast across dashboards (police and
 * hospital see the user's SOS live) via the realtime bus in
 * shared/realtime/. Until then it is local mock state — but every
 * dashboard already reads from here, so nothing but the transport changes.
 */

export type IncidentStageId = 'triggered' | 'dispatch' | 'uav' | 'responder' | 'closed'

export interface IncidentVitals {
  heartRate: number | null
  battery: number | null
  /** True when vitals came from the clearly-labeled simulator, not hardware. */
  simulated: boolean
}

export interface IncidentLocation {
  lat: number
  lng: number
  accuracy: number | null
}

export interface IncidentStage {
  id: IncidentStageId
  label: string
  detail: string
  at: number
}

export interface ActiveIncident {
  id: string
  startedAt: number
  /** Display name of the person who triggered the alert. */
  userName: string
  /** 'manual' = SOS button hold · 'auto' = escalated from a passive-detection pre-alert. */
  triggerSource: 'manual' | 'auto'
  /** Human-readable detection reason when triggerSource is 'auto'. */
  autoReason?: string
  location: IncidentLocation | null
  vitals: IncidentVitals
  stages: IncidentStage[]
  status: 'active' | 'stood-down'
}

interface IncidentState {
  activeIncident: ActiveIncident | null
  trigger: (input: {
    location: IncidentLocation | null
    vitals: IncidentVitals
    triggerSource?: 'manual' | 'auto'
    autoReason?: string
    /** Overrides the logged-in identity's name in cross-dashboard payloads. */
    userName?: string
  }) => void
  standDown: () => void
  /** Idempotent: adds the stage only if it is not already present. */
  advanceStage: (id: string, stage: Omit<IncidentStage, 'at'>) => void
}

/** Mocked downstream progression — dispatch → UAV → responder. */
const STAGE_PLAN: { id: IncidentStageId; label: string; detail: string; delayMs: number }[] = [
  {
    id: 'dispatch',
    label: 'Dispatch acknowledged',
    detail: 'Nearest dispatch server accepted the alert.',
    delayMs: 6000,
  },
  {
    id: 'uav',
    label: 'UAV en route',
    detail: 'Deterrence UAV tasked — converging on your location.',
    delayMs: 14000,
  },
  {
    id: 'responder',
    label: 'Responder en route',
    detail: 'Nearest response unit dispatched to the scene.',
    delayMs: 24000,
  },
]

let stageTimers: number[] = []

function clearStageTimers() {
  for (const t of stageTimers) window.clearTimeout(t)
  stageTimers = []
}

export const useIncidentStore = create<IncidentState>((set, get) => ({
  activeIncident: null,

  trigger: ({ location, vitals, triggerSource = 'manual', autoReason, userName: nameOverride }) => {
    clearStageTimers()
    const startedAt = Date.now()
    const isAuto = triggerSource === 'auto'
    const userName = nameOverride?.trim() || useAuthStore.getState().identity?.name?.trim() || 'Unknown user'
    const incident: ActiveIncident = {
      id: `inc-${startedAt.toString(36)}`,
      startedAt,
      userName,
      triggerSource,
      autoReason: isAuto ? autoReason : undefined,
      location,
      vitals,
      stages: [
        {
          id: 'triggered',
          label: isAuto ? 'Auto-detected alert' : 'SOS triggered',
          detail: isAuto
            ? `Passive monitoring detected a possible emergency${autoReason ? ` — ${autoReason}` : ''}. Pre-alert was not cancelled.`
            : location
              ? 'Alert sent with your live location.'
              : 'Alert sent — location unavailable, last known area used.',
          at: startedAt,
        },
      ],
      status: 'active',
    }
    set({ activeIncident: incident })
    useNotificationsStore.getState().push({
      title: isAuto ? 'Automatic alert sent' : 'SOS alert sent',
      body: isAuto
        ? 'Passive detection escalated — responders notified.'
        : 'Responders notified — help is on the way.',
      kind: 'sos',
    })
    // Phase 6: broadcast so police and hospital dashboards react live.
    emit('sos:triggered', { incident, userName })

    for (const plan of STAGE_PLAN) {
      const timer = window.setTimeout(() => {
        const current = get().activeIncident
        if (!current || current.status !== 'active') return
        const stages: IncidentStage[] = [
          ...current.stages,
          { id: plan.id, label: plan.label, detail: plan.detail, at: Date.now() },
        ]
        set({ activeIncident: { ...current, stages } })
        useNotificationsStore.getState().push({
          title: plan.label,
          body: plan.detail,
          kind: 'sos',
        })
      }, plan.delayMs)
      stageTimers.push(timer)
    }
  },

  standDown: () => {
    clearStageTimers()
    const current = get().activeIncident
    if (!current) return
    set({ activeIncident: { ...current, status: 'stood-down' } })
    emit('sos:stood-down', { id: current.id })
    useNotificationsStore.getState().push({
      title: "Stood down — you're safe",
      body: 'The alert was cancelled. Responders have been notified.',
      kind: 'system',
    })
  },

  advanceStage: (id, stage) => {
    const current = get().activeIncident
    if (!current || current.id !== id || current.stages.some((s) => s.id === stage.id)) return
    set({
      activeIncident: {
        ...current,
        stages: [...current.stages, { ...stage, at: Date.now() }],
      },
    })
    useNotificationsStore.getState().push({ title: stage.label, body: stage.detail, kind: 'sos' })
  },
}))

/* ---------- Phase 6: react to police actions broadcast from other tabs ---------- */

let incidentBusInit = false

/** Idempotent — call from the user dashboard mount (StrictMode-safe). */
export function initIncidentBus() {
  if (incidentBusInit) return
  incidentBusInit = true
  const advance = useIncidentStore.getState().advanceStage

  on('police:ack', (p: { id: string }) => {
    advance(p.id, {
      id: 'dispatch',
      label: 'Dispatch acknowledged',
      detail: 'Police dispatch acknowledged the alert.',
    })
  })

  on('police:uav-onscene', (p: { id: string }) => {
    advance(p.id, {
      id: 'uav',
      label: 'UAV on scene',
      detail: 'Deterrence UAV is overhead at your location.',
    })
  })

  on('police:responding', (p: PoliceRespondingPayload) => {
    advance(p.id, {
      id: 'responder',
      label: 'Responder en route',
      detail: `${p.unit} dispatched to the scene.`,
    })
  })

  on('police:resolved', (p: PoliceResolvedPayload) => {
    advance(p.id, {
      id: 'closed',
      label: p.kind === 'false-alarm' ? 'Closed as false alarm' : 'Incident resolved',
      detail: 'Dispatch closed the incident.',
    })
  })
}
