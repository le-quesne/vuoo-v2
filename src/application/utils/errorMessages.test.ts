// Coverage for userMessage() — maps raw Supabase / fetch errors to
// Spanish user-friendly strings. See src/application/utils/errorMessages.ts.
import { describe, it, expect } from 'vitest'
import { userMessage } from './errorMessages'

describe('userMessage', () => {
  it('returns generic fallback for null/undefined/empty', () => {
    expect(userMessage(null)).toBe('Ocurrió un error inesperado.')
    expect(userMessage(undefined)).toBe('Ocurrió un error inesperado.')
    expect(userMessage('')).toBe('Ocurrió un error inesperado.')
  })

  it('maps network errors', () => {
    expect(userMessage('Failed to fetch')).toBe('Sin conexión. Revisa tu internet.')
    expect(userMessage('NetworkError when attempting')).toBe(
      'Sin conexión. Revisa tu internet.',
    )
  })

  it('maps auth errors (401/403/jwt/unauthorized/forbidden)', () => {
    const expected = 'Tu sesión expiró. Inicia sesión nuevamente.'
    expect(userMessage('HTTP 401')).toBe(expected)
    expect(userMessage('Forbidden')).toBe(expected)
    expect(userMessage('JWT expired')).toBe(expected)
    expect(userMessage('unauthorized request')).toBe(expected)
  })

  it('maps unique-constraint violations', () => {
    expect(userMessage('duplicate key value violates unique constraint')).toBe(
      'Ya existe un registro con esos datos.',
    )
    expect(userMessage('unique constraint "stops_pkey"')).toBe(
      'Ya existe un registro con esos datos.',
    )
  })

  it('maps RLS violations', () => {
    expect(userMessage('new row violates row-level security policy')).toBe(
      'No tienes permisos para esta acción.',
    )
    expect(userMessage('RLS check failed')).toBe('No tienes permisos para esta acción.')
  })

  it('maps missing-function / 404 / schema cache errors', () => {
    const expected =
      'Esta funcionalidad aún no está disponible. Si la necesitas, contacta a soporte.'
    expect(userMessage('Could not find the function in schema cache')).toBe(expected)
    expect(userMessage('HTTP 404')).toBe(expected)
  })

  it('maps timeout / deadline errors', () => {
    expect(userMessage('statement timeout')).toBe(
      'El servidor demoró demasiado en responder. Intenta de nuevo.',
    )
    expect(userMessage('context deadline exceeded')).toBe(
      'El servidor demoró demasiado en responder. Intenta de nuevo.',
    )
  })

  it('returns the raw message when nothing matches', () => {
    expect(userMessage('Algún otro error sin patrón conocido')).toBe(
      'Algún otro error sin patrón conocido',
    )
  })
})
