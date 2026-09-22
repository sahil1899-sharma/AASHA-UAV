import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useWearableStore } from '../bluetooth/wearableStore'
import { useIncidentStore } from '../../../shared/state/incidentStore'
import type { IncidentLocation } from '../../../shared/state/incidentStore'
import { useNotificationsStore } from '../../../shared/state/notificationsStore'

/**
 * Passive anomaly detection (Phase 9, Part A).
 *
 * Watches the connected wearable's live heart-rate stream plus the phone's
 * motion sensor (DeviceMotion API) for distress signatures. These are
 * simple, documented heuristics — NOT a machine-learning model:
 *
 *  1. HEART-RATE SPIKE — the trailing baseline is the mean of heart-rate
 *     samples from the last 5 minutes, excluding the most recent 30 seconds
 *     (so the spike itself can't contaminate the baseline). A spike fires
 *     when the latest reading exceeds baseline + `hrSpikeBpm` (default 40).
 *     At least 10 baseline samples are required before detection arms.
 *
 *  2. FALL-LIKE MOTION — a sudden acceleration spike (|a| > ~2.4 g, i.e.
 *     23.5 m/s² on accelerationIncludingGravity) followed by stillness:
 *     |a| stays within 8.5–11.5 m/s² with a range under 1.5 m/s² for
 *     `stillnessSecs` (default 4 s).
 *
 * When either heuristic fires, NO SOS is sent immediately. Instead a
 * PRE-ALERT starts: a visible, cancellable `preAlertSecs` (default 15 s)
 * countdown with an "I'm OK" button. If it lapses, the incident escalates
 * through the exact same SOS flow as the manual trigger, flagged
 * triggerSource: 'auto' so police and hospital dashboards can tell it apart.
 *
 * Motion comes from the phone running this app via the DeviceMotion API —
 * treated as a proxy for the wearable's own motion sensor, and labeled as
 * such wherever it is shown.
 */

export type AnomalyReason = 'hr-spike' | 'fall'

export interface PreAlertRecord {
  id: string
  at: number
  reason: AnomalyReason
  /** Human-readable detail of what fired, e.g. "142 bpm vs 68 bpm baseline". */
  detail: string
  outcome: 'cancelled' | 'escalated' | 'false-positive'
  /** True when the readings that fired came from the simulator. */
  simulated: boolean
}

export interface AnomalyConfig {
  /** BPM above the trailing baseline that counts as a spike. */
  hrSpikeBpm: number
  /** Seconds of motion stillness required after an acceleration spike. */
  stillnessSecs: number
  /** Pre-alert countdown length in seconds. */
  preAlertSecs: number
}

interface HrSample {
  hr: number
  at: number
}

const BASELINE_WINDOW_MS = 5 * 60_000
const BASELINE_EXCLUDE_MS = 30_000
const MIN_BASELINE_SAMPLES = 10
const MIN_BASELINE_BPM = 40
const FALL_SPIKE_MS2 = 23.5
const STILL_MIN_MS2 = 8.5
const STILL_MAX_MS2 = 11.5
const STILL_RANGE_MS2 = 1.5
/** No new pre-alert within this long of the previous one resolving. */
const REFIRE_COOLDOWN_MS = 90_000

export const REASON_LABEL: Record<AnomalyReason, string> = {
  'hr-spike': 'Heart-rate spike',
  fall: 'Possible fall',
}

interface AnomalyState {
  monitoring: boolean
  config: AnomalyConfig
  /** null = not yet probed · true/false = DeviceMotion availability. */
  motionAvailable: boolean | null
  motionPermission: 'unknown' | 'granted' | 'denied' | 'prompt'
  baselineBpm: number | null
  samplesInWindow: number
  preAlert: { reason: AnomalyReason; detail: string; endsAt: number; remaining: number } | null
  history: PreAlertRecord[]
  lastPreAlertAt: number | null
  setMonitoring: (on: boolean) => void
  setConfig: (patch: Partial<AnomalyConfig>) => void
  cancelPreAlert: () => void
  escalateNow: () => void
  markFalsePositive: (id: string) => void
  clearHistory: () => void
  /** Feed a synthetic anomaly through the real detection path (sensor self-test). */
  selfTest: (reason: AnomalyReason) => void
}

/* ---------- module-scope engine state (not serializable, never in React state) ---------- */

let hrSamples: HrSample[] = []
let hrUnsub: (() => void) | null = null
let motionListener: ((e: DeviceMotionEvent) => void) | null = null
let countdownTimer: number | null = null

type FallPhase = 'idle' | 'watching-stillness'
let fallPhase: FallPhase = 'idle'
let stillnessStart = 0
let stillMin = Infinity
let stillMax = -Infinity

function pruneSamples(now: number) {
  hrSamples = hrSamples.filter((s) => now - s.at <= BASELINE_WINDOW_MS)
}

function computeBaseline(now: number): { mean: number; count: number } | null {
  pruneSamples(now)
  const eligible = hrSamples.filter((s) => now - s.at > BASELINE_EXCLUDE_MS)
  if (eligible.length < MIN_BASELINE_SAMPLES) return null
  const mean = eligible.reduce((a, s) => a + s.hr, 0) / eligible.length
  if (mean < MIN_BASELINE_BPM) return null
  return { mean, count: eligible.length }
}

