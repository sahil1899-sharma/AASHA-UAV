import { Activity, FlaskConical, HeartPulse, Info, Trash2, Vibrate } from 'lucide-react'
import { useState } from 'react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { REASON_LABEL, useAnomalyStore } from './anomalyStore'
import type { AnomalyReason } from './anomalyStore'
import { useWearableStore } from '../bluetooth/wearableStore'

const OUTCOME_META = {
  cancelled: { label: 'Cancelled', cls: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
  escalated: { label: 'Escalated to SOS', cls: 'border-red-400/40 bg-red-400/10 text-red-200' },
  'false-positive': { label: 'False positive', cls: 'border-white/15 bg-white/[0.06] text-ink-400' },
} as const

function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Passive monitoring controls: arm/disarm the anomaly heuristics, tune the
 * heart-rate spike threshold, run a sensor self-test, and review the local
 * detection log — including marking past pre-alerts as false positives.
 */
export function AnomalyPanel() {
  const monitoring = useAnomalyStore((s) => s.monitoring)
  const setMonitoring = useAnomalyStore((s) => s.setMonitoring)
  const config = useAnomalyStore((s) => s.config)
  const setConfig = useAnomalyStore((s) => s.setConfig)
  const motionAvailable = useAnomalyStore((s) => s.motionAvailable)
  const motionPermission = useAnomalyStore((s) => s.motionPermission)
  const baselineBpm = useAnomalyStore((s) => s.baselineBpm)
  const samplesInWindow = useAnomalyStore((s) => s.samplesInWindow)
  const history = useAnomalyStore((s) => s.history)
  const markFalsePositive = useAnomalyStore((s) => s.markFalsePositive)
  const clearHistory = useAnomalyStore((s) => s.clearHistory)
  const selfTest = useAnomalyStore((s) => s.selfTest)
  const wearableConnected = useWearableStore((s) => s.status === 'connected')
  const isSimulated = useWearableStore((s) => s.isSimulated)
  const [showHow, setShowHow] = useState(false)
  const [testing, setTesting] = useState<AnomalyReason | null>(null)

  const falsePositives = history.filter((h) => h.outcome === 'false-positive').length

  const runTest = (reason: AnomalyReason) => {
    setTesting(reason)
    selfTest(reason)
    window.setTimeout(() => setTesting(null), 2500)
  }

  return (
    <GlassCard
      title="Passive monitoring"
      subtitle="Automatic distress detection from your wearable"
      className="flex h-full flex-col p-6"
      glow={monitoring}
    >
      {/* Arm switch */}
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink-100">Anomaly detection</p>
          <p className="mt-0.5 text-xs text-ink-500">
            {monitoring ? 'Watching heart rate & motion' : 'Off — only manual SOS is active'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={monitoring}
          aria-label="Toggle passive anomaly detection"
          onClick={() => setMonitoring(!monitoring)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
            monitoring ? 'bg-emerald-500' : 'bg-white/15'
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
              monitoring ? 'left-6' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Live status */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
          <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
            <HeartPulse className="h-3 w-3 text-red-300" /> Heart rate
          </p>
          <p className="text-sm font-bold text-ink-100">
            {monitoring && baselineBpm !== null ? (
              <>{baselineBpm} <span className="text-[10px] font-medium text-ink-500">bpm baseline</span></>
            ) : (
              <span className="text-xs font-medium text-ink-500">
                {!wearableConnected ? 'Wearable not linked' : monitoring ? `Learning… (${samplesInWindow} samples)` : 'Monitoring off'}
              </span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-base-950/60 p-3">
          <p className="mb-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-500">
            <Vibrate className="h-3 w-3 text-sky-300" /> Motion
          </p>
          <p className="text-xs font-medium text-ink-300">
            {motionAvailable === null
              ? 'Not probed yet'
              : motionAvailable
                ? 'Phone sensor active'
                : motionPermission === 'denied'
                  ? 'Permission denied'
                  : 'Unavailable on this device'}
          </p>
          <p className="mt-0.5 font-mono text-[9px] text-ink-600">phone proxy for wearable sensor</p>
        </div>
      </div>

      {/* Config */}
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
        <div className="flex items-center justify-between">
          <label htmlFor="hr-threshold" className="text-xs font-semibold text-ink-200">
            Spike threshold
          </label>
          <span className="font-mono text-xs text-ink-100">+{config.hrSpikeBpm} bpm</span>
        </div>
        <input
          id="hr-threshold"
          type="range"
          min={20}
          max={80}
          step={5}
          value={config.hrSpikeBpm}
          onChange={(e) => setConfig({ hrSpikeBpm: Number(e.target.value) })}
          className="mt-2 w-full accent-red-400"
          aria-describedby="hr-threshold-help"
        />
        <p id="hr-threshold-help" className="mt-1 text-[11px] text-ink-500">
          Fires when heart rate jumps this far above your recent baseline.
        </p>
      </div>

      {/* Self-test */}
      <div className="mt-3 flex gap-2">
        {(['hr-spike', 'fall'] as const).map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => runTest(reason)}
            disabled={testing !== null}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-semibold text-ink-300 transition-colors hover:border-white/25 hover:text-ink-100 disabled:opacity-50"
          >
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={2} />
            {testing === reason ? 'Testing…' : `Test ${reason === 'hr-spike' ? 'HR spike' : 'fall'}`}
          </button>
        ))}
      </div>

      {/* How it works */}
      <button
        type="button"
        onClick={() => setShowHow(!showHow)}
        aria-expanded={showHow}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-ink-200"
      >
        <Info className="h-3.5 w-3.5" />
        {showHow ? 'Hide detection logic' : 'How detection works'}
      </button>
      {showHow && (
        <div className="mt-2 rounded-xl border border-white/10 bg-base-950/60 p-3.5 text-[11px] leading-relaxed text-ink-400">
          <p className="mb-2 flex items-start gap-1.5">
            <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            Simple documented heuristics — <strong className="text-ink-200">not</strong> a machine-learning model.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink-200">Heart-rate spike:</strong> baseline = mean of the last
              5 minutes of readings (excluding the last 30 s); fires at baseline + threshold. Needs
              10+ samples before it arms.
            </li>
            <li>
              <strong className="text-ink-200">Fall:</strong> a sharp acceleration spike (&gt; 2.4 g)
              followed by {config.stillnessSecs} s of stillness. Motion is read from <em>this
              phone's</em> sensor as a proxy for the wearable's own.
            </li>
            <li>
              A fired heuristic starts a {config.preAlertSecs}-second cancellable pre-alert — it never
              sends an SOS on its own.
            </li>
          </ul>
        </div>
      )}

      {/* Detection history / false positives */}
      <div className="mt-4 flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-400">
          Detection log
          {history.length > 0 && (
            <span className="ml-2 text-ink-500">
              {history.length} events · {falsePositives} false positive{falsePositives === 1 ? '' : 's'}
            </span>
          )}
        </p>
        {history.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-200"
            aria-label="Clear detection log"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div className="mt-2 max-h-44 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-ink-600">
            No detections yet. Arm monitoring and detections will be logged here.
          </p>
        ) : (
          history.map((h) => {
            const meta = OUTCOME_META[h.outcome]
            return (
              <div key={h.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink-200">
                    {REASON_LABEL[h.reason]}
                    {h.simulated && <span className="ml-1.5 font-mono text-[9px] text-amber-300">(sim)</span>}
                  </p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-500">{h.detail}</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="font-mono text-[10px] text-ink-600">{timeAgo(h.at)}</p>
                  {h.outcome !== 'false-positive' && (
                    <button
                      type="button"
                      onClick={() => markFalsePositive(h.id)}
                      className="text-[11px] font-medium text-ink-400 underline decoration-dotted underline-offset-2 hover:text-ink-100"
                    >
                      Mark as false positive
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
      {isSimulated && monitoring && (
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-300/80">
          Simulated wearable — detections are drills
        </p>
      )}
    </GlassCard>
  )
}
