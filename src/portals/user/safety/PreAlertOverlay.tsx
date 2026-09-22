import { useEffect } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import { REASON_LABEL, useAnomalyStore } from './anomalyStore'

/**
 * Pre-alert: a fired heuristic starts a visible, cancellable countdown
 * instead of an immediate SOS. "I'm OK" cancels; letting it lapse (or
 * "Send SOS now") escalates through the normal SOS flow, flagged as
 * auto-detected.
 */
export function PreAlertOverlay() {
  const preAlert = useAnomalyStore((s) => s.preAlert)
  const preAlertSecs = useAnomalyStore((s) => s.config.preAlertSecs)
  const cancelPreAlert = useAnomalyStore((s) => s.cancelPreAlert)
  const escalateNow = useAnomalyStore((s) => s.escalateNow)

  useEffect(() => {
    if (!preAlert) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelPreAlert()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preAlert, cancelPreAlert])

  if (!preAlert) return null

  const frac = Math.max(0, Math.min(1, preAlert.remaining / preAlertSecs))
  const R = 84
  const CIRC = 2 * Math.PI * R

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-label="Possible emergency detected"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-400/40 bg-base-950 shadow-[0_0_80px_rgba(251,191,36,0.25)]">
        <div className="border-b border-amber-400/20 bg-amber-400/10 px-6 py-4">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em] text-amber-200">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.5} />
            Possible emergency detected
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            {REASON_LABEL[preAlert.reason]} · {preAlert.detail}
          </p>
        </div>

        <div className="flex flex-col items-center px-6 py-6">
          <div className="relative h-44 w-44">
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
              <circle
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={CIRC * (1 - frac)}
                style={{ filter: 'drop-shadow(0 0 10px rgba(251,191,36,0.8))', transition: 'stroke-dashoffset 0.25s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-5xl font-bold text-ink-50" aria-live="assertive">
                {preAlert.remaining}
              </span>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-400">
                seconds
              </span>
            </div>
          </div>

          <p className="mt-5 text-center text-sm text-ink-300">
            If you're OK, cancel now — otherwise an emergency alert with your
            location and vitals will be sent automatically.
          </p>

          <button
            type="button"
            onClick={cancelPreAlert}
            autoFocus
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 text-base font-bold text-white transition-all hover:brightness-110"
          >
            <Check className="h-5 w-5" strokeWidth={3} />
            I'm OK — cancel alert
          </button>
          <button
            type="button"
            onClick={escalateNow}
            className="mt-2.5 w-full rounded-2xl border border-red-400/50 bg-red-400/10 px-6 py-3 text-sm font-bold text-red-200 transition-colors hover:bg-red-400/20"
          >
            Send SOS now
          </button>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-600">
            Automatic detection · not a manual SOS
          </p>
        </div>
      </div>
    </div>
  )
}
