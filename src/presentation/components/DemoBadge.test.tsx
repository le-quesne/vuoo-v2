import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DemoBadge } from './DemoBadge'

describe('DemoBadge', () => {
  it('renders compact pill with DEMO label', () => {
    render(<DemoBadge />)
    expect(screen.getByText('DEMO')).toBeInTheDocument()
  })

  it('renders banner variant with explanatory text', () => {
    render(<DemoBadge variant="banner" />)
    expect(screen.getByText(/Datos demo simulados/)).toBeInTheDocument()
    expect(screen.getByText(/No afecta data de clientes reales/)).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<DemoBadge className="my-extra-class" />)
    expect(container.firstChild).toHaveClass('my-extra-class')
  })
})
