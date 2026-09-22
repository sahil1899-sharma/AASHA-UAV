import { Fragment, memo, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, Rectangle, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { GlassCard } from '../../../shared/components/GlassCard'
import { TileStatusOverlay, useTileStatus } from '../../../shared/components/MapTileStatus'
import { useBatchedValue } from '../../../shared/perf/batched'
import { usePoliceStore } from '../incidents/policeIncidentStore'
import { SEVERITY_META, STATUS_META } from '../incidents/IncidentFeed'
import type { FlightPlan, PoliceIncident } from '../incidents/policeIncidentStore'
import { uavIcon } from '../uav/uavIcon'
import { BuildingsLayer } from './BuildingsLayer'

const JAMMU: [number, number] = [32.7266, 74.8573]

function incidentIcon(inc: PoliceIncident, selected: boolean) {
  const color = SEVERITY_META[inc.severity].color
  const pulse = inc.status === 'new' ? 'animation: ping 1.6s cubic-bezier(0,0,.2,1) infinite;' : ''
  const ring = selected
    ? 'box-shadow: 0 0 0 3px rgba(255,255,255,0.9), 0 0 18px ' + color + ';'
    : 'box-shadow: 0 0 12px ' + color + '88;'
  return L.divIcon({
    className: 'aasha-incident-marker',
    html: `<div style="position:relative;width:${selected ? 22 : 16}px;height:${selected ? 22 : 16}px;">
      ${inc.status === 'new' ? `<span style="position:absolute;inset:-6px;border-radius:9999px;background:${color}55;${pulse}"></span>` : ''}
      <span style="display:block;width:100%;height:100%;border-radius:9999px;background:${color};border:2px solid rgba(255,255,255,0.85);${ring}"></span>
    </div>
    <style>@keyframes ping { 0% { transform: scale(0.7); opacity: 0.9; } 100% { transform: scale(1.9); opacity: 0; } }</style>`,
    iconSize: [selected ? 22 : 16, selected ? 22 : 16],
    iconAnchor: [selected ? 11 : 8, selected ? 11 : 8],
  })
}

function clusterIcon(count: number) {
  return L.divIcon({
    className: 'aasha-cluster',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:#1d4ed8;color:#fff;font-weight:800;font-size:13px;border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 16px rgba(59,130,246,0.6);cursor:pointer;">${count}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

interface Cluster {
  key: string
  lat: number
  lng: number
  items: PoliceIncident[]
}

/** Lightweight grid clustering — cell size shrinks as you zoom in. */
function clusterize(incidents: PoliceIncident[], zoom: number): Cluster[] {
  const cell = 0.045 / Math.pow(2, Math.max(0, zoom - 11))
  const map = new Map<string, Cluster>()
  for (const inc of incidents) {
    const key = `${Math.floor(inc.lat / cell)}:${Math.floor(inc.lng / cell)}`
    const existing = map.get(key)
    if (existing) {
      existing.items.push(inc)
      existing.lat = existing.items.reduce((a, i) => a + i.lat, 0) / existing.items.length
      existing.lng = existing.items.reduce((a, i) => a + i.lng, 0) / existing.items.length
    } else {
      map.set(key, { key, lat: inc.lat, lng: inc.lng, items: [inc] })
    }
  }
  return [...map.values()]
}

/**
 * Phase 13 hardening: memo'd so parent re-renders (tile status, panel
 * toggles) don't force Leaflet reconciliation — updates only flow from
 * the batched store values inside.
 */
const IncidentMarkers = memo(function IncidentMarkers() {
  const map = useMap()
  const incidentsLive = usePoliceStore((s) => s.incidents)
  // Phase 13: batch realtime bursts to 250ms so Leaflet doesn't repaint per event.
  const incidents = useBatchedValue(incidentsLive, 250)
  const selectedId = usePoliceStore((s) => s.selectedId)
  const select = usePoliceStore((s) => s.select)
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom())
    map.on('zoomend', onZoom)
    return () => {
      map.off('zoomend', onZoom)
    }
  }, [map])

  const clusters = useMemo(() => clusterize(incidents, zoom), [incidents, zoom])

  return (
    <>
      {clusters.map((c) =>
        c.items.length === 1 ? (
          <Marker
            key={c.items[0].id}
            position={[c.items[0].lat, c.items[0].lng]}
            icon={incidentIcon(c.items[0], c.items[0].id === selectedId)}
            eventHandlers={{ click: () => select(c.items[0].id) }}
          >
            <Tooltip>
              <strong>{c.items[0].id}</strong> · {c.items[0].userName}
              <br />
              {SEVERITY_META[c.items[0].severity].label} · {STATUS_META[c.items[0].status].label}
            </Tooltip>
          </Marker>
        ) : (
          <Marker
            key={c.key}
            position={[c.lat, c.lng]}
            icon={clusterIcon(c.items.length)}
            eventHandlers={{
              click: () => map.setView([c.lat, c.lng], Math.min(zoom + 2, 18)),
            }}
          >
            <Tooltip>{c.items.length} incidents — click to zoom</Tooltip>
          </Marker>
        ),
      )}
    </>
  )
})

/** Pans to the selected incident when selection changes from the feed. */
function SelectionSync() {
  const map = useMap()
  const selectedId = usePoliceStore((s) => s.selectedId)
  const incidents = usePoliceStore((s) => s.incidents)
  useEffect(() => {
    const inc = incidents.find((i) => i.id === selectedId)
    if (inc) map.flyTo([inc.lat, inc.lng], Math.max(map.getZoom(), 14), { duration: 0.9 })
  }, [selectedId, incidents, map])
  return null
}

/** Waypoints still ahead of the UAV: current position + remaining route. */
function remainingPath(plan: FlightPlan, lat: number, lng: number): [number, number][] {
  const pts: [number, number][] = [[lat, lng]]
  for (let i = 0; i < plan.waypoints.length; i++) {
    if (plan.cumM[i] > plan.progressM + 1) {
      pts.push([plan.waypoints[i].lat, plan.waypoints[i].lng])
    }
  }
  const last = plan.waypoints[plan.waypoints.length - 1]
  const tail = pts[pts.length - 1]
  if (tail[0] !== last.lat || tail[1] !== last.lng) pts.push([last.lat, last.lng])
  return pts
}

/**
 * FleetLayer (Phase 9, Part B): every airframe in the fleet is visible at
 * all times — idle ones on their pads, returning ones heading home,
 * charging ones docked. Airborne (tasked) airframes are already drawn by
 * FlightLayer with their live routes, so they are skipped here.
 */
const FleetLayer = memo(function FleetLayer() {
  const fleetLive = usePoliceStore((s) => s.fleet)
  const fleet = useBatchedValue(fleetLive, 250)
  const grounded = fleet.filter((f) => f.status !== 'dispatched')
  return (
    <>
      {grounded.map((f) => (
        <Marker
          key={f.id}
          position={[f.lat, f.lng]}
          icon={L.divIcon({
            className: 'aasha-fleet-marker',
            html: `<div style="display:flex;align-items:center;gap:5px;background:rgba(10,15,22,0.85);border:1px solid ${
              f.status === 'charging' ? 'rgba(251,191,36,0.6)' : f.status === 'returning' ? 'rgba(129,140,248,0.6)' : 'rgba(110,231,183,0.45)'
            };border-radius:8px;padding:3px 8px 3px 6px;font-family:ui-monospace,monospace;font-size:9px;letter-spacing:0.08em;color:#dbe4f0;white-space:nowrap;opacity:0.92;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:9999px;background:${
                f.status === 'charging' ? '#fbbf24' : f.status === 'returning' ? '#818cf8' : '#34d399'
              };box-shadow:0 0 6px ${
                f.status === 'charging' ? '#fbbf24' : f.status === 'returning' ? '#818cf8' : '#34d399'
              };"></span>${f.id} · ${Math.round(f.battery)}%
            </div>`,
            iconSize: [0, 0],
          })}
          interactive={false}
          keyboard={false}
          zIndexOffset={500}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <strong>{f.id}</strong> · {f.status}
            <br />
            Battery {Math.round(f.battery)}% · {f.incidentId ? `was on ${f.incidentId}` : 'on pad'}
          </Tooltip>
        </Marker>
      ))}
    </>
  )
})

/**
 * Renders airspace restrictions, computed flight paths and the live UAV
 * marker for every airborne incident. Paths with class `aasha-flow-path`
 * get an animated dash-flow treatment from the global stylesheet.
 */
const FlightLayer = memo(function FlightLayer() {
  const incidentsLive = usePoliceStore((s) => s.incidents)
  const plansLive = usePoliceStore((s) => s.plans)
  const zonesLive = usePoliceStore((s) => s.zones)
  // Phase 13: coalesce telemetry + bus bursts into 250ms map updates.
  const incidents = useBatchedValue(incidentsLive, 250)
  const plans = useBatchedValue(plansLive, 250)
  const zones = useBatchedValue(zonesLive, 250)
  const airborne = incidents.filter(
    (i) =>
      (i.uav.deployment === 'en-route' || i.uav.deployment === 'dispatched') &&
      plans[i.id]?.reachable,
  )
  return (
    <>
      {zones.map((z) => (
        <Rectangle
          key={z.id}
          bounds={[
            [z.bounds.minLat, z.bounds.minLng],
            [z.bounds.maxLat, z.bounds.maxLng],
          ]}
          pathOptions={
            z.active
              ? { color: '#ff3b47', weight: 1.5, dashArray: '6 6', fillColor: '#ff3b47', fillOpacity: 0.14 }
              : { color: '#ff3b47', weight: 1, dashArray: '3 8', fillColor: '#ff3b47', fillOpacity: 0.03, opacity: 0.45 }
          }
          interactive={false}
        >
          <Tooltip direction="top" sticky>
            <strong>{z.name}</strong>
            <br />
            {z.active ? 'Restricted — UAVs route around' : 'Inactive'}
          </Tooltip>
        </Rectangle>
      ))}
      {zones
        .filter((z) => z.active)
        .map((z) => (
          <Marker
            key={`label-${z.id}`}
            position={[(z.bounds.minLat + z.bounds.maxLat) / 2, (z.bounds.minLng + z.bounds.maxLng) / 2]}
            icon={L.divIcon({
              className: 'aasha-zone-label',
              html: `<div style="font-family:ui-monospace,monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#ffb3b8;background:rgba(20,8,10,0.72);border:1px solid rgba(255,59,71,0.55);border-radius:6px;padding:2px 7px;white-space:nowrap;">No-fly · ${z.name}</div>`,
              iconSize: [0, 0],
            })}
            interactive={false}
            keyboard={false}
          />
        ))}
      {airborne.map((inc) => {
        const plan = plans[inc.id]
        if (!plan || plan.waypoints.length < 2) return null
        return (
          <Fragment key={inc.id}>
            <Polyline
              positions={plan.waypoints.map((w) => [w.lat, w.lng] as [number, number])}
              pathOptions={{ color: '#38bdf8', weight: 2, opacity: 0.22 }}
              interactive={false}
            />
            <Polyline
              positions={remainingPath(plan, inc.uav.lat, inc.uav.lng)}
              pathOptions={{
                color: '#7dd3fc',
                weight: 3,
                opacity: 0.95,
                dashArray: '10 8',
                className: 'aasha-flow-path',
              }}
              interactive={false}
            />
            <Marker position={[inc.uav.lat, inc.uav.lng]} icon={uavIcon} interactive={false} zIndexOffset={1000}>
              <Tooltip direction="top" offset={[0, -16]}>
                <strong>{inc.uav.id}</strong> · {(plan.progressM / 1000).toFixed(1)} of {(plan.totalM / 1000).toFixed(1)} km
              </Tooltip>
            </Marker>
          </Fragment>
        )
      })}
    </>
  )
})

/**
 * Flight planning controls: airspace restriction toggles, simulation
 * speed, and live route stats for the selected flight. The product always
 * plans with its optimal planner — there is no algorithm picker here.
 */
function AirspaceControl() {
  const zones = usePoliceStore((s) => s.zones)
  const toggleNoFlyZone = usePoliceStore((s) => s.toggleNoFlyZone)
  const timeScale = usePoliceStore((s) => s.timeScale)
  const setTimeScale = usePoliceStore((s) => s.setTimeScale)
  const selectedId = usePoliceStore((s) => s.selectedId)
  const plan = usePoliceStore((s) => (selectedId ? s.plans[selectedId] : undefined))
  const dispatchDecision = usePoliceStore((s) => s.dispatchDecision)
  const fleet = usePoliceStore((s) => s.fleet)
  const airborne = fleet.filter((f) => f.status === 'dispatched').length

  return (
    <div className="absolute right-3 top-3 z-[500] w-60 rounded-xl border border-white/10 bg-base-950/85 p-3 backdrop-blur-md">
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Flight planning</p>

      <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">
          Fleet · {fleet.length} airframes · {airborne} tasked
        </p>
        {dispatchDecision ? (
          <p className="mt-1 text-[10px] leading-relaxed text-ink-300" title={new Date(dispatchDecision.at).toLocaleTimeString()}>
            {dispatchDecision.reason}
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-ink-500">No taskings yet this session.</p>
        )}
      </div>

      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Airspace restrictions</p>
      <div className="mb-3 space-y-1">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => toggleNoFlyZone(z.id)}
            aria-pressed={z.active}
            className={`flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[11px] transition ${
              z.active
                ? 'border-red-400/50 bg-red-400/10 text-red-200'
                : 'border-white/10 bg-white/[0.04] text-ink-400 hover:border-white/25 hover:text-ink-200'
            }`}
          >
            <span className="font-medium">{z.name}</span>
            <span
              className={`ml-2 inline-block h-2 w-2 shrink-0 rounded-full ${z.active ? 'bg-red-400 shadow-[0_0_8px_#ff3b47]' : 'bg-white/20'}`}
            />
          </button>
        ))}
      </div>

      <div className="mb-1 flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Flight speed</p>
        <div className="flex gap-1" role="group" aria-label="Simulation speed">
          {([1, 4, 16] as const).map((ts) => (
            <button
              key={ts}
              type="button"
              onClick={() => setTimeScale(ts)}
              aria-pressed={timeScale === ts}
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] transition ${
                timeScale === ts
                  ? 'border-sky-400/60 bg-sky-400/15 text-sky-200'
                  : 'border-white/10 bg-white/[0.04] text-ink-400 hover:text-ink-200'
              }`}
            >
              {ts}×
            </button>
          ))}
        </div>
      </div>

      {plan && plan.reachable ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-semibold text-sky-200">Route locked</span>
            <span className="font-mono text-ink-400">{(plan.pathLengthM / 1000).toFixed(2)} km</span>
          </div>
          <p className="mt-0.5 font-mono text-[9px] leading-relaxed text-ink-400">
            {Math.round((plan.progressM / Math.max(plan.totalM, 1)) * 100)}% of route flown
            {plan.replanCount > 0 && (
              <>
                <br />
                <span className="text-amber-300">
                  {plan.replanCount} airspace replan{plan.replanCount === 1 ? '' : 's'} · {plan.lastReplanMs.toFixed(1)} ms
                </span>
              </>
            )}
          </p>
        </div>
      ) : plan && !plan.reachable ? (
        <p className="mt-2 rounded-lg border border-red-400/40 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">
          No flyable route — holding for airspace clearance.
        </p>
      ) : null}
    </div>
  )
}

/**
 * Live operations map — every incident plotted, grid-clustered when dense.
 * Marker click selects the incident (feed highlights in sync); feed row
 * click pans the map here.
 */
export function PoliceMap() {
  const { status: tileStatus, eventHandlers: tileHandlers } = useTileStatus()
  return (
    <GlassCard title="Live operations map" subtitle="Click a marker to inspect · clusters expand on zoom" className="flex h-full flex-col p-6">
      <div className="relative z-0 min-h-[380px] flex-1 overflow-hidden rounded-xl border border-white/10">
        <MapContainer center={JAMMU} zoom={11} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#0a0f16', minHeight: 380 }}>
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ · Buildings © OpenStreetMap contributors"
            eventHandlers={tileHandlers}
          />
          <TileStatusOverlay status={tileStatus} />
          <BuildingsLayer />
          <IncidentMarkers />
          <FleetLayer />
          <FlightLayer />
          <SelectionSync />
        </MapContainer>
        <AirspaceControl />
        <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-white/10 bg-base-950/85 px-3 py-2.5 backdrop-blur-md">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Severity</p>
          <div className="space-y-1">
            {(Object.keys(SEVERITY_META) as (keyof typeof SEVERITY_META)[]).map((k) => (
              <div key={k} className="flex items-center gap-2 text-[11px] text-ink-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_META[k].color }} />
                {SEVERITY_META[k].label}
              </div>
            ))}
          </div>
          <p className="mb-1.5 mt-2.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Fleet</p>
          <div className="space-y-1">
            {[
              { label: 'Idle on pad', color: '#34d399' },
              { label: 'Tasked', color: '#7dd3fc' },
              { label: 'Returning', color: '#818cf8' },
              { label: 'Charging', color: '#fbbf24' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-[11px] text-ink-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color, boxShadow: `0 0 6px ${f.color}` }} />
                {f.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  )
}
