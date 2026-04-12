import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import type { Organization } from '../../types/database'

interface MemberRow {
  id: string
  user_id: string
  role: string
  created_at: string
  email?: string
}

export function AdminOrgDetail() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const { setCurrentOrg } = useAuth()
  const [org, setOrg] = useState<Organization | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ plans: 0, stops: 0, vehicles: 0, routes: 0 })

  useEffect(() => {
    if (!orgId) return
    loadData()
  }, [orgId])

  async function loadData() {
    const [orgRes, membersRes, plansRes, stopsRes, vehiclesRes, routesRes] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId!).single(),
      supabase.from('organization_members').select('*').eq('org_id', orgId!),
      supabase.from('plans').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
      supabase.from('stops').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
      supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
      supabase.from('routes').select('id', { count: 'exact', head: true }).eq('org_id', orgId!),
    ])

    if (orgRes.data) setOrg(orgRes.data)
    if (membersRes.data) {
      // Fetch emails via admin RPC
      const { data: users } = await supabase.rpc('admin_list_users')
      const userMap = new Map((users ?? []).map((u: any) => [u.id, u.email]))
      setMembers(
        membersRes.data.map((m: any) => ({
          ...m,
          email: userMap.get(m.user_id) ?? 'Unknown',
        }))
      )
    }
    setStats({
      plans: plansRes.count ?? 0,
      stops: stopsRes.count ?? 0,
      vehicles: vehiclesRes.count ?? 0,
      routes: routesRes.count ?? 0,
    })
    setLoading(false)
  }

  function handleImpersonate() {
    if (!org) return
    setCurrentOrg(org)
    navigate('/planner')
  }

  async function handleDelete() {
    if (!org) return
    if (!confirm(`Eliminar la organizacion "${org.name}"? Esto borrara todos sus datos.`)) return
    await supabase.from('organizations').delete().eq('id', org.id)
    navigate('/admin')
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!org) return <div className="p-6 text-gray-400">Organizacion no encontrada</div>

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/admin')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} />
        Volver
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">{org.name}</h1>
          <p className="text-sm text-gray-500">{org.slug}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImpersonate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            <Eye size={16} />
            Impersonar
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
          >
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Planes', value: stats.plans },
          { label: 'Paradas', value: stats.stops },
          { label: 'Vehiculos', value: stats.vehicles },
          { label: 'Rutas', value: stats.routes },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Members */}
      <h2 className="text-lg font-medium mb-3">Miembros</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Rol</th>
              <th className="p-3 font-medium">Desde</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-gray-50">
                <td className="p-3 font-medium">{m.email}</td>
                <td className="p-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    m.role === 'owner' ? 'bg-red-100 text-red-700' :
                    m.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {m.role}
                  </span>
                </td>
                <td className="p-3 text-gray-500">
                  {new Date(m.created_at).toLocaleDateString('es-CL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
