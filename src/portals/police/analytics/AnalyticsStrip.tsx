import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { usePoliceStore } from '../incidents/policeIncidentStore'
import { STATUS_META } from '../incidents/IncidentFeed'
import type { IncidentStatus } from '../incidents/policeIncidentStore'

/**
 * Patrol-planning analytics: hotspot frequency over the last 7 days,
 * incidents by area, and the status mix. Computed from the incident register.
 */
export function AnalyticsStrip() {
  const incidents = usePoliceStore((s) => s.incidents)

  const byArea = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of incidents) m.set(i.area, (m.get(i.area) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [incidents])

  const last7Days = useMemo(() => {
    const days: { label: string; count: number }[] = []
    const now = new Date()
    for (let d = 6; d >= 0; d--) {
      const day = new Date(now)
      day.setDate(now.getDate() - d)
      const key = day.toDateString()
      const count = incidents.filter((i) => new Date(i.startedAt).toDateString() === key).length
      days.push({ label: day.toLocaleDateString([], { weekday: 'narrow' }), count })
    }
    return days
  }, [incidents])

  const statusMix = useMemo(() => {
    const order: IncidentStatus[] = ['new', 'acknowledged', 'responding', 'resolved', 'false-alarm']
    return order.map((s) => ({ status: s, count: incidents.filter((i) => i.status === s).length }))
  }, [incidents])

  const maxArea = Math.max(1, ...byArea.map(([, c]) => c))
  const maxDay = Math.max(1, ...last7Days.map((d) => d.count))

  return (
    <GlassCard title="Patrol analytics" subtitle="Patterns from the incident register" className="p-6">
      <div className="grid gap-6 md:grid-cols-3">
        {/* Hotspot frequency */}
        <div>
          <p className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            <BarChart3 className="h-3.5 w-3.5 text-accent" /> Hotspot frequency · 7 days
          </p>
          <div className="flex h-28 items-end gap-2">
            {last7Days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.count} incidents`}>
                <span className="font-mono text-[9px] text-ink-400">{d.count > 0 ? d.count : ''}</span>
                <div
                  className={`w-full rounded-t-md ${d.count > 0 ? 'bg-accent/70' : 'bg-white/[0.06]'}`}
                  style={{ height: `${Math.max(6, (d.count / maxDay) * 84)}px` }}
                />
                <span className="font-mono text-[9px] uppercase text-ink-500">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Incidents by area */}
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Incidents by area</p>
          <div className="space-y-2">
            {byArea.map(([area, count]) => (
              <div key={area} className="flex items-center gap-2.5">
                <span className="w-28 truncate text-[11px] text-ink-300">{area}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent" style={{ width: `${(count / maxArea) * 100}%` }} />
                </div>
                <span className="w-5 text-right font-mono text-[11px] text-ink-400">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status mix */}
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">Status mix</p>
          <div className="space-y-2">
            {statusMix.map(({ status, count }) => (
              <div key={status} className="flex items-center gap-2.5">
                <span className={`h-2 w-2 rounded-full ${STATUS_META[status].dot}`} />
                <span className="w-28 text-[11px] text-ink-300">{STATUS_META[status].label}</span>
                <span className="font-mono text-[11px] text-ink-400">{count}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
            Repeat hotspots (Karol Bagh, Connaught Place) merit denser patrol rotation during evening hours.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
