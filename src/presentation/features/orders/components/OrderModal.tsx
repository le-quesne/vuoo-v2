import { useState } from 'react';
import { AlertCircle, Clock, Package, Plus, X, Trash2, User as UserIcon, MapPin, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import { AddressAutocomplete } from '@/presentation/components/AddressAutocomplete';
import { ConfirmDialog } from '@/presentation/components/ConfirmDialog';
import { deleteOrders } from '@/data/services/orders';
import type { Order, OrderItem, OrderPriority } from '@/data/types/database';
import {
  PRIORITY_LABEL,
  emptyForm,
  fromOrder,
  totalWeight,
  type OrderFormState,
} from '../utils';
import { SectionHeader, Field } from './FormUi';

/**
 * Vincula una dirección recién completada al customer (por customer_code).
 *  1. Resuelve customer_id (insert si no existe)
 *  2. Inserta un stop con esa dirección apuntando al customer
 *  3. Actualiza la orden actual para que use el stop
 *  4. Backfill: actualiza TODAS las demás órdenes del mismo org+customer_code
 *     que estén sin dirección, así los pedidos pendientes de B.&R. CIA LTDA
 *     que comparten código se completan en una sola acción.
 *
 * Errores no bloquean el save de la orden — el caller los reportará como soft fail.
 *
 * Devuelve cuántas órdenes (además de la actual) quedaron actualizadas para
 * que el caller pueda comunicarlo en UI.
 */
async function upsertCustomerStop(args: {
  orgId: string
  customerCode: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  address: string
  lat: number | null
  lng: number | null
  userId: string | null
  orderId: string
}): Promise<{ backfilledOrderCount: number }> {
  const code = args.customerCode.trim()
  if (!code) return { backfilledOrderCount: 0 }

  // 1) customer
  let customerId: string | null = null
  const existing = await supabase
    .from('customers')
    .select('id')
    .eq('org_id', args.orgId)
    .eq('customer_code', code)
    .maybeSingle()

  if (existing.data?.id) {
    customerId = existing.data.id as string
  } else {
    const ins = await supabase
      .from('customers')
      .insert({
        org_id: args.orgId,
        customer_code: code,
        name: args.customerName,
        phone: args.customerPhone,
        email: args.customerEmail,
        is_active: true,
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(ins.error?.message ?? 'no se pudo crear cliente')
    customerId = (ins.data as { id: string }).id
  }

  // 2) stop
  const stopIns = await supabase
    .from('stops')
    .insert({
      org_id: args.orgId,
      user_id: args.userId,
      customer_id: customerId,
      name: args.customerName,
      address: args.address,
      lat: args.lat,
      lng: args.lng,
      customer_name: args.customerName,
      customer_phone: args.customerPhone,
      customer_email: args.customerEmail,
      geocoding_confidence: args.lat != null && args.lng != null ? 0.8 : null,
      geocoding_provider: 'manual',
    })
    .select('id')
    .single()
  if (stopIns.error || !stopIns.data) {
    throw new Error(stopIns.error?.message ?? 'no se pudo crear stop')
  }
  const stopId = (stopIns.data as { id: string }).id

  // 3) link order actual → stop
  await supabase
    .from('orders')
    .update({
      stop_id: stopId,
      address: args.address,
      lat: args.lat,
      lng: args.lng,
      match_quality: 'high',
      match_review_needed: false,
    })
    .eq('id', args.orderId)

  // 4) backfill: cualquier OTRA orden del mismo customer_code en este org
  //    que esté sin dirección, recibe esta misma dirección + stop_id.
  //    Excluye la orden actual (ya actualizada arriba) y respeta órdenes
  //    delivered/cancelled/returned (no mutamos historia cerrada).
  const { data: backfilled, error: bfErr } = await supabase
    .from('orders')
    .update({
      stop_id: stopId,
      address: args.address,
      lat: args.lat,
      lng: args.lng,
      match_quality: 'high',
      match_review_needed: false,
    })
    .eq('org_id', args.orgId)
    .eq('customer_code', code)
    .is('address', null)
    .neq('id', args.orderId)
    .in('status', ['pending', 'scheduled'])
    .select('id')

  if (bfErr) {
    // Soft fail: la orden actual ya se guardó. Caller decide si avisar.
    return { backfilledOrderCount: 0 }
  }

  return { backfilledOrderCount: backfilled?.length ?? 0 }
}

export function OrderModal({
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Si la orden venía sin dirección (importada con solo customer_code), ofrecemos
  // guardar la dirección que el dispatcher complete también como dirección
  // permanente del cliente (crea/actualiza stop vinculado).
  const isPendingAddress = mode === 'edit' && !order?.address && !!order?.customer_code
  const [saveAsCustomerStop, setSaveAsCustomerStop] = useState<boolean>(isPendingAddress)

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
    if (!form.customer_name.trim()) {
      setError('Nombre del cliente es obligatorio')
      return
    }
    // Address solo es obligatoria si la orden NO viene del flujo "pending"
    // (importada con customer_code). Si está pending, dejamos guardar sin address.
    if (!form.address.trim() && !isPendingAddress) {
      setError('Dirección es obligatoria. Si todavía no la sabés, dejá la orden como pendiente.')
      return
    }
    setSaving(true)

    const trimmedAddress = form.address.trim()
    const payload = {
      org_id: currentOrg.id,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim() || null,
      customer_email: form.customer_email.trim() || null,
      address: trimmedAddress || null,
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

      // Si el dispatcher acaba de completar dirección de una orden pendiente y
      // marcó "guardar como dirección del cliente", upsert el stop vinculado y
      // backfilear órdenes pendientes del mismo customer_code.
      if (
        isPendingAddress &&
        saveAsCustomerStop &&
        trimmedAddress &&
        order.customer_code
      ) {
        try {
          const { backfilledOrderCount } = await upsertCustomerStop({
            orgId: currentOrg.id,
            customerCode: order.customer_code,
            customerName: form.customer_name.trim(),
            customerPhone: form.customer_phone.trim() || null,
            customerEmail: form.customer_email.trim() || null,
            address: trimmedAddress,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            userId: user?.id ?? null,
            orderId: order.id,
          })
          if (backfilledOrderCount > 0) {
            // Mensaje informativo no-bloqueante. La modal se cierra igual; el
            // contador del filtro "Sin dirección" en la página va a refrescar.
            console.info(
              `[OrderModal] backfilled ${backfilledOrderCount} pedido(s) del cliente ${order.customer_code}`,
            )
          }
        } catch (e) {
          // Falla soft: la orden se guardó OK, solo el stop falló. Avisamos pero no bloqueamos.
          console.error('upsertCustomerStop failed', e)
          setError(
            'La orden se guardó pero no pudimos vincular la dirección al cliente: ' +
              (e instanceof Error ? e.message : 'error desconocido'),
          )
        }
      }
    }
    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!order) return
    setDeleteError(null)
    const res = await deleteOrders([order.id])
    if (!res.success) {
      setDeleteError(res.error)
      return
    }
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
              {isPendingAddress && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-medium">Pedido sin dirección</div>
                      <div className="text-xs">
                        Esta orden se importó solo con código de cliente
                        {order?.customer_code ? ` (${order.customer_code})` : ''}. Completá la dirección
                        abajo o dejala en blanco para resolver después.
                      </div>
                      {order?.customer_code && (
                        <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={saveAsCustomerStop}
                            onChange={(e) => setSaveAsCustomerStop(e.target.checked)}
                            className="h-3.5 w-3.5"
                          />
                          <span>
                            Guardar también como dirección permanente del cliente (próximas órdenes
                            con código <code className="bg-amber-100 px-1 rounded">{order.customer_code}</code> se autocompletan)
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <Field label={isPendingAddress ? 'Dirección' : 'Direccion *'}>
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
          {mode === 'edit' && (
            <button
              type="button"
              onClick={() => { setDeleteError(null); setShowDeleteConfirm(true) }}
              className="p-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50"
              title="Eliminar pedido"
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

      <ConfirmDialog
        open={showDeleteConfirm}
        variant="danger"
        title="Eliminar pedido"
        message={
          `¿Eliminar el pedido ${order?.order_number}? Esta acción no se puede deshacer.` +
          (deleteError ? `\n\nError: ${deleteError}` : '')
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        confirmText="ELIMINAR"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
      />
    </div>
  )
}
