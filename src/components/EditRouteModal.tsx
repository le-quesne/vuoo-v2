import { useEffect, useState } from 'react'
import { Truck, User, X, Loader2 } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { notifyDriverRouteAssigned } from '@/data/services/notifyDriver.services'

interface EditRouteModalProps {
  route: {
    id: string
    vehicle_id: string | null
    driver_id: string | null
    plan?: { name?: string | null; date?: string | null } | null
  }
  orgId: string
  onClose: () => void
  onSaved: () => void
}

type VehicleOption = {
  id: string
  name: string
  license_plate: string | null
  capacity_weight_kg: number
}

type DriverOption = {
  id: string
  first_name: string
  last_name: string
}

export function EditRouteModal({ route, orgId, onClose, onSaved }: EditRouteModalProps) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [vehicleId, setVehicleId] = useState<string>(route.vehicle_id ?? '')
  const [driverId, setDriverId] = useState<string>(route.driver_id ?? '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const [vehRes, drvRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('id, name, license_plate, capacity_weight_kg')
          .eq('org_id', orgId)
          .order('name'),
        supabase
          .from('drivers')
          .select('id, first_name, last_name')
          .eq('org_id', orgId)
          .order('first_name'),
      ])
      if (cancelled) return
      if (vehRes.error) {
        setError(vehRes.error.message)
        setLoading(false)
        return
      }
      if (drvRes.error) {
        setError(drvRes.error.message)
        setLoading(false)
        return
      }
      setVehicles((vehRes.data ?? []) as VehicleOption[])
      setDrivers((drvRes.data ?? []) as DriverOption[])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  async function handleSave() {
    if (!vehicleId) {
      setError('Selecciona un vehículo')
      return
    }
    setSaving(true)
    setError(null)
    const nextDriverId = driverId === '' ? null : driverId
    const { error: updErr } = await supabase
      .from('routes')
      .update({
        vehicle_id: vehicleId,
        driver_id: nextDriverId,
      })
      .eq('id', route.id)
    setSaving(false)
    if (updErr) {
      setError(updErr.message)
      return
    }
    // Fire push only when the driver actually changed to a new, non-null
    // driver — avoids spamming on pure vehicle edits or unassignments.
    if (nextDriverId && nextDriverId !== route.driver_id) {
      void notifyDriverRouteAssigned({
        driverId: nextDriverId,
        routeId: route.id,
        planName: route.plan?.name ?? null,
        planDate: route.plan?.date ?? null,
      })
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Editar ruta</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Cambia el vehículo o conductor asignado
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <Truck size={14} className="text-gray-400" />
                    Vehículo
                  </span>
                </label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="" disabled>
                    Selecciona un vehículo
                  </option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.license_plate ? ` · ${v.license_plate}` : ''} · {v.capacity_weight_kg} kg
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  <span className="inline-flex items-center gap-1.5">
                    <User size={14} className="text-gray-400" />
                    Conductor
                  </span>
                </label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="">Sin conductor</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </>
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
            disabled={loading || saving || !vehicleId}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
