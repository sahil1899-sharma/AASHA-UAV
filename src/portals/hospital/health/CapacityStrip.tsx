import { Ambulance, BedDouble } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { useHealthStore } from './healthAlertStore'

/**
 * Fleet & capacity: ambulance availability and ward bed occupancy.
 */
export function CapacityStrip() {
  const ambulances = useHealthStore((s) => s.ambulances)
  const beds = useHealthStore((s) => s.beds)

  const availableAmbulances = ambulances.filter((a) => a.status === 'available').length
  const totalFree = beds.reduce((n, w) => n + (w.total - w.occupied), 0)

  return (
    <GlassCard
      title="Fleet & capacity"
      subtitle={`${availableAmbulances} ambulances available · ${totalFree} beds free`}
      className="p-6"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            <Ambulance className="h-3.5 w-3.5 text-teal-300" /> Ambulance fleet
          </p>
          <div className="space-y-1.5">
            {ambulances.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/[0.07] px-3 py-2 text-xs">
                <span className="font-semibold text-ink-200">{a.callsign} <span className="font-normal text-ink-500">· {a.base}</span></span>
                <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${
                  a.status === 'available' ? 'text-emerald-300' : a.status === 'off-duty' ? 'text-ink-600' : 'text-amber-300'
                }`}>
                  {a.status.replace('-', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            <BedDouble className="h-3.5 w-3.5 text-teal-300" /> Bed availability
          </p>
          <div className="space-y-2.5">
            {beds.map((w) => {
              const free = w.total - w.occupied
              const pct = Math.round((w.occupied / w.total) * 100)
              return (
                <div key={w.name} className="flex items-center gap-2.5">
                  <span className="w-24 text-[11px] text-ink-300">{w.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className={`h-full rounded-full ${pct >= 90 ? 'bg-red-400' : pct >= 75 ? 'bg-amber-300' : 'bg-teal-300'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-20 text-right font-mono text-[11px] text-ink-400">{free} free / {w.total}</span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-600">
            Occupancy refreshes from the bed-management feed. Reserve ahead for P1 arrivals.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
