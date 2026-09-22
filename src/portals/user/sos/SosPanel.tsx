import { useEffect, useRef, useState } from 'react'
import { Check, HeartPulse, Loader2, MapPin, Siren } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { PulseButton } from '../../../shared/components/PulseButton'
import { useIncidentStore } from '../../../shared/state/incidentStore'
import type { IncidentLocation } from '../../../shared/state/incidentStore'
import { useWearableStore } from '../bluetooth/wearableStore'

const HOLD_MS = 2000

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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Manual SOS trigger. Press-and-hold for 2 seconds (cancellable) → captures
 * geolocation + wearable vitals → raises an active incident in the shared
 * incident store (the Phase 6 cross-dashboard seam). Post-trigger shows the
 * response timeline as it progresses.
 */
export function SosPanel() {
  const activeIncident = useIncidentStore((s) => s.activeIncident)
  const trigger = useIncidentStore((s) => s.trigger)
  const standDown = useIncidentStore((s) => s.standDown)
  const heartRate = useWearableStore((s) => s.heartRate)
  const battery = useWearableStore((s) => s.battery)
  const isSimulated = useWearableStore((s) => s.isSimulated)
  const wearableConnected = useWearableStore((s) => s.status === 'connected')

  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const [sending, setSending] = useState(false)
  const [confirmStandDown, setConfirmStandDown] = useState(false)
  const rafRef = useRef(0)
  const startRef = useRef(0)

  useEffect(() => () => window.cancelAnimationFrame(rafRef.current), [])
  useEffect(() => setConfirmStandDown(false), [activeIncident?.id])

  const doTrigger = async () => {
    setSending(true)
    const location = await locateOnce()
    trigger({
      location,
      vitals: {
        heartRate: wearableConnected ? heartRate : null,
        battery: wearableConnected ? battery : null,
        simulated: isSimulated,
      },
    })
    setSending(false)
  }

  const beginHold = () => {
    if (activeIncident?.status === 'active' || sending) return
    setHolding(true)
    startRef.current = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - startRef.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        setHolding(false)
        setProgress(0)
        void doTrigger()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const cancelHold = () => {
    window.cancelAnimationFrame(rafRef.current)
    setHolding(false)
    setProgress(0)
  }

  const isActive = activeIncident?.status === 'active'

  return (
    <GlassCard
      title="Emergency SOS"
      subtitle={isActive ? 'Incident live — responders notified' : 'Press and hold to send an alert'}
      className="flex h-full flex-col p-6"
      glow={isActive}
    >
      {isActive && activeIncident ? (
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
            </span>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-ink-100">
                Alert sent — responders notified
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-ink-400">
                {formatTime(activeIncident.startedAt)}
                {activeIncident.location
                  ? ` · ${activeIncident.location.lat.toFixed(4)}, ${activeIncident.location.lng.toFixed(4)}`
                  : ' · location unavailable'}
              </p>
            </div>
          </div>

          <ol className="mt-5 flex-1 space-y-1">
            {activeIncident.stages.map((stage, i) => {
              const isLast = i === activeIncident.stages.length - 1
              return (
                <li key={stage.id} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                        isLast
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                      }`}
                    >
                      {isLast ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                      ) : (
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      )}
                    </span>
                    {i < activeIncident.stages.length - 1 && (
                      <span className="w-px flex-1 bg-white/10" />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-semibold text-ink-100">{stage.label}</p>
                    <p className="text-xs text-ink-500">{stage.detail}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink-600">
                      {formatTime(stage.at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="mt-2 grid grid-cols-2 gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <HeartPulse className="h-4 w-4 text-accent" strokeWidth={2} />
              {activeIncident.vitals.heartRate !== null
                ? `${activeIncident.vitals.heartRate} bpm${activeIncident.vitals.simulated ? ' (sim)' : ''}`
                : 'No vitals'}
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <MapPin className="h-4 w-4 text-accent" strokeWidth={2} />
              {activeIncident.location ? 'Location attached' : 'No location'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (confirmStandDown) standDown()
              else {
                setConfirmStandDown(true)
                window.setTimeout(() => setConfirmStandDown(false), 4000)
              }
            }}
            className={`mt-4 w-full rounded-xl border px-5 py-3 text-sm font-semibold transition-colors ${
              confirmStandDown
                ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                : 'border-white/15 text-ink-300 hover:border-white/30 hover:text-ink-100'
            }`}
          >
            {confirmStandDown ? "Tap again — I'm safe, stand down" : "I'm safe — stand down"}
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <div
            className="relative select-none"
            onPointerDown={beginHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onKeyDown={(e) => {
              // Keyboard equivalent of press-and-hold: hold Space/Enter.
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault()
                beginHold()
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') cancelHold()
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ touchAction: 'none' }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 200 200"
              className="pointer-events-none absolute -inset-5 h-[calc(100%+40px)] w-[calc(100%+40px)] -rotate-90"
            >
              <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
              <circle
                cx="100"
                cy="100"
                r="94"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 94}
                strokeDashoffset={2 * Math.PI * 94 * (1 - progress)}
                style={{
                  filter: 'drop-shadow(0 0 6px var(--accent))',
                  transition: holding ? 'none' : 'stroke-dashoffset 0.25s ease-out',
                }}
              />
            </svg>
            <PulseButton
              ariaLabel="SOS — press and hold for two seconds to send an emergency alert"
              disabled={sending}
              className="h-44 w-44 !rounded-full !px-0 text-xl"
            >
              <span className="flex flex-col items-center gap-1.5">
                <Siren className="h-9 w-9" strokeWidth={2} />
                {sending ? 'SENDING…' : holding ? 'HOLD…' : 'SOS'}
              </span>
            </PulseButton>
          </div>
          <p className="mt-6 text-center text-sm font-medium text-ink-300" aria-live="polite">
            {sending
              ? 'Capturing location & vitals…'
              : holding
                ? `Keep holding — ${Math.max(1, Math.ceil(HOLD_MS / 1000 - progress * (HOLD_MS / 1000)))}s`
                : 'Press & hold 2 seconds'}
          </p>
          <p className="mt-1 text-center text-xs text-ink-600">
            {holding ? 'Release to cancel' : 'Deliberate hold prevents accidental alerts'}
          </p>
          {wearableConnected && (
            <p className="mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-ink-400">
              <HeartPulse className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              {heartRate !== null ? `${heartRate} bpm` : 'Wearable linked — vitals will attach'}
              {isSimulated && <span className="font-mono text-[10px] text-amber-300">(sim)</span>}
            </p>
          )}
        </div>
      )}
    </GlassCard>
  )
}
