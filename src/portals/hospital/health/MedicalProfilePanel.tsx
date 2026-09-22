import { AlertTriangle, Droplets, HeartPulse, Phone, Pill, Stethoscope, User } from 'lucide-react'
import { useContactsStore } from '../../user/contacts/contactsStore'
import { useMedicalStore } from '../../user/profile/medicalStore'
import type { MedicalProfile } from '../../user/profile/medicalStore'
import type { EmergencyContactInfo, HealthAlert } from './healthAlertStore'
import { TRIAGE_META } from './HealthFeed'

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
        {icon} {title}
      </p>
      {children}
    </div>
  )
}

function TagList({ items, empty, tone }: { items: string[]; empty: string; tone: string }) {
  if (items.length === 0) return <p className="text-xs text-ink-600">{empty}</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
          {t}
        </span>
      ))}
    </div>
  )
}

/**
 * Per-user medical record: the SAME underlying profile the user maintains on
 * the user dashboard (shared medical store) for a live alert, or the seeded
 * clinical record for mock patients. Trigger vitals sit alongside.
 */
export function MedicalProfilePanel({ alert }: { alert: HealthAlert }) {
  // Live alert → the real record from the shared user medical store.
  const liveProfile = useMedicalStore((s) => s.profile)
  const primaryContact = useContactsStore((s) => s.contacts.find((c) => c.isPrimary))

  const profile: MedicalProfile = alert.record?.profile ?? liveProfile
  const emergencyContact: EmergencyContactInfo | null = alert.record?.emergencyContact ?? (
    primaryContact
      ? { name: primaryContact.name, relation: primaryContact.relationship || 'Emergency contact', phone: primaryContact.phone }
      : null
  )
  const tri = TRIAGE_META[alert.triage]
  const empty = !profile.bloodType && profile.allergies.length === 0 && profile.conditions.length === 0 && profile.medications.length === 0 && !profile.notes

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Transmitted vitals */}
      <Section icon={<HeartPulse className="h-3.5 w-3.5 text-red-300" />} title="Vitals at trigger">
        <div className="mb-3 flex items-end gap-2">
          <p className="text-4xl font-bold text-ink-50">{alert.vitals.heartRate ?? '—'}</p>
          <p className="pb-1 text-xs text-ink-500">bpm</p>
        </div>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between"><dt className="text-ink-500">Trigger</dt><dd className={`font-semibold ${alert.trigger.type === 'automatic' ? 'text-amber-200' : 'text-ink-100'}`}>{alert.trigger.type === 'automatic' ? 'Automatic detection' : 'Manual SOS'}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Wearable battery</dt><dd className="font-mono text-ink-200">{alert.vitals.battery ?? '—'}%</dd></div>
          <div className="flex justify-between"><dt className="text-ink-500">Link</dt><dd className={alert.vitals.connected ? 'text-emerald-300' : 'text-ink-500'}>{alert.vitals.connected ? 'Connected' : 'Last known'}</dd></div>
        </dl>
        <p className="mt-3 rounded-lg border border-white/10 bg-base-950/60 p-2.5 text-[11px] leading-relaxed text-ink-400">{alert.trigger.detail}</p>
        {alert.vitals.simulated && (
          <p className="mt-2 inline-block rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-amber-200">Simulated readings</p>
        )}
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tri.color, boxShadow: `0 0 8px ${tri.color}` }} />
          <p className="text-xs font-semibold text-ink-100">{tri.label}</p>
          <p className="text-[11px] text-ink-500">triage priority</p>
        </div>
      </Section>

      {/* Clinical profile */}
      <div className="lg:col-span-2">
        <Section
          icon={<Stethoscope className="h-3.5 w-3.5 text-teal-300" />}
          title={alert.live ? 'Medical profile — transmitted with SOS' : 'Medical profile — on record'}
        >
          {empty ? (
            <p className="py-6 text-center text-xs text-ink-500">No medical profile on file for this patient.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-300"><Droplets className="h-3.5 w-3.5 text-red-300" /> Blood type</p>
                <p className="text-2xl font-bold text-ink-50">{profile.bloodType || '—'}</p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-300"><User className="h-3.5 w-3.5 text-ink-500" /> Patient</p>
                <p className="text-sm text-ink-100">{alert.userName}</p>
                <p className="font-mono text-[10px] text-ink-500">{alert.id}</p>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-300"><AlertTriangle className="h-3.5 w-3.5 text-amber-300" /> Allergies</p>
                <TagList items={profile.allergies} empty="None recorded" tone="border-amber-400/40 bg-amber-400/10 text-amber-200" />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink-300">Chronic conditions</p>
                <TagList items={profile.conditions} empty="None recorded" tone="border-white/15 bg-white/[0.06] text-ink-200" />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-300"><Pill className="h-3.5 w-3.5 text-teal-300" /> Current medications</p>
                <TagList items={profile.medications} empty="None recorded" tone="border-teal-400/40 bg-teal-400/10 text-teal-200" />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-300"><Phone className="h-3.5 w-3.5 text-ink-500" /> Emergency contact</p>
                {emergencyContact ? (
                  <p className="text-sm text-ink-100">
                    {emergencyContact.name} <span className="text-ink-500">· {emergencyContact.relation}</span>
                    <br />
                    <a href={`tel:${emergencyContact.phone.replace(/\s/g, '')}`} className="text-accent hover:underline">{emergencyContact.phone}</a>
                  </p>
                ) : (
                  <p className="text-xs text-ink-600">None on file</p>
                )}
              </div>
              {profile.notes && (
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-xs font-semibold text-ink-300">Responder notes</p>
                  <p className="rounded-lg border border-white/10 bg-base-950/60 p-3 text-[13px] text-ink-200">{profile.notes}</p>
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
