import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  HeartPulse,
  Plane,
  Radar,
  Radio,
  Shield,
  Siren,
} from 'lucide-react'
import { CommandCanvas } from '../../shared/animations/CommandCanvas'
import { TopNav } from '../../shared/components/TopNav'
import { GlassCard } from '../../shared/components/GlassCard'
import { PageTransition } from '../../shared/components/PageTransition'

const tickerItems = [
  'SOS received — Sector 7',
  'UAV-04 dispatched',
  'Wearable link verified',
  'UAV-07 on station',
  'Responders en route — ETA 04:12',
  'Signal mesh nominal',
  'Dispatch grid 32.72°N 74.85°E',
]

const stats = [
  { label: 'System nominal', live: true },
  { label: '12 UAVs airborne', live: false },
  { label: 'Avg dispatch 04:12', live: false },
]

const chain = [
  {
    n: '01',
    Icon: Radio,
    title: 'Wearable',
    text: 'Manual SOS and automatic distress detection on the wrist — the signal leaves the moment help is needed.',
  },
  {
    n: '02',
    Icon: Radar,
    title: 'Dispatch',
    text: 'The alert is geolocated in seconds; the nearest responders and the closest UAV are tasked in one motion.',
  },
  {
    n: '03',
    Icon: Plane,
    title: 'Deterrence UAV',
    text: 'An autonomous UAV holds overwatch — streaming live video and holding a visible presence until responders arrive.',
  },
]

const portals = [
  {
    to: '/login/user',
    role: 'user' as const,
    title: 'User Dashboard',
    description: 'Wearable device status, SOS trigger, safety controls.',
    accent: 'portal-user',
    Icon: Siren,
    cta: 'Login as User',
  },
  {
    to: '/login/police',
    role: 'police' as const,
    title: 'Police / Security',
    description: 'Live incident feed, dispatch coordination, UAV video.',
    accent: 'portal-police',
    Icon: Shield,
    cta: 'Login as Police / Security Official',
  },
  {
    to: '/login/hospital',
    role: 'hospital' as const,
    title: 'Hospital Authority',
    description: 'Medical response queue, casualty intake, readiness.',
    accent: 'portal-hospital',
    Icon: HeartPulse,
    cta: 'Login as Hospital Authority',
  },
]

const fadeUp = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
}

/**
 * Phase 13 hardening: warm the portal chunk on hover/focus so the click
 * feels instant. Same module specifiers as router.tsx, so Vite reuses the
 * already-split chunks instead of fetching duplicates.
 */
function prefetchPortal(role: 'user' | 'police' | 'hospital') {
  if (role === 'user') void import('../../portals/user/UserPortal')
  else if (role === 'police') void import('../../portals/police/PolicePortal')
  else void import('../../portals/hospital/HospitalPortal')
}

export function LandingPage() {
  return (
    <PageTransition>
    <div className="portal-user relative min-h-screen overflow-x-clip">
      <CommandCanvas />
      <TopNav portal="user" />

      {/* ============ HERO ============ */}
      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-7xl flex-col justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-ink-300">
            Personal emergency-response platform
          </p>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 48 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-[clamp(3.4rem,10vw,8.5rem)] font-bold leading-[0.95] tracking-tight text-ink-100"
        >
          Help is
          <br />
          <span className="text-accent drop-shadow-[0_0_36px_var(--accent-dim)]">
            already airborne.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg"
        >
          AASHA-UAV links a wearable SOS device, a central dispatch server,
          and an autonomous deterrence UAV — one chain from distress signal
          to responders on scene.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap gap-3"
        >
          {stats.map(({ label, live }) => (
            <span
              key={label}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium uppercase tracking-widest text-ink-300 backdrop-blur-md"
            >
              {live && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              )}
              {label}
            </span>
          ))}
        </motion.div>

        <motion.a
          href="#chain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-ink-500 transition-colors hover:text-accent-strong"
          aria-label="Scroll to explore"
        >
          <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
          <ChevronDown className="h-5 w-5 animate-bounce" />
        </motion.a>
      </section>

      {/* ============ OPS TICKER ============ */}
      <section
        aria-hidden="true"
        className="relative z-10 overflow-hidden border-y border-white/10 bg-base-950/60 py-3 backdrop-blur-md"
      >
        <div className="animate-aasha-marquee flex w-max items-center gap-8 whitespace-nowrap pr-8">
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-8 text-xs font-medium uppercase tracking-[0.25em] text-ink-500"
            >
              {item}
              <span className="text-accent">◆</span>
            </span>
          ))}
        </div>
      </section>

      {/* ============ RESPONSE CHAIN ============ */}
      <section id="chain" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-28">
        <motion.div {...fadeUp}>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            The response chain
          </p>
          <h2 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-ink-100 sm:text-5xl">
            One signal. Three tiers.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-500">
            Every emergency runs the same chain — from the wrist, through
            dispatch, to a UAV holding the scene. No apps to open, no calls
            to place.
          </p>
        </motion.div>

        <div className="relative mt-12 grid gap-5 md:grid-cols-3">
          {/* Connector line (desktop) */}
          <div
            aria-hidden="true"
            className="absolute left-[16%] right-[16%] top-16 hidden h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent md:block"
          />
          {chain.map(({ n, Icon, title, text }, i) => (
            <motion.div
              key={title}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.12 }}
            >
              <GlassCard className="group relative h-full p-7 transition-transform duration-300 hover:-translate-y-1.5">
                <div className="flex items-start justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-accent/25 bg-accent-dim text-accent transition-shadow duration-300 group-hover:shadow-[0_0_28px_-4px_var(--accent)]">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <span className="text-ghost-outline text-5xl font-bold leading-none">
                    {n}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-ink-100">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {text}
                </p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============ PORTALS ============ */}
      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-28">
        <motion.div {...fadeUp}>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">
            Mission control
          </p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight text-ink-100 sm:text-5xl">
            Enter your portal.
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {portals.map(({ to, role, title, description, accent, Icon, cta }, i) => (
            <motion.div
              key={to}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: i * 0.12 }}
              whileHover={{ y: -8 }}
              onMouseEnter={() => prefetchPortal(role)}
              onFocus={() => prefetchPortal(role)}
            >
              <Link to={to} className={`${accent} group block h-full`}>
                <GlassCard className="relative h-full overflow-hidden p-7">
                  {/* Corner brackets */}
                  <span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-accent/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-accent/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <Icon
                    className="h-9 w-9 text-accent transition-transform duration-300 group-hover:scale-110"
                    strokeWidth={1.5}
                  />
                  <h3 className="mt-5 text-xl font-semibold text-ink-100">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">
                    {description}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent-strong">
                    {cta}
                    <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1.5">→</span>
                  </span>
                </GlassCard>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="relative z-10 border-t border-white/10 bg-base-950/60 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 sm:flex-row">
          <p className="text-xs uppercase tracking-[0.25em] text-ink-500">
            AASHA-UAV · Patent-filed emergency-response system
          </p>
          <p className="text-xs uppercase tracking-[0.25em] text-ink-500">
            Wearable · Dispatch · Deterrence UAV
          </p>
        </div>
      </footer>
    </div>
    </PageTransition>
  )
}
