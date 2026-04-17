import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, addDays, subDays, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Truck, MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Plan } from '../types/database'

interface PlanWithCounts extends Plan {
  routeCount: number
  stopCount: number
  completedStops: number
}

export function DayDashboardPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [plans, setPlans] = useState<PlanWithCounts[]>([])
  const [unassignedCount, setUnassignedCount] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const navigate = useNavigate()
  const { user, currentOrg } = useAuth()

  const loadPlans = useCallback(async () => {
    setLoading(true)
    const dateStr = format(selectedDate, 'yyyy-MM-dd')

    const { data: planData } = await supabase
      .from('plans')
      .select('*')
      .eq('date', dateStr)
      .order('created_at')

    if (!planData || planData.length === 0) {
      setPlans([])
      setUnassignedCount(0)
      setLoading(false)
      return
    }

    const planIds = planData.map((p) => p.id)

    const [routesRes, stopsRes] = await Promise.all([
      supabase.from('routes').select('id, plan_id').in('plan_id', planIds),
      supabase
        .from('plan_stops')
        .select('id, plan_id, status, route_id')
        .in('plan_id', planIds),
    ])

    const routes = routesRes.data ?? []
    const stops = stopsRes.data ?? []

    setPlans(
      planData.map((p) => ({
        ...p,
        routeCount: routes.filter((r) => r.plan_id === p.id).length,
        stopCount: stops.filter((s) => s.plan_id === p.id).length,
        completedStops: stops.filter(
          (s) => s.plan_id === p.id && s.status === 'completed'
        ).length,
      }))
    )

    setUnassignedCount(stops.filter((s) => s.route_id === null).length)
    setLoading(false)
  }, [selectedDate])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans()
  }, [loadPlans])

  async function createPlan() {
    if (!user || !currentOrg) return
    const name = `Plan ${format(selectedDate, 'd MMM', { locale: es })}`
    const { data } = await supabase
      .from('plans')
      .insert({
        name,
        date: format(selectedDate, 'yyyy-MM-dd'),
        user_id: user.id,
        org_id: currentOrg.id,
      })
      .select()
      .single()
    if (data) {
      navigate(`/planner/${data.id}`)
    }
  }

  const isSelectedToday = isToday(selectedDate)
  const weekday = format(selectedDate, 'EEEE', { locale: es })
  const dateLabel = format(selectedDate, "d MMM yyyy", { locale: es })
  const headerTitle = isSelectedToday
    ? `Hoy: ${weekday} ${dateLabel}`
    : `${weekday} ${dateLabel}`

  return (
    <div className="px-6 pb-6 pt-4">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => setSelectedDate(subDays(selectedDate, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200"
          aria-label="Dia anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200"
          aria-label="Dia siguiente"
        >
          <ChevronRight size={18} />
        </button>
        <h1 className="text-2xl font-semibold capitalize text-gray-900">
          {headerTitle}
        </h1>
        {!isSelectedToday && (
          <button
            onClick={() => setSelectedDate(new Date())}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
          >
            Hoy
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {plans.map((plan) => {
          const progress =
            plan.stopCount > 0
              ? (plan.completedStops / plan.stopCount) * 100
              : 0
          return (
            <div
              key={plan.id}
              className="p-5 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all flex flex-col"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2 truncate">
                {plan.name}
              </h3>
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <span className="flex items-center gap-1.5">
                  <Truck size={14} />
                  {plan.routeCount} ruta{plan.routeCount === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} />
                  {plan.stopCount} parada{plan.stopCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {plan.completedStops}/{plan.stopCount} completadas
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                onClick={() => navigate(`/planner/${plan.id}`)}
                className="mt-auto w-full px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                Abrir →
              </button>
            </div>
          )
        })}

        <button
          onClick={createPlan}
          className="p-5 bg-white border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center min-h-[200px] text-gray-500 hover:text-blue-600"
        >
          <Plus size={28} className="mb-2" />
          <span className="text-sm font-medium">Crear plan</span>
          <span className="text-xs text-gray-400 mt-1 capitalize">
            {format(selectedDate, "EEEE d MMM", { locale: es })}
          </span>
        </button>
      </div>

      <div className="mt-8 p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900">
            Sin asignar {isSelectedToday ? 'hoy' : 'este dia'}: {unassignedCount} parada{unassignedCount === 1 ? '' : 's'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Paradas creadas para este dia que aun no pertenecen a una ruta.
          </div>
        </div>
        {unassignedCount > 0 && (
          <button
            onClick={() => navigate('/planner/unassigned')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver detalles →
          </button>
        )}
      </div>

      {loading && plans.length === 0 && (
        <div className="mt-6 text-center text-sm text-gray-400">Cargando...</div>
      )}
    </div>
  )
}
