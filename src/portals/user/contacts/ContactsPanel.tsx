import { useState } from 'react'
import { Phone, Plus, Star, Users, X } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { useContactsStore } from './contactsStore'
import type { EmergencyContact } from './contactsStore'

const EMPTY_FORM = { name: '', relationship: '', phone: '' }

function ContactForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: EmergencyContact
  onSubmit: (v: { name: string; relationship: string; phone: string }) => void
  onCancel: () => void
}) {
  const [v, setV] = useState(
    initial ? { name: initial.name, relationship: initial.relationship, phone: initial.phone } : EMPTY_FORM,
  )
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!v.name.trim() || !v.phone.trim()) {
      setError('Name and phone number are required.')
      return
    }
    if (!/^[+()\-\s\d]{6,20}$/.test(v.phone.trim())) {
      setError('That phone number doesn’t look valid.')
      return
    }
    onSubmit(v)
  }

  const inputClass =
    'w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 outline-none focus:border-accent/60'

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          aria-label="Contact name"
          placeholder="Name — e.g. Priya Sharma"
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Relationship"
          placeholder="Relationship — e.g. Mother"
          value={v.relationship}
          onChange={(e) => setV({ ...v, relationship: e.target.value })}
          className={inputClass}
        />
        <input
          aria-label="Phone number"
          placeholder="Phone — e.g. +91 98XXXXXXXX"
          value={v.phone}
          onChange={(e) => setV({ ...v, phone: e.target.value })}
          inputMode="tel"
          className={`${inputClass} sm:col-span-2`}
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-accent px-4 py-2 text-xs font-bold uppercase tracking-wider text-base-950"
        >
          {initial ? 'Save' : 'Add contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-ink-400 hover:text-ink-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Family / emergency contacts — add, edit, delete, mark one primary.
 * Persisted in localStorage.
 */
export function ContactsPanel() {
  const contacts = useContactsStore((s) => s.contacts)
  const addContact = useContactsStore((s) => s.addContact)
  const updateContact = useContactsStore((s) => s.updateContact)
  const deleteContact = useContactsStore((s) => s.deleteContact)
  const setPrimary = useContactsStore((s) => s.setPrimary)

  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <GlassCard
      title="Emergency contacts"
      subtitle="Notified automatically when you trigger SOS"
      className="flex h-full flex-col p-6"
    >
      {contacts.length === 0 && !adding ? (
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <Users className="h-8 w-8 text-ink-600" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-ink-400">No contacts yet</p>
          <p className="mt-1 max-w-[220px] text-xs text-ink-600">
            Add family or friends — they’re alerted the moment you trigger SOS.
          </p>
        </div>
      ) : (
        <ul className="flex-1 space-y-2.5 overflow-y-auto">
          {contacts.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl border p-3.5 transition-colors ${
                c.isPrimary
                  ? 'border-accent/40 bg-accent/[0.07]'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              {editingId === c.id ? (
                <ContactForm
                  initial={c}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) => {
                    updateContact(c.id, v)
                    setEditingId(null)
                  }}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-sm font-bold text-ink-200">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-100">
                      <span className="truncate">{c.name}</span>
                      {c.isPrimary && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-300 text-amber-300" />
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {[c.relationship, c.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!c.isPrimary && (
                      <button
                        type="button"
                        title="Mark as primary"
                        aria-label={`Mark ${c.name} as primary contact`}
                        onClick={() => setPrimary(c.id)}
                        className="rounded-lg p-1.5 text-ink-500 transition-colors hover:text-amber-300"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <a
                      href={`tel:${c.phone.replace(/\s/g, '')}`}
                      title={`Call ${c.name}`}
                      aria-label={`Call ${c.name}`}
                      className="rounded-lg p-1.5 text-ink-500 transition-colors hover:text-accent"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      title="Edit"
                      aria-label={`Edit ${c.name}`}
                      onClick={() => setEditingId(c.id)}
                      className="rounded-lg p-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-ink-100"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => deleteContact(c.id)}
                      className="rounded-lg p-1.5 text-ink-500 transition-colors hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3">
          <ContactForm
            onCancel={() => setAdding(false)}
            onSubmit={(v) => {
              addContact(v)
              setAdding(false)
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true)
            setEditingId(null)
          }}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-3 text-sm font-medium text-ink-300 transition-colors hover:border-accent/50 hover:text-ink-100"
        >
          <Plus className="h-4 w-4" />
          Add contact
        </button>
      )}
    </GlassCard>
  )
}
