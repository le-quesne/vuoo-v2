import { useEffect, useState } from 'react'
import { Plus, Search, Warehouse } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import type { Vehicle } from '@/data/types/database'
import {
  MoveVehiclesModal,
  VehicleFormModal,
  VehicleTable,
} from '@/presentation/features/vehicles/components'
import { depotsService, type Depot } from '@/data/services/depots'

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [depots, setDepots] = useState<Depot[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showMoveModal, setShowMoveModal] = useState(false)
  const { currentOrg } = useAuth()

  useEffect(() => {
    loadVehicles()
    loadDepots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id])

  async function loadVehicles() {
    if (!currentOrg) return setVehicles([])
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', currentOrg.id)
      .order('created_at', { ascending: false })
    if (data) setVehicles(data)
  }

  async function loadDepots() {
    if (!currentOrg) return setDepots([])
    const res = await depotsService.listDepots(currentOrg.id)
    if (res.success) setDepots(res.data)
  }

  async function handleDelete(v: Vehicle) {
    if (!window.confirm(`Eliminar vehiculo ${v.name}?`)) return
    await supabase.from('vehicles').delete().eq('id', v.id)
    loadVehicles()
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
      const next = new Set(prev)
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
  }

  async function handleMoveSelected(depotId: string | null) {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    await supabase.from('vehicles').update({ depot_id: depotId }).in('id', ids)
    setSelectedIds(new Set())
    setShowMoveModal(false)
    loadVehicles()
  }

  function openCreate() {
    setEditingVehicle(null)
    setShowModal(true)
  }

  function openEdit(v: Vehicle) {
    setEditingVehicle(v)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingVehicle(null)
  }

  const filtered = vehicles.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  )

  // Agrupar por depot para que sea fácil ver en qué centro de distribución
  // está cada vehículo. `depot_id` null cae en el depot default de la org
  // (es el que efectivamente usa el optimizador para esos vehículos).
  const defaultDepot = depots.find((d) => d.is_default)
  const vehiclesByDepot = new Map<string, Vehicle[]>()
  for (const v of filtered) {
    const depotId = v.depot_id ?? defaultDepot?.id
    if (!depotId) continue
    const group = vehiclesByDepot.get(depotId) ?? []
    group.push(v)
    vehiclesByDepot.set(depotId, group)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Vehículos</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={() => selectedIds.size > 0 && setShowMoveModal(true)}
            disabled={selectedIds.size === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedIds.size > 0
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <Warehouse size={16} />
            Mover a depot{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            <Plus size={16} />
            Crear vehiculo
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-4">
        {filtered.length} vehiculos
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
          No hay vehiculos
        </div>
      ) : (
        <div className="space-y-6">
          {depots.map((d) => (
            <VehicleTable
              key={d.id}
              title={d.name}
              badge={d.is_default ? 'Default' : undefined}
              vehicles={vehiclesByDepot.get(d.id) ?? []}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <VehicleFormModal
          vehicle={editingVehicle ?? undefined}
          onClose={closeModal}
          onSaved={() => {
            closeModal()
            loadVehicles()
          }}
        />
      )}

      {showMoveModal && (
        <MoveVehiclesModal
          count={selectedIds.size}
          depots={depots}
          onClose={() => setShowMoveModal(false)}
          onMove={handleMoveSelected}
        />
      )}
    </div>
  )
}

