import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { Hospital, Loader2, LocateFixed, Route, Shield, TriangleAlert } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { TileStatusOverlay, useTileStatus } from '../../../shared/components/MapTileStatus'
import { useGeolocation } from '../../../shared/hooks/useGeolocation'
import { SEVERITY_STYLE, buildHotspots, buildSafeZones } from './hotspotData'
import type { SafeZone } from './hotspotData'

/** Fallback when geolocation is unavailable — Jammu, J&K. */
const DEFAULT_CENTER: [number, number] = [32.7266, 74.8573]

function badgeIcon(kind: 'police' | 'hospital') {
  const bg = kind === 'police' ? '#4f8cff' : '#2dd4bf'
  const label = kind === 'police' ? 'P' : 'H'
  return L.divIcon({
    className: 'aasha-safe-badge',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${bg};color:#06121f;font-weight:800;font-size:14px;box-shadow:0 0 14px ${bg}66;border:2px solid rgba(255,255,255,0.85)">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

/** Pans to the live position once it first resolves. */
function FollowPosition({ center }: { center: [number, number] | null }) {
  const map = useMap()
  const [followed, setFollowed] = useState(false)
  useEffect(() => {
    if (center && !followed) {
      map.flyTo(center, 14, { duration: 1.2 })
      setFollowed(true)
    }
  }, [center, followed, map])
  return null
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap()
  return (
    <button
      type="button"
      title="Center on my location"
      aria-label="Center map on my location"
      onClick={() => map.flyTo(center, 14, { duration: 0.8 })}
      className="absolute right-3 top-3 z-[500] flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-base-950/80 text-ink-200 backdrop-blur-md transition-colors hover:border-accent/50 hover:text-ink-50"
    >
      <LocateFixed className="h-4 w-4" />
    </button>
  )
}

/**
 * Hotspot / risk map — Leaflet over dark CARTO tiles, mock severity zones,
 * live user position, nearby safe zones, and a mock safer-route overlay.
 */
export function RiskMap() {
  const { coords, loading: geoLoading, error: geoError } = useGeolocation(true)
  const { status: tileStatus, eventHandlers: tileHandlers } = useTileStatus()
  const center: [number, number] = coords ? [coords.lat, coords.lng] : DEFAULT_CENTER

  const hotspots = useMemo(() => buildHotspots(center), [center])
  const safeZones = useMemo(() => buildSafeZones(center), [center])
  const [showSafeRoute, setShowSafeRoute] = useState(false)

  const destination: SafeZone = safeZones[1]
  const highZone = hotspots.find((z) => z.severity === 'high')

  // Mock safer-route logic: waypoint pushed away from the high-risk centroid.
  const saferRoute: [number, number][] = useMemo(() => {
    if (!highZone) return [center, destination.position]
    const cx = highZone.polygon.reduce((a, p) => a + p[0], 0) / highZone.polygon.length
    const cy = highZone.polygon.reduce((a, p) => a + p[1], 0) / highZone.polygon.length
    const mx = (center[0] + destination.position[0]) / 2
    const my = (center[1] + destination.position[1]) / 2
    const dx = mx - cx
    const dy = my - cy
    const len = Math.hypot(dx, dy) || 1
    const push = 0.022
    return [
      center,
      [mx + (dx / len) * push, my + (dy / len) * push],
      destination.position,
    ]
  }, [center, destination.position, highZone])

  return (
    <GlassCard
      title="Risk map"
      subtitle="Live position · hotspot zones · safe zones"
      className="flex h-full flex-col p-6"
    >
      <div className="relative z-0 h-[380px] overflow-hidden rounded-xl border border-white/10">
        <MapContainer
          center={center}
          zoom={14}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', background: '#0a0f16' }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
            eventHandlers={tileHandlers}
          />
          <TileStatusOverlay status={tileStatus} />
          {/* Geolocation status — honest about live vs fallback position */}
          {(geoLoading || geoError) && (
            <div
              aria-live="polite"
              className="absolute left-3 top-3 z-[500] inline-flex max-w-[240px] items-center gap-2 rounded-full border border-white/10 bg-base-950/80 px-3.5 py-1.5 text-[11px] font-medium text-ink-300 backdrop-blur-md"
            >
              {geoLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" strokeWidth={2.5} />
                  Locating you…
                </>
              ) : (
                <>
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-300" strokeWidth={2} />
                  <span className="leading-snug">{geoError} Showing default area.</span>
                </>
              )}
            </div>
          )}
          <FollowPosition center={coords ? [coords.lat, coords.lng] : null} />
          {hotspots.map((z) => {
            const s = SEVERITY_STYLE[z.severity]
            return (
              <Polygon
                key={z.id}
                positions={z.polygon}
                pathOptions={{ color: s.color, weight: 1.5, fillColor: s.color, fillOpacity: 0.22 }}
              >
                <Tooltip sticky>
                  <strong>{z.name}</strong>
                  <br />
                  {s.label}
                </Tooltip>
              </Polygon>
            )
          })}
          {safeZones.map((sz) => (
            <Marker key={sz.id} position={sz.position} icon={badgeIcon(sz.kind)}>
              <Tooltip>
                <strong>{sz.name}</strong>
                <br />
                {sz.kind === 'police' ? 'Police station' : 'Hospital'} · {sz.distance}
              </Tooltip>
            </Marker>
          ))}
          {coords && (
            <>
              {coords.accuracy !== null && (
                <Circle
                  center={[coords.lat, coords.lng]}
                  radius={Math.min(coords.accuracy, 500)}
                  pathOptions={{ color: '#4f8cff', weight: 1, fillOpacity: 0.08 }}
                />
              )}
              <CircleMarker
                center={[coords.lat, coords.lng]}
                radius={8}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#4f8cff', fillOpacity: 1 }}
              >
                <Tooltip>You are here</Tooltip>
              </CircleMarker>
            </>
          )}
          {showSafeRoute && (
            <>
              <Polyline
                positions={[center, destination.position]}
                pathOptions={{ color: '#ff3b47', weight: 2, dashArray: '6 8', opacity: 0.7 }}
              >
                <Tooltip>Direct path — crosses a high-risk zone</Tooltip>
              </Polyline>
              <Polyline positions={saferRoute} pathOptions={{ color: '#2dd4bf', weight: 3.5, opacity: 0.95 }}>
                <Tooltip>Safer route — avoids high-risk zones</Tooltip>
              </Polyline>
            </>
          )}
          <Recenter center={center} />
        </MapContainer>

        <button
          type="button"
          onClick={() => setShowSafeRoute((v) => !v)}
          className={`absolute left-3 top-3 z-[500] flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold backdrop-blur-md transition-colors ${
            showSafeRoute
              ? 'border-teal-300/60 bg-teal-400/20 text-teal-100'
              : 'border-white/15 bg-base-950/80 text-ink-200 hover:border-teal-300/40'
          }`}
        >
          <Route className="h-4 w-4" />
          {showSafeRoute ? 'Hide safer route' : 'Safer route'}
        </button>

        <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-white/10 bg-base-950/85 px-3 py-2.5 backdrop-blur-md">
          <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">
            <TriangleAlert className="h-3 w-3" /> Risk legend
          </p>
          <div className="space-y-1">
            {(Object.keys(SEVERITY_STYLE) as (keyof typeof SEVERITY_STYLE)[]).map((k) => (
              <div key={k} className="flex items-center gap-2 text-[11px] text-ink-300">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: SEVERITY_STYLE[k].color }}
                />
                {SEVERITY_STYLE[k].label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {safeZones.map((sz) => (
          <div
            key={sz.id}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                sz.kind === 'police' ? 'bg-blue-400/15 text-blue-300' : 'bg-teal-400/15 text-teal-300'
              }`}
            >
              {sz.kind === 'police' ? <Shield className="h-4 w-4" /> : <Hospital className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-ink-100">{sz.name}</p>
              <p className="font-mono text-[10px] text-ink-500">{sz.distance}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
