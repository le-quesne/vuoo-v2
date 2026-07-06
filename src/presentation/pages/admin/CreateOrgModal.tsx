import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { userMessage } from '@/application/utils/errorMessages'
import type { Organization } from '@/data/types/database'

interface CreateOrgModalProps {
  onClose: () => void
  onCreated: (org: Organization) => void
}

type OwnerStatus = 'none' | 'attached' | 'created' | 'error'

interface CreateOrgResponse {
  org?: Organization
  owner?: { status: OwnerStatus; email?: string; error?: string; email_sent?: boolean }
  error?: string
  details?: string
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function CreateOrgModal({ onClose, onCreated }: CreateOrgModalProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Org creada pero el owner falló: dejamos continuar al detalle igualmente.
  const [createdOrg, setCreatedOrg] = useState<Organization | null>(null)
  const [ownerWarning, setOwnerWarning] = useState<string | null>(null)

  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (sessionError || !token) {
      setError('Tu sesión expiró. Recarga la página.')
      setLoading(false)
      return
    }

    const { data, error: fnError } = await supabase.functions.invoke<CreateOrgResponse>(
      'admin-create-org',
      {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          name: name.trim(),
          slug: slug.trim() || null,
          owner_email: ownerEmail.trim() || null,
          is_demo: isDemo,
        },
      }
    )

    setLoading(false)

    if (fnError) {
      let detail = fnError.message
      try {
        const ctx = (fnError as unknown as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          const parsed = (await ctx.json()) as CreateOrgResponse
          if (parsed?.error) detail = parsed.details ? `${parsed.error}: ${parsed.details}` : parsed.error
        }
      } catch {
        /* noop */
      }
      setError(userMessage(detail))
      return
    }

    if (!data?.org) {
      setError(userMessage(data?.error ?? 'Error al crear la organización'))
      return
    }

    // La org se creó. Si el owner falló (o el email de invitación no salió),
    // mostramos el aviso y dejamos continuar al detalle.
    const owner = data.owner
    if (owner?.status === 'error') {
      setCreatedOrg(data.org)
      setOwnerWarning(
        `La organización "${data.org.name}" se creó, pero no se pudo asignar el owner (${owner.email}): ${owner.error ?? 'error desconocido'}. Podés asignarlo después desde el detalle.`
      )
      return
    }
    if (owner?.status === 'created' && owner.email_sent === false) {
      setCreatedOrg(data.org)
      setOwnerWarning(
        `Se creó la organización y la cuenta de ${owner.email} como owner, pero falló el envío del email con la contraseña temporal: ${owner.error ?? 'error desconocido'}. Reseteá la contraseña del usuario para reenviarla.`
      )
      return
    }

    onCreated(data.org)
  }

  const ownerHint =
    'Se asigna como owner. Si el usuario no existe, se crea y se le envía una contraseña temporal por email.'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Nueva organización</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {ownerWarning && createdOrg ? (
          <div className="p-6 space-y-4">
            <div className="flex gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{ownerWarning}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => onCreated(createdOrg)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                Ir a la organización
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Renner"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(slugify(e.target.value))
                }}
                placeholder="renner"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Se genera del nombre. Si ya existe, se le agrega un sufijo único.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Email del owner <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="cliente@empresa.cl"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">{ownerHint}</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isDemo}
                onChange={(e) => setIsDemo(e.target.checked)}
                className="rounded border-gray-300 text-red-500 focus:ring-red-400"
              />
              Marcar como organización demo
            </label>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || name.trim().length === 0}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear organización'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
