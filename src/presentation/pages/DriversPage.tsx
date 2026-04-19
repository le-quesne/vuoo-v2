import { useState, useEffect } from 'react'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import type { Driver, DriverStatus, Vehicle } from '@/data/types/database'
import {
  AvailabilityBadge,
  DriverAvatar,
  DriverStatusBadge as StatusBadge,
  LicenseBadge,
} from '@/presentation/features/drivers/components'

const WEEK_DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
]

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadDrivers()
    loadVehicles()
  }, [])

  // Realtime: cuando un chofer cambia su availability desde la app móvil
  // (o cuando un admin edita cualquier campo), refrescar la tabla sin
  // esperar a un refresh manual.
  useEffect(() => {
    const channel = supabase
      .channel('drivers-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drivers' },
        () => loadDrivers(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function loadDrivers() {
    const { data } = await supabase
      .from('drivers')
      .select('*, default_vehicle:vehicles(*)')
      .order('created_at', { ascending: false })
    if (data) setDrivers(data as Driver[])
  }

  async function loadVehicles() {
    const { data } = await supabase.from('vehicles').select('*').order('name')
    if (data) setVehicles(data)
  }

  async function handleDelete(driver: Driver) {
    if (!window.confirm(`Eliminar al conductor ${driver.first_name} ${driver.last_name}?`)) return
    await supabase.from('drivers').delete().eq('id', driver.id)
    loadDrivers()
  }

  const filtered = drivers.filter((d) =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen">
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">Conductores</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
            >
              <Plus size={16} />
              Crear conductor
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-400 mb-2">
          {filtered.length} conductores
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                <th className="p-3 font-medium w-8"></th>
                <th className="p-3 font-medium">Nombre</th>
                <th className="p-3 font-medium">Telefono</th>
                <th className="p-3 font-medium">Vehiculo asignado</th>
                <th className="p-3 font-medium">Disponibilidad</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Licencia</th>
                <th className="p-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d, i) => (
                <tr
                  key={d.id}
                  className="border-b border-gray-50 hover:bg-gray-50"
                >
                  <td className="p-3">
                    <DriverAvatar first={d.first_name} last={d.last_name} index={i} />
                  </td>
                  <td className="p-3 font-medium">
                    {d.first_name} {d.last_name}
                  </td>
                  <td className="p-3 text-gray-500">{d.phone ?? '-'}</td>
                  <td className="p-3 text-gray-500">{d.default_vehicle?.name ?? '-'}</td>
                  <td className="p-3">
                    <AvailabilityBadge availability={d.availability ?? 'off_shift'} />
                  </td>
                  <td className="p-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="p-3">
                    <LicenseBadge expiry={d.license_expiry} />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditing(d)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(d)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    No hay conductores
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <DriverModal
            vehicles={vehicles}
            onClose={() => setShowCreate(false)}
            onSaved={() => {
              setShowCreate(false)
              loadDrivers()
            }}
          />
        )}

        {editing && (
          <DriverModal
            driver={editing}
            vehicles={vehicles}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              loadDrivers()
            }}
          />
        )}
      </div>
    </div>
  )
}

