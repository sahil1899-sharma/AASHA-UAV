import L from 'leaflet'

/** Shared UAV airframe marker — the blue navigation-chevron dot used on
 *  both the operations map flight layer and the UAV mini-map. */
export const uavIcon = L.divIcon({
  className: 'aasha-uav-marker',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:#0ea5e9;border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 14px rgba(14,165,233,0.8);">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
  </div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})
