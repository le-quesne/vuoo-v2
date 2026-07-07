import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, X, Loader2 } from 'lucide-react'
import { mapboxGeocodingService } from '@/data/services/mapbox'
import { depotsService, type Depot } from '@/data/services/depots'

type Suggestion = { place_name: string; center: [number, number] }

export function DepotFormModal({
  orgId,
  depot,
  onClose,
  onSaved,
}: {
  orgId: string
  /** Si viene, edita ese depot. Si no, crea uno nuevo. */
  depot?: Depot
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(depot?.name ?? '')
  const [address, setAddress] = useState(depot?.address ?? '')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    depot ? { lat: depot.lat, lng: depot.lng } : null,
  )
  const [isDefault, setIsDefault] = useState(depot?.is_default ?? false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(timerRef.current)
    if (query.length < 3) {
      setSuggestions([])
      return
    }
    timerRef.current = setTimeout(async () => {
      const features = await mapboxGeocodingService.forwardGeocode(query)
      setSuggestions(features)
      setOpen(true)
    }, 300)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleSave() {
    if (!name.trim() || !coords) return
    setSaving(true)
    setError(null)

    const res = depot
      ? await depotsService.updateDepot(depot.id, {
          name: name.trim(),
          address: address || null,
          lat: coords.lat,
          lng: coords.lng,
        })
      : await depotsService.createDepot({
          org_id: orgId,
          name: name.trim(),
          address: address || undefined,
          lat: coords.lat,
          lng: coords.lng,
        })

    if (!res.success) {
      setSaving(false)
      setError(res.error)
      return
    }

    // El "default" se maneja aparte porque solo un depot puede serlo a la
    // vez (índice único en la DB) — setDefaultDepot limpia el anterior.
    if (isDefault && !depot?.is_default) {
      const defRes = await depotsService.setDefaultDepot(orgId, res.data.id)
      if (!defRes.success) {
        setSaving(false)
        setError(defRes.error)
        return
      }
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {depot ? 'Editar depot' : 'Nuevo depot'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Centro de distribución desde donde salen y vuelven los vehículos
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: CD Norte, Bodega Central"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div ref={containerRef} className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
            <input
              value={address}
              onChange={(e) => {
                setAddress(e.target.value)
                setCoords(null)
                fetchSuggestions(e.target.value)
              }}
              onFocus={() => {
                if (suggestions.length > 0) setOpen(true)
              }}
              placeholder="Ej: Av. Apoquindo 4501, Las Condes"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {open && suggestions.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const [lng, lat] = s.center
                      setAddress(s.place_name)
                      setCoords({ lat, lng })
                      setOpen(false)
                      setSuggestions([])
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-start gap-2"
                  >
                    <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <span className="truncate">{s.place_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {coords && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
              Lat: {coords.lat.toFixed(5)} · Lng: {coords.lng.toFixed(5)}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              disabled={depot?.is_default}
              className="rounded border-gray-300"
            />
            Depot por defecto de la organización
          </label>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !coords || saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar depot
          </button>
        </div>
      </div>
    </div>
  )
}
