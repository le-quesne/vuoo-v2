import { useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import type { Driver, Vehicle } from '@/data/types/database'
import {
  AvailabilityBadge,
  DriverAvatar,
  DriverModal,
  DriverStatusBadge as StatusBadge,
  LicenseBadge,
} from '@/presentation/features/drivers/components'

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadDrivers()
    loadVehicles()
  }, [])

  // Realtime: cuando un chofer cambia su availability desde la app móvil
  // (o cuando un admin edita cualquier campo), refrescar la tabla sin
  // esperar a un refresh manual.
  useEffect(() => {
    const channel = supabase
      .channel('drivers-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        () => loadDrivers(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('*, default_vehicle:vehicles(*)')
      .order('created_at', { ascending: false })
    if (data) setDrivers(data as Driver[])
  }

  async function loadVehicles() {
    const { data } = await supabase.from('vehicles').select('*').order('name')
    if (data) setVehicles(data)
  }

  async function handleDelete(driver: Driver) {
    if (!window.confirm(`Eliminar al conductor ${driver.first_name} ${driver.last_name}?`)) return
    await supabase.from('drivers').delete().eq('id', driver.id)
    loadDrivers()
  }

  const filtered = drivers.filter((d) =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Conductores</h1>
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
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
            >
              <Plus size={16} />
              Crear conductor
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-2">
          {filtered.length} conductores
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="p-3 font-medium w-8"></th>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Telefono</th>
                <th className="p-3 font-medium">Vehiculo asignado</th>
                <th className="p-3 font-medium">Disponibilidad</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Licencia</th>
                <th className="p-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr
                  key={d.id}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td className="p-3">
                    <DriverAvatar first={d.first_name} last={d.last_name} index={i} />
                  </td>
                  <td className="p-3 font-medium">
                    {d.first_name} {d.last_name}
                  </td>
                  <td className="p-3 text-gray-500">{d.phone ?? '-'}</td>
                  <td className="p-3 text-gray-500">{d.default_vehicle?.name ?? '-'}</td>
                  <td className="p-3">
                    <AvailabilityBadge availability={d.availability ?? 'off_shift'} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="p-3">
                    <LicenseBadge expiry={d.license_expiry} />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(d)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(d)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    No hay conductores
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <DriverModal
            vehicles={vehicles}
            onClose={() => setShowCreate(false)}
            onSaved={() => {
              setShowCreate(false)
              loadDrivers()
            }}
          />
        )}

        {editing && (
          <DriverModal
            driver={editing}
            vehicles={vehicles}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              loadDrivers()
            }}
          />
        )}
      </div>
    </div>
  )
}

