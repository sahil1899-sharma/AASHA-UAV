import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, HeartPulse, Loader2, Shield, Siren } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CommandCanvas } from '../animations/CommandCanvas'
import { PageTransition } from './PageTransition'
import { TopNav } from './TopNav'
import type { PortalId } from './TopNav'
import { useAuthStore } from '../state/authStore'
import type { Role } from '../state/authStore'

interface RoleConfig {
  accentClass: string
  navPortal: PortalId
  Icon: LucideIcon
  /** Mono eyebrow above the display title. */
  eyebrow: string
  /** Display title, first line (solid). */
  titleA: string
  /** Display title, second line (outlined). */
  titleB: string
  blurb: string
  clearance: string
  /** What this terminal grants access to. */
  access: string[]
  credentialLabel?: string
  credentialPlaceholder?: string
}

/**
 * Per-role terminal copy. One config table — not three pages.
 */
const ROLE_CONFIG: Record<Role, RoleConfig> = {
  user: {
    accentClass: 'portal-user',
    navPortal: 'user',
    Icon: Siren,
    eyebrow: 'Access terminal // 01 — Civilian',
    titleA: 'Your safety,',
    titleB: 'in your hands.',
    blurb:
      'One identity links your wearable, the dispatch server, and the UAV network. Sign in to see your device, your SOS trigger, and your safety controls.',
    clearance: 'Clearance · Civilian',
    access: ['Live wearable status', 'One-tap SOS trigger', 'Safety controls & alerts'],
  },
  police: {
    accentClass: 'portal-police',
    navPortal: 'police',
    Icon: Shield,
    eyebrow: 'Access terminal // 02 — Law enforcement',
    titleA: 'Hold the scene',
    titleB: 'until you arrive.',
    blurb:
      'Every distress signal in your jurisdiction lands here first — geolocated, tasked, and held by a UAV until your responders are on scene.',
    clearance: 'Clearance · Law enforcement',
    access: ['Live incident feed', 'Dispatch coordination', 'UAV video & photo evidence'],
    credentialLabel: 'Badge number',
    credentialPlaceholder: 'e.g. DL-45213',
  },
  hospital: {
    accentClass: 'portal-hospital',
    navPortal: 'hospital',
    Icon: HeartPulse,
    eyebrow: 'Access terminal // 03 — Medical',
    titleA: 'Ready before',
    titleB: 'they arrive.',
    blurb:
      'Casualties are triaged while still en route. Sign in to run the medical response queue, the intake board, and readiness monitoring.',
    clearance: 'Clearance · Medical corps',
    access: ['Medical response queue', 'Casualty intake board', 'Readiness monitoring'],
    credentialLabel: 'Hospital / department',
    credentialPlaceholder: 'e.g. City General — Trauma',
  },
}

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.25 } },
}

const rise = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  },
}

interface MockAuthGateProps {
  /** Which role this gate signs in as. Real auth swaps in here later. */
  role: Role
}

/**
 * Single parameterized no-auth sign-in gate, designed as an access terminal:
 * a display-typography briefing on the left, a HUD-framed identity console
 * on the right. Continue → identity lands in the shared auth store →
 * portal dashboard. No password, no validation — the real auth module
 * replaces this component without touching routing.
 */
