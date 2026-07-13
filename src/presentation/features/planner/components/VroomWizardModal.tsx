import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Zap,
  RotateCcw,
  ArrowRight,
  Loader2,
  Check,
  AlertTriangle,
  ChevronDown,
  Settings2,
  Warehouse,
  SlidersHorizontal,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { optimize as optimizeVroom, OPTIMIZATION_MODES } from '@/data/services/vroom'
import type { VroomMode, VroomResponse } from '@/data/services/vroom'
import { depotsService, type Depot } from '@/data/services/depots'
import { vehiclesService } from '@/data/services/vehicles'
import type { Vehicle } from '@/data/types/database'

/** Vehículo ya asignado al plan (una `route`), con el depot que resuelve. */
export interface PlanVehicleInfo {
  vehicleId: string
  depotId: string | null
}

export type { VroomResponse }

function modeLabel(mode: VroomMode) {
  return OPTIMIZATION_MODES.find((m) => m.id === mode)?.title ?? mode
}

function formatDistance(meters: number | null) {
  if (meters == null) return '—'
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

export function VroomWizardModal({
  planId,
  numStops,
  planVehicles,
  onClose,
  onApplied,
  onDepotMissing,
  onVehiclesAdded,
  initialPreview,
  initialMode,
  defaultMode = 'efficiency',
  defaultReturnToDepot = true,
}: {
  planId: string
  numStops: number
  /** Vehículos (routes) ya asignados al plan, con su depot resuelto. */
  planVehicles: PlanVehicleInfo[]
  onClose: () => void
  onApplied: () => void
  onDepotMissing: () => void
  /** Llamado cuando el wizard agrega vehículos al plan automáticamente (multi-depot). Debe refrescar el plan sin cerrar el modal. */
  onVehiclesAdded: () => void
  /**
   * Preview precalculado (ej. desde `useOneClickOptimize`). Si viene,
   * el wizard abre directamente en el step 'result' y omite config/preview.
   */
  initialPreview?: VroomResponse
  /** Modo usado cuando viene un `initialPreview`. */
  initialMode?: VroomMode
  /** Modo por defecto de la organización (de settings). */
  defaultMode?: VroomMode
  /** Regreso al depot por defecto de la organización (de settings). */
  defaultReturnToDepot?: boolean
}) {
  const [step, setStep] = useState<'config' | 'running' | 'result' | 'applying'>(
    initialPreview ? 'result' : 'config',
  )
  const [mode, setMode] = useState<VroomMode>(initialMode ?? defaultMode)
  const [returnToDepot, setReturnToDepot] = useState(initialPreview ? defaultReturnToDepot : defaultReturnToDepot)
  const [result, setResult] = useState<VroomResponse | null>(initialPreview ?? null)
  const [error, setError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  // Beta (PRD 26 Fase 2): matriz de costo ponderada en vez de los 5 modos
  // fijos. Sin probar todavía contra datos reales — por eso queda detrás de
  // un toggle explícito y no reemplaza el picker de modo por default.
  const [weightsEnabled, setWeightsEnabled] = useState(false)
  const [weightTime, setWeightTime] = useState(70)
  const [weightDistance, setWeightDistance] = useState(30)
  const [weightHistory, setWeightHistory] = useState(20)

  const { user, currentOrg } = useAuth()
  const [depots, setDepots] = useState<Depot[]>([])
  const [depotId, setDepotId] = useState<string | undefined>(undefined)
  const [orgVehicles, setOrgVehicles] = useState<Vehicle[]>([])
  // Multi-depot (PRD 25 §D): centros de distribución a incluir en esta
  // corrida. Con 0 o 1 depot configurado no hay nada que elegir — se sigue
  // usando todos los vehículos del plan como siempre. `null` = "el usuario
  // todavía no tocó nada", usa el default derivado; una vez que toca algo,
  // queda fijo (no se resetea cuando `onVehiclesAdded` refresca `planVehicles`).
  const [checkedDepotIdsOverride, setCheckedDepotIdsOverride] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!currentOrg) return
    depotsService.listDepots(currentOrg.id).then((res) => {
      if (!res.success) return
      setDepots(res.data)
      // Preseleccionar el default de la org — el dispatcher puede cambiarlo,
      // no hace falta que arranque vacío.
      const def = res.data.find((d) => d.is_default)
      if (def) setDepotId(def.id)
    })
    vehiclesService.listVehicles(currentOrg.id).then((res) => {
      if (res.success) setOrgVehicles(res.data)
    })
  }, [currentOrg])

  const defaultDepotId = depots.find((d) => d.is_default)?.id
  function resolveDepotId(depotId: string | null | undefined): string | undefined {
    return depotId ?? defaultDepotId
  }

  // Default derivado: los depots que ya tienen vehículos en el plan, o si
  // ninguno tiene, el depot default de la org — mismo criterio que antes,
  // pero recalculado en cada render en vez de "snapshoteado" una vez.
  const defaultCheckedDepotIds = useMemo(() => {
    if (depots.length === 0) return new Set<string>()
    const depotsWithPlanVehicles = new Set(
      planVehicles
        .map((pv) => resolveDepotId(pv.depotId))
        .filter((id): id is string => !!id),
    )
    if (depotsWithPlanVehicles.size > 0) return depotsWithPlanVehicles
    return defaultDepotId ? new Set([defaultDepotId]) : new Set<string>()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depots, planVehicles, defaultDepotId])

  const checkedDepotIds = checkedDepotIdsOverride ?? defaultCheckedDepotIds

  function toggleDepot(id: string) {
    setCheckedDepotIdsOverride((prev) => {
      const base = prev ?? defaultCheckedDepotIds
      const next = new Set(base)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Vehículos que participarán en esta corrida: los que ya están en el plan
  // + los de la org que todavía no están, ambos filtrados por los depots
  // tildados. Con ≤1 depot configurado no se filtra nada (comportamiento de
  // siempre).
  const plannedVehicles = useMemo(() => {
    if (depots.length <= 1 || checkedDepotIds.size === 0) {
      return { existing: planVehicles, toAdd: [] as Vehicle[] }
    }
    const planVehicleIdSet = new Set(planVehicles.map((pv) => pv.vehicleId))
    const existing = planVehicles.filter((pv) => {
      const d = resolveDepotId(pv.depotId)
      return d ? checkedDepotIds.has(d) : false
    })
    const toAdd = orgVehicles.filter((v) => {
      if (planVehicleIdSet.has(v.id)) return false
      const d = resolveDepotId(v.depot_id)
      return d ? checkedDepotIds.has(d) : false
    })
    return { existing, toAdd }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depots, checkedDepotIds, planVehicles, orgVehicles])

  const previewVehicleCount = plannedVehicles.existing.length + plannedVehicles.toAdd.length

  const depotSummaryText = useMemo(() => {
    if (depots.length <= 1) return depots[0]?.address ?? null
    const active = depots.filter((d) => checkedDepotIds.has(d.id))
    if (active.length === 0) return null
    if (active.length === 1) return active[0].name
    return `${active.length} centros de distribución (${active.map((d) => d.name).join(', ')})`
  }, [depots, checkedDepotIds])

  async function handleOptimize() {
    setStep('running')
    setError(null)

    let effectivePlanVehicles = planVehicles

    if (plannedVehicles.toAdd.length > 0) {
      if (!user || !currentOrg) {
        setError('No se pudo agregar vehículos: sesión inválida.')
        setStep('config')
        return
      }
      const { error: insertErr } = await supabase.from('routes').insert(
        plannedVehicles.toAdd.map((v) => ({
          plan_id: planId,
          vehicle_id: v.id,
          driver_id: null,
          status: 'not_started' as const,
          user_id: user.id,
          org_id: currentOrg.id,
        })),
      )
      if (insertErr) {
        setError(insertErr.message)
        setStep('config')
        return
      }
      effectivePlanVehicles = [
        ...planVehicles,
        ...plannedVehicles.toAdd.map((v) => ({ vehicleId: v.id, depotId: v.depot_id })),
      ]
      onVehiclesAdded()
    }

    let vehicleIds: string[] | undefined
    if (depots.length > 1 && checkedDepotIds.size > 0) {
      const filtered = effectivePlanVehicles
        .filter((pv) => {
          const d = resolveDepotId(pv.depotId)
          return d ? checkedDepotIds.has(d) : false
        })
        .map((pv) => pv.vehicleId)
      if (filtered.length < effectivePlanVehicles.length) vehicleIds = filtered
    }

    const res = await optimizeVroom({
      plan_id: planId,
      mode,
      return_to_depot: returnToDepot,
      vehicle_ids: vehicleIds,
      depot_id: depotId,
      weights: weightsEnabled
        ? { time: weightTime / 100, distance: weightDistance / 100, history: weightHistory / 100 }
        : undefined,
    })

    if (!res.success) {
      if (/no\s*depot/i.test(res.error)) {
        onDepotMissing()
        return
      }
      setError(res.error)
      setStep('config')
      return
    }

    setResult(res.data)
    setStep('result')
  }

  async function handleApply() {
    if (!result) return
    setStep('applying')
    try {
      // Las completadas/canceladas viven fuera del optimizador pero conservan
      // su order_index actual. Si renumeramos las pendientes desde 0, colisionan
      // con las completadas y la UI las intercala. Por eso recolectamos los
      // order_index "ocupados" por completadas en cada ruta destino y los
      // saltamos al renumerar las pendientes.
      const routeIds = Array.from(
        new Set(result.routes.map((r) => r.route_id).filter((id): id is string => !!id)),
      )

      const occupiedByRoute = new Map<string, Set<number>>()
      if (routeIds.length > 0) {
        const { data: locked, error: lockedErr } = await supabase
          .from('plan_stops')
          .select('route_id, order_index, status')
          .in('route_id', routeIds)
          .in('status', ['completed', 'cancelled'])

        if (lockedErr) throw new Error(lockedErr.message)

        for (const row of locked ?? []) {
          const rid = row.route_id as string | null
          const idx = row.order_index as number | null
          if (!rid || idx == null) continue
          if (!occupiedByRoute.has(rid)) occupiedByRoute.set(rid, new Set())
          occupiedByRoute.get(rid)!.add(idx)
        }
      }

      for (const r of result.routes) {
        const occupied = (r.route_id && occupiedByRoute.get(r.route_id)) || new Set<number>()
        let cursor = 0
        for (const planStopId of r.ordered_plan_stop_ids) {
          while (occupied.has(cursor)) cursor++
          await supabase
            .from('plan_stops')
            .update({ route_id: r.route_id, vehicle_id: r.vehicle_id, order_index: cursor })
            .eq('id', planStopId)
          cursor++
        }
        await supabase
          .from('routes')
          .update({
            total_duration_minutes: Math.round((r.total_duration ?? 0) / 60),
            total_distance_km:
              r.total_distance != null ? Math.round(r.total_distance / 100) / 10 : null,
            geometry: r.geometry ?? null,
          })
          .eq('id', r.route_id)
      }
      onApplied()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error aplicando cambios')
      setStep('result')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Optimizar con Vuoo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 min-h-[280px]">
          {step === 'config' && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-1.5 text-sm text-gray-800">
                <p>
                  Asignando <strong>{numStops} paradas</strong> a{' '}
                  <strong>
                    {previewVehicleCount} vehículo{previewVehicleCount === 1 ? '' : 's'}
                  </strong>
                  {depotSummaryText ? (
                    <>, desde <strong>{depotSummaryText}</strong></>
                  ) : null}.
                </p>
                {plannedVehicles.toAdd.length > 0 && (
                  <p className="text-xs text-blue-700">
                    Vuoo va a agregar {plannedVehicles.toAdd.length} vehículo
                    {plannedVehicles.toAdd.length === 1 ? '' : 's'} al plan desde el/los centro(s)
                    recién seleccionados.
                  </p>
                )}
                <p>
                  Modo: <strong>{weightsEnabled ? 'Pesos personalizados (beta)' : modeLabel(mode)}</strong>{' '}
                  · {returnToDepot ? 'Regresa al depot' : 'Termina en última parada'}.
                </p>
              </div>

              {/* Multi-depot (PRD 25 §D) — solo si la org tiene más de un
                  depot configurado (Settings → Depots). Con 0 o 1 depot no
                  hay nada que elegir: se sigue usando todos los vehículos
                  del plan como siempre. */}
              {depots.length > 1 && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                    <Warehouse size={13} className="text-gray-400" />
                    Centros de distribución a usar
                  </label>
                  <div className="space-y-1.5">
                    {depots.map((d) => {
                      const inPlan = plannedVehicles.existing.filter(
                        (pv) => resolveDepotId(pv.depotId) === d.id,
                      ).length
                      const totalAvailable =
                        planVehicles.filter((pv) => resolveDepotId(pv.depotId) === d.id).length +
                        orgVehicles.filter(
                          (v) =>
                            !planVehicles.some((pv) => pv.vehicleId === v.id) &&
                            resolveDepotId(v.depot_id) === d.id,
                        ).length
                      const checked = checkedDepotIds.has(d.id)
                      const empty = totalAvailable === 0
                      return (
                        <label
                          key={d.id}
                          className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
                            empty
                              ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200'
                              : `cursor-pointer hover:border-gray-300 ${
                                  checked ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white'
                                }`
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={empty}
                              onChange={() => toggleDepot(d.id)}
                              className="accent-blue-600"
                            />
                            <span className="font-medium text-gray-800">
                              {d.name}
                              {d.is_default ? ' (default)' : ''}
                            </span>
                          </span>
                          <span className="text-xs text-gray-400">
                            {empty
                              ? 'sin vehículos'
                              : inPlan > 0
                              ? `${inPlan} vehículo${inPlan === 1 ? '' : 's'} en el plan`
                              : `se agregarán ${totalAvailable} vehículo${totalAvailable === 1 ? '' : 's'}`}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Si un centro tildado no tiene vehículos en este plan todavía, Vuoo agrega
                    automáticamente sus vehículos activos al optimizar.
                  </p>
                </div>
              )}

              {/* Advanced config collapsible */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Settings2 size={15} className="text-gray-400" />
                    <span className="font-medium">Configuración avanzada</span>
                  </div>
                  <ChevronDown
                    size={15}
                    className={`text-gray-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {advancedOpen && (
                  <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                    {/* Depot de respaldo — solo aplica a vehículos sin depot
                        propio en Settings → Vehículos (no restringe el resto). */}
                    {depots.length > 1 && (
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-2">
                          <Warehouse size={13} className="text-gray-400" />
                          Depot de respaldo
                        </label>
                        <select
                          value={depotId ?? ''}
                          onChange={(e) => setDepotId(e.target.value || undefined)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          {depots.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                              {d.is_default ? ' (default)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                          Aplica solo a vehículos sin un depot propio asignado en Settings →
                          Vehículos. No afecta a los centros tildados arriba.
                        </p>
                      </div>
                    )}

                    {/* Pesos personalizados (beta) — reemplaza el modo si está activo */}
                    <div className="border border-purple-200 bg-purple-50/60 rounded-lg p-3">
                      <button
                        onClick={() => setWeightsEnabled((v) => !v)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2">
                          <SlidersHorizontal size={14} className="text-purple-600" />
                          <span className="text-xs font-semibold text-gray-800">
                            Pesos personalizados (beta)
                          </span>
                        </div>
                        <div
                          className={`w-9 h-5 rounded-full transition-colors relative ${
                            weightsEnabled ? 'bg-purple-600' : 'bg-gray-300'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                              weightsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </div>
                      </button>
                      <p className="text-[11px] text-gray-500 mt-1.5">
                        Sin validar todavía contra datos reales. Si lo activás, reemplaza el modo
                        de abajo por una matriz de costo propia (tiempo, distancia, consistencia
                        con rutas anteriores).
                      </p>

                      {weightsEnabled && (
                        <div className="mt-3 space-y-3">
                          <WeightSlider
                            label="Tiempo de viaje"
                            value={weightTime}
                            onChange={setWeightTime}
                          />
                          <WeightSlider
                            label="Distancia / combustible"
                            value={weightDistance}
                            onChange={setWeightDistance}
                          />
                          <WeightSlider
                            label="Consistencia con rutas anteriores"
                            value={weightHistory}
                            onChange={setWeightHistory}
                            hint="Requiere historial de rutas completadas — sin datos, no tiene efecto."
                          />
                        </div>
                      )}
                    </div>

                    {/* Mode selector — ignorado por el backend si weights está activo */}
                    <div className={weightsEnabled ? 'opacity-40 pointer-events-none' : undefined}>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Modo de optimización</div>
                      <div className="grid grid-cols-1 gap-2">
                        {OPTIMIZATION_MODES.map((m) => {
                          const Icon = m.icon
                          const selected = mode === m.id
                          return (
                            <button
                              key={m.id}
                              onClick={() => setMode(m.id)}
                              className={`flex items-start gap-3 text-left p-3 rounded-lg border transition-colors ${
                                selected
                                  ? 'border-blue-500 bg-white'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div
                                className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
                                  selected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                <Icon size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{m.title}</div>
                                <div className="text-xs text-gray-700 mt-0.5 font-medium">{m.billingHint}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                              </div>
                              {selected && <Check size={14} className="text-blue-600 shrink-0 mt-1" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Return to depot */}
                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Regreso al depot</div>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => setReturnToDepot(true)}
                          className={`flex items-center gap-3 text-left p-3 rounded-lg border bg-white transition-colors ${
                            returnToDepot ? 'border-blue-500' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <RotateCcw
                            size={15}
                            className={returnToDepot ? 'text-blue-600' : 'text-gray-400'}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">Salir y volver al depot</div>
                            <div className="text-xs text-gray-500">Cada vehículo termina donde empezó</div>
                          </div>
                          {returnToDepot && <Check size={14} className="text-blue-600" />}
                        </button>
                        <button
                          onClick={() => setReturnToDepot(false)}
                          className={`flex items-center gap-3 text-left p-3 rounded-lg border bg-white transition-colors ${
                            !returnToDepot ? 'border-blue-500' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <ArrowRight
                            size={15}
                            className={!returnToDepot ? 'text-blue-600' : 'text-gray-400'}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">Terminar en última parada</div>
                            <div className="text-xs text-gray-500">No suma el tramo de vuelta al depot</div>
                          </div>
                          {!returnToDepot && <Check size={14} className="text-blue-600" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {step === 'running' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <div className="text-sm text-gray-600">Vuoo está calculando...</div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <Check size={18} />
                <span className="text-sm font-semibold">Optimización lista</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Rutas" value={String(result.summary.routes)} />
                <StatCard
                  label="Duración total"
                  value={formatDuration(result.summary.duration)}
                />
                <StatCard
                  label="Distancia total"
                  value={formatDistance(
                    result.routes.reduce((a, r) => a + (r.total_distance ?? 0), 0),
                  )}
                />
              </div>

              {result.summary.unassigned > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg text-xs text-amber-800">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>
                    {result.summary.unassigned} parada(s) no se pudieron asignar (capacidad,
                    time windows o constraints). Revisá el plan después de aplicar.
                  </span>
                </div>
              )}

              <div className="text-xs text-gray-500">
                Hasta que no aprietes <strong>"Aplicar al plan"</strong>, no se modifica nada.
              </div>
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <div className="text-sm text-gray-600">Aplicando cambios al plan...</div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          {step === 'config' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleOptimize}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Zap size={14} /> Optimizar
              </button>
            </>
          )}

          {step === 'running' && (
            <button
              disabled
              className="ml-auto px-4 py-2 text-sm text-gray-400 rounded-lg cursor-not-allowed"
            >
              Calculando...
            </button>
          )}

          {step === 'result' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Descartar
              </button>
              <button
                onClick={handleApply}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                <Check size={14} /> Aplicar al plan
              </button>
            </>
          )}

          {step === 'applying' && (
            <button
              disabled
              className="ml-auto px-4 py-2 text-sm text-gray-400 rounded-lg cursor-not-allowed"
            >
              Aplicando...
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  )
}

function WeightSlider({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-700 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-gray-900">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-purple-600"
      />
      {hint && <div className="text-[10px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  )
}
