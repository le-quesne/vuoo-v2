import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Search, MapPin, Map as MapIcon, List, Download, ChevronLeft, ChevronRight, X, Trash2, Pencil, User, Phone } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { MAPBOX_TOKEN } from '@/application/lib/mapbox'
import { SimpleMap } from '../components/RouteMap'
import type { Stop } from '@/data/types/database'

const PAGE_SIZE = 20

export function StopsPage() {
  const [stops, setStops] = useState<Stop[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'split'>('split')
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [editingStop, setEditingStop] = useState<Stop | null>(null)

  useEffect(() => {
    loadStops()
  }, [page])

  async function loadStops() {
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count } = await supabase
      .from('stops')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (data) setStops(data)
    if (count !== null) setTotalCount(count)
  }

  const filtered = stops.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="flex h-screen">
      <div className={viewMode === 'split' ? 'w-1/2 flex flex-col min-h-0' : 'flex-1 flex flex-col min-h-0'}>
        <div className="p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">Lugares</h1>
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
              >
                <Plus size={16} />
                Anadir parada
              </button>
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
                  className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <span className="text-xs text-gray-400">{totalCount} paradas</span>
            </div>
            <button
              onClick={() => {
                const csv = [
                  'Nombre,Ubicacion,Duracion,Peso,Hora inicio,Hora fin',
                  ...filtered.map((s) =>
                    [s.name, s.address ?? '', s.duration_minutes, s.weight_kg ?? '', s.time_window_start ?? '', s.time_window_end ?? '']
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

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                  <th className="p-3 font-medium">Nombre</th>
                  <th className="p-3 font-medium">Ubicacion</th>
                  <th className="p-3 font-medium">Duracion</th>
                  <th className="p-3 font-medium">Peso (kg)</th>
                  <th className="p-3 font-medium">Horarios</th>
                  <th className="p-3 font-medium">Cliente</th>
                  <th className="p-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((stop) => (
                  <tr
                    key={stop.id}
                    onClick={() => setSelectedStopId(stop.id)}
                    className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer group ${
                      selectedStopId === stop.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-blue-400 shrink-0" />
                        <span className="font-medium truncate">{stop.name}</span>
                      </div>
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
                    <td className="p-3 text-gray-500">
                      {stop.customer_name ? (
                        <div className="flex items-center gap-1">
                          <span className="truncate max-w-[120px]">{stop.customer_name}</span>
                          {stop.customer_phone && <Phone size={12} className="text-gray-400 shrink-0" />}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingStop(stop) }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-400">
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
                        ? 'bg-blue-500 text-white'
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

      {editingStop && (
        <EditStopModal
          stop={editingStop}
          onClose={() => { setEditingStop(null); setSelectedStopId(null) }}
          onSaved={() => {
            setEditingStop(null)
            setSelectedStopId(null)
            loadStops()
          }}
          onDeleted={() => {
            setEditingStop(null)
            setSelectedStopId(null)
            loadStops()
          }}
        />
      )}
    </div>
  )
}

function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  onSelect: (address: string, coords: { lat: number; lng: number }) => void
  placeholder?: string
}) {
  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(timerRef.current)
    if (query.length < 3) { setSuggestions([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=5&language=es`
        )
        const data = await res.json()
        setSuggestions(data.features ?? [])
        setOpen(true)
      } catch { setSuggestions([]) }
    }, 300)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); fetchSuggestions(e.target.value) }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const [lng, lat] = s.center
                onSelect(s.place_name, { lat, lng })
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
  )
}

function EditStopModal({
  stop,
  onClose,
  onSaved,
  onDeleted,
}: {
  stop: Stop
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [form, setForm] = useState({
    name: stop.name,
    address: stop.address ?? '',
    duration_minutes: stop.duration_minutes,
    weight_kg: stop.weight_kg != null ? String(stop.weight_kg) : '',
    time_window_start: stop.time_window_start ?? '',
    time_window_end: stop.time_window_end ?? '',
    customer_name: stop.customer_name ?? '',
    customer_phone: stop.customer_phone ?? '',
    customer_email: stop.customer_email ?? '',
    delivery_instructions: stop.delivery_instructions ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const update: Record<string, unknown> = {
      name: form.name,
      address: form.address || null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      customer_email: form.customer_email || null,
      delivery_instructions: form.delivery_instructions || null,
    }
    if (coords) {
      update.lat = coords.lat
      update.lng = coords.lng
    }

    await supabase.from('stops').update(update).eq('id', stop.id)
    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!confirm('Eliminar esta parada? Se eliminara tambien de todos los planes donde este asignada.')) return
    setDeleting(true)
    await supabase.from('stops').delete().eq('id', stop.id)
    setDeleting(false)
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSave} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Editar parada</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(val) => setForm({ ...form, address: val })}
              onSelect={(address, c) => { setForm({ ...form, address }); setCoords(c) }}
              placeholder="Av. Apoquindo 7709, Las Condes, Santiago"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
              <input
                type="number"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
              <input
                type="time"
                value={form.time_window_end}
                onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Cliente */}
          <div className="flex items-center gap-2 pt-3 mt-1 border-t border-gray-100">
            <User size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del cliente</label>
              <input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="+56912345678"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={form.customer_email}
              onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Instrucciones de entrega</label>
            <textarea
              value={form.delivery_instructions}
              onChange={(e) => setForm({ ...form, delivery_instructions: e.target.value })}
              placeholder="Ej: Dejar en conserjeria, timbre 3B..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
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
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    delivery_instructions: '',
  })
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const { user, currentOrg } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return
    setSaving(true)

    await supabase.from('stops').insert({
      name: form.name,
      address: form.address || null,
      lat: selectedCoords?.lat ?? null,
      lng: selectedCoords?.lng ?? null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      customer_email: form.customer_email || null,
      delivery_instructions: form.delivery_instructions || null,
      user_id: user.id,
      org_id: currentOrg.id,
    })
    setSaving(false)
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
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(val) => setForm({ ...form, address: val })}
              onSelect={(address, c) => { setForm({ ...form, address }); setSelectedCoords(c) }}
              placeholder="Av. Apoquindo 7709, Las Condes, Santiago"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
              <input
                type="number"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
              <input
                type="time"
                value={form.time_window_end}
                onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Cliente */}
          <div className="flex items-center gap-2 pt-3 mt-1 border-t border-gray-100">
            <User size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del cliente</label>
              <input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="+56912345678"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={form.customer_email}
              onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Instrucciones de entrega</label>
            <textarea
              value={form.delivery_instructions}
              onChange={(e) => setForm({ ...form, delivery_instructions: e.target.value })}
              placeholder="Ej: Dejar en conserjeria, timbre 3B..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
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
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}
