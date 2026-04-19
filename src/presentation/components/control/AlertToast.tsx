import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { AlertType, LiveAlert } from '@/data/services/liveControl.services'

const MAX_VISIBLE = 3
const AUTO_DISMISS_MS = 8000

interface AlertToastStackProps {
  alerts: LiveAlert[]
  onDismiss: (alertId: string) => void
}

interface AlertToastItemProps {
  alert: LiveAlert
  onDismiss: (alertId: string) => void
}

function getAlertTitle(type: AlertType): string {
  switch (type) {
    case 'driver_offline':
      return 'Conductor offline'
    case 'driver_stationary':
      return 'Conductor detenido'
    case 'stop_late':
      return 'Parada atrasada'
    case 'stop_failed':
      return 'Parada fallida'
    case 'route_not_started':
      return 'Ruta no iniciada'
    case 'battery_low':
      return 'Bateria baja'
    default:
      return 'Alerta'
  }
}

function AlertToastItem({ alert, onDismiss }: AlertToastItemProps): JSX.Element {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onDismiss(alert.id)
    }, AUTO_DISMISS_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [alert.id, onDismiss])

  const handleDismiss = (): void => {
    onDismiss(alert.id)
  }

  const handleCloseClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    onDismiss(alert.id)
  }

  return (
    <div
      role="alert"
      onClick={handleDismiss}
      className="w-80 cursor-pointer rounded-lg border-l-4 border-red-500 bg-white p-3 shadow-lg transition-all animate-in slide-in-from-right-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900">
            {getAlertTitle(alert.type)}
          </div>
          <div className="mt-0.5 text-xs text-gray-600 break-words">
            {alert.message}
          </div>
        </div>
        <button
          type="button"
          aria-label="Cerrar alerta"
          onClick={handleCloseClick}
          className="flex-shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export default function AlertToastStack({
  alerts,
  onDismiss,
}: AlertToastStackProps): JSX.Element | null {
  if (alerts.length === 0) return null

  const visible = [...alerts].sort((a, b) => b.ts - a.ts).slice(0, MAX_VISIBLE)

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {visible.map((alert) => (
        <AlertToastItem key={alert.id} alert={alert} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
