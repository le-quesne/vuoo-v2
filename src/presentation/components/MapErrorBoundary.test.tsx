// Regression: ISSUE-001 — RouteMap fail (e.g. Mapbox/WebGL init crash)
// whitescreen-eaba toda la app porque no había error boundary.
// Found by /qa on 2026-05-06
// Report: .gstack/qa-reports/qa-report-localhost-5180-2026-05-06.md
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MapErrorBoundary } from './MapErrorBoundary'

function Boom(): ReactElement {
  throw new Error('Failed to initialize WebGL')
}

describe('MapErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <MapErrorBoundary>
        <div data-testid="ok">map content</div>
      </MapErrorBoundary>,
    )
    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  it('renders Spanish fallback UI when child throws', () => {
    // Silence the expected console.error from React
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MapErrorBoundary>
        <Boom />
      </MapErrorBoundary>,
    )
    expect(screen.getByText('No se pudo cargar el mapa')).toBeInTheDocument()
    expect(screen.getByText(/WebGL/)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('renders custom fallback when provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <MapErrorBoundary fallback={<div data-testid="custom">my fallback</div>}>
        <Boom />
      </MapErrorBoundary>,
    )
    expect(screen.getByTestId('custom')).toBeInTheDocument()
    spy.mockRestore()
  })
})
