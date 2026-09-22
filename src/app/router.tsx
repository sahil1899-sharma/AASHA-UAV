import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AppShell } from './AppShell'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { MockAuthGate } from '../shared/components/MockAuthGate'
import { isRole } from '../shared/state/authStore'

// Phase 13: code-split each portal so loading one doesn't pull in the other two.
const UserPortal = lazy(() =>
  import('../portals/user/UserPortal').then((m) => ({ default: m.UserPortal })),
)
const PolicePortal = lazy(() =>
  import('../portals/police/PolicePortal').then((m) => ({ default: m.PolicePortal })),
)
const HospitalPortal = lazy(() =>
  import('../portals/hospital/HospitalPortal').then((m) => ({ default: m.HospitalPortal })),
)

function PortalFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-label="Loading portal">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-500 animate-pulse">
        Establishing secure link…
      </p>
    </div>
  )
}

/**
 * /login/:role — one parameterized gate for all three roles.
 * Unknown roles bounce back to the landing page.
 */
function LoginRoute() {
  const { role } = useParams()
  if (!isRole(role)) return <Navigate to="/" replace />
  return <MockAuthGate role={role} />
}

/**
 * Routes keyed by pathname inside AnimatePresence: the outgoing page's
 * PageTransition exit plays (via presence context) before the incoming
 * page animates in. The fixed canvas behind never remounts.
 */
function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="login/:role" element={<LoginRoute />} />
          <Route
            path="user"
            element={
              <Suspense fallback={<PortalFallback />}>
                <UserPortal />
              </Suspense>
            }
          />
          <Route
            path="police"
            element={
              <Suspense fallback={<PortalFallback />}>
                <PolicePortal />
              </Suspense>
            }
          />
          <Route
            path="hospital"
            element={
              <Suspense fallback={<PortalFallback />}>
                <HospitalPortal />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AnimatePresence>
  )
}

/**
 * App router. Auth (swappable module) will guard the portals later.
 */
export function AppRouter() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}
