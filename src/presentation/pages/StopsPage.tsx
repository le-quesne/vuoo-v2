import { useEffect, useState } from 'react'
import { Plus, Search, MapPin, Map as MapIcon, List, Download, ChevronLeft, ChevronRight, Pencil, Phone } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { SimpleMap } from '@/presentation/components/RouteMap'
import type { Stop } from '@/data/types/database'
import { EditStopModal, CreateStopModal } from '@/presentation/features/stops/components'

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

