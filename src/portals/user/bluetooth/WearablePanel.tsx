import { BatteryMedium, Bluetooth, BluetoothOff, HeartPulse, Loader2 } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { useWearableStore } from './wearableStore'

function StatusPill({ status, isSimulated }: { status: string; isSimulated: boolean }) {
  if (status === 'connected' && isSimulated) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-amber-400/60 bg-amber-400/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        Simulated
      </span>
    )
  }
  const map: Record<string, { label: string; dot: string; text: string }> = {
    connected: { label: 'Connected', dot: 'bg-emerald-400', text: 'text-emerald-300' },
    connecting: { label: 'Connecting', dot: 'bg-amber-300 animate-pulse', text: 'text-amber-200' },
    disconnected: { label: 'Disconnected', dot: 'bg-ink-600', text: 'text-ink-400' },
    unsupported: { label: 'Unavailable', dot: 'bg-ink-600', text: 'text-ink-400' },
  }
  const s = map[status] ?? map.disconnected
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

/**
 * Wearable Bluetooth panel — real Web Bluetooth pairing with standard GATT
 * services, plus a clearly-labeled simulation mode for demos.
 */
export function WearablePanel() {
  const {
    status,
    deviceName,
    battery,
    heartRate,
    isSimulated,
    error,
    connect,
    disconnect,
    reconnect,
    startSimulation,
    stopSimulation,
    dismissError,
  } = useWearableStore()

  const connected = status === 'connected'
  const connecting = status === 'connecting'

  return (
    <GlassCard
      title="Wearable link"
      subtitle="Bluetooth LE · Battery 0x180F · Heart rate 0x180D"
      className="p-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {connected ? (
            <Bluetooth className="h-5 w-5 text-accent" strokeWidth={2} />
          ) : (
            <BluetoothOff className="h-5 w-5 text-ink-500" strokeWidth={2} />
          )}
          <span className="text-sm font-semibold text-ink-100">
            {deviceName ?? 'No device paired'}
          </span>
        </div>
        <StatusPill status={status} isSimulated={isSimulated} />
      </div>

      {status === 'unsupported' ? (
        <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-4">
          <p className="text-sm font-medium text-amber-200">Bluetooth isn't available here</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Web Bluetooth needs Chrome or Edge over HTTPS or localhost. Use the
            simulation mode below to explore the dashboard in this browser.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-ink-500">
              <HeartPulse className="h-4 w-4" strokeWidth={2} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Heart rate</span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-ink-100">
              {heartRate ?? '—'}
              <span className="ml-1 text-xs font-medium text-ink-500">bpm</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-2 text-ink-500">
              <BatteryMedium className="h-4 w-4" strokeWidth={2} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Battery</span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-ink-100">
              {battery ?? '—'}
              <span className="ml-1 text-xs font-medium text-ink-500">%</span>
            </p>
            {battery !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${battery}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {isSimulated && (
        <p className="mt-4 rounded-lg border border-dashed border-amber-400/40 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          Simulation mode — these vitals are generated for demo purposes, not
          from real hardware.
        </p>
      )}

      {error && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-red-400/25 bg-red-400/[0.07] p-3">
          <p className="text-xs leading-relaxed text-red-200">{error}</p>
          <button
            type="button"
            onClick={dismissError}
            className="shrink-0 text-xs font-medium text-ink-400 hover:text-ink-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2.5">
        {!connected && !connecting && (
          <button
            type="button"
            onClick={() => void connect()}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-base-950 transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ boxShadow: '0 0 24px -6px var(--accent)' }}
          >
            Pair wearable
          </button>
        )}
        {connecting && (
          <button
            type="button"
            disabled
            aria-live="polite"
            className="inline-flex cursor-wait items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-ink-300"
          >
            <Loader2 className="h-4 w-4 animate-spin text-accent" strokeWidth={2.5} />
            Connecting…
          </button>
        )}
        {connected && !isSimulated && (
          <>
            <button
              type="button"
              onClick={() => void reconnect()}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-ink-100 transition-colors hover:border-accent/50"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-ink-400 transition-colors hover:text-ink-100"
            >
              Disconnect
            </button>
          </>
        )}
        {!isSimulated && !connecting && (
          <button
            type="button"
            onClick={startSimulation}
            className="rounded-xl border border-dashed border-amber-400/40 px-5 py-2.5 text-sm font-medium text-amber-200/90 transition-colors hover:bg-amber-400/10"
          >
            Simulate wearable
          </button>
        )}
        {isSimulated && (
          <button
            type="button"
            onClick={stopSimulation}
            className="rounded-xl border border-dashed border-amber-400/40 px-5 py-2.5 text-sm font-medium text-amber-200/90 transition-colors hover:bg-amber-400/10"
          >
            Stop simulation
          </button>
        )}
      </div>
    </GlassCard>
  )
}
