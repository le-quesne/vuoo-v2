/**
 * Helpers para fechas en formato YYYY-MM-DD usadas como `plan.date`,
 * `orders.requested_date`, `feedback.execution_date`, etc.
 *
 * **El problema que resuelven**: `new Date('2026-05-25')` se parsea como
 * UTC medianoche. En zonas con offset negativo (todo LATAM), formatear esa
 * Date con la zona local devuelve el día anterior. Y al revés: usar
 * `new Date().toISOString().slice(0, 10)` para "hoy" devuelve la fecha en
 * UTC, que puede ser un día distinto a la fecha local del usuario.
 *
 * Todas las fechas tipo "día calendario" en la BD (sin hora) deben generarse
 * con `todayLocalISO` / `dateToLocalISO` y mostrarse con `parseLocalDateISO`.
 */

/** Hoy en formato YYYY-MM-DD según la zona horaria local del browser/device. */
export function todayLocalISO(): string {
  return dateToLocalISO(new Date());
}

/** Convierte una `Date` a YYYY-MM-DD usando getFullYear/Month/Date (local). */
export function dateToLocalISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parsea un string YYYY-MM-DD como un `Date` en zona local (medianoche local).
 * Úsalo en vez de `new Date(isoString)` cuando el string viene de columnas
 * tipo `date` (sin hora) — `new Date(...)` lo parsearía como UTC y mostraría
 * el día anterior en LATAM.
 */
export function parseLocalDateISO(iso: string): Date {
  const [yyyy, mm, dd] = iso.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}
