import { FlaskConical } from 'lucide-react'

interface DemoBadgeProps {
  variant?: 'compact' | 'banner'
  className?: string
}

/**
 * Banner/pill que se muestra cuando la org actual es de demo.
 * Hace explícito que los datos son simulados — evita que un prospecto
 * confunda este entorno con producción.
 */
export function DemoBadge({ variant = 'compact', className = '' }: DemoBadgeProps) {
  if (variant === 'banner') {
    return (
      <div
        className={`flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm ${className}`}
      >
        <FlaskConical size={16} className="shrink-0" />
        <span>
          <span className="font-semibold">Datos demo simulados.</span> Drivers, paradas y POD se generan
          automáticamente. No afecta data de clientes reales.
        </span>
      </div>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 ${className}`}
      title="Datos demo simulados — drivers, paradas y POD generados automáticamente"
    >
      <FlaskConical size={12} />
      DEMO
    </span>
  )
}
