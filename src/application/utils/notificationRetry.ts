// Backoff schedule para reintento de notification_logs.
//
// Llamado desde:
//   - supabase/functions/send-notification/index.ts (modo retry)
//   - tests/unit/notification-retry-backoff.test.ts
//
// Schedule (cumulativo desde el primer envío fallido):
//   intento 1 (fallo inicial) → +1m
//   intento 2 (retry #1)      → +5m
//   intento 3 (retry #2)      → null (no más reintentos)
//
// El parámetro `attempts` representa el número total de intentos YA
// hechos (incluyendo el que recién falló). Devuelve cuándo programar el
// próximo intento, o `null` si ya se agotaron.

export const MAX_NOTIFICATION_ATTEMPTS = 3

const BACKOFF_MINUTES: Record<number, number> = {
  1: 1,
  2: 5,
}

export function computeNextRetryAt(attempts: number, from: Date = new Date()): string | null {
  if (attempts >= MAX_NOTIFICATION_ATTEMPTS) return null
  const minutes = BACKOFF_MINUTES[attempts]
  if (minutes === undefined) return null
  return new Date(from.getTime() + minutes * 60_000).toISOString()
}

export function shouldRetry(attempts: number): boolean {
  return attempts < MAX_NOTIFICATION_ATTEMPTS
}
