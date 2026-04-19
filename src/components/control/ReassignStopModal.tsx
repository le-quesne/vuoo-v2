import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { notifyDriverStopReassigned } from '@/data/services/notifyDriver.services'

export interface ReassignCandidateRoute {
  route_id: string
  driver: { id: string; name: string } | null
  stops_total: number
  stops_completed: number
}

export interface ReassignStopModalProps {
  planStopId: string
  planStopName: string
  currentRouteId: string
  currentDriverId: string | null
  candidateRoutes: ReassignCandidateRoute[]
  onClose: () => void
  onReassigned: () => void
}

export function ReassignStopModal({
  planStopId,
  planStopName,
  currentRouteId,
  currentDriverId,
  candidateRoutes,
  onClose,
  onReassigned,
}: ReassignStopModalProps) {
  const filteredCandidates = useMemo(
    () => candidateRoutes.filter((r) => r.route_id !== currentRouteId),
    [candidateRoutes, currentRouteId],
  )

  const currentRoute = useMemo(
    () => candidateRoutes.find((r) => r.route_id === currentRouteId) ?? null,
    [candidateRoutes, currentRouteId],
  )

  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    filteredCandidates[0]?.route_id ?? '',
  )
  const [notifyOld, setNotifyOld] = useState<boolean>(Boolean(currentDriverId))
  const [notifyNew, setNotifyNew] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const targetRoute = useMemo(
    () => filteredCandidates.find((r) => r.route_id === selectedRouteId) ?? null,
    [filteredCandidates, selectedRouteId],
  )
  const targetDriverId = targetRoute?.driver?.id ?? null

  async function handleReassign(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      let nextRouteId: string | null = null
      let nextVehicleId: string | null = null

      if (selectedRouteId) {
        const { data: routeRow, error: routeErr } = await supabase
          .from('routes')
          .select('id, vehicle_id')
          .eq('id', selectedRouteId)
          .maybeSingle()
        if (routeErr) {
          setError(routeErr.message)
          setSaving(false)
          return
        }
        if (!routeRow) {
          setError('Ruta destino no encontrada')
          setSaving(false)
          return
        }
        nextRouteId = routeRow.id
        nextVehicleId = (routeRow.vehicle_id as string | null) ?? null
      }

      const { error: updErr } = await supabase
        .from('plan_stops')
        .update({ route_id: nextRouteId, vehicle_id: nextVehicleId })
        .eq('id', planStopId)

      if (updErr) {
        setError(updErr.message)
        setSaving(false)
        return
      }

      const notifyTasks: Promise<unknown>[] = []
      if (notifyOld && currentDriverId) {
        notifyTasks.push(
          notifyDriverStopReassigned({
            fromDriverId: currentDriverId,
            toDriverId: null,
            stopName: planStopName,
          }),
        )
      }
      if (notifyNew && targetDriverId) {
        notifyTasks.push(
          notifyDriverStopReassigned({
            fromDriverId: null,
            toDriverId: targetDriverId,
            stopName: planStopName,
          }),
        )
      }
      if (notifyTasks.length > 0) {
        await Promise.all(notifyTasks)
      }

      setSaving(false)
      onReassigned()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
      setSaving(false)
    }
  }

  const currentDriverName = currentRoute?.driver?.name ?? 'Sin conductor'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Reasignar: {planStopName}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Actualmente en: {currentDriverName}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            {filteredCandidates.map((route) => {
              const pending = Math.max(0, route.stops_total - route.stops_completed)
              const driverName = route.driver?.name ?? 'Sin conductor'
              const isSelected = selectedRouteId === route.route_id
              return (
                <label
                  key={route.route_id}
                  className={`flex items-start gap-3 px-3 py-2 border rounded-lg cursor-pointer transition ${
                    isSelected
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="reassign-target"
                    className="mt-1 accent-indigo-600"
                    value={route.route_id}
                    checked={isSelected}
                    onChange={() => setSelectedRouteId(route.route_id)}
                    disabled={saving}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {driverName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {pending} paradas por completar
                    </div>
                  </div>
                </label>
              )
            })}

            <label
              className={`flex items-start gap-3 px-3 py-2 border rounded-lg cursor-pointer transition ${
                selectedRouteId === ''
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="reassign-target"
                className="mt-1 accent-indigo-600"
                value=""
                checked={selectedRouteId === ''}
                onChange={() => setSelectedRouteId('')}
                disabled={saving}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">Sin asignar</div>
                <div className="text-xs text-gray-500">
                  Dejar la parada fuera de cualquier ruta
                </div>
              </div>
            </label>
          </div>

          <div className="pt-2 space-y-2 border-t border-gray-100">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={notifyOld}
                onChange={(e) => setNotifyOld(e.target.checked)}
                disabled={saving || !currentDriverId}
              />
              Notificar al conductor anterior (push)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                className="accent-indigo-600"
                checked={notifyNew}
                onChange={(e) => setNotifyNew(e.target.checked)}
                disabled={saving || !targetDriverId}
              />
              Notificar al conductor nuevo (push)
            </label>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleReassign}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Reasignar
          </button>
        </div>
      </div>
    </div>
  )
}
