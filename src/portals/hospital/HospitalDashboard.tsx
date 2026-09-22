import { useEffect } from 'react'
import { Cross } from 'lucide-react'
import { CommandCanvas } from '../../shared/animations/CommandCanvas'
import { TopNav } from '../../shared/components/TopNav'
import { PageTransition } from '../../shared/components/PageTransition'
import { NotificationCenter } from '../user/notifications/NotificationCenter'
import { useAuthStore } from '../../shared/state/authStore'
import { initLiveSync } from '../police/incidents/policeIncidentStore'
import { HealthFeed } from './health/HealthFeed'
import { TriggerMap } from './health/TriggerMap'
import { AlertWorkspace } from './health/AlertWorkspace'
import { CapacityStrip } from './health/CapacityStrip'
import { HOSPITAL, initHealthSync, useHealthStore } from './health/healthAlertStore'

/**
 * Hospital Authority dashboard: incoming health alerts with transmitted
 * vitals, trigger location with ambulance-run ETA, the patient's medical
 * record, pre-arrival triage, police coordination, and fleet/bed capacity.
 */
export function HospitalDashboard() {
  const identity = useAuthStore((s) => s.identity)
  const alerts = useHealthStore((s) => s.alerts)

  useEffect(() => {
    initHealthSync()
    initLiveSync() // ensure linked police incidents exist for the coordination channel
  }, [])

  const activeCount = alerts.filter(
    (a) => a.status === 'incoming' || a.status === 'responding' || a.status === 'in-transit',
  ).length

  return (
    <div className="relative min-h-screen bg-transparent text-ink-50">
      <CommandCanvas />
      <TopNav portal="hospital" />

      <PageTransition>
        <main className="relative z-10 mx-auto w-full max-w-[1500px] px-4 pb-16 pt-24 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
                <Cross className="h-3.5 w-3.5" /> Hospital Authority · {HOSPITAL.name}
              </p>
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {identity?.name ? `Receiving, ${identity.name.split(' ')[0]}.` : 'Casualty intake.'}
              </h1>
              <p className="mt-1.5 text-sm text-ink-400">
                {identity?.credential ? `${identity.credential} · ` : ''}
                {activeCount} active {activeCount === 1 ? 'health alert' : 'health alerts'} under response
              </p>
            </div>
            <NotificationCenter />
          </header>

          <div className="grid gap-5 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <HealthFeed />
            </div>
            <div className="min-w-0 lg:col-span-7">
              <TriggerMap />
            </div>
          </div>

          <div className="mt-5">
            <AlertWorkspace />
          </div>

          <div className="mt-5">
            <CapacityStrip />
          </div>
        </main>
      </PageTransition>
    </div>
  )
}
