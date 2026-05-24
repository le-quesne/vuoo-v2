import { useState } from 'react'
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
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { optimize as optimizeVroom, OPTIMIZATION_MODES } from '@/data/services/vroom'
import type { VroomMode, VroomResponse } from '@/data/services/vroom'

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
  numVehicles,
  depotAddress,
  onClose,
  onApplied,
  onDepotMissing,
  initialPreview,
  initialMode,
  defaultMode = 'efficiency',
  defaultReturnToDepot = true,
}: {
  planId: string
  numStops: number
  numVehicles: number
  depotAddress: string | null
  onClose: () => void
  onApplied: () => void
  onDepotMissing: () => void
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

  async function handleOptimize() {
    setStep('running')
    setError(null)

    const res = await optimizeVroom({ plan_id: planId, mode, return_to_depot: returnToDepot })

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
      for (const r of result.routes) {
        for (let i = 0; i < r.ordered_plan_stop_ids.length; i++) {
          await supabase
            .from('plan_stops')
            .update({ route_id: r.route_id, vehicle_id: r.vehicle_id, order_index: i })
            .eq('id', r.ordered_plan_stop_ids[i])
        }
        await supabase
          .from('routes')
          .update({
            total_duration_minutes: Math.round((r.total_duration ?? 0) / 60),
            total_distance_km:
              r.total_distance != null ? Math.round(r.total_distance / 100) / 10 : null,
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
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 space-y-1.5 text-sm text-gray-800">
                <p>
                  Asignando <strong>{numStops} paradas</strong> a{' '}
                  <strong>{numVehicles} vehículo{numVehicles === 1 ? '' : 's'}</strong>
                  {depotAddress ? (
                    <>, desde <strong>{depotAddress}</strong></>
                  ) : null}.
                </p>
                <p>
                  Modo: <strong>{modeLabel(mode)}</strong> ·{' '}
                  {returnToDepot ? 'Regresa al depot' : 'Termina en última parada'}.
                </p>
              </div>

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
                    {/* Mode selector */}
                    <div>
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
                                  ? 'border-indigo-500 bg-white'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div
                                className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center ${
                                  selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                <Icon size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{m.title}</div>
                                <div className="text-xs text-gray-700 mt-0.5 font-medium">{m.billingHint}</div>
                                <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                              </div>
                              {selected && <Check size={14} className="text-indigo-600 shrink-0 mt-1" />}
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
                            returnToDepot ? 'border-indigo-500' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <RotateCcw
                            size={15}
                            className={returnToDepot ? 'text-indigo-600' : 'text-gray-400'}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">Salir y volver al depot</div>
                            <div className="text-xs text-gray-500">Cada vehículo termina donde empezó</div>
                          </div>
                          {returnToDepot && <Check size={14} className="text-indigo-600" />}
                        </button>
                        <button
                          onClick={() => setReturnToDepot(false)}
                          className={`flex items-center gap-3 text-left p-3 rounded-lg border bg-white transition-colors ${
                            !returnToDepot ? 'border-indigo-500' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <ArrowRight
                            size={15}
                            className={!returnToDepot ? 'text-indigo-600' : 'text-gray-400'}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">Terminar en última parada</div>
                            <div className="text-xs text-gray-500">No suma el tramo de vuelta al depot</div>
                          </div>
                          {!returnToDepot && <Check size={14} className="text-indigo-600" />}
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
              <Loader2 size={32} className="animate-spin text-indigo-600" />
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
              <Loader2 size={32} className="animate-spin text-indigo-600" />
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
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
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