function DriverModal({
  driver,
  vehicles,
  onClose,
  onSaved,
}: {
  driver?: Driver
  vehicles: Vehicle[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    first_name: driver?.first_name ?? '',
    last_name: driver?.last_name ?? '',
    phone: driver?.phone ?? '',
    email: driver?.email ?? '',
    license_number: driver?.license_number ?? '',
    license_expiry: driver?.license_expiry ?? '',
    national_id: driver?.national_id ?? '',
    default_vehicle_id: driver?.default_vehicle_id ?? '',
    time_window_start: driver?.time_window_start ?? '',
    time_window_end: driver?.time_window_end ?? '',
    working_days: driver?.working_days ?? [1, 2, 3, 4, 5],
    status: driver?.status ?? ('active' as DriverStatus),
    notes: driver?.notes ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { user, currentOrg } = useAuth()
  const isEditing = Boolean(driver)

  function toggleDay(day: number) {
    setForm({
      ...form,
      working_days: form.working_days.includes(day)
        ? form.working_days.filter((d) => d !== day)
        : [...form.working_days, day].sort(),
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return
    if (submitting) return

    setErrorMsg(null)
    setSubmitting(true)

    try {
      if (driver) {
        // EDITAR: update directo, sin tocar user_id ni email
        const updatePayload = {
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone || null,
          license_number: form.license_number || null,
          license_expiry: form.license_expiry || null,
          national_id: form.national_id || null,
          default_vehicle_id: form.default_vehicle_id || null,
          time_window_start: form.time_window_start || null,
          time_window_end: form.time_window_end || null,
          working_days: form.working_days,
          status: form.status,
          notes: form.notes || null,
        }
        const { error } = await supabase
          .from('drivers')
          .update(updatePayload)
          .eq('id', driver.id)
        if (error) throw error
        window.alert('Conductor actualizado correctamente')
      } else {
        // CREAR: invitar al conductor via edge function
        const trimmedEmail = form.email.trim()
        if (!trimmedEmail) {
          throw new Error('El email es obligatorio para crear un conductor')
        }

        const driverData = {
          phone: form.phone || null,
          license_number: form.license_number || null,
          license_expiry: form.license_expiry || null,
          national_id: form.national_id || null,
          default_vehicle_id: form.default_vehicle_id || null,
          time_window_start: form.time_window_start || null,
          time_window_end: form.time_window_end || null,
          working_days: form.working_days,
          status: form.status,
          notes: form.notes || null,
        }

        // Refresh session to ensure the access token is valid before calling the edge function
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError || !session?.access_token) {
          throw new Error('Tu sesión ha expirado. Por favor recarga la página e inicia sesión nuevamente.')
        }

        const { data, error } = await supabase.functions.invoke('invite-driver', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: {
            email: trimmedEmail,
            first_name: form.first_name,
            last_name: form.last_name,
            org_id: currentOrg.id,
            driver_data: driverData,
          },
        })

        if (error) throw error
        if (data?.error) throw new Error(data.error)

        if (data?.email_sent) {
          window.alert(
            `Conductor creado. Se enviaron las credenciales por email a ${trimmedEmail}.`,
          )
        } else {
          window.alert(
            `Conductor creado, pero no se pudo enviar el email (${data?.email_error ?? 'error desconocido'}).\n\nEntrega estas credenciales manualmente:\n\nEmail: ${trimmedEmail}\nContrasena temporal: ${data?.temp_password}`,
          )
        }
      }

      onSaved()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error al guardar el conductor'
      setErrorMsg(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-semibold mb-4">
          {driver ? 'Editar conductor' : 'Nuevo conductor'}
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Nombre *"
              value={form.first_name}
              onChange={(v) => setForm({ ...form, first_name: v })}
              required
            />
            <Field
              label="Apellido *"
              value={form.last_name}
              onChange={(v) => setForm({ ...form, last_name: v })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Telefono"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
            <Field
              label={isEditing ? 'Email' : 'Email *'}
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              required={!isEditing}
              disabled={isEditing}
            />
          </div>
          {!isEditing && (
            <p className="text-xs text-gray-400 -mt-1">
              Se enviara una invitacion por email al conductor para activar su cuenta.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Numero licencia"
              value={form.license_number}
              onChange={(v) => setForm({ ...form, license_number: v })}
            />
            <Field
              label="Vencimiento licencia"
              type="date"
              value={form.license_expiry}
              onChange={(v) => setForm({ ...form, license_expiry: v })}
            />
          </div>
          <Field
            label="RUT"
            value={form.national_id}
            onChange={(v) => setForm({ ...form, national_id: v })}
          />
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Vehiculo asignado
            </label>
            <select
              value={form.default_vehicle_id}
              onChange={(e) => setForm({ ...form, default_vehicle_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Sin asignar</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hora inicio
              </label>
              <input
                type="time"
                value={form.time_window_start}
                onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
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
                onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Dias laborales
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEK_DAYS.map((d) => {
                const active = form.working_days.includes(d.value)
                return (
                  <label
                    key={d.value}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleDay(d.value)}
                      className="hidden"
                    />
                    {d.label}
                  </label>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as DriverStatus })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="on_leave">Con permiso</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Notas
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? driver
                ? 'Guardando...'
                : 'Invitando...'
              : driver
                ? 'Guardar'
                : 'Crear e invitar'}
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
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500"
      />
    </div>
  )
}
