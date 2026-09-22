import { useState } from 'react'
import { HeartPulse, Plus, X } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { BLOOD_TYPES, useMedicalStore } from './medicalStore'

type ListField = 'allergies' | 'conditions' | 'medications'

const FIELD_META: { field: ListField; label: string; placeholder: string }[] = [
  { field: 'allergies', label: 'Allergies', placeholder: 'e.g. Penicillin' },
  { field: 'conditions', label: 'Conditions', placeholder: 'e.g. Asthma' },
  { field: 'medications', label: 'Medications', placeholder: 'e.g. Inhaler' },
]

function TagEditor({ field, label, placeholder }: { field: ListField; label: string; placeholder: string }) {
  const items = useMedicalStore((s) => s.profile[field])
  const addItem = useMedicalStore((s) => s.addItem)
  const removeItem = useMedicalStore((s) => s.removeItem)
  const [draft, setDraft] = useState('')

  const add = () => {
    addItem(field, draft)
    setDraft('')
  }

  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-xs text-ink-200"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              onClick={() => removeItem(field, i)}
              className="text-ink-500 hover:text-red-300"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          aria-label={`Add ${label.toLowerCase()}`}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          className="w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60"
        />
        <button
          type="button"
          aria-label={`Add to ${label.toLowerCase()}`}
          onClick={add}
          className="shrink-0 rounded-lg border border-white/15 px-3 text-ink-300 transition-colors hover:border-accent/50 hover:text-ink-100"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * Medical profile — blood type, allergies, conditions, medications, notes.
 * This exact shape is what the Hospital dashboard will consume for triage.
 */
export function MedicalPanel() {
  const profile = useMedicalStore((s) => s.profile)
  const setBloodType = useMedicalStore((s) => s.setBloodType)
  const setNotes = useMedicalStore((s) => s.setNotes)
  const [savedFlash, setSavedFlash] = useState(false)

  return (
    <GlassCard
      title="Medical profile"
      subtitle="Shared with responders and hospitals during an emergency"
      className="flex h-full flex-col p-6"
    >
      <div className="flex items-center gap-2.5">
        <HeartPulse className="h-5 w-5 text-accent" strokeWidth={2} />
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-500">Blood type</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {BLOOD_TYPES.map((bt) => (
          <button
            key={bt}
            type="button"
            onClick={() => setBloodType(bt)}
            aria-pressed={profile.bloodType === bt}
            className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
              profile.bloodType === bt
                ? 'border-accent bg-accent/20 text-accent'
                : 'border-white/12 text-ink-400 hover:border-white/30 hover:text-ink-100'
            }`}
          >
            {bt}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {FIELD_META.map((m) => (
          <TagEditor key={m.field} field={m.field} label={m.label} placeholder={m.placeholder} />
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-500">
          Notes for responders
        </p>
        <textarea
          aria-label="Notes for responders"
          placeholder="Anything responders should know — implants, doctor's number…"
          value={profile.notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60"
        />
      </div>

      <p aria-live="polite" className="mt-3 h-4 text-xs text-emerald-300">
        {savedFlash ? 'Saved — stored on this device.' : ''}
      </p>
      <button
        type="button"
        onClick={() => {
          setSavedFlash(true)
          window.setTimeout(() => setSavedFlash(false), 2500)
        }}
        className="mt-1 w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-base-950 transition-transform hover:scale-[1.01] active:scale-[0.99]"
        style={{ boxShadow: '0 0 24px -6px var(--accent)' }}
      >
        Save profile
      </button>
    </GlassCard>
  )
}
