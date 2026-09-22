import { useEffect, useRef, useState } from 'react'
import { Bell, Bluetooth, Siren, X } from 'lucide-react'
import { useNotificationsStore } from '../../../shared/state/notificationsStore'
import type { NotificationKind } from '../../../shared/state/notificationsStore'

function KindIcon({ kind }: { kind: NotificationKind }) {
  if (kind === 'sos') return <Siren className="h-4 w-4 text-accent" strokeWidth={2} />
  if (kind === 'wearable') return <Bluetooth className="h-4 w-4 text-blue-300" strokeWidth={2} />
  return <Bell className="h-4 w-4 text-ink-400" strokeWidth={2} />
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleDateString()
}

/**
 * Notification center — bell with unread badge and a dropdown feed of
 * alert status updates and system messages.
 */
export function NotificationCenter() {
  const items = useNotificationsStore((s) => s.items)
  const unread = useNotificationsStore((s) => s.unread)
  const markAllRead = useNotificationsStore((s) => s.markAllRead)
  const clear = useNotificationsStore((s) => s.clear)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open ])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
        onClick={() => {
          setOpen((v) => !v)
          if (!open) markAllRead()
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-ink-300 backdrop-blur-md transition-colors hover:border-accent/40 hover:text-ink-100"
      >
        <Bell className="h-4.5 w-4.5" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold text-base-950">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-[600] w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-base-950/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-ink-100">Notifications</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={clear}
                className="text-xs font-medium text-ink-500 hover:text-ink-100"
              >
                Clear
              </button>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
                className="text-ink-500 hover:text-ink-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <ul className="max-h-[380px] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-ink-500">
                No notifications yet.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="flex gap-3 border-b border-white/5 px-4 py-3 last:border-0">
                  <span className="mt-0.5 shrink-0">
                    <KindIcon kind={n.kind} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink-100">{n.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{n.body}</p>
                    <p className="mt-1 font-mono text-[10px] text-ink-600">{timeAgo(n.at)}</p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
