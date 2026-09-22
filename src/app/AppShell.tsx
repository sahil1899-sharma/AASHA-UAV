import { Outlet } from 'react-router-dom'

/**
 * Top-level shell for the AASHA-UAV platform.
 * Phase 0: renders the matched route only. Portal chrome (nav, headers)
 * and the swappable auth module arrive in later phases.
 */
export function AppShell() {
  return (
    <div className="min-h-full text-ink-100">
      <Outlet />
    </div>
  )
}
