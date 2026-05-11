import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message: string | null
}

const DEFAULT_FALLBACK = (
  <div className="w-full h-full flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg">
    <div className="text-center px-6 py-8 max-w-md">
      <div className="text-gray-700 font-semibold mb-2">No se pudo cargar el mapa</div>
      <div className="text-sm text-gray-500">
        Verifica tu conexión y que tu navegador soporte WebGL. El resto de la
        información sigue disponible en la lista de rutas.
      </div>
    </div>
  </div>
)

export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[MapErrorBoundary]', error, info)
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? DEFAULT_FALLBACK
    return this.props.children
  }
}
