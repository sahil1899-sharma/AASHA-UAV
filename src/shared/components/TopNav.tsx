import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hexagon } from 'lucide-react'

export type PortalId = 'user' | 'police' | 'hospital'

export const PORTALS: Record<PortalId, { label: string; short: string; path: string }> = {
  user: { label: 'User', short: 'User', path: '/login/user' },
  police: { label: 'Police / Security', short: 'Police', path: '/login/police' },
  hospital: { label: 'Hospital Authority', short: 'Hospital', path: '/login/hospital' },
}

interface TopNavProps {
  portal: PortalId
  /**
   * Demo convenience: when provided, switching portals calls this instead of
   * navigating (lets a demo page reskin in place). Real portals omit it and
   * the switcher navigates between routes.
   */
  onSwitchPortal?: (portal: PortalId) => void
}

/**
 * Shared top shell: wordmark, current-portal badge, portal switcher
 * (demo convenience until real auth lands), live clock.
 * Must be rendered inside the portal's accent wrapper (e.g. .portal-user).
 */
export function TopNav({ portal, onSwitchPortal }: TopNavProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = now.toLocaleTimeString('en-GB', { hour12: false })
  const date = now.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-base-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {/* Wordmark */}
        <Link to="/" className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center">
            <Hexagon className="h-9 w-9 text-accent" strokeWidth={1.5} />
            <span className="absolute h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="whitespace-nowrap text-base font-bold tracking-[0.18em] text-ink-100 sm:text-lg">
            AASHA<span className="text-accent">-UAV</span>
          </span>
        </Link>

        {/* Current portal badge */}
        <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-medium text-ink-300 sm:flex">
          <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
          {PORTALS[portal].label}
        </span>

        <div className="flex-1" />

        {/* Portal switcher (demo convenience) */}
        <nav aria-label="Switch portal" className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
          {(Object.keys(PORTALS) as PortalId[]).map((id) =>
            onSwitchPortal ? (
              <button
                key={id}
                type="button"
                onClick={() => onSwitchPortal(id)}
                aria-pressed={id === portal}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  id === portal
                    ? 'bg-accent text-base-950'
                    : 'text-ink-500 hover:text-ink-100'
                }`}
              >
                {/* Short label on narrow screens keeps the switcher tappable */}
                <span className="sm:hidden">{PORTALS[id].short}</span>
                <span className="hidden sm:inline">{PORTALS[id].label}</span>
              </button>
            ) : (
              <Link
                key={id}
                to={PORTALS[id].path}
                aria-current={id === portal ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  id === portal
                    ? 'bg-accent text-base-950'
                    : 'text-ink-500 hover:text-ink-100'
                }`}
              >
                {/* Short label on narrow screens keeps the switcher tappable */}
                <span className="sm:hidden">{PORTALS[id].short}</span>
                <span className="hidden sm:inline">{PORTALS[id].label}</span>
              </Link>
            ),
          )}
        </nav>

        {/* Clock */}
        <div className="hidden text-right md:block">
          <div className="text-sm font-semibold tabular-nums text-ink-100">{time}</div>
          <div className="text-[10px] uppercase tracking-widest text-ink-500">{date}</div>
        </div>
      </div>
    </header>
  )
}
