import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'

export function WelcomePage() {
  const { user, loading, refreshMemberships } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [bootstrapping, setBootstrapping] = useState(
    typeof window !== 'undefined' && window.location.hash.includes('access_token'),
  )

  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('access_token')) return

    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    const clean = window.location.pathname + window.location.search

    ;(async () => {
      // setSession overrides any prior session in localStorage so updateUser
      // targets the invitee, not whoever was logged in before in this browser.
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token })
      }
      window.history.replaceState(null, '', clean)
      setBootstrapping(false)
    })()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirm) {
      setError('Las contrasenas no coinciden')
      return
    }
    setError('')
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }
    await refreshMemberships()
    navigate('/planner', { replace: true })
  }

  if (loading || bootstrapping) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="flex justify-center mb-6">
            <img src="/logo_vuoo.svg" alt="Vuoo" className="h-10" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Invitacion invalida</h1>
          <p className="text-sm text-gray-500">
            El enlace de invitacion expiro o ya fue utilizado. Contacta al
            administrador de tu organizacion para obtener uno nuevo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex justify-center mb-6">
          <img src="/logo_vuoo.svg" alt="Vuoo" className="h-10" />
        </div>
        <h1 className="text-xl font-semibold text-center mb-2">Bienvenido a Vuoo</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Crea una contrasena para acceder al portal
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Contrasena</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Confirmar contrasena</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Acceder al portal'}
          </button>
        </form>
      </div>
    </div>
  )
}