export function MockAuthGate({ role }: MockAuthGateProps) {
  const cfg = ROLE_CONFIG[role]
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [credential, setCredential] = useState('')
  const [linking, setLinking] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (linking) return
    setLinking(true)
    // Brief link beat so the transition into the dashboard reads as a
    // handoff, then the identity is stored and routing continues.
    window.setTimeout(() => {
      login({ role, name: name.trim(), credential: credential.trim() })
      navigate(`/${role}`)
    }, 950)
  }

  const { Icon } = cfg

  const fieldClass =
    'w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-ink-100 placeholder:text-ink-600 outline-none backdrop-blur-md transition-colors focus:border-accent/60 focus:bg-white/[0.08] disabled:opacity-50'

  return (
    <PageTransition>
      <div className={`${cfg.accentClass} relative min-h-screen overflow-x-clip`}>
        <CommandCanvas />
        <TopNav portal={cfg.navPortal} />

        <main className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-6 py-14 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-10">
          {/* ============ BRIEFING ============ */}
          <motion.div
            variants={list}
            initial="hidden"
            animate="show"
            className="lg:col-span-7"
          >
            <motion.p
              variants={rise}
              className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent"
            >
              <span className="mr-3 inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
              {cfg.eyebrow}
            </motion.p>

            <motion.h1
              variants={rise}
              className="mt-6 text-[clamp(2.9rem,6.5vw,5.75rem)] font-bold leading-[0.95] tracking-tight text-ink-100"
            >
              {cfg.titleA}
              <br />
              <span className="text-transparent [-webkit-text-stroke:1.5px_var(--accent)]">
                {cfg.titleB}
              </span>
            </motion.h1>

            <motion.p
              variants={rise}
              className="mt-6 max-w-xl text-base leading-relaxed text-ink-500"
            >
              {cfg.blurb}
            </motion.p>

            <motion.div variants={rise} className="mt-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-600">
                This terminal grants
              </p>
              <ul className="mt-4 space-y-3">
                {cfg.access.map((item, i) => (
                  <li key={item} className="flex items-center gap-4">
                    <span className="font-mono text-xs tabular-nums text-accent">
                      0{i + 1}
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
                      <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                    </span>
                    <span className="text-sm font-medium text-ink-300">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div variants={rise} className="mt-8">
              <span className="inline-flex items-center gap-2.5 rounded-full border border-accent/30 bg-accent/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {cfg.clearance}
              </span>
            </motion.div>
          </motion.div>

          {/* ============ IDENTITY CONSOLE ============ */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-5"
          >
            <div className="relative rounded-2xl border border-white/10 bg-white/[0.045] p-7 backdrop-blur-xl sm:p-8"
              style={{
                borderColor: 'color-mix(in srgb, var(--accent) 32%, transparent)',
                boxShadow:
                  '0 0 44px -12px var(--accent-dim), inset 0 1px 0 rgb(255 255 255 / 0.07)',
              }}
            >
              {/* HUD corner brackets */}
              <span aria-hidden="true" className="pointer-events-none absolute -left-px -top-px h-6 w-6 border-l-2 border-t-2 border-accent" />
              <span aria-hidden="true" className="pointer-events-none absolute -right-px -top-px h-6 w-6 border-r-2 border-t-2 border-accent" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -left-px h-6 w-6 border-b-2 border-l-2 border-accent" />
              <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -right-px h-6 w-6 border-b-2 border-r-2 border-accent" />

              {/* Console header */}
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-400">
                  Identity check
                </p>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-accent">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  Ready
                </span>
              </div>

              <form onSubmit={submit} className="mt-6 space-y-5">
                <div>
                  <label
                    htmlFor="gate-name"
                    className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
                  >
                    Full name
                  </label>
                  <input
                    id="gate-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    autoComplete="name"
                    disabled={linking}
                    className={fieldClass}
                  />
                </div>

                {cfg.credentialLabel && (
                  <div>
                    <label
                      htmlFor="gate-credential"
                      className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-ink-400"
                    >
                      {cfg.credentialLabel}
                    </label>
                    <input
                      id="gate-credential"
                      type="text"
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder={cfg.credentialPlaceholder}
                      disabled={linking}
                      className={fieldClass}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={linking}
                  className="group flex w-full items-center justify-center gap-3 rounded-xl bg-accent px-6 py-4 text-sm font-bold uppercase tracking-[0.22em] text-base-950 transition-all duration-200 hover:scale-[1.015] active:scale-[0.985] disabled:cursor-wait disabled:hover:scale-100"
                  style={{
                    boxShadow:
                      '0 0 34px -6px var(--accent), 0 10px 28px -10px var(--accent-dim)',
                  }}
                >
                  {linking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
                      Establishing link
                    </>
                  ) : (
                    <>
                      Continue
                      <span
                        aria-hidden="true"
                        className="transition-transform duration-300 group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-ink-600">
                  Secure channel · AASHA-UAV dispatch
                </p>
                <span className="h-px flex-1 bg-white/10" />
              </div>
            </div>

            <div className="mt-5 text-center">
              <Link
                to="/"
                className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-100"
              >
                ← Back home
              </Link>
            </div>
          </motion.div>
        </main>
      </div>
    </PageTransition>
  )
}
