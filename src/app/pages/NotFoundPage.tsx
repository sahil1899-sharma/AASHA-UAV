import { Link } from 'react-router-dom'
import { PageTransition } from '../../shared/components/PageTransition'

export function NotFoundPage() {
  return (
    <PageTransition>
      <main className="flex min-h-screen flex-col items-center justify-center bg-base-950 px-6 text-center">
        <h1 className="text-5xl font-bold text-ink-100">404</h1>
        <p className="mt-2 text-sm text-ink-500">
          This page doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-base-950 hover:opacity-90"
        >
          Back to /
        </Link>
      </main>
    </PageTransition>
  )
}
