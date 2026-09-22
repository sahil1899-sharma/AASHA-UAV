import { useMemo, useState } from 'react'
import { HeartPulse, Search } from 'lucide-react'
import { TableVirtuoso } from 'react-virtuoso'
import { GlassCard } from '../../../shared/components/GlassCard'
import { useDebouncedValue } from '../../../shared/perf/batched'
import { useHealthStore } from './healthAlertStore'
import type { AlertStatus, HealthAlert, TriagePriority } from './healthAlertStore'

export const ALERT_STATUS_META: Record<AlertStatus, { label: string; pill: string; dot: string }> = {
  incoming: { label: 'Incoming', pill: 'border-red-400/50 bg-red-400/15 text-red-200', dot: 'bg-red-400' },
  responding: { label: 'Responding', pill: 'border-amber-400/50 bg-amber-400/15 text-amber-200', dot: 'bg-amber-300' },
  'in-transit': { label: 'In transit', pill: 'border-blue-400/50 bg-blue-400/15 text-blue-200', dot: 'bg-blue-400' },
  admitted: { label: 'Admitted', pill: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-400' },
  cleared: { label: 'Cleared', pill: 'border-white/15 bg-white/[0.06] text-ink-400', dot: 'bg-ink-500' },
  'false-alarm': { label: 'False alarm', pill: 'border-white/15 bg-white/[0.06] text-ink-400', dot: 'bg-ink-500' },
}

export const TRIAGE_META: Record<TriagePriority, { label: string; color: string }> = {
  P1: { label: 'P1 · Critical', color: '#ff3b47' },
  P2: { label: 'P2 · Urgent', color: '#ff9f1c' },
  P3: { label: 'P3 · Stable', color: '#34d399' },
}

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_FILTERS: ('all' | AlertStatus)[] = ['all', 'incoming', 'responding', 'in-transit', 'admitted', 'cleared', 'false-alarm']

/**
 * Incoming health alert feed — every incident with transmitted wearable
 * vitals, trigger type (manual SOS / automatic fall detection), and triage
 * priority. Row click selects the alert everywhere.
 */
export function HealthFeed() {
  const alerts = useHealthStore((s) => s.alerts)
  const selectedId = useHealthStore((s) => s.selectedId)
  const select = useHealthStore((s) => s.select)

  const [statusFilter, setStatusFilter] = useState<'all' | AlertStatus>('all')
  const [query, setQuery] = useState('')
  // Phase 13 hardening: don't re-filter the list on every keystroke.
  const debouncedQuery = useDebouncedValue(query, 150)

  const rows = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    return alerts
      .filter((a) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false
        if (q && !`${a.userName} ${a.area} ${a.id}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => b.startedAt - a.startedAt)
  }, [alerts, statusFilter, debouncedQuery])

  const activeCount = alerts.filter((a) => a.status === 'incoming' || a.status === 'responding' || a.status === 'in-transit').length

  return (
    <GlassCard title="Incoming health alerts" subtitle={`${activeCount} active · ${alerts.length} total`} className="flex h-full flex-col p-6">
      <div className="mb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-600" />
          <input
            aria-label="Search health alerts"
            placeholder="Search name, area, ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-xs text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            aria-pressed={statusFilter === f}
            className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              statusFilter === f
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-white/10 text-ink-500 hover:text-ink-200'
            }`}
          >
            {f === 'all' ? 'All' : ALERT_STATUS_META[f].label}
          </button>
        ))}
      </div>

      <div className="min-h-0 h-[420px] flex-1">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-ink-500">No alerts match these filters.</p>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={rows}
            overscan={8}
            fixedHeaderContent={() => (
              <tr className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500">
                <th className="bg-[#0c1420]/95 px-2 py-2 text-left font-medium">Patient</th>
                <th className="bg-[#0c1420]/95 px-2 py-2 text-left font-medium">Vitals</th>
                <th className="bg-[#0c1420]/95 px-2 py-2 text-left font-medium">Status</th>
              </tr>
            )}
            itemContent={(_index, a: HealthAlert) => {
              const sm = ALERT_STATUS_META[a.status]
              const tri = TRIAGE_META[a.triage]
              return (
                <>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: tri.color, boxShadow: `0 0 8px ${tri.color}` }}
                        title={tri.label}
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink-100">
                          {a.userName}
                          {a.live && (
                            <span className="rounded bg-red-400/20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-red-200">
                              Live
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[10px] text-ink-600">
                          {a.live ? a.incidentId : a.id} · {a.triage} · {a.trigger.type === 'automatic' ? 'Auto fall' : 'Manual SOS'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <p className="flex items-center gap-1 text-[13px] font-semibold text-ink-100">
                      <HeartPulse className="h-3.5 w-3.5 text-red-300" />
                      {a.vitals.heartRate ?? '—'}
                      <span className="text-[10px] font-normal text-ink-500">bpm</span>
                    </p>
                    <p className="font-mono text-[10px] text-ink-600">
                      {timeAgo(a.startedAt)} · {a.vitals.battery ?? '—'}%{a.vitals.simulated ? ' · sim' : ''}
                    </p>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${sm.pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${sm.dot} ${a.status === 'incoming' ? 'animate-pulse' : ''}`} />
                      {sm.label}
                    </span>
                  </td>
                </>
              )
            }}
            components={{
              Table: (props) => <table {...props} className="w-full border-collapse text-left" />,
              TableRow: ({ item: a, ...rest }: { item: HealthAlert } & React.HTMLAttributes<HTMLTableRowElement>) => {
                const selected = a.id === selectedId
                return (
                  <tr
                    {...rest}
                    onClick={() => select(a.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open health alert ${a.id} — ${a.userName}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        select(a.id)
                      }
                    }}
                    className={`cursor-pointer border-t border-white/5 transition-colors ${
                      selected ? 'bg-accent/[0.09]' : 'hover:bg-white/[0.03]'
                    }`}
                  />
                )
              },
            }}
          />
        )}
      </div>
    </GlassCard>
  )
}
