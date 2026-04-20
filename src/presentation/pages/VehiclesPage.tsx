import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import type { Vehicle } from '@/data/types/database'
import { VehicleAvatar, VehicleFormModal } from '@/presentation/features/vehicles/components'

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadVehicles()
  }, [])

  async function loadVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setVehicles(data)
  }

  async function handleDelete(v: Vehicle) {
    if (!window.confirm(`Eliminar vehiculo ${v.name}?`)) return
    await supabase.from('vehicles').delete().eq('id', v.id)
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

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Vehiculos</h1>
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
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            <Plus size={16} />
            Crear vehiculo
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-400 mb-2">
        {filtered.length} vehiculos
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium w-8"></th>
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Matricula</th>
              <th className="p-3 font-medium">Marca</th>
              <th className="p-3 font-medium">Modelo</th>
              <th className="p-3 font-medium">Precio/km ($)</th>
              <th className="p-3 font-medium">Combustible</th>
              <th className="p-3 font-medium">Consumo medio</th>
              <th className="p-3 font-medium">Capacidad (kg)</th>
              <th className="p-3 font-medium">Fecha creacion</th>
              <th className="p-3 font-medium w-20">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr
                key={v.id}
                onClick={() => openEdit(v)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3">
                  <VehicleAvatar name={v.name} index={i} />
                </td>
                <td className="p-3 font-medium">{v.name}</td>
                <td className="p-3 text-gray-500">{v.license_plate ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.brand ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.model ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.price_per_km ?? '-'}</td>
                <td className="p-3 text-gray-500 capitalize">{v.fuel_type}</td>
                <td className="p-3 text-gray-500">
                  {v.avg_consumption ? `${v.avg_consumption}L/100km` : '-'}
                </td>
                <td className="p-3 text-gray-500">{v.capacity_weight_kg}kg</td>
                <td className="p-3 text-gray-500">
                  {new Date(v.created_at).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(v)
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(v)
                      }}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-gray-400">
                  No hay vehiculos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  )
}

