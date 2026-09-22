import { useMemo } from 'react'
import { Video } from 'lucide-react'
import type { EvidenceItem } from '../incidents/policeIncidentStore'

/** Deterministic PRNG (mulberry32) — same item always renders the same still. */
function rng(seedStr: string) {
  let t = 0
  for (let i = 0; i < seedStr.length; i++) t = (t * 31 + seedStr.charCodeAt(i)) >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let z = t
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' }).toUpperCase()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`
}

/**
 * Mock surveillance still — deterministic pseudo-thermal frame with
 * crosshair, telemetry strip and timestamp, like a UAV downlink frame.
 */
export function EvidenceThumb({ item, onOpen }: { item: EvidenceItem; onOpen: () => void }) {
  const blobs = useMemo(() => {
    const r = rng(item.id)
    return Array.from({ length: 26 }, () => ({
      x: r() * 160,
      y: r() * 90,
      rx: 6 + r() * 22,
      ry: 4 + r() * 12,
      o: 0.08 + r() * 0.22,
      hot: r() > 0.82,
    }))
  }, [item.id])

  const target = useMemo(() => {
    const r = rng(item.id + '-t')
    return { x: 40 + r() * 80, y: 25 + r() * 40 }
  }, [item.id])

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-full overflow-hidden rounded-xl border border-white/10 text-left transition-all hover:border-accent/50"
      aria-label={`Open evidence ${item.id}`}
    >
      <svg viewBox="0 0 160 90" className="block h-auto w-full" aria-hidden="true">
        <rect width="160" height="90" fill="#070b12" />
        {blobs.map((b, i) => (
          <ellipse
            key={i}
            cx={b.x}
            cy={b.y}
            rx={b.rx}
            ry={b.ry}
            fill={b.hot ? '#ff5a3c' : '#3d6b8f'}
            opacity={b.o}
          />
        ))}
        {/* scanlines */}
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="0" y1={i * 8} x2="160" y2={i * 8} stroke="#ffffff" strokeOpacity="0.03" />
        ))}
        {/* crosshair on tracked subject */}
        <g stroke="#ff5a3c" strokeWidth="1" opacity="0.9">
          <circle cx={target.x} cy={target.y} r="9" fill="none" />
          <line x1={target.x - 14} y1={target.y} x2={target.x - 9} y2={target.y} />
          <line x1={target.x + 9} y1={target.y} x2={target.x + 14} y2={target.y} />
          <line x1={target.x} y1={target.y - 14} x2={target.x} y2={target.y - 9} />
          <line x1={target.x} y1={target.y + 9} x2={target.x} y2={target.y + 14} />
        </g>
        <text x="6" y="12" fill="#9fd8ff" fontSize="7" fontFamily="monospace" opacity="0.9">
          {item.uavId} · NIGHT VIS
        </text>
        <text x="6" y="84" fill="#9fd8ff" fontSize="6.5" fontFamily="monospace" opacity="0.75">
          {formatClock(item.capturedAt)}
        </text>
      </svg>
      {item.kind === 'video' && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-red-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
          <Video className="h-3 w-3" />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 pb-1.5 pt-5">
        <span className="block truncate text-[11px] font-medium text-ink-100">{item.label}</span>
        <span className="block font-mono text-[9px] text-ink-500">{item.id}</span>
      </span>
    </button>
  )
}
