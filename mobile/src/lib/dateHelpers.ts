/**
 * Helpers para fechas tipo "día calendario" (YYYY-MM-DD) en el móvil.
 *
 * Equivalente al `src/application/utils/dateHelpers.ts` del web. Cualquier
 * fecha que se compare contra `plans.date`, `plan_stops.execution_date`,
 * etc. debe generarse con `todayLocalISO()` para evitar drift cuando el
 * device está en zonas con offset negativo y son las primeras horas de la
 * madrugada UTC (o las últimas de la noche local).
 *
 * `new Date().toISOString().slice(0, 10)` da la fecha en UTC, que puede ser
 * el día siguiente al del usuario.
 */

export function todayLocalISO(): string {
  return dateToLocalISO(new Date())
}

export function dateToLocalISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
