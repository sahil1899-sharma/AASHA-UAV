import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import { Camera, History, Pause, Play, RotateCcw, Video } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { replayFlightSnapshot, usePoliceStore } from './policeIncidentStore'
import type { PoliceIncident } from './policeIncidentStore'
import { uavIcon } from '../uav/uavIcon'
import { STATUS_META } from './IncidentFeed'
import { buildReplayEvents, formatReplayClock, formatReplayFull, statusAt } from './replay'
import type { ReplayEventKind } from './replay'

/** Scrub playback speed: incident-time ms advanced per real second. */
const PLAY_RATE = 30_000

const sceneIcon = L.divIcon({
  className: 'aasha-scene-marker',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#ff3b47;border:2px solid #fff;box-shadow:0 0 12px #ff3b47;"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const KIND_DOT: Record<ReplayEventKind, string> = {
  trigger: '#ff3b47',
  ack: '#fbbf24',
  unit: '#818cf8',
  uav: '#7dd3fc',
  evidence: '#34d399',
  resolved: '#a3adc2',
}

function ReplayMap({ incident, at }: { incident: PoliceIncident; at: number }) {
  const plan = usePoliceStore((s) => s.plans[incident.id])
  const snap = replayFlightSnapshot(incident.id, at)

  const flown: [number, number][] = useMemo(() => {
    if (!plan || !snap) return []
    const pts: [number, number][] = []
    for (let i = 0; i < plan.waypoints.length; i++) {
      if (plan.cumM[i] <= snap.progressM + 1) pts.push([plan.waypoints[i].lat, plan.waypoints[i].lng])
    }
    const last = pts[pts.length - 1]
    if (!last || last[0] !== snap.lat || last[1] !== snap.lng) pts.push([snap.lat, snap.lng])
    return pts
  }, [plan, snap])

  return (
    <div className="relative z-0 h-64 overflow-hidden rounded-xl border border-white/10 sm:h-72">
      <MapContainer
        center={[incident.lat, incident.lng]}
        zoom={14}
        scrollWheelZoom={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%', background: '#0a0f16' }}
      >
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
        {plan && plan.reachable && plan.waypoints.length >= 2 && (
          <Polyline
            positions={plan.waypoints.map((w) => [w.lat, w.lng] as [number, number])}
            pathOptions={{ color: '#38bdf8', weight: 2, opacity: 0.25 }}
            interactive={false}
          />
        )}
        {flown.length >= 2 && (
          <Polyline
            positions={flown}
            pathOptions={{ color: '#7dd3fc', weight: 3, opacity: 0.95, dashArray: '8 6' }}
            interactive={false}
          />
        )}
        {snap && <Marker position={[snap.lat, snap.lng]} icon={uavIcon} interactive={false} zIndexOffset={1000} />}
        <Marker position={[incident.lat, incident.lng]} icon={sceneIcon} interactive={false} />
      </MapContainer>
      <div className="absolute left-2.5 top-2.5 z-[500] flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-black/80 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200">
        <History className="h-3 w-3" /> Replay · {formatReplayFull(at)}
      </div>
    </div>
  )
}

/**
 * Phase 12 — incident replay view. Drag the scrubber through the incident's
 * lifecycle; the map (UAV position along its recorded route), status,
 * evidence and comms all render as they were at the scrubber position.
 * Scrubbing back shows a historical snapshot — it never mutates live state.
 */
export function IncidentReplay({ incident }: { incident: PoliceIncident }) {
  const events = useMemo(() => buildReplayEvents(incident), [incident])
  const start = incident.startedAt
  const [nowMs, setNowMs] = useState(() => Date.now())
  const end = Math.max(incident.resolvedAt ?? 0, nowMs)
  const [at, setAt] = useState(end)
  const [playing, setPlaying] = useState(false)
  const atRef = useRef(at)
  atRef.current = at

  // Keep the live edge fresh while the tab is open.
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 2000)
    return () => window.clearInterval(t)
  }, [])

  // Follow the live edge when new data lands and the user is already there.
  useEffect(() => {
    if (atRef.current >= end - 3000) setAt(end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end])

  // Playback.
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => {
      setAt((a) => {
        const next = a + PLAY_RATE / 4
        if (next >= end) {
          setPlaying(false)
          return end
        }
        return next
      })
    }, 250)
    return () => window.clearInterval(t)
  }, [playing, end])

  const liveEdge = at >= end - 3000
  const pastEvents = events.filter((e) => e.t <= at)
  const current = pastEvents[pastEvents.length - 1]
  const st = statusAt(incident, at)
  const sm = STATUS_META[st]
  const evidenceAt = incident.evidence.filter((e) => e.capturedAt <= at)
  const commsAt = incident.comms.filter((c) => c.at <= at)

  return (
    <div className="space-y-4">
      {!liveEdge && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200">
            Historical snapshot — not live
          </p>
          <button
            type="button"
            onClick={() => setAt(end)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-black hover:brightness-110"
          >
            <RotateCcw className="h-3 w-3" /> Return to live
          </button>
        </div>
      )}

      {/* Scrubber */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!playing && at >= end - 1000) setAt(start)
              setPlaying((p) => !p)
            }}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-all hover:brightness-110"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="relative">
              <input
                type="range"
                min={start}
                max={end}
                step={1000}
                value={at}
                aria-label="Incident timeline scrubber"
                onChange={(e) => {
                  setPlaying(false)
                  setAt(Number(e.target.value))
                }}
                className="w-full accent-sky-400"
              />
              <div className="pointer-events-none relative mx-[7px] h-2">
                {events.map((e, i) => (
                  <span
                    key={`${e.t}-${i}`}
                    title={`${e.label} · ${formatReplayFull(e.t)}`}
                    className="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                    style={{
                      left: `${end > start ? ((e.t - start) / (end - start)) * 100 : 0}%`,
                      background: KIND_DOT[e.kind],
                      opacity: e.t <= at ? 1 : 0.35,
                      boxShadow: `0 0 6px ${KIND_DOT[e.kind]}`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-500">
              <span>{formatReplayFull(start)}</span>
              <span>{formatReplayFull(end)}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] ${sm.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />
            {sm.label}
          </span>
          {current && (
            <p className="text-sm text-ink-200">
              <span className="font-semibold">{current.label}</span>
              <span className="ml-2 font-mono text-[11px] text-ink-500">{formatReplayFull(current.t)}</span>
            </p>
          )}
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard title="Positions at scrubber time" subtitle="UAV along its recorded route" className="p-5">
          <ReplayMap incident={incident} at={at} />
          <p className="mt-2 font-mono text-[10px] text-ink-500">
            {replayFlightSnapshot(incident.id, at)
              ? 'Route geometry is the recorded flight plan; position is interpolated at cruise speed between dispatch and the on-scene timestamp.'
              : 'No recorded flight route for this incident.'}
          </p>
        </GlassCard>

        <GlassCard title="Lifecycle" subtitle="Events up to the scrubber position" className="p-5">
          <ol className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {events.map((e, i) => {
              const past = e.t <= at
              return (
                <li
                  key={`${e.t}-${i}`}
                  className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 ${past ? 'bg-white/[0.04]' : 'opacity-35'}`}
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: KIND_DOT[e.kind], boxShadow: `0 0 6px ${KIND_DOT[e.kind]}` }}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink-100">{e.label}</p>
                    {e.detail && <p className="truncate text-[11px] text-ink-500">{e.detail}</p>}
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-500">{formatReplayClock(e.t)}</span>
                </li>
              )
            })}
          </ol>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard
          title={`Evidence · ${evidenceAt.length}`}
          subtitle={evidenceAt.length === 0 ? 'Nothing captured yet at this point' : 'Captured up to the scrubber position'}
          className="p-5"
        >
          {evidenceAt.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-500">No evidence had been captured at this point in the incident.</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {evidenceAt.map((e) => (
                <li key={e.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.07] px-3 py-2">
                  {e.kind === 'video' ? (
                    <Video className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 shrink-0 text-ink-500" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-100">{e.label}</p>
                    <p className="font-mono text-[10px] text-ink-500">{e.id} · {e.uavId}</p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-500">{formatReplayClock(e.capturedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard
          title={`Comms · ${commsAt.length}`}
          subtitle="Channel traffic up to the scrubber position"
          className="p-5"
        >
          {commsAt.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-500">No channel traffic at this point in the incident.</p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {commsAt.map((c) => (
                <li key={c.id} className="rounded-lg border border-white/[0.07] px-3 py-2">
                  <p className="mb-0.5 flex items-center justify-between">
                    <span className={`font-mono text-[9px] uppercase tracking-[0.16em] ${c.from === 'hospital' ? 'text-teal-300' : c.from === 'unit' ? 'text-blue-300' : 'text-ink-400'}`}>
                      {c.from}
                    </span>
                    <span className="font-mono text-[10px] text-ink-500">{formatReplayClock(c.at)}</span>
                  </p>
                  <p className="text-[13px] text-ink-200">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
