import { useEffect, useState } from 'react';
import { Check, Truck, X } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import { notifyDriverRouteAssigned } from '@/data/services/notifyDriver.services';
import type { Driver, Vehicle } from '@/data/types/database';

export function AddVehicleToPlanModal({
  planId,
  existingVehicleIds,
  onClose,
  onAdded,
}: {
  planId: string
  existingVehicleIds: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [selections, setSelections] = useState<Record<string, string | null>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('*').order('name'),
      supabase.from('drivers').select('*').eq('status', 'active').order('first_name'),
    ]).then(([vehiclesRes, driversRes]) => {
      if (vehiclesRes.data) {
        setVehicles(vehiclesRes.data.filter((v) => !existingVehicleIds.includes(v.id)))
      }
      if (driversRes.data) setDrivers(driversRes.data)
      setLoading(false)
    })
  }, [])

  const { user, currentOrg } = useAuth()

  function toggleVehicle(vehicleId: string) {
    setSelections((prev) => {
      if (vehicleId in prev) {
        const next = { ...prev }
        delete next[vehicleId]
        return next
      }
      const suggested = drivers.find((d) => d.default_vehicle_id === vehicleId)
      return { ...prev, [vehicleId]: suggested ? suggested.id : null }
    })
  }

  function setDriverFor(vehicleId: string, driverId: string | null) {
    setSelections((prev) => ({ ...prev, [vehicleId]: driverId }))
  }

  const selectedIds = Object.keys(selections)

  async function addVehicles() {
    if (!user || !currentOrg || selectedIds.length === 0) return
    setSaving(true)
    const rows = selectedIds.map((vehicleId) => ({
      plan_id: planId,
      vehicle_id: vehicleId,
      driver_id: selections[vehicleId],
      status: 'not_started' as const,
      user_id: user.id,
      org_id: currentOrg.id,
    }))
    const { data: inserted } = await supabase
      .from('routes')
      .insert(rows)
      .select('id, driver_id, plan:plans(name, date)')
    setSaving(false)

    if (inserted) {
      for (const row of inserted as Array<{
        id: string
        driver_id: string | null
        plan?: { name?: string | null; date?: string | null } | null
      }>) {
        if (row.driver_id) {
          void notifyDriverRouteAssigned({
            driverId: row.driver_id,
            routeId: row.id,
            planName: row.plan?.name ?? null,
            planDate: row.plan?.date ?? null,
          })
        }
      }
    }

    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Agregar vehiculos</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No hay vehiculos disponibles. Crea uno en la seccion Drivers.
          </p>
        ) : (
          <div className="space-y-2 max-h-[28rem] overflow-y-auto">
            {vehicles.map((v) => {
              const isSelected = v.id in selections
              return (
                <div
                  key={v.id}
                  className={`rounded-lg transition-colors ${
                    isSelected ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'
                  }`}
                >
                  <button
                    onClick={() => toggleVehicle(v.id)}
                    className="w-full flex items-center gap-3 p-3 text-left"
                  >
                    <Truck size={16} className="text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{v.name}</div>
                      <div className="text-xs text-gray-400">
                        {v.capacity_weight_kg}kg
                        {v.license_plate ? ` - ${v.license_plate}` : ''}
                      </div>
                    </div>
                    {isSelected && <Check size={16} className="text-blue-500 shrink-0" />}
                  </button>
                  {isSelected && (
                    <div className="px-3 pb-3">
                      <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
                        Conductor (opcional)
                      </label>
                      <select
                        value={selections[v.id] ?? ''}
                        onChange={(e) => setDriverFor(v.id, e.target.value || null)}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Sin conductor</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.first_name} {d.last_name}
                            {d.default_vehicle_id === v.id ? ' (sugerido)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={addVehicles}
            disabled={selectedIds.length === 0 || saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving
              ? 'Agregando...'
              : selectedIds.length > 1
              ? `Agregar ${selectedIds.length}`
              : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
