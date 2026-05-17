import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/application/lib/supabase'
import { userMessage } from '@/application/utils/errorMessages'

type Status = 'verifying' | 'ready' | 'invalid' | 'done'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let recoveryDetected = false

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryDetected = true
        setStatus('ready')
      }
    })

    // Fallback: si el hash ya se procesó antes de montar, verificamos sesión
    const timer = window.setTimeout(async () => {
      if (recoveryDetected) return
      const { data } = await supabase.auth.getSession()
      setStatus(data.session ? 'ready' : 'invalid')
    }, 800)

    return () => {
      sub.subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (updateError) {
      setError(userMessage(updateError.message))
      return
    }

    setStatus('done')
    window.setTimeout(() => {
      void supabase.auth.signOut().then(() => navigate('/login', { replace: true }))
    }, 1800)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex justify-center mb-6">
            <img src="/logo_vuoo.svg" alt="Vuoo" className="h-10" />
          </div>
          <h1 className="text-xl font-semibold text-center mb-6">
            Nueva contraseña
          </h1>

          {status === 'verifying' && (
            <div className="flex justify-center py-6">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {status === 'invalid' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
                El enlace de recuperación es inválido o ya expiró. Solicita uno
                nuevo.
              </div>
              <Link
                to="/forgot-password"
                className="block w-full text-center py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
              >
                Solicitar nuevo enlace
              </Link>
            </div>
          )}

          {status === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                {submitting ? 'Guardando...' : 'Guardar contraseña'}
              </button>
            </form>
          )}

          {status === 'done' && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
              Contraseña actualizada. Redirigiendo al inicio de sesión...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
