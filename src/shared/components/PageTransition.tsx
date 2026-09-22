import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Shared page transition for landing → sign-in → dashboard.
 * Subtle fade + short rise, tuned to sit under the reactive canvas
 * (the canvas itself is fixed and never remounts mid-transition).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}
