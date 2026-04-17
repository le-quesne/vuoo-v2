import { useMemo, useState } from 'react'
import { AlertTriangle, Wrench, X, Loader2 } from 'lucide-react'
import type { LiveRoute } from '../../lib/liveControl'
import { supabase } from '../../lib/supabase'

type IncidentType =
  | 'vehicle_breakdown'
  | 'accident'
  | 'weather'
  | 'driver_offline'
  | 'customer_issue'
  | 'other'

interface IncidentModalProps {
  orgId: string
  userId: string
  routes: LiveRoute[]
  preselectedRouteId?: string | null
  onClose: () => void
  onSaved: () => void
}

const TYPE_OPTIONS: { value: IncidentType; label: string }[] = [
  { value: 'vehicle_breakdown', label: 'Avería de vehículo' },
  { value: 'accident', label: 'Accidente' },
  { value: 'weather', label: 'Clima' },
  { value: 'driver_offline', label: 'Conductor offline' },
  { value: 'customer_issue', label: 'Problema con cliente' },
  { value: 'other', label: 'Otro' },
]

function IncidentModal({
  orgId,
  userId,
  routes,
  preselectedRouteId,
  onClose,
  onSaved,
}: IncidentModalProps) {
  const [type, setType] = useState<IncidentType>('vehicle_breakdown')
  const [routeId, setRouteId] = useState<string>(preselectedRouteId ?? '')
  const [description, setDescription] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedRoute = useMemo(
    () => routes.find((r) => r.route_id === routeId) ?? null,
    [routes, routeId],
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: insertErr } = await supabase.from('operational_incidents').insert({
      org_id: orgId,
      created_by: userId,
      route_id: routeId || null,
      driver_id: selectedRoute?.driver?.id ?? null,
      type,
      description: description.trim() || null,
      action_taken: actionTaken.trim() || null,
      resolved: false,
    })
    setSaving(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Registrar incidente
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Quedará registrado en el historial operacional
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Tipo de incidente
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as IncidentType)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-gray-50"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Ruta afectada
            </label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:bg-gray-50"
            >
              <option value="">— Sin ruta específica —</option>
              {routes.map((r) => {
                const label = `${r.driver?.name ?? r.vehicle?.name ?? 'Sin asignar'} · ${r.plan_name}`
                return (
                  <option key={r.route_id} value={r.route_id}>
                    {label}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Qué pasó?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={saving}
              placeholder="Describe brevemente el incidente"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none disabled:bg-gray-50"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 mb-1">
              <Wrench size={12} className="text-gray-500" />
              Cómo lo resolvieron?
            </label>
            <textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              rows={3}
              disabled={saving}
              placeholder="Acción tomada (opcional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none disabled:bg-gray-50"
            />
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
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default IncidentModal
