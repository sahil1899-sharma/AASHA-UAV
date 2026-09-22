import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Flag, HeartPulse, MapPin, Phone, Siren, User, XCircle } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { CommsPanel } from './CommsPanel'
import { UavPanel } from '../uav/UavPanel'
import { IncidentReplay } from './IncidentReplay'
import { haversineKm, usePoliceStore } from './policeIncidentStore'
import { SEVERITY_META, STATUS_META } from './IncidentFeed'
import type { Severity } from './policeIncidentStore'

const TABS = ['Overview', 'UAV & Evidence', 'Dispatch & Comms', 'Replay'] as const

const FALSE_ALARM_REASONS = [
  'Accidental trigger',
  'Test trigger',
  'Duplicate of another alert',
  'No threat found on arrival',
  'User confirmed safe',
]

function formatFull(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
}

/**
 * Selected-incident workspace: overview with severity tagging, UAV evidence,
 * dispatch workflow (assign nearest unit + officer status), two-way comms,
 * and the resolve / false-alarm workflow with a reason field.
 */
export function IncidentDetail() {
  const incident = usePoliceStore((s) => s.incidents.find((i) => i.id === s.selectedId))
  const units = usePoliceStore((s) => s.units)
  const acknowledge = usePoliceStore((s) => s.acknowledge)
  const setSeverity = usePoliceStore((s) => s.setSeverity)
  const assignNearestUnit = usePoliceStore((s) => s.assignNearestUnit)
  const setOfficerStatus = usePoliceStore((s) => s.setOfficerStatus)
  const resolve = usePoliceStore((s) => s.resolve)
  const markFalseAlarm = usePoliceStore((s) => s.markFalseAlarm)

  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [resolutionMode, setResolutionMode] = useState<'none' | 'resolve' | 'false-alarm'>('none')
  const [reason, setReason] = useState(FALSE_ALARM_REASONS[0])
  const [note, setNote] = useState('')

  const nearest = useMemo(() => {
    if (!incident) return null
    const available = units.filter((u) => u.status === 'available')
    if (available.length === 0) return null
    return available.reduce((best, u) =>
      haversineKm(incident.lat, incident.lng, u.lat, u.lng) <
      haversineKm(incident.lat, incident.lng, best.lat, best.lng)
        ? u
        : best,
    )
  }, [incident, units])

  if (!incident) {
    return (
      <GlassCard title="Incident detail" className="p-6">
        <p className="py-12 text-center text-sm text-ink-500">Select an incident from the feed or map.</p>
      </GlassCard>
    )
  }

  const sm = STATUS_META[incident.status]
  const sev = SEVERITY_META[incident.severity]
  const closed = incident.status === 'resolved' || incident.status === 'false-alarm'
  const assigned = units.find((u) => u.callsign === incident.assignedUnit)

  return (
    <GlassCard
      title={`${incident.id} — ${incident.userName}`}
      subtitle={`${incident.area} · reported ${formatFull(incident.startedAt)}`}
      className="p-6"
    >
      {/* Status + severity bar */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] ${sm.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot} ${incident.status === 'new' ? 'animate-pulse' : ''}`} />
          {sm.label}
        </span>
        <label className="flex items-center gap-2 text-xs text-ink-400">
          <Flag className="h-3.5 w-3.5" style={{ color: sev.color }} />
          Severity
          <span className="relative">
            <select
              aria-label="Set severity"
              value={incident.severity}
              disabled={closed}
              onChange={(e) => setSeverity(incident.id, e.target.value as Severity)}
              className="appearance-none rounded-lg border border-white/10 bg-white/[0.05] py-1.5 pl-3 pr-8 text-xs font-semibold text-ink-100 outline-none focus:border-accent/60 disabled:opacity-40 [&>option]:bg-base-950"
            >
              {(Object.keys(SEVERITY_META) as Severity[]).map((k) => (
                <option key={k} value={k}>{SEVERITY_META[k].label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
          </span>
        </label>
        {incident.status === 'new' && (
          <button
            type="button"
            onClick={() => acknowledge(incident.id)}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white transition-all hover:brightness-110"
          >
            Acknowledge alert
          </button>
        )}
        {incident.live && (
          <span className="rounded bg-red-400/20 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-red-200">
            Live SOS this session
          </span>
        )}
        {incident.triggerSource === 'auto' && (
          <span
            className="rounded bg-amber-400/20 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-amber-200"
            title={incident.autoReason ?? 'Escalated from a passive-detection pre-alert'}
          >
            Auto-detected
          </span>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Incident detail sections" className="mb-5 flex gap-1.5 border-b border-white/10 pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-selected={tab === t}
            role="tab"
            className={`px-4 py-2.5 text-[13px] font-semibold transition-colors ${
              tab === t ? 'border-b-2 border-accent text-ink-50' : 'text-ink-500 hover:text-ink-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">Subject</p>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-ink-100"><User className="h-4 w-4 text-ink-500" /> {incident.userName}</p>
              <p className="flex items-center gap-2 text-ink-100">
                <Phone className="h-4 w-4 text-ink-500" />
                {incident.userPhone !== '—' ? <a href={`tel:${incident.userPhone.replace(/\s/g, '')}`} className="text-accent hover:underline">{incident.userPhone}</a> : '—'}
              </p>
              <p className="flex items-center gap-2 text-ink-100"><MapPin className="h-4 w-4 text-ink-500" /> {incident.area}</p>
              <p className="font-mono text-[11px] text-ink-400">{incident.lat.toFixed(5)}, {incident.lng.toFixed(5)}</p>
            </div>
            {incident.vitals && (
              <div className="mt-2 rounded-xl border border-white/10 bg-base-950/60 p-3.5">
                <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  <HeartPulse className="h-3.5 w-3.5 text-red-300" /> Vitals at trigger
                </p>
                <div className="flex gap-5 text-sm">
                  <p className="text-ink-100"><span className="font-bold">{incident.vitals.heartRate ?? '—'}</span> <span className="text-xs text-ink-500">bpm</span></p>
                  <p className="text-ink-100"><span className="font-bold">{incident.vitals.battery ?? '—'}%</span> <span className="text-xs text-ink-500">wearable</span></p>
                </div>
                {incident.vitals.simulated && (
                  <p className="mt-1.5 inline-block rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-200">Simulated readings</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">Resolution</p>
            {closed ? (
              <div className="rounded-xl border border-white/10 bg-base-950/60 p-4">
                <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink-100">
                  {incident.status === 'resolved' ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-ink-400" />}
                  {sm.label}
                </p>
                <p className="text-[13px] text-ink-400">{incident.resolutionNote}</p>
              </div>
            ) : resolutionMode === 'none' ? (
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setResolutionMode('resolve')}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 text-xs font-bold text-emerald-200 transition-all hover:bg-emerald-400/20"
                >
                  <CheckCircle2 className="h-4 w-4" /> Mark resolved
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionMode('false-alarm')}
                  className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-xs font-bold text-ink-300 transition-all hover:bg-white/10"
                >
                  <XCircle className="h-4 w-4" /> False alarm
                </button>
              </div>
            ) : resolutionMode === 'resolve' ? (
              <div className="space-y-2.5">
                <textarea
                  aria-label="Resolution notes"
                  placeholder="Resolution notes for the record…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { resolve(incident.id, note); setResolutionMode('none'); setNote('') }}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:brightness-110"
                  >
                    Confirm resolution
                  </button>
                  <button type="button" onClick={() => setResolutionMode('none')} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-ink-400 hover:text-ink-100">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <label className="block text-xs text-ink-400">
                  Reason
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink-100 outline-none focus:border-accent/60 [&>option]:bg-base-950"
                  >
                    {FALSE_ALARM_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { markFalseAlarm(incident.id, `False alarm — ${reason.toLowerCase()}.`); setResolutionMode('none') }}
                    className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-ink-100 hover:bg-white/15"
                  >
                    Confirm false alarm
                  </button>
                  <button type="button" onClick={() => setResolutionMode('none')} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-ink-400 hover:text-ink-100">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-ink-600">
              Closing an incident stands down the tasked UAV and releases the assigned unit. False alarms are logged with a reason for audit.
            </p>
          </div>
        </div>
      )}

      {tab === 'UAV & Evidence' && <UavPanel incident={incident} />}

      {tab === 'Replay' && <IncidentReplay incident={incident} />}

      {tab === 'Dispatch & Comms' && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">Dispatch workflow</p>
            {incident.assignedUnit ? (
              <div className="rounded-xl border border-accent/30 bg-accent/[0.07] p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-ink-50">
                  <Siren className="h-4 w-4 text-accent" /> {incident.assignedUnit}
                  <span className="font-mono text-[10px] font-medium text-ink-400">{assigned?.station}</span>
                </p>
                <label className="mt-3 block text-xs text-ink-400">
                  Officer status
                  <span className="relative mt-1.5 block">
                    <select
                      value={incident.officerStatus ?? 'En route'}
                      disabled={closed}
                      onChange={(e) => setOfficerStatus(incident.id, e.target.value as 'En route' | 'On scene' | 'Returning')}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink-100 outline-none focus:border-accent/60 disabled:opacity-40 [&>option]:bg-base-950"
                    >
                      <option>En route</option>
                      <option>On scene</option>
                      <option>Returning</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-ink-500">No unit assigned yet.</p>
            )}
            <button
              type="button"
              onClick={() => assignNearestUnit(incident.id)}
              disabled={closed || incident.assignedUnit !== null || !nearest}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {nearest
                ? `Assign nearest unit — ${nearest.callsign} (${nearest.station}, ${haversineKm(incident.lat, incident.lng, nearest.lat, nearest.lng).toFixed(1)} km)`
                : 'No available units'}
            </button>
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">All units</p>
              {units.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2 text-xs">
                  <span className="font-semibold text-ink-200">{u.callsign} <span className="font-normal text-ink-500">· {u.station}</span></span>
                  <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${u.status === 'available' ? 'text-emerald-300' : u.status === 'en-route' ? 'text-amber-300' : 'text-blue-300'}`}>
                    {u.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-3">
            <CommsPanel incidentId={incident.id} />
          </div>
        </div>
      )}
    </GlassCard>
  )
}
