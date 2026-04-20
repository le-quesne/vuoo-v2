import { useEffect, useState } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import { MAPBOX_TOKEN } from '@/application/lib/mapbox';
import type { Stop } from '@/data/types/database';

export function AddStopToPlanModal({
  planId,
  existingStopIds,
  onClose,
  onCreated,
}: {
  planId: string
  existingStopIds: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing')
  const [existingStops, setExistingStops] = useState<Stop[]>([])
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)

  const [form, setForm] = useState({
    name: '',
    address: '',
    duration_minutes: 15,
    weight_kg: '',
    time_window_start: '',
    time_window_end: '',
  })
  const [loading, setLoading] = useState(false)

  const { user, currentOrg } = useAuth()

  useEffect(() => {
    // Get unique stops by name+address (deduplicate recurrent stops)
    supabase
      .from('stops')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const seen = new Map<string, Stop>()
          for (const s of data) {
            const key = `${s.name}|${s.address ?? ''}`
            if (!seen.has(key)) seen.set(key, s)
          }
          const excludeSet = new Set(existingStopIds)
          setExistingStops(Array.from(seen.values()).filter((s) => !excludeSet.has(s.id)))
        }
        setLoadingExisting(false)
      })
  }, [])

  const filtered = existingStops.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.address ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function toggleStop(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAssignExisting() {
    if (selectedIds.size === 0 || !currentOrg) return
    setAssigning(true)
    const rows = Array.from(selectedIds).map((stopId) => ({
      stop_id: stopId,
      plan_id: planId,
      status: 'pending' as const,
      delivery_attempts: 0,
      org_id: currentOrg.id,
    }))
    await supabase.from('plan_stops').insert(rows)
    setAssigning(false)
    onCreated()
  }

  async function geocode(address: string) {
    if (!address) return null
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=1`
      )
      const data = await res.json()
      if (data.features?.[0]) {
        const [lng, lat] = data.features[0].center
        return { lat, lng }
      }
    } catch {}
    return null
  }

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return
    setLoading(true)

    const coords = await geocode(form.address)

    const { data: newStop } = await supabase.from('stops').insert({
      name: form.name,
      address: form.address || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      user_id: user.id,
      org_id: currentOrg.id,
    }).select().single()

    if (newStop) {
      await supabase.from('plan_stops').insert({
        stop_id: newStop.id,
        plan_id: planId,
        status: 'pending',
        delivery_attempts: 0,
        org_id: currentOrg.id,
      })
    }

    setLoading(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Anadir parada</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-4">
          <button
            onClick={() => setTab('existing')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Existentes {existingStops.length > 0 && `(${existingStops.length})`}
          </button>
          <button
            onClick={() => setTab('new')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Crear nueva
          </button>
        </div>

        {tab === 'existing' ? (
          <>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar parada..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-64">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  {existingStops.length === 0 ? 'No hay paradas sin asignar' : 'Sin resultados'}
                </p>
              ) : (
                filtered.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onClick={() => toggleStop(stop.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      selectedIds.has(stop.id)
                        ? 'bg-blue-50 ring-1 ring-blue-300'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedIds.has(stop.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300'
                    }`}>
                      {selectedIds.has(stop.id) && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{stop.name}</div>
                      {stop.address && (
                        <div className="text-xs text-gray-400 truncate">{stop.address}</div>
                      )}
                    </div>
                    <MapPin size={14} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssignExisting}
                disabled={selectedIds.size === 0 || assigning}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                {assigning ? 'Asignando...' : `Anadir ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateNew} className="flex-1 flex flex-col">
            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                <input
                  required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Av. Apoquindo 7709, Las Condes"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
                  <input type="number" value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
                  <input type="number" value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hora inicio</label>
                  <input type="time" value={form.time_window_start}
                    onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
                  <input type="time" value={form.time_window_end}
                    onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
                {loading ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
