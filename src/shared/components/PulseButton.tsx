import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface PulseButtonProps {
  children: ReactNode
  /** Fired on press, after the press animation starts. */
  onPress?: () => void
  className?: string
  ariaLabel?: string
  disabled?: boolean
}

/**
 * Shared animated big-button. Generic by design — Phase 3 reuses this as the
 * SOS trigger. Press = spring scale-down + expanding glow ring.
 */
export function PulseButton({
  children,
  onPress,
  className = '',
  ariaLabel,
  disabled = false,
}: PulseButtonProps) {
  const [rings, setRings] = useState<number[]>([])

  const press = () => {
    if (disabled) return
    const id = Date.now() + Math.random()
    setRings((r) => [...r, id])
    window.setTimeout(() => setRings((r) => r.filter((x) => x !== id)), 700)
    onPress?.()
  }

  return (
    <motion.button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={press}
      whileHover={disabled ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : { scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={`relative overflow-hidden rounded-2xl bg-accent px-10 py-5 text-lg font-bold tracking-wide text-base-950 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      style={{
        boxShadow:
          '0 0 34px -6px var(--accent), 0 10px 28px -10px var(--accent-dim)',
      }}
    >
      <AnimatePresence>
        {rings.map((id) => (
          <motion.span
            key={id}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-white/70"
            initial={{ scale: 0.92, opacity: 0.85 }}
            animate={{ scale: 1.65, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        ))}
      </AnimatePresence>
      <span className="relative z-10 flex items-center justify-center gap-3">
        {children}
      </span>
    </motion.button>
  )
}
