import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, X } from 'lucide-react';
import { supabase } from '@/application/lib/supabase';
import { useAuth } from '@/application/hooks/useAuth';
import type { Order, Plan } from '@/data/types/database';
import { formatOrderDate as formatDate } from '../utils';
import { Field } from './FormUi';
import { assignToPlan, unassignFromPlan } from '@/data/services/orders/orders.services';
import { todayLocalISO } from '@/application/utils/dateHelpers';

type ConflictInfo = {
  orderId: string;
  orderNumber: string;
  sourcePlanId: string;
  sourcePlanName: string;
};

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
  const [newPlanDate, setNewPlanDate] = useState(todayLocalISO())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null)
  const [moveFromOtherPlans, setMoveFromOtherPlans] = useState(false)

  useEffect(() => {
    if (!currentOrg) return
    const today = todayLocalISO()
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

  async function detectConflicts(targetPlanId: string): Promise<ConflictInfo[]> {
    const ids = orders.map((o) => o.id)
    const { data, error: convErr } = await supabase
      .from('orders')
      .select('id, order_number, plan_stop_id, plan_stops!inner(plan_id, plans!inner(name))')
      .in('id', ids)
      .not('plan_stop_id', 'is', null)
    if (convErr || !data) return []
    return (data as unknown as Array<{
      id: string
      order_number: string
      plan_stops: { plan_id: string; plans: { name: string } } | null
    }>)
      .filter((r) => r.plan_stops && r.plan_stops.plan_id !== targetPlanId)
      .map((r) => ({
        orderId: r.id,
        orderNumber: r.order_number,
        sourcePlanId: r.plan_stops!.plan_id,
        sourcePlanName: r.plan_stops!.plans.name,
      }))
  }

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

    // Detección previa: si hay órdenes en otros planes, pedir confirmación
    // antes de moverlas. Sin esto, el RPC las skipea silenciosamente y el
    // usuario termina en un plan vacío.
    if (!moveFromOtherPlans) {
      const found = await detectConflicts(targetPlanId)
      if (found.length > 0) {
        setConflicts(found)
        setSaving(false)
        return
      }
    } else if (conflicts && conflicts.length > 0) {
      // Mover desde otros planes: desasignar primero del plan origen
      // (esto limpia los plan_stops huérfanos vía RPC).
      const byPlan = new Map<string, string[]>()
      for (const c of conflicts) {
        const list = byPlan.get(c.sourcePlanId) ?? []
        list.push(c.orderId)
        byPlan.set(c.sourcePlanId, list)
      }
      for (const [sourcePlanId, ids] of byPlan.entries()) {
        const unassign = await unassignFromPlan(ids, sourcePlanId)
        if (!unassign.success) {
          setError(unassign.error)
          setSaving(false)
          return
        }
      }
    }

    const orderIds = orders.map((o) => o.id)
    const res = await assignToPlan(orderIds, targetPlanId, false)
    if (!res.success) {
      setError(res.error)
      setSaving(false)
      return
    }

    const { createdCount, mergedCount, skippedCount } = res.data
    setSaving(false)

    // Si no se asignó ni se mergeó nada, no navegamos al plan vacío.
    if (createdCount + mergedCount === 0) {
      setError(
        skippedCount > 0
          ? 'Todas las órdenes seleccionadas ya estaban en otro plan. Activa "Mover desde otros planes" para reubicarlas.'
          : 'No se programó ninguna orden.',
      )
      return
    }

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

          {conflicts && conflicts.length > 0 && (
            <div className="flex flex-col gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {conflicts.length} orden{conflicts.length === 1 ? '' : 'es'} ya {conflicts.length === 1 ? 'está' : 'están'} en otro plan
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs text-amber-700 max-h-24 overflow-y-auto">
                    {Array.from(new Set(conflicts.map((c) => c.sourcePlanName))).map((name) => (
                      <li key={name}>· {name}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={moveFromOtherPlans}
                  onChange={(e) => setMoveFromOtherPlans(e.target.checked)}
                  className="rounded border-amber-300"
                />
                Mover {conflicts.length === 1 ? 'esa orden' : 'esas órdenes'} desde el plan actual a este
              </label>
            </div>
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
          <button
            onClick={handleSchedule}
            disabled={saving || (conflicts !== null && conflicts.length > 0 && !moveFromOtherPlans)}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving
              ? 'Programando...'
              : moveFromOtherPlans && conflicts && conflicts.length > 0
                ? 'Mover y programar'
                : 'Programar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================
