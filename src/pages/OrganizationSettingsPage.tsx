import { useEffect, useState, useRef, useCallback } from 'react'
import { MapPin, Save, Loader2, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { MAPBOX_TOKEN } from '../lib/mapbox'

type Suggestion = { place_name: string; center: [number, number] }

export function OrganizationSettingsPage() {
  const { currentOrg } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [depotAddress, setDepotAddress] = useState('')
  const [depotCoords, setDepotCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!currentOrg) return
    let cancelled = false
    supabase
      .from('organizations')
      .select('default_depot_lat, default_depot_lng, default_depot_address')
      .eq('id', currentOrg.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setDepotAddress(data.default_depot_address ?? '')
        if (data.default_depot_lat != null && data.default_depot_lng != null) {
          setDepotCoords({ lat: data.default_depot_lat, lng: data.default_depot_lng })
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg])

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
    if (!currentOrg || !depotCoords) return
    setSaving(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('organizations')
      .update({
        default_depot_lat: depotCoords.lat,
        default_depot_lng: depotCoords.lng,
        default_depot_address: depotAddress,
      })
      .eq('id', currentOrg.id)
    setSaving(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(null), 2000)
  }

  async function handleClear() {
    if (!currentOrg) return
    if (!confirm('¿Eliminar el depot configurado?')) return
    setSaving(true)
    setError(null)
    const { error: updErr } = await supabase
      .from('organizations')
      .update({
        default_depot_lat: null,
        default_depot_lng: null,
        default_depot_address: null,
      })
      .eq('id', currentOrg.id)
    setSaving(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    setDepotAddress('')
    setDepotCoords(null)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ajustes generales de {currentOrg?.name}
          </p>
        </div>

        {/* Depot Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Depot</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Lugar desde donde salen los vehículos. Usado por el optimizador de rutas (Vroom) para
              calcular la ruta óptima. Los vehículos pueden tener su propio depot; si no, usan éste.
            </p>
          </div>

          <div className="p-5 space-y-3">
            <div ref={containerRef} className="relative">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Dirección
              </label>
              <input
                value={depotAddress}
                onChange={(e) => {
                  setDepotAddress(e.target.value)
                  setDepotCoords(null)
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
                        setDepotAddress(s.place_name)
                        setDepotCoords({ lat, lng })
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

            {depotCoords && (
              <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                Lat: {depotCoords.lat.toFixed(5)} · Lng: {depotCoords.lng.toFixed(5)}
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
            <button
              onClick={handleClear}
              disabled={!depotCoords || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-red-600 disabled:opacity-30"
            >
              <Trash2 size={12} /> Quitar depot
            </button>
            <div className="flex items-center gap-3">
              {savedAt && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check size={12} /> Guardado
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={!depotCoords || saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
