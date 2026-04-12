import { useEffect, useState } from 'react'
import { X, MapPin, Clock, MessageSquare, Image as ImageIcon, PenLine } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PlanStopWithStop } from '../types/database'

interface PODModalProps {
  planStop: PlanStopWithStop
  onClose: () => void
}

const PHOTOS_BUCKET = 'delivery-photos'

function isFullUrl(value: string | null | undefined): boolean {
  if (!value) return false
  return /^https?:\/\//i.test(value)
}

async function resolveUrl(pathOrUrl: string): Promise<string> {
  if (isFullUrl(pathOrUrl)) return pathOrUrl
  // Try signed URL first (private bucket), fall back to public URL.
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(pathOrUrl, 300)
  if (!error && data?.signedUrl) return data.signedUrl
  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(pathOrUrl)
  return pub?.publicUrl ?? pathOrUrl
}

function parseLatLng(value: string | null): { lat: number; lng: number } | null {
  if (!value) return null
  const parts = value.split(',').map((s) => Number(s.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null
  return { lat: parts[0], lng: parts[1] }
}

// Haversine distance in meters
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function PODModal({ planStop, onClose }: PODModalProps) {
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [loadingAssets, setLoadingAssets] = useState(true)

  const stop = planStop.stop
  const reported = parseLatLng(planStop.report_location)
  const planned = stop?.lat != null && stop?.lng != null ? { lat: stop.lat, lng: stop.lng } : null
  const distance = reported && planned ? Math.round(distanceMeters(reported, planned)) : null

  // ESC to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Resolve photo + signature URLs (signed if paths, direct if already URLs)
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingAssets(true)
      const images = planStop.report_images ?? []
      const urls = await Promise.all(
        images.map(async (p) => {
          try {
            return await resolveUrl(p)
          } catch {
            return p
          }
        })
      )
      if (cancelled) return
      setPhotoUrls(urls.filter(Boolean))

      if (planStop.report_signature_url) {
        try {
          const sig = await resolveUrl(planStop.report_signature_url)
          if (!cancelled) setSignatureUrl(sig)
        } catch {
          if (!cancelled) setSignatureUrl(planStop.report_signature_url)
        }
      } else {
        setSignatureUrl(null)
      }
      if (!cancelled) setLoadingAssets(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [planStop.id, planStop.report_images, planStop.report_signature_url])

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-xs text-gray-400 uppercase tracking-wide">Prueba de entrega</div>
            <h3 className="text-lg font-semibold truncate">{stop?.name ?? 'Parada'}</h3>
            {stop?.address && (
              <div className="text-sm text-gray-500 truncate">{stop.address}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 shrink-0"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoCard
              icon={<Clock size={14} className="text-gray-400" />}
              label="Hora de entrega"
              value={formatTime(planStop.report_time)}
            />
            <InfoCard
              icon={<MapPin size={14} className="text-gray-400" />}
              label="Distancia reportada vs. planificada"
              value={
                distance == null
                  ? 'Sin datos'
                  : distance < 1000
                    ? `${distance} m`
                    : `${(distance / 1000).toFixed(2)} km`
              }
            />
          </div>

          {/* Comments */}
          <section>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
              <MessageSquare size={14} className="text-gray-400" />
              Comentarios
            </div>
            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 min-h-[52px] whitespace-pre-wrap">
              {planStop.report_comments?.trim() || (
                <span className="text-gray-400">Sin comentarios.</span>
              )}
            </div>
          </section>

          {/* Photos */}
          <section>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
              <ImageIcon size={14} className="text-gray-400" />
              Fotos {photoUrls.length > 0 && <span className="text-xs text-gray-400">({photoUrls.length})</span>}
            </div>
            {loadingAssets ? (
              <div className="text-xs text-gray-400">Cargando...</div>
            ) : photoUrls.length === 0 ? (
              <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-4 text-center">
                Sin fotos adjuntas.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {photoUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-100 hover:ring-2 hover:ring-blue-300"
                  >
                    <img
                      src={url}
                      alt={`Foto ${i + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* Signature */}
          <section>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-gray-700">
              <PenLine size={14} className="text-gray-400" />
              Firma
            </div>
            {loadingAssets ? (
              <div className="text-xs text-gray-400">Cargando...</div>
            ) : signatureUrl ? (
              <div className="bg-white border border-gray-200 rounded-lg p-2 inline-block">
                <img
                  src={signatureUrl}
                  alt="Firma"
                  className="max-h-32 object-contain"
                />
              </div>
            ) : (
              <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-4 text-center">
                Sin firma registrada.
              </div>
            )}
          </section>

          {/* Location debug line */}
          {(reported || planned) && (
            <section className="text-[11px] text-gray-400 space-y-0.5">
              {planned && (
                <div>
                  Planificada: {planned.lat.toFixed(5)}, {planned.lng.toFixed(5)}
                </div>
              )}
              {reported && (
                <div>
                  Reportada: {reported.lat.toFixed(5)}, {reported.lng.toFixed(5)}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-gray-800 mt-0.5">{value}</div>
    </div>
  )
}
