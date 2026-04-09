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
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Plan } from '../types/database'

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
      supabase.from('stops').select('id, plan_id, status').in('plan_id', planIds),
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
            className={`min-h-24 border border-gray-100 p-1.5 cursor-pointer transition-colors hover:bg-indigo-50/50 ${
              !inMonth ? 'bg-gray-50/50 text-gray-300' : ''
            } ${isSameDay(d, selectedDate) ? 'bg-indigo-50 ring-2 ring-indigo-400 ring-inset' : ''}`}
          >
            <span
              className={`text-xs font-medium inline-flex w-6 h-6 items-center justify-center rounded-full ${
                isToday(d) ? 'bg-indigo-500 text-white' : ''
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
                  className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded truncate cursor-pointer hover:bg-indigo-200 flex items-center gap-1"
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

  return (
    <div className="flex h-screen">
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedDate(new Date())
                setCurrentMonth(new Date())
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Hoy
            </button>
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-gray-100 rounded"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 hover:bg-gray-100 rounded"
            >
              <ChevronRight size={18} />
            </button>
            <h2 className="text-lg font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar plan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
        <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden">
          {renderCalendarDays()}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-80 border-l border-gray-200 bg-white p-4 flex flex-col">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">
          {searchQuery
            ? `Resultados: "${searchQuery}"`
            : format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
        </h3>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {displayPlans.map((plan) => {
            const progress =
              plan.stopCount > 0
                ? (plan.completedStops / plan.stopCount) * 100
                : 0
            return (
              <div
                key={plan.id}
                onClick={() => navigate(`/planner/${plan.id}`)}
                className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-500">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{plan.name}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Truck size={10} />
                        {plan.routeCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={10} />
                        {plan.stopCount}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )
          })}
          {displayPlans.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-8">
              {searchQuery ? 'Sin resultados' : 'Sin planes para este dia'}
            </p>
          )}
        </div>
        <button
          onClick={async () => {
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
          }}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 transition-colors"
        >
          <Plus size={16} />
          Crear un plan nuevo
        </button>
      </div>
    </div>
  )
}
