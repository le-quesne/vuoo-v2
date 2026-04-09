import { useState, useEffect } from 'react'
import { Plus, Search, MapPin, Map as MapIcon, List, X, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { MAPBOX_TOKEN } from '../lib/mapbox'
import { SimpleMap } from '../components/RouteMap'
import type { Stop, StopStatus } from '../types/database'

const PAGE_SIZE = 20

export function StopsPage() {
  const [stops, setStops] = useState<Stop[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StopStatus | 'all'>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'split'>('split')
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)

  useEffect(() => {
    loadStops()
  }, [statusFilter, page])

  async function loadStops() {
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('stops')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, count } = await query
    if (data) setStops(data)
    if (count !== null) setTotalCount(count)
  }

  const filtered = stops.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="flex h-screen">
      <div className={viewMode === 'split' ? 'w-1/2 flex flex-col' : 'flex-1 flex flex-col'}>
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">Paradas</h1>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={`p-1.5 rounded-md ${viewMode === 'split' ? 'bg-white shadow-sm' : ''}`}
                >
                  <MapIcon size={16} />
                </button>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600"
              >
                <Plus size={16} />
                Anadir parada
              </button>
            </div>
          </div>

          {/* Active filter chips */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {statusFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                Estado: {statusFilter === 'pending' ? 'Pendientes' : statusFilter === 'completed' ? 'Completadas' : statusFilter === 'cancelled' ? 'Canceladas' : 'Incompletas'}
                <button onClick={() => { setStatusFilter('all'); setPage(1) }}>
                  <X size={12} />
                </button>
              </span>
            )}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="inline-flex items-center gap-1 px-3 py-1 border border-dashed border-gray-300 rounded-full text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
              >
                <Plus size={12} />
                Anadir filtro
              </button>
              {showFilterDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFilterDropdown(false)} />
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px]">
                    {(['pending', 'completed', 'cancelled', 'incomplete'] as StopStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => { setStatusFilter(s); setPage(1); setShowFilterDropdown(false) }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        {s === 'pending' ? 'Pendientes' : s === 'completed' ? 'Completadas' : s === 'cancelled' ? 'Canceladas' : 'Incompletas'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar parada..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
              <span className="text-xs text-gray-400">{totalCount} paradas</span>
            </div>
            <button
              onClick={() => {
                const csv = [
                  'Nombre,Estado,Ubicacion,Duracion,Peso,Hora inicio,Hora fin',
                  ...filtered.map((s) =>
                    [s.name, s.status, s.address ?? '', s.duration_minutes, s.weight_kg ?? '', s.time_window_start ?? '', s.time_window_end ?? '']
                      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                      .join(',')
                  ),
                ].join('\n')
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'paradas.csv'
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"
              title="Exportar CSV"
            >
              <Download size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                  <th className="p-3 font-medium">Nombre</th>
                  <th className="p-3 font-medium">Estado</th>
                  <th className="p-3 font-medium">Ubicacion</th>
                  <th className="p-3 font-medium">Duracion</th>
                  <th className="p-3 font-medium">Peso (kg)</th>
                  <th className="p-3 font-medium">Horarios</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stop) => (
                  <tr
                    key={stop.id}
                    onClick={() => setSelectedStopId(stop.id)}
                    className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                      selectedStopId === stop.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {stop.order_index != null ? (
                          <span className="w-6 h-6 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center text-xs font-medium shrink-0">
                            {stop.order_index}
                          </span>
                        ) : (
                          <MapPin size={14} className="text-indigo-400 shrink-0" />
                        )}
                        <span className="font-medium truncate">{stop.name}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={stop.status} />
                    </td>
                    <td className="p-3 text-gray-500 max-w-[150px] truncate">
                      {stop.address ?? '-'}
                    </td>
                    <td className="p-3 text-gray-500">{stop.duration_minutes} min</td>
                    <td className="p-3 text-gray-500">{stop.weight_kg ?? '-'}</td>
                    <td className="p-3 text-gray-500">
                      {stop.time_window_start && stop.time_window_end
                        ? `${stop.time_window_start}-${stop.time_window_end}`
                        : '-'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      No hay paradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-4">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum: number
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (page <= 3) {
                  pageNum = i + 1
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = page - 2 + i
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 rounded text-sm ${
                      page === pageNum
                        ? 'bg-indigo-500 text-white'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
              {totalPages > 5 && page < totalPages - 2 && (
                <>
                  <span className="px-1 text-gray-400">...</span>
                  <button
                    onClick={() => setPage(totalPages)}
                    className="w-8 h-8 rounded text-sm hover:bg-gray-100"
                  >
                    {totalPages}
                  </button>
                </>
              )}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {viewMode === 'split' && (
        <div className="w-1/2 border-l border-gray-200">
          <SimpleMap
            stops={filtered}
            onStopClick={(stop) => setSelectedStopId(stop.id)}
            selectedStopId={selectedStopId}
          />
        </div>
      )}

      {showCreateModal && (
        <CreateStopModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false)
            loadStops()
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    incomplete: 'bg-orange-100 text-orange-700',
  }
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    completed: 'Completada',
    cancelled: 'Cancelada',
    incomplete: 'Incompleta',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function CreateStopModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    duration_minutes: 15,
    weight_kg: '',
    time_window_start: '',
    time_window_end: '',
  })
  const [geocoding, setGeocoding] = useState(false)

  async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!address) return null
    setGeocoding(true)
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=1`
      )
      const data = await res.json()
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center
        return { lat, lng }
      }
    } catch {
      // geocoding failed silently
    } finally {
      setGeocoding(false)
    }
    return null
  }

  const { user, currentOrg } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return

    const coords = await geocodeAddress(form.address)

    await supabase.from('stops').insert({
      name: form.name,
      address: form.address || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      status: 'pending',
      delivery_attempts: 0,
      user_id: user.id,
      org_id: currentOrg.id,
    })
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-4">Nueva parada</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Direccion (se geocodifica automaticamente)
            </label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Av. Apoquindo 7709, Las Condes, Santiago"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
              <input
                type="number"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora inicio</label>
              <input
                type="time"
                value={form.time_window_start}
                onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
              <input
                type="time"
                value={form.time_window_end}
                onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={geocoding}
            className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
          >
            {geocoding ? 'Geocodificando...' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}
