import { useEffect, useState } from 'react'
import { PhoneCall, Siren } from 'lucide-react'
import { PageTransition } from '../../shared/components/PageTransition'
import { TopNav } from '../../shared/components/TopNav'
import { CommandCanvas } from '../../shared/animations/CommandCanvas'
import { useAuthStore } from '../../shared/state/authStore'
import { initIncidentBus, useIncidentStore } from '../../shared/state/incidentStore'
import { useWearableStore } from './bluetooth/wearableStore'
import { WearablePanel } from './bluetooth/WearablePanel'
import { SosPanel } from './sos/SosPanel'
import { ContactsPanel } from './contacts/ContactsPanel'
import { RiskMap } from './map/RiskMap'
import { NotificationCenter } from './notifications/NotificationCenter'
import { FakeCallOverlay } from './safety/FakeCallOverlay'
import { AnomalyPanel } from './safety/AnomalyPanel'
import { PreAlertOverlay } from './safety/PreAlertOverlay'
import { MedicalPanel } from './profile/MedicalPanel'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * User dashboard — wearable link, SOS trigger, risk map, emergency
 * contacts, notifications, medical profile, and the discreet fake call.
 */
export function UserDashboard() {
  const name = useAuthStore((s) => s.identity?.name)
  const incidentActive = useIncidentStore((s) => s.activeIncident?.status === 'active')
  const wearableStatus = useWearableStore((s) => s.status)
  const wearableSimulated = useWearableStore((s) => s.isSimulated)
  const [fakeCall, setFakeCall] = useState(false)

  // Phase 6: police actions broadcast from other tabs advance the SOS timeline here.
  useEffect(() => {
    initIncidentBus()
  }, [])

  const firstName = name?.trim().split(/\s+/)[0]

  return (
    <PageTransition>
      <div className="portal-user relative min-h-screen">
        <CommandCanvas />
        <TopNav portal="user" />

        <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
                <Siren className="h-6 w-6 text-accent" strokeWidth={1.75} />
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink-100">
                  {greeting()}{firstName ? `, ${firstName}` : ''}
                </h1>
                <p className="mt-0.5 text-sm text-ink-500">
                  Your safety dashboard — everything is one glance away.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {incidentActive && (
                <span className="inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/15 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  Incident live
                </span>
              )}
              <span
                className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.2em] ${
                  wearableStatus === 'connected' ? 'text-emerald-300' : 'text-ink-400'
                }`}
                title={wearableSimulated ? 'Simulated wearable' : 'Wearable link'}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    wearableStatus === 'connected'
                      ? 'bg-emerald-400'
                      : wearableStatus === 'connecting'
                        ? 'animate-pulse bg-amber-300'
                        : 'bg-ink-600'
                  }`}
                />
                {wearableStatus === 'connected'
                  ? wearableSimulated
                    ? 'Wearable · sim'
                    : 'Wearable linked'
                  : 'Wearable off'}
              </span>
              <button
                type="button"
                title="Simulate an incoming call (discreet exit)"
                aria-label="Simulate an incoming call"
                onClick={() => setFakeCall(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-300 backdrop-blur-md transition-colors hover:border-accent/40 hover:text-ink-100"
              >
                <PhoneCall className="h-4.5 w-4.5" strokeWidth={2} />
              </button>
              <NotificationCenter />
            </div>
          </header>

          {/* Bento grid */}
          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-4 lg:row-span-2">
              <SosPanel />
            </div>
            <div className="lg:col-span-8 lg:row-span-2">
              <RiskMap />
            </div>
            <div className="lg:col-span-4">
              <WearablePanel />
            </div>
            <div className="lg:col-span-4">
              <AnomalyPanel />
            </div>
            <div className="lg:col-span-4">
              <ContactsPanel />
            </div>
            <div className="lg:col-span-4">
              <MedicalPanel />
            </div>
          </div>

          <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-ink-600">
            AASHA-UAV · User terminal · Wearable → Dispatch → UAV
          </p>
        </main>

        {fakeCall && <FakeCallOverlay onClose={() => setFakeCall(false)} />}
        <PreAlertOverlay />
      </div>
    </PageTransition>
  )
}