function detectionArmed(): boolean {
  const s = useAnomalyStore.getState()
  if (!s.monitoring || s.preAlert) return false
  if (s.lastPreAlertAt && Date.now() - s.lastPreAlertAt < REFIRE_COOLDOWN_MS) return false
  const incident = useIncidentStore.getState().activeIncident
  if (incident?.status === 'active') return false
  return useWearableStore.getState().status === 'connected'
}

function firePreAlert(reason: AnomalyReason, detail: string) {
  const s = useAnomalyStore.getState()
  if (!detectionArmed()) return
  const endsAt = Date.now() + s.config.preAlertSecs * 1000
  useAnomalyStore.setState({
    preAlert: { reason, detail, endsAt, remaining: s.config.preAlertSecs },
    lastPreAlertAt: Date.now(),
  })
  useNotificationsStore.getState().push({
    title: 'Possible emergency detected',
    body: `${REASON_LABEL[reason]} — confirm you're OK or an alert will be sent.`,
    kind: 'sos',
  })
  if (countdownTimer !== null) window.clearInterval(countdownTimer)
  countdownTimer = window.setInterval(() => {
    const cur = useAnomalyStore.getState().preAlert
    if (!cur) {
      if (countdownTimer !== null) window.clearInterval(countdownTimer)
      countdownTimer = null
      return
    }
    const remaining = Math.max(0, Math.ceil((cur.endsAt - Date.now()) / 1000))
    if (remaining <= 0) {
      if (countdownTimer !== null) window.clearInterval(countdownTimer)
      countdownTimer = null
      void escalatePreAlert()
      return
    }
    useAnomalyStore.setState({ preAlert: { ...cur, remaining } })
  }, 250)
}

function recordOutcome(outcome: PreAlertRecord['outcome'], reason: AnomalyReason, detail: string) {
  const simulated = useWearableStore.getState().isSimulated
  const rec: PreAlertRecord = {
    id: `pa-${Date.now().toString(36)}`,
    at: Date.now(),
    reason,
    detail,
    outcome,
    simulated,
  }
  useAnomalyStore.setState((s) => ({ history: [rec, ...s.history].slice(0, 50) }))
}

function locateOnce(): Promise<IncidentLocation | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null)
      return
    }
    const timer = window.setTimeout(() => resolve(null), 8000)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer)
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        })
      },
      () => {
        window.clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 },
    )
  })
}

async function escalatePreAlert() {
  const s = useAnomalyStore.getState()
  const pre = s.preAlert
  if (!pre) return
  if (countdownTimer !== null) window.clearInterval(countdownTimer)
  countdownTimer = null
  useAnomalyStore.setState({ preAlert: null })
  recordOutcome('escalated', pre.reason, pre.detail)
  const location = await locateOnce()
  const w = useWearableStore.getState()
  useIncidentStore.getState().trigger({
    location,
    vitals: {
      heartRate: w.status === 'connected' ? w.heartRate : null,
      battery: w.status === 'connected' ? w.battery : null,
      simulated: w.isSimulated,
    },
    triggerSource: 'auto',
    autoReason: `${REASON_LABEL[pre.reason]} — ${pre.detail}`,
  })
}

function ingestHeartRate(hr: number) {
  const now = Date.now()
  hrSamples.push({ hr, at: now })
  pruneSamples(now)
  const baseline = computeBaseline(now)
  useAnomalyStore.setState({
    baselineBpm: baseline ? Math.round(baseline.mean) : null,
    samplesInWindow: hrSamples.length,
  })
  if (!detectionArmed() || !baseline) return
  const threshold = useAnomalyStore.getState().config.hrSpikeBpm
  if (hr >= baseline.mean + threshold) {
    firePreAlert('hr-spike', `${hr} bpm vs ${Math.round(baseline.mean)} bpm baseline`)
  }
}

function ingestMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity
  if (!a || a.x == null || a.y == null || a.z == null) return
  const mag = Math.hypot(a.x, a.y, a.z)
  const now = Date.now()
  const stillnessSecs = useAnomalyStore.getState().config.stillnessSecs

  if (fallPhase === 'idle') {
    if (mag > FALL_SPIKE_MS2) {
      fallPhase = 'watching-stillness'
      stillnessStart = now
      stillMin = Infinity
      stillMax = -Infinity
    }
    return
  }

  // watching-stillness: every sample must look like lying still.
  if (mag >= STILL_MIN_MS2 && mag <= STILL_MAX_MS2) {
    stillMin = Math.min(stillMin, mag)
    stillMax = Math.max(stillMax, mag)
    if (stillMax - stillMin > STILL_RANGE_MS2) {
      fallPhase = 'idle' // too much movement — not a fall
      return
    }
    if (now - stillnessStart >= stillnessSecs * 1000) {
      fallPhase = 'idle'
      if (detectionArmed()) {
        firePreAlert('fall', 'Sudden motion spike followed by stillness (phone motion sensor)')
      }
    }
  } else {
    fallPhase = 'idle' // moved again — not a fall
  }
}

function attachMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.DeviceMotionEvent === 'undefined') {
    useAnomalyStore.setState({ motionAvailable: false })
    return false
  }
  const DME = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  const ensure = () => {
    if (motionListener) return
    motionListener = (e: DeviceMotionEvent) => ingestMotion(e)
    window.addEventListener('devicemotion', motionListener)
    useAnomalyStore.setState({ motionAvailable: true, motionPermission: 'granted' })
  }
  if (typeof DME.requestPermission === 'function') {
    // iOS 13+: permission must be requested from a user gesture.
    useAnomalyStore.setState({ motionPermission: 'prompt' })
    DME.requestPermission()
      .then((res) => {
        if (res === 'granted') ensure()
        else useAnomalyStore.setState({ motionAvailable: false, motionPermission: 'denied' })
      })
      .catch(() => useAnomalyStore.setState({ motionAvailable: false, motionPermission: 'denied' }))
    return true
  }
  ensure()
  return true
}

function detachMotion() {
  if (motionListener) {
    window.removeEventListener('devicemotion', motionListener)
    motionListener = null
  }
  fallPhase = 'idle'
}

function attachHeartRate() {
  if (hrUnsub) return
  let lastHr: number | null = useWearableStore.getState().heartRate
  hrUnsub = useWearableStore.subscribe((s) => {
    if (s.heartRate !== null && s.heartRate !== lastHr) {
      lastHr = s.heartRate
      ingestHeartRate(s.heartRate)
    }
    if (s.status !== 'connected') {
      lastHr = s.heartRate
    }
  })
}

function detachHeartRate() {
  if (hrUnsub) {
    hrUnsub()
    hrUnsub = null
  }
}

export const useAnomalyStore = create<AnomalyState>()(
  persist(
    (set, get) => ({
      monitoring: false,
      config: { hrSpikeBpm: 40, stillnessSecs: 4, preAlertSecs: 15 },
      motionAvailable: null,
      motionPermission: 'unknown',
      baselineBpm: null,
      samplesInWindow: 0,
      preAlert: null,
      history: [],
      lastPreAlertAt: null,

      setMonitoring: (on) => {
        if (on === get().monitoring) return
        if (on) {
          hrSamples = []
          fallPhase = 'idle'
          attachHeartRate()
          attachMotion()
          set({ monitoring: true, baselineBpm: null, samplesInWindow: 0 })
          useNotificationsStore.getState().push({
            title: 'Passive monitoring on',
            body: 'Watching heart rate and motion for distress signs.',
            kind: 'system',
          })
        } else {
          detachHeartRate()
          detachMotion()
          if (countdownTimer !== null) window.clearInterval(countdownTimer)
          countdownTimer = null
          set({ monitoring: false, preAlert: null, baselineBpm: null, samplesInWindow: 0 })
        }
      },

      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),

      cancelPreAlert: () => {
        const pre = get().preAlert
        if (!pre) return
        if (countdownTimer !== null) window.clearInterval(countdownTimer)
        countdownTimer = null
        set({ preAlert: null })
        recordOutcome('cancelled', pre.reason, pre.detail)
        useNotificationsStore.getState().push({
          title: 'Pre-alert cancelled',
          body: "Glad you're OK — no alert was sent.",
          kind: 'system',
        })
      },

      escalateNow: () => {
        void escalatePreAlert()
      },

      markFalsePositive: (id) =>
        set((s) => ({
          history: s.history.map((r) => (r.id === id ? { ...r, outcome: 'false-positive' } : r)),
        })),

      clearHistory: () => set({ history: [] }),

      selfTest: (reason) => {
        if (!get().monitoring) get().setMonitoring(true)
        const sim = useWearableStore.getState().isSimulated
        if (reason === 'hr-spike') {
          // Synthetic pattern through the REAL detection path: a calm run
          // of readings to build a baseline, then a sudden spike.
          hrSamples = []
          const now = Date.now()
          for (let i = 0; i < 12; i++) {
            hrSamples.push({ hr: 70 + (i % 3), at: now - (12 - i) * 20_000 })
          }
          useAnomalyStore.setState({ baselineBpm: 71, samplesInWindow: hrSamples.length })
          window.setTimeout(() => ingestHeartRate(150), 400)
          if (!sim) {
            // Without a wearable the spike sample still exercises the path.
          }
        } else {
          // Synthetic fall signature through the real motion path.
          fallPhase = 'watching-stillness'
          stillnessStart = Date.now() - get().config.stillnessSecs * 1000
          stillMin = 9.6
          stillMax = 10.1
          const evt = { accelerationIncludingGravity: { x: 0.4, y: -0.3, z: 9.9 } } as DeviceMotionEvent
          window.setTimeout(() => ingestMotion(evt), 400)
        }
      },
    }),
    {
      name: 'aasha-anomaly',
      // Persist the tuning and the detection log; live engine state stays in memory.
      partialize: (s) => ({
        monitoring: s.monitoring,
        config: s.config,
        history: s.history,
        lastPreAlertAt: s.lastPreAlertAt,
      }),
    },
  ),
)
