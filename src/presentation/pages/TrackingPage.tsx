import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  Package,
  Truck,
  MapPin,
  CheckCircle2,
  Clock,
  Star,
  Send,
  AlertTriangle,
  User,
  CarFront,
  Image as ImageIcon,
  PenLine,
  XCircle,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { MAPBOX_TOKEN, MAP_STYLE } from '@/application/lib/mapbox'

mapboxgl.accessToken = MAPBOX_TOKEN

/* ─────────────────────────── Types ─────────────────────────── */

interface TrackingResponse {
  status: 'scheduled' | 'in_transit' | 'arriving' | 'delivered' | 'failed'
  stop: {
    address: string
    time_window_start: string | null
    time_window_end: string | null
    customer_name: string | null
    delivery_instructions: string | null
  }
  driver: {
    first_name: string
    vehicle_plate: string | null
  } | null
  eta: {
    estimated_arrival: string | null
    stops_before: number
  } | null
  location: {
    lat: number
    lng: number
    updated_at: string
  } | null
  pod: {
    photos: string[]
    signature_url: string | null
    completed_at: string | null
    location: string | null
  } | null
  org: {
    name: string
    logo_url: string | null
    primary_color: string | null
  }
  route_id: string | null
  stop_lat: number
  stop_lng: number
  notifications: Array<{
    id: string
    channel: string
    event_type: string
    status: string
    sent_at: string
  }>
}

type Status = TrackingResponse['status']

/* ─────────────────────────── Helpers ─────────────────────────── */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

const STATUS_CONFIG: Record<
  Status,
  { label: string; sublabel: string; bg: string; text: string; border: string; icon: React.ReactNode }
> = {
  scheduled: {
    label: 'Programado',
    sublabel: 'Tu entrega esta programada',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    icon: <Clock size={18} />,
  },
  in_transit: {
    label: 'En camino',
    sublabel: 'Tu entrega esta en camino',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: <Truck size={18} />,
  },
  arriving: {
    label: 'Llegando',
    sublabel: 'Tu entrega esta por llegar',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    icon: <MapPin size={18} />,
  },
  delivered: {
    label: 'Entregado',
    sublabel: 'Tu entrega fue completada',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: <CheckCircle2 size={18} />,
  },
  failed: {
    label: 'Fallido',
    sublabel: 'No se pudo completar la entrega',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: <XCircle size={18} />,
  },
}

import {
  fmtTime,
  fmtDateTime,
  fmtRelative,
  fmtTimeWindow,
  NOTIF_CHANNEL_LABELS,
  NOTIF_EVENT_LABELS,
} from '@/presentation/features/tracking/utils'

/* ─────────────────────────── Component ─────────────────────────── */

