import { useEffect, useRef, useState } from 'react'

/**
 * Phase 13 — batch realtime-driven re-renders.
 *
 * The Phase 6 BroadcastChannel sync + the 2s telemetry ticker can push
 * store updates in bursts. Leaflet re-paints are expensive, so map layers
 * read through this hook: it holds the latest store value but only
 * publishes it to React state on a 250ms interval, coalescing bursts
 * into a single re-render instead of one per event.
 */
export function useBatchedValue<T>(value: T, intervalMs = 250): T {
  const [batched, setBatched] = useState(value)
  const latestRef = useRef(value)
  latestRef.current = value

  useEffect(() => {
    const id = window.setInterval(() => {
      setBatched((prev) => (prev === latestRef.current ? prev : latestRef.current))
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return batched
}

/**
 * Debounce a fast-changing value (e.g. search input): the returned value
 * only updates after `delayMs` with no new input. Filtering a large list
 * on every keystroke is wasted work — this lets the user finish typing.
 */
export function useDebouncedValue<T>(value: T, delayMs = 150): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])

  return debounced
}
