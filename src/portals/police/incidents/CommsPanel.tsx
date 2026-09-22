import { useEffect, useRef, useState } from 'react'
import { Radio, Send } from 'lucide-react'
import { usePoliceStore } from './policeIncidentStore'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Two-way status/communication channel between dispatch and the responding
 * unit. Dispatch messages are typed here; the unit auto-replies (mock).
 */
export function CommsPanel({ incidentId }: { incidentId: string }) {
  const incident = usePoliceStore((s) => s.incidents.find((i) => i.id === incidentId))
  const sendComms = usePoliceStore((s) => s.sendComms)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [incident?.comms.length])

  if (!incident) return null
  const unit = incident.assignedUnit ?? 'Unit'
  const closed = incident.status === 'resolved' || incident.status === 'false-alarm'

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
          <Radio className="h-3.5 w-3.5 text-accent" /> Dispatch channel
        </p>
        <p className="font-mono text-[10px] text-ink-500">
          {incident.assignedUnit ? `${incident.assignedUnit} · ${incident.officerStatus ?? 'tasked'}` : 'No unit assigned'}
        </p>
      </div>

      <div className="min-h-[180px] flex-1 space-y-2.5 overflow-y-auto pr-1" aria-live="polite">
        {incident.comms.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-500">
            {incident.assignedUnit
              ? 'Channel open. Send the first transmission.'
              : 'Assign a unit to open this channel.'}
          </p>
        ) : (
          incident.comms.map((m) => (
            <div key={m.id} className={`flex ${m.from === 'dispatch' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 ${
                  m.from === 'dispatch'
                    ? 'rounded-br-sm bg-accent/20 text-ink-50'
                    : m.from === 'hospital'
                      ? 'rounded-bl-sm border border-teal-400/30 bg-teal-400/[0.08] text-ink-100'
                      : 'rounded-bl-sm border border-white/10 bg-white/[0.05] text-ink-100'
                }`}
              >
                <p className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.18em] opacity-60">
                  {m.from === 'dispatch' ? 'Dispatch' : m.from === 'hospital' ? 'Hospital' : unit} · {formatTime(m.at)}
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
          if (!draft.trim()) return
          sendComms(incidentId, draft)
          setDraft('')
        }}
      >
        <input
          aria-label="Message the responding unit"
          placeholder={closed ? 'Incident closed — channel archived' : `Transmit to ${unit}…`}
          value={draft}
          disabled={closed}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60 disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={closed || !draft.trim()}
          aria-label="Send message"
          className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </form>
    </div>
  )
}
