import { create } from 'zustand'

/**
 * Shared notification center state. The user dashboard surfaces this as the
 * notification bell; police and hospital dashboards will read the same store
 * in their own phases.
 */

export type NotificationKind = 'sos' | 'wearable' | 'system'

export interface AppNotification {
  id: string
  at: number
  title: string
  body: string
  kind: NotificationKind
}

interface NotificationsState {
  items: AppNotification[]
  unread: number
  push: (n: { title: string; body: string; kind: NotificationKind }) => void
  markAllRead: () => void
  clear: () => void
}

let seeded = false

export const useNotificationsStore = create<NotificationsState>((set) => ({
  items: [],
  unread: 0,

  push: ({ title, body, kind }) => {
    if (!seeded) {
      seeded = true
      set({
        items: [
          {
            id: 'sys-boot',
            at: Date.now(),
            title: 'AASHA-UAV system online',
            body: 'Your safety dashboard is live. Pair your wearable to begin.',
            kind: 'system',
          },
        ],
        unread: 1,
      })
    }
    const item: AppNotification = {
      id: `n-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`,
      at: Date.now(),
      title,
      body,
      kind,
    }
    set((s) => ({ items: [item, ...s.items].slice(0, 50), unread: s.unread + 1 }))
  },

  markAllRead: () => set({ unread: 0 }),
  clear: () => set({ items: [], unread: 0 }),
}))
