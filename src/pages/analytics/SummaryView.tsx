import { useMemo } from 'react'
import { Download, CheckCircle2, TrendingUp, Route, Clock, Smile, DollarSign } from 'lucide-react'
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
import { useAnalyticsSummary, useDailyTrend, useFeedbackSummary } from '../../hooks/useAnalyticsData'
import { KPICard } from '../../components/analytics/KPICard'
import { ChartCard } from '../../components/analytics/ChartCard'
import {
  formatNumber,
  formatDistance,
  formatDuration,
  formatCurrency,
  formatPercent,
  calculateDelta,
} from '../../lib/analyticsFormat'
import { exportToCSV } from '../../lib/csvExport'

const DEFAULT_PRICE_PER_KM = 450

interface Props {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export function SummaryView({ from, to, previousFrom, previousTo }: Props) {
  const summary = useAnalyticsSummary(from, to)
  const previousSummary = useAnalyticsSummary(previousFrom, previousTo)
  const trend = useDailyTrend(from, to)
  const feedback = useFeedbackSummary(from, to)
  const prevFeedback = useFeedbackSummary(previousFrom, previousTo)

  const kpis = useMemo(() => {
    const curr = summary.data
    const prev = previousSummary.data
    const fb = feedback.data
    const prevFb = prevFeedback.data

    const successRate = curr && curr.total_stops > 0 ? (curr.stops_completed / curr.total_stops) * 100 : 0
    const prevSuccessRate = prev && prev.total_stops > 0 ? (prev.stops_completed / prev.total_stops) * 100 : 0

    const avgTimePerStop = curr && curr.stops_completed > 0 ? curr.total_duration_min / curr.stops_completed : 0
    const prevAvgTimePerStop = prev && prev.stops_completed > 0 ? prev.total_duration_min / prev.stops_completed : 0

    const estimatedCost = curr ? curr.total_distance_km * DEFAULT_PRICE_PER_KM : 0
    const prevEstimatedCost = prev ? prev.total_distance_km * DEFAULT_PRICE_PER_KM : 0

    return {
      completed: {
        value: curr?.stops_completed ?? 0,
        delta: calculateDelta(curr?.stops_completed, prev?.stops_completed),
      },
      successRate: {
        value: successRate,
        delta: calculateDelta(successRate, prevSuccessRate),
      },
      distance: {
        value: curr?.total_distance_km ?? 0,
        delta: calculateDelta(curr?.total_distance_km, prev?.total_distance_km),
      },
      avgTime: {
        value: avgTimePerStop,
        delta: calculateDelta(avgTimePerStop, prevAvgTimePerStop),
      },
      nps: {
        value: fb?.nps ?? 0,
        delta: calculateDelta(fb?.nps, prevFb?.nps),
      },
      cost: {
        value: estimatedCost,
        delta: calculateDelta(estimatedCost, prevEstimatedCost),
      },
    }
  }, [summary.data, previousSummary.data, feedback.data, prevFeedback.data])

  const chartData = useMemo(() => {
    return trend.data.map((d) => ({
      day: d.day,
      total: Number(d.total_stops),
      completed: Number(d.completed),
      cancelled: Number(d.cancelled),
      incomplete: Number(d.incomplete),
      pending: Number(d.pending),
    }))
  }, [trend.data])

  function handleExport() {
    exportToCSV(
      `resumen_${from}_${to}.csv`,
      chartData,
      {
        day: 'Dia',
        total: 'Total',
        completed: 'Completadas',
        cancelled: 'Canceladas',
        incomplete: 'Incompletas',
        pending: 'Pendientes',
      },
    )
  }

  const anyLoading = summary.loading || trend.loading || feedback.loading

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Resumen</h2>
        <p className="text-sm text-gray-500 mt-1">Metricas principales del periodo</p>
      </div>

      {summary.error && <div className="text-sm text-red-500">Error: {summary.error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          label="Entregas completadas"
          value={formatNumber(kpis.completed.value)}
          delta={kpis.completed.delta}
          deltaLabel="vs periodo anterior"
          icon={<CheckCircle2 size={18} />}
        />
        <KPICard
          label="Tasa de exito"
          value={formatPercent(kpis.successRate.value)}
          delta={kpis.successRate.delta}
          deltaLabel="vs anterior"
          icon={<TrendingUp size={18} />}
        />
        <KPICard
          label="Distancia total"
          value={formatDistance(kpis.distance.value)}
          delta={kpis.distance.delta}
          deltaLabel="vs anterior"
          icon={<Route size={18} />}
        />
        <KPICard
          label="Tiempo promedio / entrega"
          value={formatDuration(kpis.avgTime.value)}
          delta={kpis.avgTime.delta}
          deltaLabel="vs anterior"
          invertDelta
          icon={<Clock size={18} />}
        />
        <KPICard
          label="NPS"
          value={kpis.nps.value != null ? Math.round(kpis.nps.value) : '-'}
          delta={kpis.nps.delta}
          deltaLabel="vs anterior"
          icon={<Smile size={18} />}
        />
        <KPICard
          label="Costo estimado"
          value={formatCurrency(kpis.cost.value)}
          delta={kpis.cost.delta}
          deltaLabel="vs anterior"
          invertDelta
          icon={<DollarSign size={18} />}
          hint={`~${formatCurrency(DEFAULT_PRICE_PER_KM)}/km`}
        />
      </div>

      <ChartCard
        title="Tendencia diaria de entregas"
        subtitle="Total vs completadas"
        actions={
          <button
            onClick={handleExport}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200"
          >
            <Download size={12} />
            CSV
          </button>
        }
      >
        {anyLoading ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" name="Total" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completed" name="Completadas" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Distribucion de status por dia"
        subtitle="Completadas, canceladas, incompletas, pendientes"
      >
        {anyLoading ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar dataKey="completed" name="Completadas" stackId="s" fill="#22c55e" />
              <Bar dataKey="cancelled" name="Canceladas" stackId="s" fill="#ef4444" />
              <Bar dataKey="incomplete" name="Incompletas" stackId="s" fill="#fb923c" />
              <Bar dataKey="pending" name="Pendientes" stackId="s" fill="#facc15" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
