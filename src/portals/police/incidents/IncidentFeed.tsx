import { useMemo, useState } from 'react'
import { ArrowDownWideNarrow, Search } from 'lucide-react'
import { TableVirtuoso } from 'react-virtuoso'
import { GlassCard } from '../../../shared/components/GlassCard'
import { useDebouncedValue } from '../../../shared/perf/batched'
import { usePoliceStore } from './policeIncidentStore'
import type { IncidentStatus, PoliceIncident, Severity } from './policeIncidentStore'

export const STATUS_META: Record<IncidentStatus, { label: string; pill: string; dot: string }> = {
  new: { label: 'New', pill: 'border-red-400/50 bg-red-400/15 text-red-200', dot: 'bg-red-400' },
  acknowledged: { label: 'Acknowledged', pill: 'border-amber-400/50 bg-amber-400/15 text-amber-200', dot: 'bg-amber-300' },
  responding: { label: 'Responding', pill: 'border-blue-400/50 bg-blue-400/15 text-blue-200', dot: 'bg-blue-400' },
  resolved: { label: 'Resolved', pill: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200', dot: 'bg-emerald-400' },
  'false-alarm': { label: 'False alarm', pill: 'border-white/15 bg-white/[0.06] text-ink-400', dot: 'bg-ink-500' },
}

export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: '#ff3b47' },
  high: { label: 'High', color: '#ff9f1c' },
  medium: { label: 'Medium', color: '#ffd166' },
  low: { label: 'Low', color: '#7d8aa0' },
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const STATUS_FILTERS: ('all' | IncidentStatus)[] = ['all', 'new', 'acknowledged', 'responding', 'resolved', 'false-alarm']

/**
 * Live incident feed — filterable, sortable, searchable register of every
 * triggered alert. Row click selects the incident everywhere (map, detail).
 */
export function IncidentFeed() {
  const incidents = usePoliceStore((s) => s.incidents)
  const selectedId = usePoliceStore((s) => s.selectedId)
  const select = usePoliceStore((s) => s.select)

  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all')
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all')
  const [query, setQuery] = useState('')
  const [sortBySeverity, setSortBySeverity] = useState(false)
  // Phase 13 hardening: don't re-filter the list on every keystroke.
  const debouncedQuery = useDebouncedValue(query, 150)

  const rows = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    let list = incidents.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (severityFilter !== 'all' && i.severity !== severityFilter) return false
      if (q && !`${i.userName} ${i.area} ${i.id}`.toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a, b) =>
      sortBySeverity
        ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.startedAt - a.startedAt
        : b.startedAt - a.startedAt,
    )
    return list
  }, [incidents, statusFilter, severityFilter, debouncedQuery, sortBySeverity])

  const activeCount = incidents.filter((i) => i.status === 'new' || i.status === 'acknowledged' || i.status === 'responding').length

  return (
    <GlassCard title="Incident feed" subtitle={`${activeCount} active · ${incidents.length} total`} className="flex h-full flex-col p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-600" />
          <input
            aria-label="Search incidents"
            placeholder="Search name, area, ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-xs text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60"
          />
        </div>
        <select
          aria-label="Filter by severity"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as 'all' | Severity)}
          className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-xs text-ink-200 outline-none focus:border-accent/60 [&>option]:bg-base-950"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          type="button"
          onClick={() => setSortBySeverity((v) => !v)}
          title={sortBySeverity ? 'Sort by newest' : 'Sort by severity'}
          aria-pressed={sortBySeverity}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
            sortBySeverity ? 'border-accent/60 text-accent' : 'border-white/10 text-ink-400 hover:text-ink-100'
          }`}
        >
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          {sortBySeverity ? 'Severity' : 'Newest'}
        </button>
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
            {f === 'all' ? 'All' : STATUS_META[f].label}
          </button>
        ))}
      </div>

      <div className="min-h-0 h-[420px] flex-1">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-ink-500">No incidents match these filters.</p>
        ) : (
          <TableVirtuoso
            data={rows}
            overscan={8}
            fixedHeaderContent={() => (
              <tr className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500">
                <th className="bg-[#0c1220]/95 px-2 py-2 text-left font-medium">Alert</th>
                <th className="bg-[#0c1220]/95 px-2 py-2 text-left font-medium">Area</th>
                <th className="hidden bg-[#0c1220]/95 px-2 py-2 text-left font-medium sm:table-cell">Reported</th>
                <th className="bg-[#0c1220]/95 px-2 py-2 text-left font-medium">Status</th>
              </tr>
            )}
            itemContent={(_index, inc: PoliceIncident) => {
              const sm = STATUS_META[inc.status]
              const sev = SEVERITY_META[inc.severity]
              return (
                <>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: sev.color, boxShadow: `0 0 8px ${sev.color}` }}
                        title={sev.label}
                      />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink-100">
                          {inc.userName}
                          {inc.live && (
                            <span className="rounded bg-red-400/20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-red-200">
                              Live
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-[10px] text-ink-600">{inc.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[110px] truncate px-2 py-2.5 text-xs text-ink-400">{inc.area}</td>
                  <td className="hidden whitespace-nowrap px-2 py-2.5 font-mono text-[11px] text-ink-500 sm:table-cell">{timeAgo(inc.startedAt)}</td>
                  <td className="px-2 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] ${sm.pill}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${sm.dot} ${inc.status === 'new' ? 'animate-pulse' : ''}`} />
                      {sm.label}
                    </span>
                  </td>
                </>
              )
            }}
            components={{
              Table: (props) => <table {...props} className="w-full border-collapse text-left" />,
              TableRow: ({ item: inc, ...rest }: { item: PoliceIncident } & React.HTMLAttributes<HTMLTableRowElement>) => {
                const selected = inc.id === selectedId
                return (
                  <tr
                    {...rest}
                    onClick={() => select(inc.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open incident ${inc.id} — ${inc.userName}, ${inc.area}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        select(inc.id)
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
