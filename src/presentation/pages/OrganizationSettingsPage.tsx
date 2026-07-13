import { useEffect, useState } from 'react'
import { Save, Loader2, Check, Zap, RotateCcw, ArrowRight, Globe } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { refreshMemberships } from '@/application/lib/auth'
import { OPERATING_COUNTRIES } from '@/data/constants/countries'
import type { OptimizationMode } from '@/data/types/database'
import { OPTIMIZATION_MODES } from '@/data/services/vroom'

export function OrganizationSettingsPage() {
  const { currentOrg } = useAuth()
  const [loading, setLoading] = useState(true)

  // Operating countries state
  const [countries, setCountries] = useState<string[]>(['CL'])
  const [multiCountry, setMultiCountry] = useState(false)
  const [savingCountries, setSavingCountries] = useState(false)
  const [countriesSavedAt, setCountriesSavedAt] = useState<number | null>(null)
  const [countriesError, setCountriesError] = useState<string | null>(null)

  // Optimization mode state
  const [optMode, setOptMode] = useState<OptimizationMode>('efficiency')
  const [optReturnToDepot, setOptReturnToDepot] = useState(true)
  const [savingMode, setSavingMode] = useState(false)
  const [modeSavedAt, setModeSavedAt] = useState<number | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrg) return
    let cancelled = false
    supabase
      .from('organizations')
      .select('default_optimization_mode, default_return_to_depot, operating_countries')
      .eq('id', currentOrg.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setOptMode((data.default_optimization_mode as OptimizationMode) ?? 'efficiency')
        setOptReturnToDepot(data.default_return_to_depot ?? true)
        const orgCountries = data.operating_countries ?? ['CL']
        setCountries(orgCountries)
        setMultiCountry(orgCountries.length > 1)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg])

  function toggleCountry(code: string) {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  async function handleSaveCountries() {
    if (!currentOrg || countries.length === 0) return
    setSavingCountries(true)
    setCountriesError(null)
    // RLS: un UPDATE sin permisos afecta 0 filas SIN error — con `.select()`
    // detectamos ese caso y lo mostramos como error en vez de "Guardado" falso.
    const { data, error: updErr } = await supabase
      .from('organizations')
      .update({ operating_countries: countries })
      .eq('id', currentOrg.id)
      .select('id')
    setSavingCountries(false)
    if (updErr) {
      setCountriesError(updErr.message)
      return
    }
    if (!data || data.length === 0) {
      setCountriesError('No tenés permisos para modificar esta organización.')
      return
    }
    setCountriesSavedAt(Date.now())
    setTimeout(() => setCountriesSavedAt(null), 2000)
    await refreshMemberships()
  }

  async function handleSaveMode() {
    if (!currentOrg) return
    setSavingMode(true)
    setModeError(null)
    const { data, error: updErr } = await supabase
      .from('organizations')
      .update({
        default_optimization_mode: optMode,
        default_return_to_depot: optReturnToDepot,
      })
      .eq('id', currentOrg.id)
      .select('id')
    setSavingMode(false)
    if (updErr) {
      setModeError(updErr.message)
      return
    }
    if (!data || data.length === 0) {
      setModeError('No tenés permisos para modificar esta organización.')
      return
    }
    setModeSavedAt(Date.now())
    setTimeout(() => setModeSavedAt(null), 2000)
    await refreshMemberships()
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ajustes generales de {currentOrg?.name}
          </p>
        </div>

        {/* Operating Countries Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Globe size={18} className="text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">País de operación</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Filtra las sugerencias de direcciones (Mapbox) para que solo muestren resultados de tu país o países de operación.
            </p>
          </div>

          <div className="p-5 space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={multiCountry}
                onChange={(e) => {
                  const checked = e.target.checked
                  setMultiCountry(checked)
                  if (!checked && countries.length > 1) {
                    setCountries([countries[0]])
                  }
                }}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
              />
              Opera en más de un país
            </label>

            {!multiCountry ? (
              <select
                value={countries[0] ?? 'CL'}
                onChange={(e) => setCountries([e.target.value])}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {OPERATING_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                {OPERATING_COUNTRIES.map((c) => (
                  <label
                    key={c.code}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={countries.includes(c.code)}
                      onChange={() => toggleCountry(c.code)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}

            {countriesError && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{countriesError}</div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
            {countriesSavedAt && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Check size={12} /> Guardado
              </span>
            )}
            <button
              onClick={handleSaveCountries}
              disabled={countries.length === 0 || savingCountries}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingCountries ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>

        {/* Optimization Mode Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Modo de optimización por defecto</h2>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Este modo se usará automáticamente en el optimizador. Se puede cambiar puntualmente desde la ventana de optimización en el plan.
            </p>
          </div>

          <div className="p-5 space-y-5">
            {/* Mode cards */}
            <div className="grid grid-cols-1 gap-2">
              {OPTIMIZATION_MODES.map((m) => {
                const Icon = m.icon
                const selected = optMode === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => setOptMode(m.id)}
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
                      <div className="text-xs text-gray-700 mt-0.5 font-medium">{m.billingHint}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
                    </div>
                    {selected && <Check size={16} className="text-indigo-600 shrink-0 mt-1" />}
                  </button>
                )
              })}
            </div>

            {/* Return to depot toggle */}
            <div>
              <div className="text-xs font-medium text-gray-700 mb-2">Regreso al depot</div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setOptReturnToDepot(true)}
                  className={`flex items-center gap-3 text-left p-3 rounded-lg border transition-colors ${
                    optReturnToDepot
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <RotateCcw
                    size={16}
                    className={optReturnToDepot ? 'text-indigo-600' : 'text-gray-500'}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">Salir y volver al depot</div>
                    <div className="text-xs text-gray-500">Cada vehículo termina donde empezó</div>
                  </div>
                  {optReturnToDepot && <Check size={16} className="text-indigo-600" />}
                </button>
                <button
                  onClick={() => setOptReturnToDepot(false)}
                  className={`flex items-center gap-3 text-left p-3 rounded-lg border transition-colors ${
                    !optReturnToDepot
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <ArrowRight
                    size={16}
                    className={!optReturnToDepot ? 'text-indigo-600' : 'text-gray-500'}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">Terminar en última parada</div>
                    <div className="text-xs text-gray-500">No suma el tramo de vuelta al depot</div>
                  </div>
                  {!optReturnToDepot && <Check size={16} className="text-indigo-600" />}
                </button>
              </div>
            </div>

            {modeError && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{modeError}</div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
            {modeSavedAt && (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Check size={12} /> Guardado
              </span>
            )}
            <button
              onClick={handleSaveMode}
              disabled={savingMode}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingMode ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
