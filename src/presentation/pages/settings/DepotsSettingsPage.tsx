import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Star } from 'lucide-react'
import { useAuth } from '@/application/hooks/useAuth'
import { depotsService, type Depot } from '@/data/services/depots'
import { DepotFormModal } from '@/presentation/features/settings/components/DepotFormModal'

export function DepotsSettingsPage() {
  const { currentOrg } = useAuth()
  const [depots, setDepots] = useState<Depot[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingDepot, setEditingDepot] = useState<Depot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDepots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id])

  async function loadDepots() {
    if (!currentOrg) return setDepots([])
    const res = await depotsService.listDepots(currentOrg.id)
    if (res.success) setDepots(res.data)
    else setError(res.error)
  }

  async function handleDelete(d: Depot) {
    if (!window.confirm(`Eliminar el depot "${d.name}"?`)) return
    const res = await depotsService.deleteDepot(d.id)
    if (!res.success) {
      setError(res.error)
      return
    }
    loadDepots()
  }

  function openCreate() {
    setEditingDepot(null)
    setShowModal(true)
  }

  function openEdit(d: Depot) {
    setEditingDepot(d)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingDepot(null)
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Depots</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Centros de distribución desde donde salen y vuelven los vehículos. Se eligen al
            optimizar una ruta.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 shrink-0"
        >
          <Plus size={16} />
          Nuevo depot
        </button>
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Dirección</th>
              <th className="p-3 font-medium">Coordenadas</th>
              <th className="p-3 font-medium w-24">Default</th>
              <th className="p-3 font-medium w-20">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {depots.map((d) => (
              <tr
                key={d.id}
                onClick={() => openEdit(d)}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3 font-medium">{d.name}</td>
                <td className="p-3 text-gray-500">{d.address ?? '-'}</td>
                <td className="p-3 text-gray-500">
                  {d.lat.toFixed(4)}, {d.lng.toFixed(4)}
                </td>
                <td className="p-3">
                  {d.is_default && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      <Star size={11} className="fill-amber-500 text-amber-500" />
                      Default
                    </span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openEdit(d)
                      }}
                      className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      title="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(d)
                      }}
                      className="p-1.5 rounded-md text-red-500 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {depots.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-400">
                  No hay depots configurados todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && currentOrg && (
        <DepotFormModal
          orgId={currentOrg.id}
          depot={editingDepot ?? undefined}
          onClose={closeModal}
          onSaved={() => {
            closeModal()
            loadDepots()
          }}
        />
      )}
    </div>
  )
}
