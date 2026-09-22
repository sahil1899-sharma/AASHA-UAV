import { useRef, useState } from 'react'
import { Loader2, SatelliteDish } from 'lucide-react'

export type TileStatus = 'loading' | 'ready' | 'degraded'

/**
 * Tracks Leaflet basemap tile health so every map can show honest
 * loading/error states:
 * - 'loading'  — until the first full tile set renders
 * - 'ready'    — tiles are painting
 * - 'degraded' — many tiles failed before anything rendered (basemap
 *   imagery unavailable, but vector overlays and markers still work)
 *
 * Wire `eventHandlers` into the map's <TileLayer/>. Render
 * <TileStatusOverlay/> inside the (relative) map container.
 */
export function useTileStatus() {
  const [status, setStatus] = useState<TileStatus>('loading')
  const errors = useRef(0)

  const eventHandlers = {
    load: () => {
      errors.current = 0
      setStatus('ready')
    },
    tileerror: () => {
      errors.current += 1
      if (errors.current >= 6) {
        setStatus((s) => (s === 'loading' ? 'degraded' : s))
      }
    },
  }

  return { status, eventHandlers }
}

export function TileStatusOverlay({ status }: { status: TileStatus }) {
  if (status === 'ready') return null
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center"
    >
      {status === 'loading' ? (
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-base-950/80 px-4 py-2 text-xs font-medium text-ink-300 backdrop-blur-md">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={2.5} />
          Loading map…
        </span>
      ) : (
        <span className="inline-flex max-w-[260px] items-center gap-2 rounded-xl border border-amber-400/25 bg-base-950/85 px-4 py-2.5 text-center text-xs leading-relaxed text-amber-200 backdrop-blur-md">
          <SatelliteDish className="h-4 w-4 shrink-0" strokeWidth={2} />
          Map imagery unavailable — live markers and zones still active.
        </span>
      )}
    </div>
  )
}
