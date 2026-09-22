import { create } from 'zustand'

/**
 * Shared identity state for the AASHA-UAV platform.
 *
 * This is the swappable auth module's seam: today the MockAuthGate writes a
 * no-validation identity here; tomorrow a real auth provider writes the same
 * shape and nothing else changes — routing, portals, and guards all read
 * from this store.
 */

export type Role = 'user' | 'police' | 'hospital'

export const ROLES: Role[] = ['user', 'police', 'hospital']

export function isRole(value: string | undefined): value is Role {
  return value === 'user' || value === 'police' || value === 'hospital'
}

export interface Identity {
  role: Role
  /** Full name as entered on the sign-in screen. */
  name: string
  /**
   * Role credential as entered on the sign-in screen:
   * badge number (police), hospital / department (hospital), '' otherwise.
   */
  credential: string
}

interface AuthState {
  /** null = nobody has signed in yet this session. */
  identity: Identity | null
  login: (identity: Identity) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  identity: null,
  login: (identity) => set({ identity }),
  logout: () => set({ identity: null }),
}))
