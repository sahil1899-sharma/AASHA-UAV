import { useEffect } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { Ambulance, Clock } from 'lucide-react'
import { GlassCard } from '../../../shared/components/GlassCard'
import { TileStatusOverlay, useTileStatus } from '../../../shared/components/MapTileStatus'
import { HOSPITAL, estimateEtaMinutes, useHealthStore } from './healthAlertStore'

const incidentIcon = L.divIcon({
  className: 'aasha-health-marker',
  html: `<div style="position:relative;width:20px;height:20px;">
    <span style="position:absolute;inset:-7px;border-radius:9999px;background:#ff3b4755;animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite;"></span>
    <span style="display:block;width:100%;height:100%;border-radius:9999px;background:#ff3b47;border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 14px #ff3b47;"></span>
  </div>
  <style>@keyframes ping { 0% { transform: scale(0.7); opacity: 0.9; } 100% { transform: scale(1.9); opacity: 0; } }</style>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

const hospitalIcon = L.divIcon({
  className: 'aasha-hospital-marker',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:#0d9488;border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 16px rgba(13,148,136,0.8);color:#fff;font-weight:900;font-size:18px;">+</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

function PanToAlert() {
  const map = useMap()
  const alert = useHealthStore((s) => s.alerts.find((a) => a.id === s.selectedId))
  useEffect(() => {
    if (alert) map.flyTo([alert.lat, alert.lng], Math.max(map.getZoom(), 13), { duration: 0.9 })
  }, [alert?.id, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/**
 * Trigger location map: the incident plotted against the trauma centre,
 * with a straight-line distance / ETA estimate for the ambulance run.
 */
export function TriggerMap() {
  const alert = useHealthStore((s) => s.alerts.find((a) => a.id === s.selectedId))
  const { status: tileStatus, eventHandlers: tileHandlers } = useTileStatus()
  if (!alert) {
    return (
      <GlassCard title="Trigger location" className="p-6">
        <p className="py-12 text-center text-sm text-ink-500">Select an alert to see its location.</p>
      </GlassCard>
    )
  }
  const eta = estimateEtaMinutes(alert.lat, alert.lng)

  return (
    <GlassCard title="Trigger location" subtitle={`${alert.area} · ${alert.id}`} className="flex h-full flex-col p-6">
      <div className="relative z-0 min-h-[300px] flex-1 overflow-hidden rounded-xl border border-white/10">
        <MapContainer
          center={[alert.lat, alert.lng]}
          zoom={12}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', background: '#0a0f16', minHeight: 300 }}
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
            eventHandlers={tileHandlers}
          />
          <TileStatusOverlay status={tileStatus} />
          <Polyline
            positions={[[alert.lat, alert.lng], [HOSPITAL.lat, HOSPITAL.lng]]}
            pathOptions={{ color: '#2dd4bf', weight: 2, dashArray: '6 6', opacity: 0.8 }}
          />
          <Marker position={[alert.lat, alert.lng]} icon={incidentIcon}>
            <Tooltip>{alert.id} · {alert.userName}<br />{alert.area}</Tooltip>
          </Marker>
          <Marker position={[HOSPITAL.lat, HOSPITAL.lng]} icon={hospitalIcon}>
            <Tooltip>{HOSPITAL.name} — receiving facility</Tooltip>
          </Marker>
          <PanToAlert />
        </MapContainer>
        <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-white/10 bg-base-950/85 px-3.5 py-3 backdrop-blur-md">
          <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-400">Ambulance run · estimate</p>
          <p className="flex items-center gap-1.5 text-lg font-bold text-ink-50">
            <Ambulance className="h-4.5 w-4.5 text-teal-300" />
            {eta.km.toFixed(1)} km
            <span className="flex items-center gap-1 text-sm font-semibold text-teal-200">
              <Clock className="h-3.5 w-3.5" /> ~{eta.minutes} min
            </span>
          </p>
          <p className="mt-0.5 max-w-[220px] text-[10px] leading-snug text-ink-500">
            Straight-line distance at an assumed 38 km/h urban cruise. Actual route and traffic will differ.
          </p>
        </div>
      </div>
    </GlassCard>
  )
}
