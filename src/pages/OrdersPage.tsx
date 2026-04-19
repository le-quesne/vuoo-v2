import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Plus,
  Search,
  Upload,
  X,
  Trash2,
  Pencil,
  User as UserIcon,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  Tag as TagIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { MAPBOX_TOKEN } from '@/application/lib/mapbox'
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderSource,
  OrderPriority,
  Plan,
} from '@/data/types/database'

const PAGE_SIZE = 25

type StatusFilter = 'all' | OrderStatus

const STATUS_META: Record<OrderStatus, { label: string; classes: string; dot: string }> = {
  pending:    { label: 'Pendiente',  classes: 'bg-amber-50 text-amber-700 border-amber-200',   dot: 'bg-amber-400' },
  scheduled:  { label: 'Programado', classes: 'bg-blue-50 text-blue-700 border-blue-200',      dot: 'bg-blue-400' },
  in_transit: { label: 'En ruta',    classes: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-400' },
  delivered:  { label: 'Entregado',  classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  failed:     { label: 'Fallido',    classes: 'bg-red-50 text-red-700 border-red-200',          dot: 'bg-red-400' },
  cancelled:  { label: 'Cancelado',  classes: 'bg-gray-100 text-gray-600 border-gray-200',      dot: 'bg-gray-400' },
  returned:   { label: 'Devuelto',   classes: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-400' },
}

const SOURCE_LABEL: Record<OrderSource, string> = {
  manual:   'Manual',
  csv:      'CSV',
  shopify:  'Shopify',
  vtex:     'VTEX',
  api:      'API',
  whatsapp: 'WhatsApp',
}

const PRIORITY_LABEL: Record<OrderPriority, string> = {
  urgent: 'Urgente',
  high:   'Alta',
  normal: 'Normal',
  low:    'Baja',
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

function statusCounts(orders: Order[]) {
  const counts: Record<OrderStatus, number> = {
    pending: 0, scheduled: 0, in_transit: 0, delivered: 0, failed: 0, cancelled: 0, returned: 0,
  }
  for (const o of orders) counts[o.status] += 1
  return counts
}

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

  const [reloadTick, setReloadTick] = useState(0)

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

          {selectedOrders.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selectedOrders.length} seleccionado{selectedOrders.length === 1 ? '' : 's'}
              </span>
              <button
                onClick={() => setShowSchedule(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600"
              >
                <Calendar size={16} />
                Programar seleccion
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
                        <button
                          onClick={() => setEditing(o)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Pencil size={14} />
                        </button>
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
      {showImport && (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); reload() }}
        />
      )}
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
    </div>
  )
}

// =============================================
// StatusTab
// =============================================

function StatusTab({
  label,
  value,
  filter,
  onClick,
  count,
  dot,
}: {
  label: string
  value: StatusFilter
  filter: StatusFilter
  onClick: (v: StatusFilter) => void
  count: number | null
  dot?: string
}) {
  const active = filter === value
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {dot && !active && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      <span>{label}</span>
      {count !== null && (
        <span className={`${active ? 'text-blue-100' : 'text-gray-400'}`}>{count}</span>
      )}
    </button>
  )
}

// =============================================
// AddressAutocomplete (local copy)
// =============================================

function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
}: {
  value: string
  onChange: (val: string) => void
  onSelect: (address: string, coords: { lat: number; lng: number }) => void
  placeholder?: string
}) {
  const [suggestions, setSuggestions] = useState<{ place_name: string; center: [number, number] }[]>([])
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(timerRef.current)
    if (query.length < 3) { setSuggestions([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=5&language=es`,
        )
        const data = await res.json()
        setSuggestions(data.features ?? [])
        setOpen(true)
      } catch { setSuggestions([]) }
    }, 300)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); fetchSuggestions(e.target.value) }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const [lng, lat] = s.center
                onSelect(s.place_name, { lat, lng })
                setOpen(false)
                setSuggestions([])
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-start gap-2"
            >
              <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
              <span className="truncate">{s.place_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================
// OrderModal (create + edit)
// =============================================

type OrderFormState = {
  customer_name: string
  customer_phone: string
  customer_email: string
  address: string
  delivery_instructions: string
  items: OrderItem[]
  service_duration_minutes: number
  time_window_start: string
  time_window_end: string
  requested_date: string
  priority: OrderPriority
  requires_signature: boolean
  requires_photo: boolean
  internal_notes: string
  tags: string[]
}

function emptyForm(): OrderFormState {
  return {
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    address: '',
    delivery_instructions: '',
    items: [],
    service_duration_minutes: 15,
    time_window_start: '',
    time_window_end: '',
    requested_date: new Date().toISOString().slice(0, 10),
    priority: 'normal',
    requires_signature: false,
    requires_photo: true,
    internal_notes: '',
    tags: [],
  }
}

function fromOrder(o: Order): OrderFormState {
  return {
    customer_name: o.customer_name,
    customer_phone: o.customer_phone ?? '',
    customer_email: o.customer_email ?? '',
    address: o.address,
    delivery_instructions: o.delivery_instructions ?? '',
    items: o.items ?? [],
    service_duration_minutes: o.service_duration_minutes,
    time_window_start: o.time_window_start?.slice(0, 5) ?? '',
    time_window_end: o.time_window_end?.slice(0, 5) ?? '',
    requested_date: o.requested_date ?? '',
    priority: o.priority,
    requires_signature: o.requires_signature,
    requires_photo: o.requires_photo,
    internal_notes: o.internal_notes ?? '',
    tags: o.tags ?? [],
  }
}

function totalWeight(items: OrderItem[]): number {
  return items.reduce((sum, it) => sum + (it.weight_kg ?? 0) * it.quantity, 0)
}

function OrderModal({
  mode,
  order,
  onClose,
  onSaved,
  onDeleted,
}: {
  mode: 'create' | 'edit'
  order?: Order
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}) {
  const { user, currentOrg } = useAuth()
  const [form, setForm] = useState<OrderFormState>(order ? fromOrder(order) : emptyForm())
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    order?.lat != null && order?.lng != null ? { lat: order.lat, lng: order.lng } : null,
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  function updateItem(index: number, patch: Partial<OrderItem>) {
    const next = form.items.slice()
    next[index] = { ...next[index], ...patch }
    setForm({ ...form, items: next })
  }
  function addItem() {
    setForm({ ...form, items: [...form.items, { name: '', quantity: 1, weight_kg: 0 }] })
  }
  function removeItem(index: number) {
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) })
  }

  function addTag() {
    const t = tagDraft.trim()
    if (!t || form.tags.includes(t)) return
    setForm({ ...form, tags: [...form.tags, t] })
    setTagDraft('')
  }
  function removeTag(t: string) {
    setForm({ ...form, tags: form.tags.filter((x) => x !== t) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentOrg) return
    setError(null)
    if (!form.customer_name.trim() || !form.address.trim()) {
      setError('Nombre del cliente y direccion son obligatorios')
      return
    }
    setSaving(true)

    const payload = {
      org_id: currentOrg.id,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      customer_email: form.customer_email.trim() || null,
      address: form.address.trim(),
      lat: coords?.lat ?? order?.lat ?? null,
      lng: coords?.lng ?? order?.lng ?? null,
      delivery_instructions: form.delivery_instructions.trim() || null,
      items: form.items.filter((it) => it.name.trim()),
      total_weight_kg: totalWeight(form.items.filter((it) => it.name.trim())),
      service_duration_minutes: form.service_duration_minutes,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      requested_date: form.requested_date || null,
      priority: form.priority,
      requires_signature: form.requires_signature,
      requires_photo: form.requires_photo,
      internal_notes: form.internal_notes.trim() || null,
      tags: form.tags,
    }

    if (mode === 'create') {
      const { data: numData, error: numErr } = await supabase.rpc('generate_order_number', {
        p_org_id: currentOrg.id,
      })
      if (numErr) {
        setError(numErr.message)
        setSaving(false)
        return
      }
      const { error: insErr } = await supabase.from('orders').insert({
        ...payload,
        order_number: numData as string,
        source: 'manual',
        status: 'pending',
        created_by: user?.id ?? null,
      })
      if (insErr) {
        setError(insErr.message)
        setSaving(false)
        return
      }
    } else if (order) {
      const { error: updErr } = await supabase.from('orders').update(payload).eq('id', order.id)
      if (updErr) {
        setError(updErr.message)
        setSaving(false)
        return
      }
    }
    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!order) return
    if (order.status !== 'pending') {
      alert('Solo se pueden eliminar pedidos en estado pendiente. Cancela el pedido en su lugar.')
      return
    }
    if (!confirm('Eliminar este pedido? Esta accion no se puede deshacer.')) return
    setDeleting(true)
    const { error: delErr } = await supabase.from('orders').delete().eq('id', order.id)
    setDeleting(false)
    if (delErr) { setError(delErr.message); return }
    onDeleted?.()
  }

  const weight = totalWeight(form.items)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-blue-500" />
            <h3 className="text-lg font-semibold">
              {mode === 'create' ? 'Nuevo pedido' : `Pedido ${order?.order_number}`}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cliente */}
          <section>
            <SectionHeader icon={<UserIcon size={14} />} label="Cliente" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre *">
                <input
                  required
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Telefono">
                <input
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                  placeholder="+56912345678"
                  className="input"
                />
              </Field>
              <Field label="Email" full>
                <input
                  type="email"
                  value={form.customer_email}
                  onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
                  className="input"
                />
              </Field>
            </div>
          </section>

          {/* Destino */}
          <section>
            <SectionHeader icon={<MapPin size={14} />} label="Destino" />
            <div className="space-y-3">
              <Field label="Direccion *">
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => setForm({ ...form, address: v })}
                  onSelect={(address, c) => { setForm({ ...form, address }); setCoords(c) }}
                  placeholder="Av. Providencia 1234, Santiago"
                />
              </Field>
              <Field label="Instrucciones de entrega">
                <textarea
                  value={form.delivery_instructions}
                  onChange={(e) => setForm({ ...form, delivery_instructions: e.target.value })}
                  rows={2}
                  placeholder="Ej: Timbre 3B, dejar con conserje..."
                  className="input resize-none"
                />
              </Field>
            </div>
          </section>

          {/* Items */}
          <section>
            <SectionHeader icon={<Package size={14} />} label="Contenido" />
            <div className="space-y-2">
              {form.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_90px_32px] gap-2 items-center">
                  <input
                    value={it.name}
                    onChange={(e) => updateItem(i, { name: e.target.value })}
                    placeholder="Descripcion"
                    className="input"
                  />
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                    placeholder="Cant"
                    className="input"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={it.weight_kg ?? ''}
                    onChange={(e) => updateItem(i, { weight_kg: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="kg"
                    className="input"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-600"
              >
                <Plus size={14} /> Agregar item
              </button>
              <div className="text-xs text-gray-500 pt-1">
                Peso total: <span className="font-medium">{weight.toFixed(2)} kg</span>
              </div>
            </div>
          </section>

          {/* Entrega */}
          <section>
            <SectionHeader icon={<Clock size={14} />} label="Entrega" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha deseada">
                <input
                  type="date"
                  value={form.requested_date}
                  onChange={(e) => setForm({ ...form, requested_date: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Duracion (min)">
                <input
                  type="number"
                  min="1"
                  value={form.service_duration_minutes}
                  onChange={(e) =>
                    setForm({ ...form, service_duration_minutes: Number(e.target.value) || 15 })
                  }
                  className="input"
                />
              </Field>
              <Field label="Hora inicio">
                <input
                  type="time"
                  value={form.time_window_start}
                  onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Hora fin">
                <input
                  type="time"
                  value={form.time_window_end}
                  onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                  className="input"
                />
              </Field>
              <Field label="Prioridad" full>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as OrderPriority })}
                  className="input"
                >
                  {(Object.keys(PRIORITY_LABEL) as OrderPriority[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Tags */}
          <section>
            <SectionHeader icon={<TagIcon size={14} />} label="Etiquetas" />
            <div className="flex flex-wrap items-center gap-1.5">
              {form.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full"
                >
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="hover:text-red-500">
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="fragil, frio, VIP..."
                className="flex-1 min-w-[120px] px-2 py-1 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </section>

          {/* Opciones */}
          <section>
            <SectionHeader label="Opciones" />
            <div className="flex flex-col gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.requires_photo}
                  onChange={(e) => setForm({ ...form, requires_photo: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Requiere foto al entregar
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.requires_signature}
                  onChange={(e) => setForm({ ...form, requires_signature: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Requiere firma al entregar
              </label>
            </div>
            <div className="mt-3">
              <Field label="Notas internas">
                <textarea
                  value={form.internal_notes}
                  onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                  rows={2}
                  placeholder="Notas privadas del equipo (no las ve el cliente)"
                  className="input resize-none"
                />
              </Field>
            </div>
          </section>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          {mode === 'edit' && order?.status === 'pending' && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="p-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : mode === 'create' ? 'Crear pedido' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}

function SectionHeader({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      {icon && <span className="text-gray-400">{icon}</span>}
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

// =============================================
// ScheduleOrdersModal — program selected orders into a plan
// =============================================

function ScheduleOrdersModal({
  orders,
  onClose,
  onScheduled,
}: {
  orders: Order[]
  onClose: () => void
  onScheduled: () => void
}) {
  const { user, currentOrg } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<Plan[]>([])
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [planId, setPlanId] = useState<string>('')
  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanDate, setNewPlanDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrg) return
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('plans')
      .select('*')
      .eq('org_id', currentOrg.id)
      .gte('date', today)
      .order('date', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setPlans(data as Plan[])
          if (data.length > 0) setPlanId((data[0] as Plan).id)
          else setMode('new')
        }
      })
  }, [currentOrg])

  async function handleSchedule() {
    if (!currentOrg || !user) return
    setError(null)
    setSaving(true)

    let targetPlanId = planId
    if (mode === 'new') {
      if (!newPlanName.trim()) {
        setError('Dale un nombre al plan')
        setSaving(false)
        return
      }
      const { data: planData, error: planErr } = await supabase
        .from('plans')
        .insert({
          name: newPlanName.trim(),
          date: newPlanDate,
          user_id: user.id,
          org_id: currentOrg.id,
        })
        .select()
        .single()
      if (planErr || !planData) {
        setError(planErr?.message ?? 'No se pudo crear el plan')
        setSaving(false)
        return
      }
      targetPlanId = (planData as Plan).id
    }

    if (!targetPlanId) {
      setError('Selecciona un plan')
      setSaving(false)
      return
    }

    for (const order of orders) {
      let stopId = order.stop_id
      if (!stopId) {
        let stopQuery = supabase
          .from('stops')
          .select('id')
          .eq('org_id', currentOrg.id)
          .limit(1)
        if (order.lat != null && order.lng != null) {
          stopQuery = stopQuery
            .gte('lat', order.lat - 0.0005)
            .lte('lat', order.lat + 0.0005)
            .gte('lng', order.lng - 0.0005)
            .lte('lng', order.lng + 0.0005)
        } else {
          stopQuery = stopQuery.eq('address', order.address)
        }
        const { data: existingStop } = await stopQuery.maybeSingle()

        if (existingStop) {
          stopId = (existingStop as { id: string }).id
        } else {
          const { data: newStop, error: stopErr } = await supabase
            .from('stops')
            .insert({
              name: order.customer_name,
              address: order.address,
              lat: order.lat,
              lng: order.lng,
              duration_minutes: order.service_duration_minutes,
              weight_kg: order.total_weight_kg || null,
              time_window_start: order.time_window_start,
              time_window_end: order.time_window_end,
              customer_name: order.customer_name,
              customer_phone: order.customer_phone,
              customer_email: order.customer_email,
              delivery_instructions: order.delivery_instructions,
              user_id: user.id,
              org_id: currentOrg.id,
            })
            .select()
            .single()
          if (stopErr || !newStop) {
            setError(`Error creando parada para ${order.customer_name}: ${stopErr?.message}`)
            setSaving(false)
            return
          }
          stopId = (newStop as { id: string }).id
        }
      }

      const { data: planStop, error: psErr } = await supabase
        .from('plan_stops')
        .insert({
          stop_id: stopId,
          plan_id: targetPlanId,
          status: 'pending',
          delivery_attempts: 0,
          org_id: currentOrg.id,
        })
        .select()
        .single()
      if (psErr || !planStop) {
        setError(`Error asignando ${order.order_number}: ${psErr?.message}`)
        setSaving(false)
        return
      }

      const { error: upErr } = await supabase
        .from('orders')
        .update({
          stop_id: stopId,
          plan_stop_id: (planStop as { id: string }).id,
          status: 'scheduled',
        })
        .eq('id', order.id)
      if (upErr) {
        setError(`Error actualizando ${order.order_number}: ${upErr.message}`)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onScheduled()
    navigate(`/planner/${targetPlanId}`)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">Programar {orders.length} pedido{orders.length === 1 ? '' : 's'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('existing')}
              disabled={plans.length === 0}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                mode === 'existing' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } disabled:opacity-50`}
            >
              Plan existente
            </button>
            <button
              onClick={() => setMode('new')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                mode === 'new' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              Nuevo plan
            </button>
          </div>

          {mode === 'existing' && (
            <Field label="Plan">
              <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="input">
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatDate(p.date)}
                  </option>
                ))}
                {plans.length === 0 && <option value="">Sin planes futuros</option>}
              </select>
            </Field>
          )}

          {mode === 'new' && (
            <div className="space-y-3">
              <Field label="Nombre del plan">
                <input
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="Ej: Lunes AM"
                  className="input"
                />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={newPlanDate}
                  onChange={(e) => setNewPlanDate(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-h-40 overflow-y-auto space-y-1">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between">
                <span className="font-mono">{o.order_number}</span>
                <span className="truncate max-w-[220px]">{o.customer_name}</span>
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSchedule}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? 'Programando...' : 'Programar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// ImportCsvModal
// =============================================

type CsvRow = {
  raw: Record<string, string>
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  address: string
  total_weight_kg: number
  time_window_start: string | null
  time_window_end: string | null
  requested_date: string | null
  internal_notes: string | null
  lat: number | null
  lng: number | null
  error?: string
  warning?: string
  geocoded?: boolean
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim() })
    return row
  })
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=1&language=es`,
    )
    const data = await res.json()
    const feat = data.features?.[0]
    if (!feat) return null
    const [lng, lat] = feat.center
    return { lat, lng }
  } catch {
    return null
  }
}

function ImportCsvModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { user, currentOrg } = useAuth()
  const [rows, setRows] = useState<CsvRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setParsing(true)
    setError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)

      const normalized: CsvRow[] = parsed.map((r) => {
        const name = r.nombre_cliente || r.cliente || r.customer_name || r.nombre || ''
        const address = r.direccion || r.address || ''
        const phone = r.telefono || r.phone || r.customer_phone || ''
        const email = r.email || r.customer_email || ''
        const weightStr = r.peso_kg || r.peso || r.weight_kg || '0'
        const startRaw = r.ventana_inicio || r.hora_inicio || r.time_window_start || ''
        const endRaw = r.ventana_fin || r.hora_fin || r.time_window_end || ''
        const dateRaw = r.fecha || r.fecha_entrega || r.requested_date || ''
        const notes = r.notas || r.items || r.internal_notes || ''

        let err: string | undefined
        if (!name.trim()) err = 'Falta nombre de cliente'
        else if (!address.trim()) err = 'Falta direccion'

        return {
          raw: r,
          customer_name: name.trim(),
          customer_phone: phone.trim() || null,
          customer_email: email.trim() || null,
          address: address.trim(),
          total_weight_kg: Number(weightStr.replace(',', '.')) || 0,
          time_window_start: startRaw.trim() || null,
          time_window_end: endRaw.trim() || null,
          requested_date: dateRaw.trim() || null,
          internal_notes: notes.trim() || null,
          lat: null,
          lng: null,
          error: err,
        }
      })

      // Geocode valid rows (limit concurrency)
      const toGeocode = normalized.filter((r) => !r.error)
      for (let i = 0; i < toGeocode.length; i++) {
        const r = toGeocode[i]
        const coords = await geocode(r.address)
        if (coords) {
          r.lat = coords.lat
          r.lng = coords.lng
          r.geocoded = true
        } else {
          r.warning = 'No se pudo geocodificar la direccion'
        }
      }

      setRows(normalized)
    } catch (e) {
      setError((e as Error).message)
    }
    setParsing(false)
  }

  async function handleImport() {
    if (!currentOrg || !user) return
    const toImport = rows.filter((r) => !r.error)
    if (toImport.length === 0) return

    setImporting(true)
    setError(null)

    for (const r of toImport) {
      const { data: numData, error: numErr } = await supabase.rpc('generate_order_number', {
        p_org_id: currentOrg.id,
      })
      if (numErr) { setError(numErr.message); setImporting(false); return }

      const { error: insErr } = await supabase.from('orders').insert({
        org_id: currentOrg.id,
        order_number: numData as string,
        source: 'csv',
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_email: r.customer_email,
        address: r.address,
        lat: r.lat,
        lng: r.lng,
        total_weight_kg: r.total_weight_kg,
        time_window_start: r.time_window_start,
        time_window_end: r.time_window_end,
        requested_date: r.requested_date,
        internal_notes: r.internal_notes,
        status: 'pending',
        created_by: user.id,
      })
      if (insErr) { setError(insErr.message); setImporting(false); return }
    }

    setImporting(false)
    onImported()
  }

  function downloadTemplate() {
    const csv =
      'nombre_cliente,telefono,email,direccion,peso_kg,ventana_inicio,ventana_fin,fecha,notas\n' +
      'Juan Perez,+56912345678,juan@example.cl,Av. Providencia 1234 Santiago,3.5,09:00,12:00,2026-04-12,Fragil'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_pedidos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const valid = rows.filter((r) => !r.error).length
  const invalid = rows.filter((r) => r.error).length
  const warnings = rows.filter((r) => r.warning && !r.error).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-500" />
            <h3 className="text-lg font-semibold">Importar pedidos desde CSV</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {rows.length === 0 && (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg py-12 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
              >
                <Upload size={28} className="mx-auto text-gray-400 mb-2" />
                <div className="text-sm font-medium text-gray-700">Selecciona un archivo CSV</div>
                <div className="text-xs text-gray-400 mt-1">O arrastra aqui (proximamente)</div>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
              <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <div className="font-medium text-gray-700 mb-1">Columnas esperadas:</div>
                <code className="block text-[11px] text-gray-600">
                  nombre_cliente, telefono, email, direccion, peso_kg, ventana_inicio, ventana_fin, fecha, notas
                </code>
              </div>
              <button
                onClick={downloadTemplate}
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                Descargar plantilla CSV
              </button>
            </>
          )}

          {parsing && <div className="text-center text-sm text-gray-500 py-8">Procesando y geocodificando...</div>}

          {rows.length > 0 && !parsing && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <CheckCircle2 size={14} />
                  {valid} validos
                </span>
                {invalid > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600">
                    <AlertCircle size={14} />
                    {invalid} con errores
                  </span>
                )}
                {warnings > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600">
                    <AlertCircle size={14} />
                    {warnings} advertencias
                  </span>
                )}
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="p-2 text-left font-medium">#</th>
                      <th className="p-2 text-left font-medium">Cliente</th>
                      <th className="p-2 text-left font-medium">Direccion</th>
                      <th className="p-2 text-left font-medium">Peso</th>
                      <th className="p-2 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-2 text-gray-400">{i + 1}</td>
                        <td className="p-2 truncate max-w-[150px]">{r.customer_name || '-'}</td>
                        <td className="p-2 truncate max-w-[220px] text-gray-500">{r.address || '-'}</td>
                        <td className="p-2 text-gray-500">{r.total_weight_kg || '-'}</td>
                        <td className="p-2">
                          {r.error ? (
                            <span className="text-red-600">{r.error}</span>
                          ) : r.warning ? (
                            <span className="text-amber-600">{r.warning}</span>
                          ) : (
                            <span className="text-emerald-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleImport}
              disabled={importing || valid === 0}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {importing ? 'Importando...' : `Importar ${valid} pedido${valid === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
