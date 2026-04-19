import { useState } from 'react'
import {
  X,
  Zap,
  Scale,
  Clock,
  Package,
  RotateCcw,
  ArrowRight,
  Loader2,
  Check,
  AlertTriangle,
  ChevronLeft,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'

type Mode = 'efficiency' | 'balance_stops' | 'balance_time' | 'consolidate'

type VroomRoute = {
  route_id: string
  vehicle_id: string
  total_duration: number
  total_distance: number | null
  ordered_plan_stop_ids: string[]
}

type VroomResponse = {
  summary: { cost: number; routes: number; unassigned: number; duration: number }
  routes: VroomRoute[]
  unassigned: Array<{ plan_stop_id: string | null; reason: string }>
}

const MODES: Array<{
  id: Mode
  icon: typeof Zap
  title: string
  desc: string
  color: string
}> = [
  {
    id: 'efficiency',
    icon: Zap,
    title: 'Eficiencia',
    desc: 'Mínima distancia y tiempo totales. Puede dejar camiones vacíos.',
    color: 'amber',
  },
  {
    id: 'balance_stops',
    icon: Scale,
    title: 'Balancear paradas',
    desc: 'Reparte un número similar de paradas entre todos los vehículos.',
    color: 'blue',
  },
  {
    id: 'balance_time',
    icon: Clock,
    title: 'Balancear tiempo',
    desc: 'Distribuye el tiempo de conducción para que terminen a hora parecida.',
    color: 'indigo',
  },
  {
    id: 'consolidate',
    icon: Package,
    title: 'Consolidar',
    desc: 'Usa el menor número posible de vehículos. Los sobrantes quedan libres.',
    color: 'emerald',
  },
]

function modeLabel(mode: Mode) {
  return MODES.find((m) => m.id === mode)?.title ?? mode
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
}: {
  planId: string
  numStops: number
  numVehicles: number
  depotAddress: string | null
  onClose: () => void
  onApplied: () => void
  onDepotMissing: () => void
}) {
  const [step, setStep] = useState<'config' | 'preview' | 'running' | 'result' | 'applying'>(
    'config',
  )
  const [mode, setMode] = useState<Mode>('efficiency')
  const [returnToDepot, setReturnToDepot] = useState(true)
  const [result, setResult] = useState<VroomResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleOptimize() {
    setStep('running')
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('optimize-routes-vroom', {
        body: { plan_id: planId, mode, return_to_depot: returnToDepot },
      })

      if (fnErr) {
        const details = await fnErr.context?.json?.().catch(() => null)
        if (details?.error === 'No depot configured') {
          onDepotMissing()
          return
        }
        setError(details?.message ?? details?.error ?? fnErr.message ?? 'Error desconocido')
        setStep('config')
        return
      }

      if (!data || data.error) {
        if (data?.error === 'No depot configured') {
          onDepotMissing()
          return
        }
        setError(data?.message ?? data?.error ?? 'Respuesta inesperada')
        setStep('config')
        return
      }

      setResult(data as VroomResponse)
      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
      setStep('config')
    }
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

  const estStopsPerVehicle = numVehicles > 0 ? Math.ceil(numStops / numVehicles) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Optimizar con Vuoo</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 min-h-[280px]">
          {step === 'config' && (
            <div className="space-y-5">
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-2">
                  1. ¿Qué querés optimizar?
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {MODES.map((m) => {
                    const Icon = m.icon
                    const selected = mode === m.id
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className={`flex items-start gap-3 text-left p-3 rounded-lg border transition-colors ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div
                          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                            selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{m.title}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                        </div>
                        {selected && <Check size={16} className="text-indigo-600 shrink-0 mt-1" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-gray-900 mb-2">2. ¿El depot?</div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setReturnToDepot(true)}
                    className={`flex items-center gap-3 text-left p-3 rounded-lg border transition-colors ${
                      returnToDepot
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <RotateCcw
                      size={16}
                      className={returnToDepot ? 'text-indigo-600' : 'text-gray-500'}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        Salir y volver al depot
                      </div>
                      <div className="text-xs text-gray-500">
                        Cada vehículo termina donde empezó
                      </div>
                    </div>
                    {returnToDepot && <Check size={16} className="text-indigo-600" />}
                  </button>
                  <button
                    onClick={() => setReturnToDepot(false)}
                    className={`flex items-center gap-3 text-left p-3 rounded-lg border transition-colors ${
                      !returnToDepot
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <ArrowRight
                      size={16}
                      className={!returnToDepot ? 'text-indigo-600' : 'text-gray-500'}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        Terminar en última parada
                      </div>
                      <div className="text-xs text-gray-500">
                        No suma el tramo de vuelta al depot
                      </div>
                    </div>
                    {!returnToDepot && <Check size={16} className="text-indigo-600" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-gray-900">Esto va a hacer:</div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 space-y-2 text-sm text-gray-800">
                <p>
                  Vuoo va a asignar <strong>{numStops} paradas</strong> a{' '}
                  <strong>{numVehicles} vehículo{numVehicles === 1 ? '' : 's'}</strong>
                  {depotAddress ? (
                    <>
                      , saliendo desde <strong>{depotAddress}</strong>
                    </>
                  ) : null}
                  .
                </p>
                <p>
                  Modo: <strong>{modeLabel(mode)}</strong>
                  {mode === 'balance_stops' && estStopsPerVehicle > 0 && (
                    <> (~{estStopsPerVehicle} paradas por vehículo)</>
                  )}
                  .
                </p>
                <p>
                  {returnToDepot
                    ? 'Cada vehículo volverá al depot al terminar.'
                    : 'Cada vehículo terminará en su última parada (ruta abierta).'}
                </p>
              </div>
              <div className="text-xs text-gray-500">
                Tiempo estimado de cálculo: &lt;2 segundos. Podés revisar el resultado antes de
                aplicarlo al plan.
              </div>
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
                Hasta que no apretés <strong>"Aplicar al plan"</strong>, no se modifica nada.
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
                onClick={() => setStep('preview')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Siguiente <ArrowRight size={14} />
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('config')}
                className="flex items-center gap-1 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft size={14} /> Atrás
              </button>
              <button
                onClick={handleOptimize}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Optimizar
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
