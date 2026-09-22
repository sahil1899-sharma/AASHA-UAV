import { useEffect, useRef, useState } from 'react'
import { Mic, Phone, PhoneOff, Video, Volume2 } from 'lucide-react'
import { useContactsStore } from '../contacts/contactsStore'

/**
 * Discreet "fake call" — a full-screen incoming-call screen that looks like
 * a real phone call, for defusing a threatening situation without revealing
 * the app. Uses the primary emergency contact's name (falls back to "Mom").
 * A soft synthesized ringtone plays while "ringing".
 */

function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return
    let ctx: AudioContext | null = null
    let stopped = false
    try {
      const AC = window.AudioContext
      if (!AC) return
      ctx = new AC()
      const playTone = (freq: number, at: number, dur: number) => {
        if (!ctx || stopped) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.08, at + 0.05)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(at)
        osc.stop(at + dur + 0.05)
      }
      const ring = () => {
        if (!ctx || stopped) return
        const t = ctx.currentTime
        // classic dual-tone ring: two bursts
        playTone(440, t, 0.35)
        playTone(480, t, 0.35)
        playTone(440, t + 0.45, 0.35)
        playTone(480, t + 0.45, 0.35)
      }
      ring()
      const id = window.setInterval(ring, 2200)
      return () => {
        stopped = true
        window.clearInterval(id)
        void ctx?.close()
      }
    } catch {
      return
    }
  }, [active])
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function FakeCallOverlay({ onClose }: { onClose: () => void }) {
  const primary = useContactsStore((s) => s.contacts.find((c) => c.isPrimary))
  const name = primary?.name.trim() || 'Mom'
  const [phase, setPhase] = useState<'incoming' | 'active'>('incoming')
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<number | null>(null)

  useRingtone(phase === 'incoming')

  useEffect(() => {
    if (phase === 'active') {
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    }
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
    }
  }, [phase])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const initial = name.charAt(0).toUpperCase()

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center bg-black px-6 py-14">
      {/* subtle backdrop glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 18%, rgba(80,120,200,0.18), transparent)',
        }}
      />
      <p className="relative mt-6 font-mono text-[11px] uppercase tracking-[0.3em] text-white/50">
        {phase === 'incoming' ? 'Incoming call' : formatElapsed(elapsed)}
      </p>
      <h2 className="relative mt-3 text-4xl font-semibold text-white">{name}</h2>
      <p className="relative mt-1.5 text-sm text-white/50">
        {phase === 'incoming' ? 'mobile' : 'connected'}
      </p>

      <div className="relative mt-10 flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-bold text-white">
        {phase === 'incoming' && (
          <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
        )}
        {initial}
      </div>

      <div className="relative mt-auto w-full max-w-xs">
        {phase === 'incoming' ? (
          <div className="flex items-center justify-between px-6">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label="Decline fake call"
                onClick={onClose}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-transform active:scale-95"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
              <span className="text-xs text-white/60">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label="Accept fake call"
                onClick={() => setPhase('active')}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-transform active:scale-95"
              >
                <Phone className="h-7 w-7" />
              </button>
              <span className="text-xs text-white/60">Accept</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-10 grid grid-cols-3 gap-6 px-4">
              {[
                { icon: Mic, label: 'Mute' },
                { icon: Volume2, label: 'Speaker' },
                { icon: Video, label: 'Video' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    aria-label={label}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white transition-colors active:bg-white/20"
                  >
                    <Icon className="h-6 w-6" />
                  </button>
                  <span className="text-[11px] text-white/60">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                aria-label="End fake call"
                onClick={onClose}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-transform active:scale-95"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
