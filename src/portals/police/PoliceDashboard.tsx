import { useEffect } from 'react'
import { Shield } from 'lucide-react'
import { CommandCanvas } from '../../shared/animations/CommandCanvas'
import { TopNav } from '../../shared/components/TopNav'
import { PageTransition } from '../../shared/components/PageTransition'
import { NotificationCenter } from '../user/notifications/NotificationCenter'
import { useAuthStore } from '../../shared/state/authStore'
import { IncidentFeed } from './incidents/IncidentFeed'
import { IncidentDetail } from './incidents/IncidentDetail'
import { PoliceMap } from './map/PoliceMap'
import { AnalyticsStrip } from './analytics/AnalyticsStrip'
import { initLiveSync, usePoliceStore } from './incidents/policeIncidentStore'

/**
 * Police / Security dashboard: live incident feed, operations map, per-incident
 * UAV evidence, dispatch workflow, unit comms, resolution, and patrol analytics.
 */
export function PoliceDashboard() {
  const identity = useAuthStore((s) => s.identity)
  const incidents = usePoliceStore((s) => s.incidents)
  const tickTelemetry = usePoliceStore((s) => s.tickTelemetry)

  // Live SOS sync + UAV telemetry simulation loop.
  useEffect(() => {
    initLiveSync()
    const t = window.setInterval(tickTelemetry, 2000)
    return () => {
      window.clearInterval(t)
    }
  }, [tickTelemetry])

  const activeCount = incidents.filter(
    (i) => i.status === 'new' || i.status === 'acknowledged' || i.status === 'responding',
  ).length

  return (
    <div className="relative min-h-screen bg-transparent text-ink-50">
      <CommandCanvas />
      <TopNav portal="police" />

      <PageTransition>
        <main className="relative z-10 mx-auto w-full max-w-[1500px] px-4 pb-16 pt-24 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                <Shield className="h-3.5 w-3.5" /> Police / Security operations
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {identity?.name ? `On watch, ${identity.name.split(' ')[0]}.` : 'Operations floor.'}
              </h1>
              <p className="mt-1.5 text-sm text-ink-400">
                {identity?.credential ? `Badge ${identity.credential} · ` : ''}
                {activeCount} active {activeCount === 1 ? 'incident' : 'incidents'} under response
              </p>
            </div>
            <NotificationCenter />
          </header>

          {/* Feed + map */}
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <IncidentFeed />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <PoliceMap />
            </div>
          </div>

          {/* Incident workspace */}
          <div className="mt-5">
            <IncidentDetail />
          </div>

          {/* Analytics */}
          <div className="mt-5">
            <AnalyticsStrip />
          </div>
        </main>
      </PageTransition>
    </div>
  )
}
