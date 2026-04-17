import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  isSameDay,
  isToday,
} from 'date-fns'
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

export function WeekDashboardPage() {
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date())
  const [plans, setPlans] = useState<PlanWithCounts[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const navigate = useNavigate()
  const { user, currentOrg } = useAuth()

  const weekStart = useMemo(
    () => startOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor]
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekAnchor, { weekStartsOn: 1 }),
    [weekAnchor]
  )
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  const loadPlans = useCallback(async () => {
    setLoading(true)
    const startStr = format(weekStart, 'yyyy-MM-dd')
    const endStr = format(weekEnd, 'yyyy-MM-dd')

    const { data: planData } = await supabase
      .from('plans')
      .select('*')
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date')

    if (!planData || planData.length === 0) {
      setPlans([])
      setLoading(false)
      return
    }

    const planIds = planData.map((p) => p.id)
    const [routesRes, stopsRes] = await Promise.all([
      supabase.from('routes').select('id, plan_id').in('plan_id', planIds),
      supabase
        .from('plan_stops')
        .select('id, plan_id, status')
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
    setLoading(false)
  }, [weekStart, weekEnd])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans()
  }, [loadPlans])

  async function createPlanFor(date: Date) {
    if (!user || !currentOrg) return
    const name = `Plan ${format(date, 'd MMM', { locale: es })}`
    const { data } = await supabase
      .from('plans')
      .insert({
        name,
        date: format(date, 'yyyy-MM-dd'),
        user_id: user.id,
        org_id: currentOrg.id,
      })
      .select()
      .single()
    if (data) navigate(`/planner/${data.id}`)
  }

  const sameMonth = weekStart.getMonth() === weekEnd.getMonth()
  const rangeLabel = sameMonth
    ? `${format(weekStart, 'd', { locale: es })} - ${format(weekEnd, "d 'de' MMMM yyyy", { locale: es })}`
    : `${format(weekStart, 'd MMM', { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`

  return (
    <div className="px-6 pb-6 pt-4">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => setWeekAnchor(subWeeks(weekAnchor, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setWeekAnchor(addWeeks(weekAnchor, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200"
          aria-label="Semana siguiente"
        >
          <ChevronRight size={18} />
        </button>
        <h1 className="text-2xl font-semibold capitalize text-gray-900">
          {rangeLabel}
        </h1>
        <button
          onClick={() => setWeekAnchor(new Date())}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
        >
          Hoy
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d) => {
          const dayPlans = plans.filter((p) => isSameDay(new Date(p.date), d))
          const highlighted = isToday(d)
          return (
            <div
              key={d.toISOString()}
              className={`border rounded-lg bg-white flex flex-col min-h-[220px] ${
                highlighted ? 'border-blue-400' : 'border-gray-200'
              }`}
            >
              <div
                className={`px-3 py-2 border-b text-xs font-medium flex items-center justify-between capitalize ${
                  highlighted
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'border-gray-200 text-gray-600'
                }`}
              >
                <span>{format(d, 'EEE', { locale: es })}</span>
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
                    highlighted ? 'bg-blue-500 text-white' : 'text-gray-700'
                  }`}
                >
                  {format(d, 'd')}
                </span>
              </div>
              <div className="p-2 flex-1 flex flex-col gap-2">
                {dayPlans.map((plan) => {
                  const progress =
                    plan.stopCount > 0
                      ? (plan.completedStops / plan.stopCount) * 100
                      : 0
                  return (
                    <button
                      key={plan.id}
                      onClick={() => navigate(`/planner/${plan.id}`)}
                      className="text-left p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors"
                    >
                      <div className="text-xs font-semibold text-gray-900 truncate">
                        {plan.name}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                        <span className="flex items-center gap-0.5">
                          <Truck size={10} />
                          {plan.routeCount}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <MapPin size={10} />
                          {plan.stopCount}
                        </span>
                      </div>
                      <div className="h-1 bg-gray-200 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </button>
                  )
                })}
                <button
                  onClick={() => createPlanFor(d)}
                  className="mt-auto text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50/40 border border-dashed border-gray-300 hover:border-blue-300 rounded-md py-2 flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus size={12} />
                  Nuevo plan
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {loading && plans.length === 0 && (
        <div className="mt-6 text-center text-sm text-gray-400">Cargando...</div>
      )}
    </div>
  )
}
