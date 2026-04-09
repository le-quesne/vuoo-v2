import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export function OnboardingPage() {
  const { user, setCurrentOrg, refreshMemberships } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setError('')

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)

    const { data: org, error: orgError } = await supabase
      .rpc('create_organization_with_owner', { p_name: name, p_slug: slug })
      .single()

    if (orgError || !org) {
      setError(orgError?.message ?? 'Error al crear organizacion')
      setLoading(false)
      return
    }

    setCurrentOrg(org as never)
    await refreshMemberships()
    navigate('/planner', { replace: true })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              VU
            </div>
          </div>
          <h1 className="text-xl font-semibold text-center mb-2">Crea tu organizacion</h1>
          <p className="text-sm text-gray-500 text-center mb-6">
            Elige un nombre para tu empresa o equipo
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Nombre de la organizacion
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi Empresa"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Continuar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
