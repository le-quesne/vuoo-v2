import { useEffect, useMemo, useState } from 'react'
import { Download, Route as RouteIcon, Clock, MapPin, Timer } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { parseISO, format } from 'date-fns'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { useAnalyticsSummary, useDailyTrend } from '@/presentation/features/analytics/hooks/useAnalyticsData'
import { KPICard } from '@/presentation/features/analytics/components/KPICard'
import { ChartCard } from '@/presentation/features/analytics/components/ChartCard'
import { formatDistance, formatDuration, formatPercent } from '@/presentation/features/analytics/utils/analyticsFormat'
import { exportToCSV } from '@/application/utils/csvExport'

interface Props {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

interface OtifStopRow {
  id: string
  report_time: string | null
  plan: { date: string } | null
  stop: { time_window_end: string | null } | null
}

export function OperationsView({ from, to }: Props) {
  const { currentOrg } = useAuth()
  const summary = useAnalyticsSummary(from, to)
  const trend = useDailyTrend(from, to)

  const [hourDist, setHourDist] = useState<{ hour: number; count: number }[]>([])
  const [hourLoading, setHourLoading] = useState(true)
  const [otifRows, setOtifRows] = useState<OtifStopRow[]>([])
  const [otifLoading, setOtifLoading] = useState(true)

  useEffect(() => {
    if (!currentOrg?.id) return
    let cancelled = false
    setHourLoading(true)
    supabase
      .from('plan_stops')
      .select('report_time, plan:plans!inner(date)')
      .eq('org_id', currentOrg.id)
      .eq('status', 'completed')
      .not('report_time', 'is', null)
      .gte('plan.date', from)
      .lte('plan.date', to)
      .then(({ data }) => {
        if (cancelled) return
        const buckets = new Map<number, number>()
        for (let i = 0; i < 24; i++) buckets.set(i, 0)
        for (const row of (data ?? []) as { report_time: string | null }[]) {
          if (!row.report_time) continue
          const d = new Date(row.report_time)
          const h = d.getHours()
          buckets.set(h, (buckets.get(h) ?? 0) + 1)
        }
        setHourDist(Array.from(buckets.entries()).map(([hour, count]) => ({ hour, count })))
        setHourLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  useEffect(() => {
    if (!currentOrg?.id) return
    let cancelled = false
    setOtifLoading(true)
    supabase
      .from('plan_stops')
      .select('id, report_time, plan:plans!inner(date), stop:stops!inner(time_window_end)')
      .eq('org_id', currentOrg.id)
      .eq('status', 'completed')
      .not('report_time', 'is', null)
      .not('stop.time_window_end', 'is', null)
      .gte('plan.date', from)
      .lte('plan.date', to)
      .then(({ data }) => {
        if (cancelled) return
        setOtifRows((data as unknown as OtifStopRow[]) ?? [])
        setOtifLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  const s = summary.data

  const avgStopsPerRoute = useMemo(() => {
    if (!s || s.total_routes === 0) return 0
    return s.total_stops / s.total_routes
  }, [s])

  const avgTimePerStop = useMemo(() => {
    if (!s || s.stops_completed === 0) return 0
    return s.total_duration_min / s.stops_completed
  }, [s])

  const distanceTrend = useMemo(() => {
    return trend.data.map((d) => ({ day: d.day, distance: Number(d.distance_km) }))
  }, [trend.data])

  const durationTrend = useMemo(() => {
    return trend.data.map((d) => ({ day: d.day, duration: Number(d.duration_min) }))
  }, [trend.data])

  const { otifPercent, otifByDay, otifInsufficient } = useMemo(() => {
    if (otifRows.length < 10) {
      return { otifPercent: null, otifByDay: [] as { day: string; otif: number }[], otifInsufficient: true }
    }
    const onTime = (row: OtifStopRow) => {
      if (!row.report_time || !row.stop?.time_window_end || !row.plan?.date) return false
      const reportDate = new Date(row.report_time)
      const [hh, mm] = row.stop.time_window_end.split(':').map(Number)
      const windowEnd = new Date(row.plan.date)
      windowEnd.setHours(hh || 0, mm || 0, 0, 0)
      return reportDate.getTime() <= windowEnd.getTime()
    }
    const total = otifRows.length
    const onTimeCount = otifRows.filter(onTime).length
    const percent = (onTimeCount / total) * 100

    const byDay = new Map<string, { total: number; onTime: number }>()
    for (const row of otifRows) {
      const day = row.plan?.date ?? ''
      if (!day) continue
      const entry = byDay.get(day) ?? { total: 0, onTime: 0 }
      entry.total += 1
      if (onTime(row)) entry.onTime += 1
      byDay.set(day, entry)
    }
    const dayArr = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, otif: v.total > 0 ? (v.onTime / v.total) * 100 : 0 }))

    return { otifPercent: percent, otifByDay: dayArr, otifInsufficient: false }
  }, [otifRows])

  function handleExport() {
    exportToCSV(
      `operacional_${from}_${to}.csv`,
      trend.data.map((d) => ({
        day: d.day,
        total_stops: d.total_stops,
        completed: d.completed,
        distance_km: d.distance_km,
        duration_min: d.duration_min,
      })),
      {
        day: 'Dia',
        total_stops: 'Paradas',
        completed: 'Completadas',
        distance_km: 'Distancia km',
        duration_min: 'Duracion min',
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Operacional</h2>
          <p className="text-sm text-gray-500 mt-1">Metricas de operacion y puntualidad</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded border border-gray-200 bg-white"
        >
          <Download size={12} />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Distancia total"
          value={formatDistance(s?.total_distance_km ?? 0)}
          icon={<RouteIcon size={18} />}
        />
        <KPICard
          label="Duracion total"
          value={formatDuration(s?.total_duration_min ?? 0)}
          icon={<Clock size={18} />}
        />
        <KPICard
          label="Paradas / ruta"
          value={avgStopsPerRoute.toFixed(1)}
          icon={<MapPin size={18} />}
          hint="Promedio"
        />
        <KPICard
          label="Tiempo / parada"
          value={formatDuration(avgTimePerStop)}
          icon={<Timer size={18} />}
          hint="Promedio"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Distancia por dia" subtitle="Kilometros recorridos">
          {trend.loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : distanceTrend.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={distanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip formatter={((v: number) => `${v.toFixed(1)} km`) as never} />
                <Line type="monotone" dataKey="distance" name="Distancia km" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Duracion por dia" subtitle="Minutos de operacion">
          {trend.loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : durationTrend.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={durationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip formatter={((v: number) => formatDuration(v)) as never} />
                <Line type="monotone" dataKey="duration" name="Duracion min" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Entregas por hora del dia" subtitle="Distribucion horaria de completados">
        {hourLoading ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
        ) : hourDist.every((h) => h.count === 0) ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos suficientes</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={hourDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="hour" stroke="#9ca3af" fontSize={11} tickFormatter={(h) => `${h}h`} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip labelFormatter={(h) => `${h}:00`} />
              <Bar dataKey="count" name="Entregas" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KPICard
          label="OTIF"
          value={otifPercent != null ? formatPercent(otifPercent) : 'Data insuficiente'}
          icon={<Timer size={18} />}
          hint={otifInsufficient ? 'Minimo 10 paradas con time window' : 'On-Time In-Full'}
        />
        <ChartCard title="OTIF trend por dia" subtitle="% de paradas on-time" className="lg:col-span-2">
          {otifLoading ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : otifInsufficient || otifByDay.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
              Data insuficiente - se requieren al menos 10 paradas con time_window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={otifByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="day"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickFormatter={(v) => {
                    try {
                      return format(parseISO(v), 'dd/MM')
                    } catch {
                      return v
                    }
                  }}
                />
                <YAxis stroke="#9ca3af" fontSize={11} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={((v: number) => `${v.toFixed(1)}%`) as never} />
                <Legend />
                <Line type="monotone" dataKey="otif" name="OTIF %" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

