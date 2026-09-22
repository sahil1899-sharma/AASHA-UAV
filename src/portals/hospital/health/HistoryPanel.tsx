import { History } from 'lucide-react'
import { useMedicalStore } from '../../user/profile/medicalStore'
import type { HealthAlert } from './healthAlertStore'

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Visit / incident history timeline for the patient. Live SOS users read
 * their shared record (no prior visits yet); mock patients show seeded history.
 */
export function HistoryPanel({ alert }: { alert: HealthAlert }) {
  // Touch the shared store so the live user's record stays the single source of truth.
  useMedicalStore((s) => s.profile)
  const visits = alert.record?.visits ?? []

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
        <History className="h-3.5 w-3.5 text-teal-300" /> Visit history — {alert.userName}
      </p>
      {visits.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-500">No prior visits on record for this patient.</p>
      ) : (
        <ol className="relative space-y-5 border-l border-white/10 pl-6">
          {[...visits].sort((a, b) => b.date - a.date).map((v) => (
            <li key={v.id} className="relative">
              <span className="absolute -left-[31px] top-1 h-2.5 w-2.5 rounded-full border-2 border-teal-300 bg-base-950" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-500">{formatDate(v.date)}</p>
              <p className="mt-0.5 text-sm font-semibold text-ink-100">
                {v.kind} <span className="font-normal text-ink-500">· {v.facility}</span>
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-400">{v.summary}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
