import { useEffect, useRef, useState } from 'react'
import { Ambulance, ChevronDown, ClipboardList, Radio, Send } from 'lucide-react'
import { useHealthStore, estimateEtaMinutes } from './healthAlertStore'
import type { HealthAlert, TriagePriority } from './healthAlertStore'
import { usePoliceStore, haversineKm } from '../../police/incidents/policeIncidentStore'
import { TRIAGE_META } from './HealthFeed'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatFull(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/** Shared channel with the responding police/security unit (same comms log, posted as hospital). */
function CoordinationChannel({ alert }: { alert: HealthAlert }) {
  const policeIncident = usePoliceStore((s) => (alert.policeIncidentId ? s.incidents.find((i) => i.id === alert.policeIncidentId) : undefined))
  const postComms = usePoliceStore((s) => s.postComms)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [policeIncident?.comms.length])

  if (!alert.policeIncidentId || !policeIncident) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <Radio className="mb-2 h-6 w-6 text-ink-600" />
        <p className="text-xs text-ink-500">No linked police incident for this alert —<br />coordination channel unavailable.</p>
      </div>
    )
  }

  const closed = alert.status === 'cleared' || alert.status === 'false-alarm' || alert.status === 'admitted'
  const unit = policeIncident.assignedUnit ?? 'Police unit'

  return (
    <div className="flex h-full min-h-[320px] flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
          <Radio className="h-3.5 w-3.5 text-teal-300" /> Police coordination
        </p>
        <p className="font-mono text-[10px] text-ink-500">{policeIncident.id} · {unit}</p>
      </div>
      <div className="min-h-[180px] flex-1 space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
        {policeIncident.comms.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-500">Channel open. Coordinate scene access and patient handoff here.</p>
        ) : (
          policeIncident.comms.map((m) => (
            <div key={m.id} className={`flex ${m.from === 'hospital' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 ${
                  m.from === 'hospital'
                    ? 'rounded-br-sm bg-teal-400/20 text-ink-50'
                    : 'rounded-bl-sm border border-white/10 bg-white/[0.05] text-ink-100'
                }`}
              >
                <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.18em] opacity-60">
                  {m.from === 'hospital' ? 'Hospital' : m.from === 'dispatch' ? 'Dispatch' : unit} · {formatTime(m.at)}
                </p>
                <p className="text-[13px] leading-snug">{m.text}</p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim() || !alert.policeIncidentId) return
          postComms(alert.policeIncidentId, 'hospital', draft)
          setDraft('')
        }}
      >
        <input
          aria-label="Message the police unit"
          placeholder={closed ? 'Alert closed — channel archived' : `Coordinate with ${unit}…`}
          value={draft}
          disabled={closed}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={closed || !draft.trim()}
          aria-label="Send coordination message"
          className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </form>
    </div>
  )
}

/**
 * Triage workspace: priority tagging, pre-arrival triage notes for the medical
 * team, nearest-ambulance dispatch, and the police coordination channel.
 */
export function TriagePanel({ alert }: { alert: HealthAlert }) {
  const ambulances = useHealthStore((s) => s.ambulances)
  const setTriage = useHealthStore((s) => s.setTriage)
  const addTriageNote = useHealthStore((s) => s.addTriageNote)
  const dispatchAmbulance = useHealthStore((s) => s.dispatchAmbulance)
  const [note, setNote] = useState('')
  const closed = alert.status === 'cleared' || alert.status === 'false-alarm' || alert.status === 'admitted'

  const nearest = (() => {
    const available = ambulances.filter((a) => a.status === 'available')
    if (available.length === 0) return null
    return available.reduce((best, a) =>
      haversineKm(alert.lat, alert.lng, a.lat, a.lng) < haversineKm(alert.lat, alert.lng, best.lat, best.lng) ? a : best,
    )
  })()
  const assigned = ambulances.find((a) => a.callsign === alert.ambulance)

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        {/* Triage priority + notes */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
              <ClipboardList className="h-3.5 w-3.5 text-teal-300" /> Pre-arrival triage
            </p>
            <label className="flex items-center gap-2 text-xs text-ink-400">
              Priority
              <span className="relative">
                <select
                  aria-label="Set triage priority"
                  value={alert.triage}
                  disabled={closed}
                  onChange={(e) => setTriage(alert.id, e.target.value as TriagePriority)}
                  className="appearance-none rounded-lg border border-white/10 bg-white/[0.05] py-1.5 pl-3 pr-8 text-xs font-bold outline-none focus:border-accent/60 disabled:opacity-40 [&>option]:bg-base-950"
                  style={{ color: TRIAGE_META[alert.triage].color }}
                >
                  <option value="P1">P1 · Critical</option>
                  <option value="P2">P2 · Urgent</option>
                  <option value="P3">P3 · Stable</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
              </span>
            </label>
          </div>

          <div className="mb-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {alert.triageNotes.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-500">No triage notes yet — log guidance for the receiving team.</p>
            ) : (
              [...alert.triageNotes].reverse().map((n) => (
                <div key={n.id} className="rounded-xl border border-white/[0.07] bg-base-950/60 p-3">
                  <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-500">{n.author} · {formatFull(n.at)}</p>
                  <p className="text-[13px] leading-snug text-ink-100">{n.text}</p>
                </div>
              ))
            )}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addTriageNote(alert.id, 'Duty desk', note)
              setNote('')
            }}
          >
            <input
              aria-label="Add triage note"
              placeholder={closed ? 'Alert closed' : 'Note for the receiving team…'}
              value={note}
              disabled={closed}
              onChange={(e) => setNote(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={closed || !note.trim()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Log
            </button>
          </form>
        </div>

        {/* Ambulance dispatch */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">Ambulance</p>
          {assigned ? (
            <div className="rounded-xl border border-teal-400/30 bg-teal-400/[0.07] p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-ink-50">
                <Ambulance className="h-4 w-4 text-teal-300" /> {assigned.callsign}
                <span className="font-mono text-[10px] font-medium capitalize text-ink-400">{assigned.status.replace('-', ' ')}</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-500">ETA to scene ~{estimateEtaMinutes(alert.lat, alert.lng).minutes} min (estimate)</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => dispatchAmbulance(alert.id)}
              disabled={closed || !nearest}
              className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {nearest
                ? `Dispatch nearest ambulance — ${nearest.callsign} (${nearest.base})`
                : 'No ambulances available'}
            </button>
          )}
        </div>
      </div>

      <div className="lg:col-span-3">
        <CoordinationChannel alert={alert} />
      </div>
    </div>
  )
}
