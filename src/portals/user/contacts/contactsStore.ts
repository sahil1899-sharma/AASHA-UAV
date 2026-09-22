import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Family / emergency contacts. Persisted in localStorage for now — the
 * Phase 6 backend will sync these to the user's account.
 */

export interface EmergencyContact {
  id: string
  name: string
  relationship: string
  phone: string
  isPrimary: boolean
}

interface ContactsState {
  contacts: EmergencyContact[]
  addContact: (c: { name: string; relationship: string; phone: string }) => void
  updateContact: (id: string, c: { name: string; relationship: string; phone: string }) => void
  deleteContact: (id: string) => void
  setPrimary: (id: string) => void
}

export const useContactsStore = create<ContactsState>()(
  persist(
    (set) => ({
      contacts: [],

      addContact: ({ name, relationship, phone }) =>
        set((s) => ({
          contacts: [
            ...s.contacts,
            {
              id: `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
              name: name.trim(),
              relationship: relationship.trim(),
              phone: phone.trim(),
              isPrimary: s.contacts.length === 0,
            },
          ],
        })),

      updateContact: (id, { name, relationship, phone }) =>
        set((s) => ({
          contacts: s.contacts.map((c) =>
            c.id === id
              ? { ...c, name: name.trim(), relationship: relationship.trim(), phone: phone.trim() }
              : c,
          ),
        })),

      deleteContact: (id) =>
        set((s) => {
          const remaining = s.contacts.filter((c) => c.id !== id)
          const deletedWasPrimary = s.contacts.find((c) => c.id === id)?.isPrimary
          if (deletedWasPrimary && remaining.length > 0) {
            remaining[0] = { ...remaining[0], isPrimary: true }
          }
          return { contacts: remaining }
        }),

      setPrimary: (id) =>
        set((s) => ({
          contacts: s.contacts.map((c) => ({ ...c, isPrimary: c.id === id })),
        })),
    }),
    { name: 'aasha-contacts-v1' },
  ),
)
