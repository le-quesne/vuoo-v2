import { useEffect, useRef, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM, fetchDirections } from '../lib/mapbox'
import type { Stop, DriverLocation } from '../types/database'

mapboxgl.accessToken = MAPBOX_TOKEN

const ROUTE_COLORS = [
  '#3b82f6', // blue
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
  showRouteLines?: boolean
  onStopClick?: (stop: Stop) => void
  selectedStopId?: string | null
  driverLocations?: DriverLocation[]
  driverColorByRouteId?: Record<string, string>
  driverNameByRouteId?: Record<string, string>
  depot?: { lat: number; lng: number; address: string | null } | null
}

export function RouteMap({
  routeGroups,
  showRouteLines = true,
  onStopClick,
  selectedStopId,
  driverLocations,
  driverColorByRouteId,
  driverNameByRouteId,
  depot,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const depotMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverMarkersRef = useRef<mapboxgl.Marker[]>([])
  const mapLoadedRef = useRef(false)
  const onStopClickRef = useRef(onStopClick)
  onStopClickRef.current = onStopClick

  const routeDataKey = useMemo(() =>
    JSON.stringify(routeGroups.map(g => ({
      id: g.routeId,
      color: g.color,
      stops: g.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),
    }))),
    [routeGroups]
  )

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
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      mapLoadedRef.current = false
    }
  }, [])

  // Update markers (sync)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function drawMarkers(map: mapboxgl.Map) {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []

      const bounds = new mapboxgl.LngLatBounds()
      let hasPoints = false

      for (const group of routeGroups) {
        const stopsWithCoords = group.stops.filter((s) => s.lat && s.lng)

        stopsWithCoords.forEach((stop, i) => {
          const isSelected = selectedStopId === stop.id
          const el = document.createElement('div')
          el.style.cssText = `
            width: 30px; height: 30px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 700; color: white;
            background: ${group.color};
            border: 2.5px solid white;
            box-shadow: ${isSelected ? `0 0 0 3px ${group.color}40, 0 2px 8px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.3)'};
            cursor: pointer;
            ${isSelected ? 'transform: scale(1.3);' : ''}
          `
          el.textContent = String(i + 1)

          el.addEventListener('click', (e) => {
            e.stopPropagation()
            onStopClickRef.current?.(stop)
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
      }

      if (depot?.lat != null && depot?.lng != null) {
        bounds.extend([depot.lng, depot.lat])
        hasPoints = true
      }

      if (hasPoints) {
        map.fitBounds(bounds, { padding: 70, duration: 0 })
      }
    }

    if (mapLoadedRef.current) {
      drawMarkers(map)
    } else {
      const handler = () => drawMarkers(map)
      map.on('load', handler)
      return () => { map.off('load', handler) }
    }
  }, [routeDataKey, selectedStopId, depot?.lat, depot?.lng])

  // Depot marker (persistent, distinct from stops)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function drawDepot(map: mapboxgl.Map) {
      if (depotMarkerRef.current) {
        depotMarkerRef.current.remove()
        depotMarkerRef.current = null
      }
      if (!depot || depot.lat == null || depot.lng == null) return

      const el = document.createElement('div')
      el.style.cssText = `
        width: 36px; height: 36px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        background: #4f46e5;
        border: 3px solid white;
        box-shadow: 0 3px 10px rgba(79, 70, 229, 0.5);
        cursor: pointer;
      `
      el.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      `

      const popup = new mapboxgl.Popup({ offset: 22, closeButton: false }).setHTML(`
        <div style="font-family: system-ui; padding: 2px;">
          <div style="font-weight: 600; font-size: 13px; color: #4f46e5; margin-bottom: 2px;">Depot</div>
          ${depot.address ? `<div style="font-size: 12px; color: #444;">${depot.address}</div>` : ''}
        </div>
      `)

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([depot.lng, depot.lat])
        .setPopup(popup)
        .addTo(map)

      depotMarkerRef.current = marker
    }

    if (mapLoadedRef.current) {
      drawDepot(map)
    } else {
      const handler = () => drawDepot(map)
      map.on('load', handler)
      return () => { map.off('load', handler) }
    }
  }, [depot?.lat, depot?.lng, depot?.address])

  // Draw driver location markers (distinctive, dynamic)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    function drawDriverMarkers(map: mapboxgl.Map) {
      driverMarkersRef.current.forEach((m) => m.remove())
      driverMarkersRef.current = []

      if (!driverLocations || driverLocations.length === 0) return

      for (const loc of driverLocations) {
        if (loc.lat == null || loc.lng == null) continue
        const color = (loc.route_id && driverColorByRouteId?.[loc.route_id]) || '#111827'
        const name = (loc.route_id && driverNameByRouteId?.[loc.route_id]) || 'Conductor'

        const wrap = document.createElement('div')
        wrap.style.cssText = `
          position: relative;
          width: 34px; height: 34px;
          display: flex; align-items: center; justify-content: center;
          pointer-events: auto;
        `

        const pulse = document.createElement('div')
        pulse.style.cssText = `
          position: absolute; inset: 0;
          border-radius: 50%;
          background: ${color}55;
          animation: vuoo-pulse 1.6s ease-out infinite;
        `

        const core = document.createElement('div')
        core.style.cssText = `
          position: relative;
          width: 20px; height: 20px; border-radius: 50%;
          background: ${color};
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.35);
          display: flex; align-items: center; justify-content: center;
        `

        const inner = document.createElement('div')
        inner.style.cssText = `
          width: 6px; height: 6px; border-radius: 50%;
          background: white;
        `
        core.appendChild(inner)
        wrap.appendChild(pulse)
        wrap.appendChild(core)

        if (!document.getElementById('vuoo-pulse-style')) {
          const style = document.createElement('style')
          style.id = 'vuoo-pulse-style'
          style.textContent = `@keyframes vuoo-pulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(1.8); opacity: 0; } }`
          document.head.appendChild(style)
        }

        const recordedAt = loc.recorded_at ? new Date(loc.recorded_at).toLocaleTimeString('es-CL') : ''
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(`
          <div style="font-family: system-ui; padding: 2px;">
            <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">${name}</div>
            <div style="font-size: 11px; color: #888;">Ultima posicion ${recordedAt}</div>
            ${loc.speed != null ? `<div style="font-size: 11px; color: #888;">${Math.round(loc.speed * 3.6)} km/h</div>` : ''}
          </div>
        `)

        const marker = new mapboxgl.Marker({ element: wrap, anchor: 'center' })
          .setLngLat([loc.lng, loc.lat])
          .setPopup(popup)
          .addTo(map)

        driverMarkersRef.current.push(marker)
      }
    }

    if (mapLoadedRef.current) {
      drawDriverMarkers(map)
    } else {
      const handler = () => drawDriverMarkers(map)
      map.on('load', handler)
      return () => { map.off('load', handler) }
    }
  }, [driverLocations, driverColorByRouteId, driverNameByRouteId])

  // Fetch and draw route lines (async) — only when showRouteLines is true
  useEffect(() => {
    if (!showRouteLines) return

    const map = mapRef.current
    if (!map) return

    let cancelled = false

    async function drawRouteLines(map: mapboxgl.Map) {
      if (!mapLoadedRef.current) {
        await new Promise<void>((resolve) => {
          map.on('load', () => resolve())
        })
      }
      if (cancelled) return

      // Clear old route layers/sources
      for (let i = 0; i < 20; i++) {
        const borderId = `route-border-${i}`
        const layerId = `route-line-${i}`
        const sourceId = `route-src-${i}`
        if (map.getLayer(borderId)) map.removeLayer(borderId)
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }

      for (let groupIdx = 0; groupIdx < routeGroups.length; groupIdx++) {
        const group = routeGroups[groupIdx]
        const stopsWithCoords = group.stops.filter((s) => s.lat && s.lng)
        if (stopsWithCoords.length < 1) continue

        // Include depot as start/end of route line if configured.
        const coords: [number, number][] = []
        if (depot?.lat != null && depot?.lng != null) {
          coords.push([depot.lng, depot.lat])
        }
        for (const s of stopsWithCoords) {
          coords.push([s.lng!, s.lat!])
        }
        if (depot?.lat != null && depot?.lng != null) {
          coords.push([depot.lng, depot.lat])
        }
        if (coords.length < 2) continue

        const directions = await fetchDirections(coords)

        if (cancelled) return

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

    drawRouteLines(map)
    return () => { cancelled = true }
  }, [routeDataKey, showRouteLines, depot?.lat, depot?.lng])

  return <div ref={containerRef} className="w-full h-full" />
}

// Simple map — markers only, no route lines
export function SimpleMap({
  stops,
  onStopClick,
  selectedStopId,
}: {
  stops: Stop[]
  onStopClick?: (stop: Stop) => void
  selectedStopId?: string | null
}) {
  const groups = useMemo(() => [{
    routeId: 'all',
    vehicleName: 'All',
    stops,
    color: ROUTE_COLORS[0],
  }], [stops])

  return (
    <RouteMap
      routeGroups={groups}
      showRouteLines={false}
      onStopClick={onStopClick}
      selectedStopId={selectedStopId}
    />
  )
}

export { ROUTE_COLORS }