export default function TrackingPage() {
  const { token } = useParams<{ token: string }>()

  const [data, setData] = useState<TrackingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Driver live location (updated via Realtime)
  const [driverLoc, setDriverLoc] = useState<{
    lat: number
    lng: number
    updated_at: string
  } | null>(null)

  // Feedback state
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const stopMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null)

  // Stable ref for data so map helpers can read latest
  const dataRef = useRef(data)
  dataRef.current = data
  const driverLocRef = useRef(driverLoc)
  driverLocRef.current = driverLoc

  /* ──── Fetch tracking data ──── */

  const fetchTracking = useCallback(async () => {
    if (!token) return
    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/get-tracking-status?token=${token}`,
      )
      if (!response.ok) {
        setError(
          response.status === 404
            ? 'Este enlace de seguimiento no es valido o ha expirado.'
            : 'No se pudo cargar la informacion de seguimiento.',
        )
        return
      }
      const json: TrackingResponse = await response.json()
      setData(json)
      setDriverLoc(json.location)
      setError(null)
    } catch {
      setError('Error de conexion. Verifica tu internet e intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [token])

  // Initial fetch
  useEffect(() => {
    fetchTracking()
  }, [fetchTracking])

  // Auto-refresh every 30 s while active
  useEffect(() => {
    if (!data || data.status === 'delivered' || data.status === 'failed') return
    const id = setInterval(fetchTracking, 30_000)
    return () => clearInterval(id)
  }, [data?.status, fetchTracking])

  /* ──── Realtime driver location ──── */

  useEffect(() => {
    if (!data?.route_id) return
    if (data.status === 'delivered' || data.status === 'failed') return

    const channel = supabase
      .channel('tracking-location')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
          filter: `route_id=eq.${data.route_id}`,
        },
        (payload) => {
          const row = payload.new as {
            lat: number
            lng: number
            recorded_at: string
          }
          if (row.lat && row.lng) {
            setDriverLoc({
              lat: row.lat,
              lng: row.lng,
              updated_at: row.recorded_at,
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [data?.route_id, data?.status])

  /* ──── Map helpers ──── */

  function fitBounds(map: mapboxgl.Map) {
    const d = dataRef.current
    const dl = driverLocRef.current
    if (!d || !d.stop_lat || !d.stop_lng) return

    if (!dl) {
      map.flyTo({ center: [d.stop_lng, d.stop_lat], zoom: 15, duration: 800 })
    } else {
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([d.stop_lng, d.stop_lat])
      bounds.extend([dl.lng, dl.lat])
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 50, right: 50 },
        duration: 800,
      })
    }
  }

  function whenMapReady(map: mapboxgl.Map, fn: () => void) {
    if (map.loaded()) fn()
    else map.once('load', fn)
  }

  /* ──── Map init ──── */

  useEffect(() => {
    if (loading || !mapContainerRef.current || mapRef.current) return

    const center: [number, number] =
      data?.stop_lng && data?.stop_lat
        ? [data.stop_lng, data.stop_lat]
        : [-70.6693, -33.4489]

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center,
      zoom: 15,
      attributionControl: false,
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // Only run once when loading finishes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  /* ──── Stop marker ──── */

  useEffect(() => {
    const map = mapRef.current
    if (!map || !data?.stop_lat || !data?.stop_lng) return

    const stopLat = data.stop_lat
    const stopLng = data.stop_lng

    const place = () => {
      stopMarkerRef.current?.remove()

      const el = document.createElement('div')
      el.innerHTML = `
        <div style="
          width:40px;height:40px;border-radius:50%;
          background:#4f46e5;border:3px solid white;
          box-shadow:0 4px 14px rgba(79,70,229,0.4);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>`

      stopMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([stopLng, stopLat])
        .addTo(map)

      fitBounds(map)
    }

    whenMapReady(map, place)
  }, [data?.stop_lat, data?.stop_lng])

  /* ──── Driver marker ──── */

  useEffect(() => {
    const map = mapRef.current
    if (!map || !driverLoc) return

    const { lat, lng } = driverLoc

    const place = () => {
      driverMarkerRef.current?.remove()

      if (!document.getElementById('trk-pulse-style')) {
        const s = document.createElement('style')
        s.id = 'trk-pulse-style'
        s.textContent =
          '@keyframes trk-pulse{0%{transform:scale(.8);opacity:.8}100%{transform:scale(2.2);opacity:0}}'
        document.head.appendChild(s)
      }

      const wrap = document.createElement('div')
      wrap.style.cssText =
        'position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;'

      const pulse = document.createElement('div')
      pulse.style.cssText =
        'position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.35);animation:trk-pulse 1.8s ease-out infinite;'

      const core = document.createElement('div')
      core.style.cssText =
        'position:relative;width:22px;height:22px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 2px 12px rgba(59,130,246,0.5);display:flex;align-items:center;justify-content:center;'

      const inner = document.createElement('div')
      inner.style.cssText = 'width:8px;height:8px;border-radius:50%;background:white;'

      core.appendChild(inner)
      wrap.appendChild(pulse)
      wrap.appendChild(core)

      driverMarkerRef.current = new mapboxgl.Marker({ element: wrap, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)

      fitBounds(map)
    }

    whenMapReady(map, place)
  }, [driverLoc?.lat, driverLoc?.lng])

  /* ──── Submit feedback ──── */

  async function handleFeedbackSubmit() {
    if (!token || rating === 0 || feedbackSubmitting) return
    setFeedbackSubmitting(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, comment: comment.trim() || null }),
      })
      if (res.ok) setFeedbackSent(true)
    } catch {
      // silently fail — not critical
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  /* ──── Timeline computation ──── */

  function getTimeline() {
    const status = data?.status ?? 'scheduled'
    const order: Status[] = ['scheduled', 'in_transit', 'arriving', 'delivered']
    const idx = order.indexOf(status)
    const failed = status === 'failed'

    type StepState = 'completed' | 'current' | 'pending' | 'failed'

    const steps: { label: string; detail: string | null; state: StepState }[] = [
      {
        label: 'Pedido confirmado',
        detail: null,
        state: failed || idx >= 0 ? 'completed' : 'pending',
      },
      {
        label: 'En camino',
        detail: data?.driver ? `Conductor: ${data.driver.first_name}` : null,
        state: failed
          ? 'completed'
          : idx > 1
            ? 'completed'
            : idx === 1
              ? 'current'
              : 'pending',
      },
      {
        label: 'Llegando',
        detail: data?.eta
          ? data.eta.stops_before > 0
            ? `${data.eta.stops_before} parada${data.eta.stops_before > 1 ? 's' : ''} antes`
            : data.eta.estimated_arrival
              ? `Llega a las ${fmtTime(data.eta.estimated_arrival)}`
              : null
          : null,
        state: failed
          ? 'pending'
          : idx > 2
            ? 'completed'
            : idx === 2
              ? 'current'
              : 'pending',
      },
      {
        label: failed ? 'Entrega fallida' : 'Entregado',
        detail: failed
          ? 'No se pudo completar'
          : data?.pod?.completed_at
            ? fmtDateTime(data.pod.completed_at)
            : null,
        state: failed ? 'failed' : idx >= 3 ? 'completed' : 'pending',
      },
    ]
    return steps
  }

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-lg mx-auto px-4 pt-8 pb-20 animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded-lg w-48" />
          <div className="h-5 bg-slate-200 rounded w-64" />
          <div className="h-56 bg-slate-200 rounded-2xl" />
          <div className="space-y-3">
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-12 bg-slate-200 rounded-xl" />
            <div className="h-12 bg-slate-200 rounded-xl" />
          </div>
          <div className="h-24 bg-slate-200 rounded-xl" />
        </div>
      </div>
    )
  }

  /* ── Error state ── */
  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h2 className="font-display text-lg font-semibold text-slate-800 mb-2">
            No se pudo cargar
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {error || 'Enlace de seguimiento no valido.'}
          </p>
          <button
            onClick={() => {
              setLoading(true)
              setError(null)
              fetchTracking()
            }}
            className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const statusConf = STATUS_CONFIG[data.status]
  const timeline = getTimeline()
  const timeWindow = fmtTimeWindow(data.stop.time_window_start, data.stop.time_window_end)
  const etaTime = data.eta?.estimated_arrival ? fmtTime(data.eta.estimated_arrival) : null
  const etaMinutes = data.eta?.estimated_arrival
    ? Math.max(0, Math.round((new Date(data.eta.estimated_arrival).getTime() - Date.now()) / 60000))
    : null
  const orgColor = data.org.primary_color || '#4f46e5'
  const isActive = data.status === 'in_transit' || data.status === 'arriving'
  const hasEta = isActive && (etaMinutes != null || (data.eta && data.eta.stops_before >= 0))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto pb-8">
        <div className="px-4 pt-6 space-y-4">

          {/* ══════════════════════ 1. TITULO ══════════════════════ */}
          <div>
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
            >
              {statusConf.icon}
              {statusConf.label}
            </div>
            <h1 className="font-display text-xl font-bold text-slate-900 mt-2">
              {statusConf.sublabel}
            </h1>
            {data.stop.customer_name && (
              <p className="text-sm text-slate-500 mt-0.5">Hola {data.stop.customer_name}</p>
            )}
          </div>

          {/* ══════════════════════ 2. INFO BASICA ══════════════════════ */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
            {/* ETA / Tiempo estimado */}
            {hasEta && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${orgColor}15` }}
                >
                  <Clock size={16} style={{ color: orgColor }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800">
                    {etaMinutes != null
                      ? etaMinutes < 1
                        ? 'Llegando ahora'
                        : `Llega en ~${etaMinutes} min`
                      : data.eta && data.eta.stops_before > 0
                        ? `Faltan ${data.eta.stops_before} parada${data.eta.stops_before > 1 ? 's' : ''}`
                        : 'Siguiente parada'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {etaTime && `Estimado: ${etaTime}`}
                    {etaTime && data.eta && data.eta.stops_before > 0 && ' · '}
                    {etaMinutes != null && data.eta && data.eta.stops_before > 0
                      ? `${data.eta.stops_before} parada${data.eta.stops_before > 1 ? 's' : ''} antes`
                      : ''}
                  </div>
                </div>
                {etaMinutes != null ? (
                  <div
                    className="text-2xl font-bold font-display shrink-0"
                    style={{ color: orgColor }}
                  >
                    {etaMinutes < 1 ? '<1' : etaMinutes}
                    <span className="text-xs font-medium text-slate-400 ml-0.5">min</span>
                  </div>
                ) : data.eta && data.eta.stops_before > 0 ? (
                  <div
                    className="text-2xl font-bold font-display shrink-0"
                    style={{ color: orgColor }}
                  >
                    {data.eta.stops_before}
                    <span className="text-xs font-medium text-slate-400 ml-0.5">
                      {data.eta.stops_before === 1 ? 'parada' : 'paradas'}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Time window (when not active, show schedule) */}
            {timeWindow && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-violet-500" />
                </div>
                <div>
                  <div className="text-sm text-slate-800">{timeWindow}</div>
                  <div className="text-xs text-slate-400">Ventana de entrega</div>
                </div>
              </div>
            )}

            {/* Driver */}
            {data.driver && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <User size={16} className="text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">
                    {data.driver.first_name}
                  </div>
                  <div className="text-xs text-slate-400">Conductor</div>
                </div>
                {data.driver.vehicle_plate && (
                  <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg shrink-0">
                    <CarFront size={13} className="text-slate-500" />
                    <span className="text-xs font-medium text-slate-600">
                      {data.driver.vehicle_plate}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Address */}
            <div className="flex items-start gap-3 px-5 py-3.5">
              <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin size={16} className="text-indigo-500" />
              </div>
              <div className="min-w-0">
                <div className="text-sm text-slate-800">{data.stop.address}</div>
                {data.stop.delivery_instructions && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    Ref: {data.stop.delivery_instructions}
                  </div>
                )}
              </div>
            </div>

            {/* Live location freshness */}
            {driverLoc && isActive && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Truck size={16} className="text-blue-500" />
                </div>
                <div>
                  <div className="text-sm text-slate-800">Ubicacion en vivo</div>
                  <div className="text-xs text-slate-400">
                    Actualizado {fmtRelative(driverLoc.updated_at)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══════════════════════ 3. MAPA ══════════════════════ */}
          <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
            <div ref={mapContainerRef} className="w-full h-56 sm:h-64" />
          </div>

          {/* ══════════════════════ 4. DETALLE: Timeline ══════════════════════ */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="space-y-0">
              {timeline.map((step, i) => {
                const isLast = i === timeline.length - 1
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {step.state === 'completed' ? (
                        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      ) : step.state === 'current' ? (
                        <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center shrink-0 ring-4 ring-blue-100">
                          <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                        </div>
                      ) : step.state === 'failed' ? (
                        <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                          <XCircle size={14} className="text-white" />
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-full border-2 border-slate-200 bg-white flex items-center justify-center shrink-0">
                          <div className="w-2 h-2 rounded-full bg-slate-200" />
                        </div>
                      )}
                      {!isLast && (
                        <div className={`w-0.5 flex-1 min-h-6 my-1 ${
                          step.state === 'completed' ? 'bg-emerald-300' : 'bg-slate-200'
                        }`} />
                      )}
                    </div>
                    <div className={isLast ? 'pt-1 pb-0' : 'pt-1 pb-4'}>
                      <div className={`text-sm font-medium ${
                        step.state === 'completed' || step.state === 'current'
                          ? 'text-slate-800'
                          : step.state === 'failed'
                            ? 'text-red-600'
                            : 'text-slate-400'
                      }`}>
                        {step.label}
                      </div>
                      {step.detail && (
                        <div className="text-xs text-slate-400 mt-0.5">{step.detail}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ══════════════════════ 4a.5. Historial de notificaciones ══════════════════════ */}
          {data.notifications && data.notifications.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">
                Notificaciones
              </h3>
              <ul className="space-y-2.5">
                {data.notifications.map((n) => (
                  <li key={n.id} className="flex items-start gap-2.5">
                    <div
                      className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        n.status === 'sent' || n.status === 'delivered' || n.status === 'read'
                          ? 'bg-emerald-400'
                          : n.status === 'failed'
                            ? 'bg-red-400'
                            : 'bg-slate-300'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-slate-700">
                        {NOTIF_EVENT_LABELS[n.event_type] ?? n.event_type}{' '}
                        <span className="text-slate-400">
                          · {NOTIF_CHANNEL_LABELS[n.channel] ?? n.channel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {fmtRelative(n.sent_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ══════════════════════ 4b. DETALLE: POD ══════════════════════ */}
          {data.status === 'delivered' && data.pod && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-800">Prueba de entrega</h3>
              </div>

              {data.pod.completed_at && (
                <div className="text-xs text-slate-500">
                  Completada el {fmtDateTime(data.pod.completed_at)}
                </div>
              )}

              {data.pod.photos.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-500">
                    <ImageIcon size={12} />
                    Fotos ({data.pod.photos.length})
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {data.pod.photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer"
                        className="block aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-100 hover:ring-2 hover:ring-indigo-300 transition-shadow">
                        <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {data.pod.signature_url && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-slate-500">
                    <PenLine size={12} />
                    Firma
                  </div>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 inline-block">
                    <img src={data.pod.signature_url} alt="Firma" className="max-h-24 object-contain" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════ 4c. DETALLE: Feedback ══════════════════════ */}
          {data.status === 'delivered' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              {feedbackSent ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 size={24} className="text-emerald-500" />
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-800 mb-1">
                    Gracias por tu feedback
                  </h3>
                  <p className="text-sm text-slate-500">Tu opinion nos ayuda a mejorar el servicio.</p>
                </div>
              ) : (
                <>
                  <h3 className="text-sm font-semibold text-slate-800 mb-1">Califica tu experiencia</h3>
                  <p className="text-xs text-slate-400 mb-4">Tu opinion es importante para nosotros</p>

                  <div className="flex gap-1.5 mb-4">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button"
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform hover:scale-110 active:scale-95">
                        <Star size={28} className={`transition-colors ${
                          n <= (hoverRating || rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                        }`} />
                      </button>
                    ))}
                  </div>

                  <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                    placeholder="Deja un comentario (opcional)" rows={3}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 resize-none" />

                  <button onClick={handleFeedbackSubmit}
                    disabled={rating === 0 || feedbackSubmitting}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <Send size={14} />
                    {feedbackSubmitting ? 'Enviando...' : 'Enviar'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ══════════════════════ Footer ══════════════════════ */}
          <div className="flex flex-col items-center gap-3 pt-4 pb-4">
            {data.org.logo_url && (
              <img src={data.org.logo_url} alt={data.org.name} className="h-8 object-contain" />
            )}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>Powered by</span>
              <img src="/logo_vuoo.svg" alt="Vuoo" className="h-14" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
