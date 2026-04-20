import { useState } from 'react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import type { FuelType, Vehicle } from '@/data/types/database';

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

export function VehicleFormModal({
  vehicle,
  onClose,
  onSaved,
}: {
  vehicle?: Vehicle
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!vehicle

  const [form, setForm] = useState({
    name: vehicle?.name ?? '',
    license_plate: vehicle?.license_plate ?? '',
    brand: vehicle?.brand ?? '',
    model: vehicle?.model ?? '',
    capacity_weight_kg: vehicle?.capacity_weight_kg ?? 0,
    price_per_km:
      vehicle?.price_per_km != null ? String(vehicle.price_per_km) : '',
    fuel_type: (vehicle?.fuel_type ?? 'gasoline') as FuelType,
    avg_consumption:
      vehicle?.avg_consumption != null ? String(vehicle.avg_consumption) : '',
    time_window_start: vehicle?.time_window_start ?? '',
    time_window_end: vehicle?.time_window_end ?? '',
  })

  const { user, currentOrg } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return

    const payload = {
      name: form.name,
      license_plate: form.license_plate || null,
      brand: form.brand || null,
      model: form.model || null,
      capacity_weight_kg: form.capacity_weight_kg,
      price_per_km: form.price_per_km ? Number(form.price_per_km) : null,
      fuel_type: form.fuel_type,
      avg_consumption: form.avg_consumption ? Number(form.avg_consumption) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
    }

    if (isEdit && vehicle) {
      await supabase.from('vehicles').update(payload).eq('id', vehicle.id)
    } else {
      await supabase.from('vehicles').insert({
        ...payload,
        user_id: user.id,
        org_id: currentOrg.id,
      })
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-semibold mb-4">
          {isEdit ? 'Editar vehiculo' : 'Nuevo vehiculo'}
        </h3>
        <div className="space-y-3">
          <Field
            label="Nombre *"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Matricula"
              value={form.license_plate}
              onChange={(v) => setForm({ ...form, license_plate: v })}
            />
            <Field
              label="Marca"
              value={form.brand}
              onChange={(v) => setForm({ ...form, brand: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Modelo"
              value={form.model}
              onChange={(v) => setForm({ ...form, model: v })}
            />
            <Field
              label="Capacidad (kg)"
              type="number"
              value={String(form.capacity_weight_kg)}
              onChange={(v) =>
                setForm({ ...form, capacity_weight_kg: Number(v) })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Precio/km ($)"
              type="number"
              value={form.price_per_km}
              onChange={(v) => setForm({ ...form, price_per_km: v })}
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Combustible
              </label>
              <select
                value={form.fuel_type}
                onChange={(e) =>
                  setForm({ ...form, fuel_type: e.target.value as FuelType })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="gasoline">Gasolina</option>
                <option value="diesel">Diesel</option>
                <option value="electric">Electrico</option>
                <option value="hybrid">Hibrido</option>
              </select>
            </div>
          </div>
          <Field
            label="Consumo medio (L/100km)"
            type="number"
            value={form.avg_consumption}
            onChange={(v) => setForm({ ...form, avg_consumption: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hora inicio
              </label>
              <input
                type="time"
                value={form.time_window_start}
                onChange={(e) =>
                  setForm({ ...form, time_window_start: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hora fin
              </label>
              <input
                type="time"
                value={form.time_window_end}
                onChange={(e) =>
                  setForm({ ...form, time_window_end: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            {isEdit ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}

