import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { OrgRole } from '../types/database'

interface MemberRow {
  id: string
  user_id: string
  email: string
  role: OrgRole
  app_role: string
  created_at: string
}

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Miembro',
}

const ROLE_STYLES: Record<OrgRole, string> = {
  owner: 'bg-purple-50 text-purple-700',
  admin: 'bg-blue-50 text-blue-700',
  member: 'bg-gray-100 text-gray-700',
}

const AVATAR_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316']

function UserAvatar({ email, index }: { email: string; index: number }) {
  const initials = (email[0] ?? '?').toUpperCase()
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length]
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

export function UsersPage() {
  const { currentOrg, orgRole, user } = useAuth()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInvite, setShowInvite] = useState(false)

  const canManage = orgRole === 'owner' || orgRole === 'admin'

  const load = useCallback(async () => {
    if (!currentOrg) return
    setLoading(true)
    const { data, error } = await supabase.rpc('list_org_members', { p_org_id: currentOrg.id })
    if (!error && data) setMembers(data as MemberRow[])
    setLoading(false)
  }, [currentOrg])

  useEffect(() => {
    load()
  }, [load])

  async function handleRemove(member: MemberRow) {
    if (member.user_id === user?.id) {
      window.alert('No puedes eliminarte a ti mismo')
      return
    }
    if (!window.confirm(`Eliminar a ${member.email} de la organizacion?`)) return
    const { error } = await supabase.rpc('remove_org_member', { p_member_id: member.id })
    if (error) {
      window.alert(error.message)
      return
    }
    load()
  }

  const filtered = members.filter((m) =>
    m.email.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestiona quien tiene acceso al portal web
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            <Plus size={16} />
            Invitar usuario
          </button>
        )}
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Usuario</th>
              <th className="p-3 font-medium">Rol</th>
              <th className="p-3 font-medium">Ingreso</th>
              <th className="p-3 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="p-8 text-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            )}
            {!loading && filtered.map((m, i) => (
              <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar email={m.email} index={i} />
                    <div>
                      <div className="font-medium text-gray-900">{m.email}</div>
                      {m.user_id === user?.id && (
                        <div className="text-xs text-gray-400">Tu</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[m.role]}`}>
                    {ROLE_LABELS[m.role]}
                  </span>
                </td>
                <td className="p-3 text-gray-500">
                  {new Date(m.created_at).toLocaleDateString('es-CL')}
                </td>
                <td className="p-3">
                  {canManage && m.role !== 'owner' && m.user_id !== user?.id && (
                    <button
                      onClick={() => handleRemove(m)}
                      className="text-gray-400 hover:text-red-500"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-gray-400">
                  {search ? 'Sin resultados' : 'No hay usuarios'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showInvite && currentOrg && (
        <InviteUserModal
          orgId={currentOrg.id}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function InviteUserModal({
  orgId,
  onClose,
  onInvited,
}: {
  orgId: string
  onClose: () => void
  onInvited: () => void
}) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('admin')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) {
      setSaving(false)
      setError('Tu sesion ha expirado. Recarga la pagina.')
      return
    }

    const { data, error: fnError } = await supabase.functions.invoke('invite-org-user', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        email: email.trim().toLowerCase(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        org_id: orgId,
        role,
        redirect_url: `${window.location.origin}/welcome`,
      },
    })

    setSaving(false)

    if (fnError) {
      let detail = fnError.message
      try {
        const ctx = (fnError as unknown as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json()
          if (body?.error) {
            detail = body.details ? `${body.error}: ${body.details}` : body.error
          }
        }
      } catch {
        /* noop */
      }
      setError(detail)
      return
    }
    if (data?.error) {
      setError(data.error)
      return
    }
    onInvited()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">Invitar usuario</h2>
        <p className="text-sm text-gray-500 mb-4">
          Se enviara un correo de invitacion para acceder al portal
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Apellido</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Rol</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="admin">Admin</option>
              <option value="member">Miembro</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {saving ? 'Invitando...' : 'Enviar invitacion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
