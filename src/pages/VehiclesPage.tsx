import { useState, useEffect } from 'react'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Vehicle, FuelType } from '../types/database'

const AVATAR_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316']

function VehicleAvatar({ name, index }: { name: string; index: number }) {
  const initials = name
    .split(/[\s()]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
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

const SUB_NAV = [
  'Vehiculos',
  'Informacion de parada',
  'Pruebas de entrega',
  'Paradas completadas',
  'Paradas canceladas',
  'Configuracion',
]

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [activeSection, setActiveSection] = useState(0)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadVehicles()
  }, [])

  async function loadVehicles() {
    const { data } = await supabase
      .from('vehicles')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setVehicles(data)
  }

  const filtered = vehicles.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen">
      {/* Left sidebar nav */}
      <div className="w-60 border-r border-gray-200 bg-white p-4 flex flex-col">
        <h2 className="text-lg font-semibold mb-4">Drivers</h2>
        <nav className="space-y-0.5">
          {SUB_NAV.map((item, i) => (
            <button
              key={item}
              onClick={() => setActiveSection(i)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === i
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Vehiculos</h2>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600"
            >
              <Plus size={16} />
              Crear vehiculo
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-2">
          {filtered.length} vehiculos
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="p-3 font-medium w-8"></th>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Matricula</th>
                <th className="p-3 font-medium">Marca</th>
                <th className="p-3 font-medium">Modelo</th>
                <th className="p-3 font-medium">Precio/km ($)</th>
                <th className="p-3 font-medium">Combustible</th>
                <th className="p-3 font-medium">Consumo medio</th>
                <th className="p-3 font-medium">Capacidad (kg)</th>
                <th className="p-3 font-medium">Fecha creacion</th>
              </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr
                key={v.id}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3">
                  <VehicleAvatar name={v.name} index={i} />
                </td>
                <td className="p-3 font-medium">{v.name}</td>
                <td className="p-3 text-gray-500">{v.license_plate ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.brand ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.model ?? '-'}</td>
                <td className="p-3 text-gray-500">{v.price_per_km ?? '-'}</td>
                <td className="p-3 text-gray-500 capitalize">{v.fuel_type}</td>
                <td className="p-3 text-gray-500">
                  {v.avg_consumption ? `${v.avg_consumption}L/100km` : '-'}
                </td>
                <td className="p-3 text-gray-500">{v.capacity_weight_kg}kg</td>
                <td className="p-3 text-gray-500">
                  {new Date(v.created_at).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-gray-400">
                  No hay vehiculos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

        {showCreate && (
          <CreateVehicleModal
            onClose={() => setShowCreate(false)}
            onCreated={() => {
              setShowCreate(false)
              loadVehicles()
            }}
          />
        )}
      </div>
    </div>
  )
}

function CreateVehicleModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    license_plate: '',
    brand: '',
    model: '',
    capacity_weight_kg: 0,
    price_per_km: '',
    fuel_type: 'gasoline' as FuelType,
    avg_consumption: '',
    time_window_start: '',
    time_window_end: '',
  })

  const { user, currentOrg } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return

    await supabase.from('vehicles').insert({
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
      user_id: user.id,
      org_id: currentOrg.id,
    })
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-semibold mb-4">Nuevo vehiculo</h3>
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
            className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600"
          >
            Crear
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />
    </div>
  )
}
