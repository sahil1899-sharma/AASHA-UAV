import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  /** Accent border-glow. Disable for neutral panels. */
  glow?: boolean
  title?: string
  subtitle?: string
}

/**
 * Shared frosted-glass panel used for every dashboard widget across all
 * three portals. The accent glow follows the portal's CSS variable, so the
 * same component reskins automatically.
 */
export function GlassCard({
  children,
  className = '',
  glow = true,
  title,
  subtitle,
}: GlassCardProps) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl ${className}`}
      style={
        glow
          ? {
              borderColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
              boxShadow:
                '0 0 36px -10px var(--accent-dim), inset 0 1px 0 rgb(255 255 255 / 0.07)',
            }
          : undefined
      }
    >
      {(title ?? subtitle) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-sm font-semibold tracking-wide text-ink-100">
              {title}
            </h3>
          )}
          {subtitle && <p className="mt-1 text-xs text-ink-500">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
