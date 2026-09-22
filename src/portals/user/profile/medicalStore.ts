import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * User medical profile. This is the data model the Hospital dashboard will
 * read in its own phase (triage board, casualty intake) — fields are named
 * for that handoff. Persisted in localStorage for now.
 */

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export interface MedicalProfile {
  bloodType: string
  allergies: string[]
  conditions: string[]
  medications: string[]
  notes: string
}

interface MedicalState {
  profile: MedicalProfile
  setBloodType: (bloodType: string) => void
  addItem: (field: 'allergies' | 'conditions' | 'medications', value: string) => void
  removeItem: (field: 'allergies' | 'conditions' | 'medications', index: number) => void
  setNotes: (notes: string) => void
}

const EMPTY_PROFILE: MedicalProfile = {
  bloodType: '',
  allergies: [],
  conditions: [],
  medications: [],
  notes: '',
}

export const useMedicalStore = create<MedicalState>()(
  persist(
    (set) => ({
      profile: EMPTY_PROFILE,

      setBloodType: (bloodType) =>
        set((s) => ({ profile: { ...s.profile, bloodType } })),

      addItem: (field, value) => {
        const v = value.trim()
        if (!v) return
        set((s) => {
          if (s.profile[field].some((x) => x.toLowerCase() === v.toLowerCase())) return s
          return { profile: { ...s.profile, [field]: [...s.profile[field], v] } }
        })
      },

      removeItem: (field, index) =>
        set((s) => ({
          profile: { ...s.profile, [field]: s.profile[field].filter((_, i) => i !== index) },
        })),

      setNotes: (notes) => set((s) => ({ profile: { ...s.profile, notes } })),
    }),
    { name: 'aasha-medical-v1' },
  ),
)
