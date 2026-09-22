import { useMemo } from 'react'
import { GeoJSON } from 'react-leaflet'
import type { FeatureCollection, Polygon } from 'geojson'
import buildingData from '../../../shared/pathfinding/jammuBuildings.json'

interface BuildingsFile {
  type: string
  count: number
  /** Each polygon is a ring of [lng, lat] pairs (real OSM footprints, Jammu). */
  polys: number[][][]
}

/**
 * Real Jammu building footprints (OpenStreetMap) rendered as a subtle
 * canvas layer. Visual context for the operations map — the UAVs route
 * around airspace restrictions above this city fabric.
 */
export function BuildingsLayer() {
  const geo = useMemo<FeatureCollection<Polygon> | null>(() => {
    const data = buildingData as BuildingsFile
    if (!data?.polys?.length) return null
    return {
      type: 'FeatureCollection',
      features: data.polys.map((ring) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [[...ring, ring[0]]] },
      })),
    }
  }, [])

  if (!geo) return null
  return (
    <GeoJSON
      data={geo}
      interactive={false}
      pathOptions={{
        color: '#3a4356',
        weight: 0.6,
        opacity: 0.55,
        fillColor: '#232b3d',
        fillOpacity: 0.5,
      }}
    />
  )
}
