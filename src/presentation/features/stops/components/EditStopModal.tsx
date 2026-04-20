import { useState } from 'react';
import { Trash2, User, X } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { AddressAutocomplete } from '@/presentation/components/AddressAutocomplete';
import type { Stop } from '@/data/types/database';

export function EditStopModal({
  stop,
  onClose,
  onSaved,
  onDeleted,
}: {
  stop: Stop
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [form, setForm] = useState({
    name: stop.name,
    address: stop.address ?? '',
    duration_minutes: stop.duration_minutes,
    weight_kg: stop.weight_kg != null ? String(stop.weight_kg) : '',
    time_window_start: stop.time_window_start ?? '',
    time_window_end: stop.time_window_end ?? '',
    customer_name: stop.customer_name ?? '',
    customer_phone: stop.customer_phone ?? '',
    customer_email: stop.customer_email ?? '',
    delivery_instructions: stop.delivery_instructions ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const update: Record<string, unknown> = {
      name: form.name,
      address: form.address || null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      customer_name: form.customer_name || null,
      customer_phone: form.customer_phone || null,
      customer_email: form.customer_email || null,
      delivery_instructions: form.delivery_instructions || null,
    }
    if (coords) {
      update.lat = coords.lat
      update.lng = coords.lng
    }

    await supabase.from('stops').update(update).eq('id', stop.id)
    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!confirm('Eliminar esta parada? Se eliminara tambien de todos los planes donde este asignada.')) return
    setDeleting(true)
    await supabase.from('stops').delete().eq('id', stop.id)
    setDeleting(false)
    onDeleted()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSave} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Editar parada</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
            <AddressAutocomplete
              value={form.address}
              onChange={(val) => setForm({ ...form, address: val })}
              onSelect={(address, c) => { setForm({ ...form, address }); setCoords(c) }}
              placeholder="Av. Apoquindo 7709, Las Condes, Santiago"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
              <input
                type="number"
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
              <input
                type="number"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora inicio</label>
              <input
                type="time"
                value={form.time_window_start}
                onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
              <input
                type="time"
                value={form.time_window_end}
                onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Cliente */}
          <div className="flex items-center gap-2 pt-3 mt-1 border-t border-gray-100">
            <User size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del cliente</label>
              <input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Telefono</label>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                placeholder="+56912345678"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={form.customer_email}
              onChange={(e) => setForm({ ...form, customer_email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Instrucciones de entrega</label>
            <textarea
              value={form.delivery_instructions}
              onChange={(e) => setForm({ ...form, delivery_instructions: e.target.value })}
              placeholder="Ej: Dejar en conserjeria, timbre 3B..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
            title="Eliminar"
          >
            <Trash2 size={16} />
          </button>
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
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

