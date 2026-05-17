import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/application/lib/supabase'
import { userMessage } from '@/application/utils/errorMessages'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setSubmitting(false)
    if (resetError) {
      setError(userMessage(resetError.message))
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex justify-center mb-6">
            <img src="/logo_vuoo.svg" alt="Vuoo" className="h-10" />
          </div>
          <h1 className="text-xl font-semibold text-center mb-2">
            Recuperar contraseña
          </h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Te enviaremos un enlace para restablecerla.
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                Si <span className="font-medium">{email}</span> tiene una cuenta,
                recibirás un correo con el enlace para restablecer tu contraseña.
                Revisa también tu carpeta de spam.
              </div>
              <Link
                to="/login"
                className="block w-full text-center py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
              >
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  {submitting ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>

              <Link
                to="/login"
                className="block w-full text-center text-sm text-blue-500 mt-4 hover:underline"
              >
                Volver al inicio de sesión
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
