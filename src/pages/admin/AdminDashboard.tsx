import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, MapPin, Calendar, Truck } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface OrgStat {
  org_id: string
  org_name: string
  org_slug: string
  org_created_at: string
  member_count: number
  plan_count: number
  stop_count: number
  vehicle_count: number
  route_count: number
}

export function AdminDashboard() {
  const [orgs, setOrgs] = useState<OrgStat[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.rpc('admin_get_org_stats').then(({ data }) => {
      if (data) setOrgs(data as OrgStat[])
      setLoading(false)
    })
  }, [])

  const totals = orgs.reduce(
    (acc, o) => ({
      orgs: acc.orgs + 1,
      members: acc.members + o.member_count,
      plans: acc.plans + o.plan_count,
      stops: acc.stops + o.stop_count,
      vehicles: acc.vehicles + o.vehicle_count,
    }),
    { orgs: 0, members: 0, plans: 0, stops: 0, vehicles: 0 }
  )

  const summaryCards = [
    { label: 'Organizaciones', value: totals.orgs, icon: Building2, color: 'bg-red-500' },
    { label: 'Usuarios', value: totals.members, icon: Users, color: 'bg-blue-500' },
    { label: 'Planes', value: totals.plans, icon: Calendar, color: 'bg-indigo-500' },
    { label: 'Paradas', value: totals.stops, icon: MapPin, color: 'bg-green-500' },
    { label: 'Vehiculos', value: totals.vehicles, icon: Truck, color: 'bg-orange-500' },
  ]

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-5 gap-4 mb-8">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">{card.label}</span>
              <div className={`w-7 h-7 ${card.color} rounded-lg flex items-center justify-center`}>
                <card.icon size={14} className="text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-medium mb-3">Organizaciones</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Slug</th>
              <th className="p-3 font-medium">Miembros</th>
              <th className="p-3 font-medium">Planes</th>
              <th className="p-3 font-medium">Paradas</th>
              <th className="p-3 font-medium">Vehiculos</th>
              <th className="p-3 font-medium">Rutas</th>
              <th className="p-3 font-medium">Creada</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => (
              <tr
                key={org.org_id}
                onClick={() => navigate(`/admin/orgs/${org.org_id}`)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3 font-medium">{org.org_name}</td>
                <td className="p-3 text-gray-500">{org.org_slug}</td>
                <td className="p-3 text-gray-500">{org.member_count}</td>
                <td className="p-3 text-gray-500">{org.plan_count}</td>
                <td className="p-3 text-gray-500">{org.stop_count}</td>
                <td className="p-3 text-gray-500">{org.vehicle_count}</td>
                <td className="p-3 text-gray-500">{org.route_count}</td>
                <td className="p-3 text-gray-500">
                  {new Date(org.org_created_at).toLocaleDateString('es-CL')}
                </td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-gray-400">
                  No hay organizaciones
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
