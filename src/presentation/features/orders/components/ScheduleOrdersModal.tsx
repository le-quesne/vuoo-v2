import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import type { Order, Plan } from '@/data/types/database';
import { formatOrderDate as formatDate } from '../utils';
import { Field } from './FormUi';

export function ScheduleOrdersModal({
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
