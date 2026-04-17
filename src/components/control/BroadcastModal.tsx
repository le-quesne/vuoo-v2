import { useMemo, useState } from 'react'
import { Send, Users, X, Loader2 } from 'lucide-react'
import type { LiveRoute, LiveDriver } from '../../lib/liveControl'
import { notifyDriversCustom } from '../../lib/notifyDriver'

interface BroadcastModalProps {
  routes: LiveRoute[]
  onClose: () => void
  onSent: (stats: { sent: number; failed: number }) => void
}

function BroadcastModal({ routes, onClose, onSent }: BroadcastModalProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeDrivers = useMemo<LiveDriver[]>(() => {
    const seen = new Set<string>()
    const result: LiveDriver[] = []
    for (const route of routes) {
      if (route.route_status !== 'in_transit') continue
      if (!route.driver) continue
      if (seen.has(route.driver.id)) continue
      seen.add(route.driver.id)
      result.push(route.driver)
    }
    return result
  }, [routes])

  const trimmed = message.trim()
  const canSend = trimmed.length > 0 && activeDrivers.length > 0 && !sending

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const stats = await notifyDriversCustom({
        driverIds: activeDrivers.map((d) => d.id),
        title: 'Mensaje de la central',
        body: trimmed,
      })
      onSent(stats)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar'
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Mensaje a conductores</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Envía un aviso push a todos los conductores en ruta
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
              <Users size={14} className="text-gray-500" />
              Enviar a {activeDrivers.length}{' '}
              {activeDrivers.length === 1 ? 'conductor' : 'conductores'} en ruta
            </div>
            {activeDrivers.length === 0 ? (
              <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2">
                No hay conductores en ruta ahora mismo.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeDrivers.map((d) => (
                  <span
                    key={d.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-50 text-indigo-700"
                  >
                    {d.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Mensaje
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              disabled={sending}
              placeholder="Ej: Vuelvan al depot a cargar combustible."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none disabled:bg-gray-50"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Título fijo: "Mensaje de la central"
            </p>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={sending}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}

export default BroadcastModal
