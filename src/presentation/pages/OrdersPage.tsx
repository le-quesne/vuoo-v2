import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package,
  Plus,
  Search,
  Upload,
  Pencil,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import type { Order, OrderStatus } from '@/data/types/database'
import {
  PAGE_SIZE,
  STATUS_META,
  SOURCE_LABEL,
  formatOrderDate as formatDate,
  statusCounts,
  type StatusFilter,
} from '@/presentation/features/orders/utils'
import {
  StatusTab,
  OrderModal,
  ScheduleOrdersModal,
} from '@/presentation/features/orders/components'
import { ImportWizard } from '@/presentation/features/orders/components/ImportWizard'
import { useOneClickOptimize } from '@/presentation/features/planner/hooks'
import { ConfirmDialog } from '@/presentation/components/ConfirmDialog'
import { deleteOrders } from '@/data/services/orders'

export function OrdersPage() {
  const { currentOrg } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Order | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; isBulk: boolean } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [reloadTick, setReloadTick] = useState(0)

  const oneClick = useOneClickOptimize(currentOrg?.id ?? '')

  const handleOptimizeDay = useCallback(async () => {
    if (!currentOrg) return
    const today = new Date().toISOString().slice(0, 10)
    const res = await oneClick.execute(today)
    if (res.success) {
      const { plan, assignReport } = res.data
      alert(
        `Plan del día listo: ${assignReport.created} nuevas + ${assignReport.merged} mergeadas. Abre el plan ${plan.id} para revisar.`,
      )
      setReloadTick((t) => t + 1)
    } else {
      alert(`No se pudo optimizar: ${res.error}`)
    }
  }, [currentOrg, oneClick])

  useEffect(() => {
    if (!currentOrg) return
    let cancelled = false

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('org_id', currentOrg.id)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    q.then(({ data, count, error }) => {
      if (cancelled) return
      if (!error && data) setOrders(data as Order[])
      if (count !== null) setTotalCount(count)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [currentOrg, page, statusFilter, reloadTick])

  const reload = useCallback(() => setReloadTick((t) => t + 1), [])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    const res = await deleteOrders(deleteTarget.ids)
    if (!res.success) {
      setDeleteError(res.error)
      return
    }
    setSelected((prev) => {
      const next = new Set(prev)
      deleteTarget.ids.forEach((id) => next.delete(id))
      return next
    })
    setDeleteTarget(null)
    reload()
  }

  function changeStatusFilter(next: StatusFilter) {
    setStatusFilter(next)
    setPage(1)
    setSelected(new Set())
  }

  useEffect(() => {
    if (!currentOrg) return
    const channel = supabase
      .channel(`orders-page-${currentOrg.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `org_id=eq.${currentOrg.id}` },
        () => reload(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentOrg, reload])

  const filtered = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q) ||
        (o.customer_phone ?? '').includes(q),
    )
  }, [orders, search])

  const counts = useMemo(() => statusCounts(orders), [orders])
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selected.has(o.id))

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleSelectAll() {
    if (allFilteredSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((o) => o.id)))
  }

  const selectedOrders = useMemo(
    () => orders.filter((o) => selected.has(o.id) && o.status === 'pending'),
    [orders, selected],
  )

  return (
    <div className="flex flex-col h-screen">
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package size={22} className="text-blue-500" />
            <h1 className="text-xl font-semibold">Pedidos</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOptimizeDay}
              disabled={oneClick.isRunning}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Crea/usa plan de hoy, asigna pedidos pendientes y optimiza rutas"
            >
              <Sparkles size={16} />
              {oneClick.isRunning ? 'Optimizando...' : 'Optimizar día'}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Upload size={16} />
              Importar CSV
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
            >
              <Plus size={16} />
              Nuevo pedido
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-4 flex-wrap">
          <StatusTab label="Todos" value="all" filter={statusFilter} onClick={changeStatusFilter} count={null} />
          {(Object.keys(STATUS_META) as OrderStatus[]).map((s) => (
            <StatusTab
              key={s}
              label={STATUS_META[s].label}
              value={s}
              filter={statusFilter}
              onClick={changeStatusFilter}
              count={counts[s]}
              dot={STATUS_META[s].dot}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, direccion, numero..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
              </span>
              {selectedOrders.length > 0 && (
                <button
                  onClick={() => setShowSchedule(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600"
                >
                  <Calendar size={16} />
                  Programar seleccion
                </button>
              )}
              <button
                onClick={() => {
                  setDeleteError(null)
                  setDeleteTarget({ ids: Array.from(selected), isBulk: true })
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                <Trash2 size={16} />
                Eliminar ({selected.size})
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="p-3 font-medium">#</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Direccion</th>
                <th className="p-3 font-medium">Peso</th>
                <th className="p-3 font-medium">Ventana</th>
                <th className="p-3 font-medium">Fecha</th>
                <th className="p-3 font-medium">Origen</th>
                <th className="p-3 font-medium">Estado</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    Cargando pedidos...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">
                    No hay pedidos
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((o) => {
                  const meta = STATUS_META[o.status]
                  const checked = selected.has(o.id)
                  return (
                    <tr
                      key={o.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 group ${checked ? 'bg-blue-50/40' : ''}`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(o.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-700">{o.order_number}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-medium truncate max-w-[180px]">{o.customer_name}</span>
                          {o.customer_phone && (
                            <span className="text-xs text-gray-400">{o.customer_phone}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-gray-500 max-w-[220px] truncate">{o.address}</td>
                      <td className="p-3 text-gray-500 whitespace-nowrap">
                        {o.total_weight_kg ? `${o.total_weight_kg} kg` : '-'}
                      </td>
                      <td className="p-3 text-gray-500 whitespace-nowrap">
                        {o.time_window_start && o.time_window_end
                          ? `${o.time_window_start.slice(0, 5)}-${o.time_window_end.slice(0, 5)}`
                          : '-'}
                      </td>
                      <td className="p-3 text-gray-500 whitespace-nowrap">
                        {formatDate(o.requested_date)}
                      </td>
                      <td className="p-3 text-gray-500 text-xs">{SOURCE_LABEL[o.source]}</td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.classes}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditing(o)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Editar pedido"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteTarget({ ids: [o.id], isBulk: false })
                            }}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Eliminar pedido"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-4">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-500 px-3">
              Pagina {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <OrderModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); reload() }}
        />
      )}
      {editing && (
        <OrderModal
          mode="edit"
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
          onDeleted={() => { setEditing(null); reload() }}
        />
      )}
      <ImportWizard
        open={showImport}
        onClose={() => { setShowImport(false); reload() }}
        onComplete={(report) => {
          // Refresca la tabla en el fondo; el wizard sigue abierto mostrando
          // el resumen hasta que el usuario cierre con "Ir a pedidos".
          console.log('[ImportWizard] report recibido:', report)
          reload()
        }}
      />

      {showSchedule && (
        <ScheduleOrdersModal
          orders={selectedOrders}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => {
            setShowSchedule(false)
            setSelected(new Set())
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        variant="danger"
        title={deleteTarget?.isBulk ? `Eliminar ${deleteTarget.ids.length} pedido${deleteTarget.ids.length === 1 ? '' : 's'}` : 'Eliminar pedido'}
        message={
          deleteTarget
            ? deleteTarget.isBulk
              ? `¿Eliminar los ${deleteTarget.ids.length} pedido${deleteTarget.ids.length === 1 ? '' : 's'} seleccionado${deleteTarget.ids.length === 1 ? '' : 's'}? Esta acción no se puede deshacer.` +
                (deleteError ? `\n\nError: ${deleteError}` : '')
              : `¿Eliminar este pedido? Esta acción no se puede deshacer.` +
                (deleteError ? `\n\nError: ${deleteError}` : '')
            : ''
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmText="ELIMINAR"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}



// =============================================
// OrderModal (create + edit)



// ImportCsvModal

