import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, X, Loader2 } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { MAPBOX_TOKEN } from '@/application/lib/mapbox'

type Suggestion = { place_name: string; center: [number, number] }

export function DepotConfigModal({
  orgId,
  onClose,
  onSaved,
}: {
  orgId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
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
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=5&language=es`,
        )
        const data = await res.json()
        setSuggestions(data.features ?? [])
        setOpen(true)
      } catch {
        setSuggestions([])
      }
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
    if (!coords) return
    setSaving(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('organizations')
      .update({
        default_depot_lat: coords.lat,
        default_depot_lng: coords.lng,
        default_depot_address: address,
      })
      .eq('id', orgId)
    setSaving(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Configurar depot</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Lugar desde donde salen y vuelven los vehículos
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div ref={containerRef} className="relative">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Dirección del depot
            </label>
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
            disabled={!coords || saving}
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
