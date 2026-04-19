export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11'
export const DEFAULT_CENTER: [number, number] = [-70.6693, -33.4489]
export const DEFAULT_ZOOM = 11

// Fetch real road directions between ordered coordinates
export async function fetchDirections(
  coords: [number, number][]
): Promise<{ distance: number; duration: number; geometry: [number, number][] } | null> {
  if (coords.length < 2) return null
  const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
    `?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
  )
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) return null
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates,
  }
}

// Optimize route order using Mapbox Optimization API (solves TSP)
export async function optimizeTrip(
  coords: [number, number][] // first coord is origin/depot
): Promise<{
  optimizedOrder: number[]
  geometry: [number, number][]
  distance: number
  duration: number
} | null> {
  if (coords.length < 3) return null // need origin + at least 2 stops
  const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const res = await fetch(
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordStr}` +
    `?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&source=first&roundtrip=false&destination=last`
  )
  const data = await res.json()
  const trip = data.trips?.[0]
  if (!trip) return null

  // Extract optimized order (skip first=origin)
  const waypointOrder: number[] = data.waypoints
    .slice(1) // skip origin
    .map((wp: any, inputIdx: number) => ({ inputIdx, optPos: wp.waypoint_index }))
    .sort((a: { optPos: number }, b: { optPos: number }) => a.optPos - b.optPos)
    .map((item: { inputIdx: number }) => item.inputIdx)

  return {
    optimizedOrder: waypointOrder,
    geometry: trip.geometry.coordinates,
    distance: trip.distance,
    duration: trip.duration,
  }
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}
