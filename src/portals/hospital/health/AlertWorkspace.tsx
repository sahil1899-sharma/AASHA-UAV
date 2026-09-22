import { CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { ALERT_STATUS_META } from './HealthFeed'
import { HistoryPanel } from './HistoryPanel'
import { MedicalProfilePanel } from './MedicalProfilePanel'
import { TriagePanel } from './TriagePanel'
import { useHealthStore } from './healthAlertStore'
import type { AlertStatus } from './healthAlertStore'

const TABS = ['Medical profile', 'Triage & coordination', 'Visit history'] as const

const NEXT_STATUS: Partial<Record<AlertStatus, { to: AlertStatus; label: string }>> = {
  incoming: { to: 'responding', label: 'Mark responding' },
  responding: { to: 'in-transit', label: 'Mark in transit' },
  'in-transit': { to: 'admitted', label: 'Mark admitted' },
}

function formatFull(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
}

/**
 * Selected-alert workspace: status pill + workflow actions, and tabs for the
 * medical profile, triage/coordination, and visit history.
 */
export function AlertWorkspace() {
  const alert = useHealthStore((s) => s.alerts.find((a) => a.id === s.selectedId))
  const setAlertStatus = useHealthStore((s) => s.setAlertStatus)
  const markFalseAlarm = useHealthStore((s) => s.markFalseAlarm)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Medical profile')

  if (!alert) {
    return (
      <GlassCard title="Alert detail" className="p-6">
        <p className="py-12 text-center text-sm text-ink-500">Select an alert from the feed or map.</p>
      </GlassCard>
    )
  }

  const sm = ALERT_STATUS_META[alert.status]
  const closed = alert.status === 'cleared' || alert.status === 'false-alarm' || alert.status === 'admitted'
  const next = NEXT_STATUS[alert.status]

  return (
    <GlassCard
      title={`${alert.id} — ${alert.userName}`}
      subtitle={`${alert.area} · alert raised ${formatFull(alert.startedAt)}${alert.live ? ` · incident ${alert.incidentId}` : ''}`}
      className="p-6"
    >
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] ${sm.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${sm.dot} ${alert.status === 'incoming' ? 'animate-pulse' : ''}`} />
          {sm.label}
        </span>
        {alert.live && (
          <span className="rounded bg-red-400/20 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-red-200">
            Live SOS this session
          </span>
        )}
        <span className="flex-1" />
        {!closed && next && (
          <button
            type="button"
            onClick={() => setAlertStatus(alert.id, next.to)}
            className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white transition-all hover:brightness-110"
          >
            {next.label}
          </button>
        )}
        {!closed && (
          <>
            <button
              type="button"
              onClick={() => setAlertStatus(alert.id, 'cleared')}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-xs font-bold text-emerald-200 transition-all hover:bg-emerald-400/20"
            >
              <CheckCircle2 className="h-4 w-4" /> Clear
            </button>
            <button
              type="button"
              onClick={() => markFalseAlarm(alert.id)}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-bold text-ink-300 transition-all hover:bg-white/10"
            >
              <XCircle className="h-4 w-4" /> False alarm
            </button>
          </>
        )}
      </div>

      <div role="tablist" aria-label="Alert workspace sections" className="mb-5 flex gap-1.5 border-b border-white/10 pb-px">
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

      {tab === 'Medical profile' && <MedicalProfilePanel alert={alert} />}
      {tab === 'Triage & coordination' && <TriagePanel alert={alert} />}
      {tab === 'Visit history' && <HistoryPanel alert={alert} />}
    </GlassCard>
  )
}
