import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

interface UserRow {
  id: string
  email: string
  created_at: string
  is_super_admin: boolean
  org_count: number
}

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.rpc('admin_list_users').then(({ data }) => {
      if (data) setUsers(data as UserRow[])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">Usuarios</h1>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Rol</th>
              <th className="p-3 font-medium">Organizaciones</th>
              <th className="p-3 font-medium">Registro</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="p-3 font-medium">{u.email}</td>
                <td className="p-3">
                  {u.is_super_admin ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                      Super Admin
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                      Usuario
                    </span>
                  )}
                </td>
                <td className="p-3 text-gray-500">{u.org_count}</td>
                <td className="p-3 text-gray-500">
                  {new Date(u.created_at).toLocaleDateString('es-CL')}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-400">
                  No hay usuarios
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
