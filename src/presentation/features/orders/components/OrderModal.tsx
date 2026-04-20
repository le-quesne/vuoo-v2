import { useState } from 'react';
import { AlertCircle, Clock, Package, Plus, X, Trash2, User as UserIcon, MapPin, Tag as TagIcon } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import { AddressAutocomplete } from '@/presentation/components/AddressAutocomplete';
import type { Order, OrderItem, OrderPriority } from '@/data/types/database';
import {
  PRIORITY_LABEL,
  emptyForm,
  fromOrder,
  totalWeight,
  type OrderFormState,
} from '../utils';
import { SectionHeader, Field } from './FormUi';

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
