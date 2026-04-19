import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Search, Truck, MapPin } from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import type { Plan } from '@/data/types/database'

interface PlanWithCounts extends Plan {
  routeCount: number
  stopCount: number
  completedStops: number
}

export function PlannerPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [plans, setPlans] = useState<PlanWithCounts[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const { user, currentOrg } = useAuth()

  useEffect(() => {
    loadPlans()
  }, [currentMonth])

  async function loadPlans() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const { data: planData } = await supabase
      .from('plans')
      .select('*')
      .gte('date', start)
      .lte('date', end)
      .order('date')

    if (!planData) return setPlans([])

    const planIds = planData.map((p) => p.id)

    const [routesRes, stopsRes] = await Promise.all([
      supabase.from('routes').select('id, plan_id').in('plan_id', planIds),
      supabase.from('plan_stops').select('id, plan_id, status').in('plan_id', planIds),
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
  }

  function getPlansForDate(date: Date) {
    return plans.filter((p) => isSameDay(new Date(p.date), date))
  }

  const filteredPlans = searchQuery
    ? plans.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : null

  function renderCalendarDays() {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

    const rows: React.ReactElement[] = []
    let days: React.ReactElement[] = []
    let day = calStart

    while (day <= calEnd) {
      for (let i = 0; i < 7; i++) {
        const d = day
        const dayPlans = getPlansForDate(d)
        const inMonth = isSameMonth(d, monthStart)

        days.push(
          <div
            key={d.toISOString()}
            onClick={() => setSelectedDate(d)}
            className={`min-h-24 border border-gray-100 p-1.5 cursor-pointer transition-colors hover:bg-blue-50/50 ${
              !inMonth ? 'bg-gray-50/50 text-gray-300' : ''
            } ${isSameDay(d, selectedDate) ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset' : ''}`}
          >
            <span
              className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                isToday(d) ? 'bg-blue-500 text-white' : ''
              }`}
            >
              {format(d, 'd')}
            </span>
            <div className="mt-0.5 space-y-0.5">
              {dayPlans.slice(0, 2).map((p) => (
                <div
                  key={p.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/planner/${p.id}`)
                  }}
                  className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded truncate cursor-pointer hover:bg-blue-200 flex items-center gap-1"
                >
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
              {dayPlans.length > 2 && (
                <div className="text-[10px] text-gray-400 px-1.5">
                  + {dayPlans.length - 2} evento{dayPlans.length - 2 > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        )
        day = addDays(day, 1)
      }
      rows.push(
        <div key={day.toISOString()} className="grid grid-cols-7">
          {days}
        </div>
      )
      days = []
    }
    return rows
  }

  const selectedPlans = getPlansForDate(selectedDate)
  const displayPlans = filteredPlans ?? selectedPlans

  async function createPlanForSelected() {
    if (!user || !currentOrg) return
    const name = format(selectedDate, 'EEEE', { locale: es })
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
      loadPlans()
      navigate(`/planner/${data.id}`)
    }
  }

  return (
    <div className="px-6 pb-6 pt-4">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200"
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 hover:bg-gray-100 rounded-lg border border-gray-200"
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
        <h2 className="text-2xl font-semibold capitalize text-gray-900">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </h2>
        <button
          onClick={() => {
            setSelectedDate(new Date())
            setCurrentMonth(new Date())
          }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
        >
          Hoy
        </button>
        <div className="relative ml-auto">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar plan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-7 text-xs font-medium text-gray-500 mb-1">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'].map((d) => (
          <div key={d} className="text-center py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {renderCalendarDays()}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 capitalize">
            {searchQuery
              ? `Resultados: "${searchQuery}"`
              : format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </h3>
          {!searchQuery && (
            <button
              onClick={createPlanForSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus size={14} />
              Nuevo plan
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {displayPlans.map((plan) => {
            const progress =
              plan.stopCount > 0
                ? (plan.completedStops / plan.stopCount) * 100
                : 0
            return (
              <div
                key={plan.id}
                onClick={() => navigate(`/planner/${plan.id}`)}
                className="p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="text-sm font-semibold text-gray-900 mb-2 truncate">
                  {plan.name}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span className="flex items-center gap-1">
                    <Truck size={12} />
                    {plan.routeCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {plan.stopCount}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )
          })}
          {displayPlans.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full py-4">
              {searchQuery ? 'Sin resultados' : 'Sin planes para este dia'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
