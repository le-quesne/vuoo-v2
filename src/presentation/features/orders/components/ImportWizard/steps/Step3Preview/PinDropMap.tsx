import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/application/lib/mapbox';

if (typeof window !== 'undefined') {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

interface PinDropMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

export function PinDropMap({ lat, lng, onChange }: PinDropMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);
    const center: [number, number] = hasCoord ? [lng, lat] : DEFAULT_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: hasCoord ? 14 : DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const marker = new mapboxgl.Marker({ draggable: true, color: '#2563eb' })
      .setLngLat(center)
      .addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      onChangeRef.current(pos.lat, pos.lng);
    });

    markerRef.current = marker;
    mapRef.current = map;

    return () => {
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [lat, lng]);

  return <div ref={containerRef} className="w-full h-64 rounded-lg" />;
}
