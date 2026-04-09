import { useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM, fetchDirections } from '../lib/mapbox'
import type { Stop } from '../types/database'

mapboxgl.accessToken = MAPBOX_TOKEN

const ROUTE_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
]

interface RouteGroup {
  routeId: string
  vehicleName: string
  stops: Stop[]
  color: string
}

interface RouteMapProps {
  routeGroups: RouteGroup[]
  onStopClick?: (stop: Stop) => void
  selectedStopId?: string | null
}

export function RouteMap({ routeGroups, onStopClick, selectedStopId }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const mapLoadedRef = useRef(false)
  const abortRef = useRef(0)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right')

    map.on('load', () => {
      mapLoadedRef.current = true
      // We'll add sources/layers dynamically per route group
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [])

  // Update markers + route lines when routeGroups or selectedStopId change
  const updateMap = useCallback(async () => {
    const map = mapRef.current
    if (!map || !mapLoadedRef.current) return

    const currentAbort = ++abortRef.current

    // Clear old markers
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    // Clear old route layers/sources
    for (let i = 0; i < 20; i++) {
      const layerId = `route-line-${i}`
      const borderId = `route-border-${i}`
      const sourceId = `route-src-${i}`
      if (map.getLayer(borderId)) map.removeLayer(borderId)
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }

    const bounds = new mapboxgl.LngLatBounds()
    let hasPoints = false

    for (let groupIdx = 0; groupIdx < routeGroups.length; groupIdx++) {
      const group = routeGroups[groupIdx]
      const stopsWithCoords = group.stops.filter((s) => s.lat && s.lng)
      if (stopsWithCoords.length === 0) continue

      // Add markers (fixed to map coordinates)
      stopsWithCoords.forEach((stop, i) => {
        const el = document.createElement('div')
        el.style.cssText = `
          width: 30px; height: 30px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: white;
          background: ${group.color};
          border: 2.5px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.15s;
        `
        el.textContent = String(i + 1)

        if (selectedStopId === stop.id) {
          el.style.transform = 'scale(1.3)'
          el.style.boxShadow = `0 0 0 3px ${group.color}40, 0 2px 8px rgba(0,0,0,0.3)`
        }

        el.addEventListener('click', (e) => {
          e.stopPropagation()
          onStopClick?.(stop)
        })

        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(`
          <div style="font-family: system-ui; padding: 2px;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">Parada ${i + 1}</div>
            <div style="font-size: 12px; color: #444;">${stop.name}</div>
            ${stop.address ? `<div style="font-size: 11px; color: #888;">${stop.address}</div>` : ''}
            ${stop.time_window_start ? `<div style="font-size: 11px; color: #888;">${stop.time_window_start}-${stop.time_window_end}</div>` : ''}
          </div>
        `)

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([stop.lng!, stop.lat!])
          .setPopup(popup)
          .addTo(map)

        markersRef.current.push(marker)
        bounds.extend([stop.lng!, stop.lat!])
        hasPoints = true
      })

      // Fetch real road directions for this route group
      if (stopsWithCoords.length >= 2) {
        const coords: [number, number][] = stopsWithCoords.map((s) => [s.lng!, s.lat!])
        const directions = await fetchDirections(coords)

        // Check if we were cancelled
        if (abortRef.current !== currentAbort) return

        if (directions) {
          const sourceId = `route-src-${groupIdx}`
          const borderId = `route-border-${groupIdx}`
          const layerId = `route-line-${groupIdx}`

          map.addSource(sourceId, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: directions.geometry,
              },
            },
          })

          // White border for contrast
          map.addLayer({
            id: borderId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#ffffff',
              'line-width': 6,
              'line-opacity': 0.8,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          })

          // Colored route line
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': group.color,
              'line-width': 3.5,
              'line-opacity': 0.9,
            },
            layout: { 'line-cap': 'round', 'line-join': 'round' },
          })
        }
      }
    }

    if (hasPoints) {
      map.fitBounds(bounds, { padding: 70, duration: 600 })
    }
  }, [routeGroups, selectedStopId, onStopClick])

  // Trigger update when data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapLoadedRef.current) {
      updateMap()
    } else {
      const onLoad = () => updateMap()
      map.on('load', onLoad)
      return () => { map.off('load', onLoad) }
    }
  }, [updateMap])

  return <div ref={containerRef} className="w-full h-full" />
}

// Simple map for a flat list of stops
export function SimpleMap({
  stops,
  onStopClick,
  selectedStopId,
}: {
  stops: Stop[]
  onStopClick?: (stop: Stop) => void
  selectedStopId?: string | null
}) {
  return (
    <RouteMap
      routeGroups={[
        {
          routeId: 'all',
          vehicleName: 'All',
          stops,
          color: ROUTE_COLORS[0],
        },
      ]}
      onStopClick={onStopClick}
      selectedStopId={selectedStopId}
    />
  )
}

export { ROUTE_COLORS }
