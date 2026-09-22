import { useEffect, useState } from 'react'

export interface GeoCoords {
  lat: number
  lng: number
  accuracy: number | null
}

export interface GeoState {
  coords: GeoCoords | null
  error: string | null
  loading: boolean
}

/**
 * Shared geolocation hook. Resolves once on mount; optionally keeps a live
 * watch. Never throws — failures surface as `error` with coords staying
 * null so callers can fall back gracefully.
 */
export function useGeolocation(watch = false): GeoState {
  const [coords, setCoords] = useState<GeoCoords | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not available in this browser.')
      setLoading(false)
      return
    }
    const apply = (pos: GeolocationPosition) => {
      setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      })
      setLoading(false)
    }
    const fail = (err: GeolocationPositionError) => {
      setError(
        err.code === err.PERMISSION_DENIED
          ? 'Location permission denied — using default area.'
          : 'Could not determine location — using default area.',
      )
      setLoading(false)
    }
    navigator.geolocation.getCurrentPosition(apply, fail, {
      enableHighAccuracy: true,
      timeout: 9000,
      maximumAge: 60000,
    })
    if (!watch) return
    const id = navigator.geolocation.watchPosition(apply, fail, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
    })
    return () => navigator.geolocation.clearWatch(id)
  }, [watch])

  return { coords, error, loading }
}
