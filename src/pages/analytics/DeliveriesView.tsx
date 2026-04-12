import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useAnalyticsSummary, useCancellationReasons } from '../../hooks/useAnalyticsData'
import { KPICard } from '../../components/analytics/KPICard'
import { ChartCard } from '../../components/analytics/ChartCard'
import { formatNumber } from '../../lib/analyticsFormat'
import { exportToCSV } from '../../lib/csvExport'
import type { PlanStop, Stop } from '../../types/database'

interface Props {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

type FailedStopRow = PlanStop & { stop: Stop }

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  cancelled: '#ef4444',
  incomplete: '#fb923c',
  pending: '#facc15',
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completadas',
  cancelled: 'Canceladas',
  incomplete: 'Incompletas',
  pending: 'Pendientes',
}

export function DeliveriesView({ from, to }: Props) {
  const { currentOrg } = useAuth()
  const summary = useAnalyticsSummary(from, to)
  const reasons = useCancellationReasons(from, to)

  const [failed, setFailed] = useState<FailedStopRow[]>([])
  const [failedLoading, setFailedLoading] = useState(true)
  const [failedError, setFailedError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrg?.id) return
    let cancelled = false
    setFailedLoading(true)
    supabase
      .from('plan_stops')
      .select('*, stop:stops(*)')
      .eq('org_id', currentOrg.id)
      .gt('delivery_attempts', 1)
      .order('delivery_attempts', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setFailedError(error.message)
        else setFailed((data as unknown as FailedStopRow[]) ?? [])
        setFailedLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  const statusPie = useMemo(() => {
    const curr = summary.data
    if (!curr) return []
    return [
      { name: 'completed', value: curr.stops_completed },
      { name: 'cancelled', value: curr.stops_cancelled },
      { name: 'incomplete', value: curr.stops_incomplete },
      { name: 'pending', value: curr.stops_pending ?? 0 },
    ].filter((d) => d.value > 0)
  }, [summary.data])

  const reasonsChart = useMemo(() => {
    return reasons.data.slice(0, 10).map((r) => ({
      name: r.reason,
      count: Number(r.count),
      percentage: Number(r.percentage),
    }))
  }, [reasons.data])

  function handleExport() {
    exportToCSV(
      `entregas_${from}_${to}.csv`,
      failed.map((f) => ({
        cliente: f.stop?.customer_name ?? f.stop?.name ?? '',
        direccion: f.stop?.address ?? '',
        intentos: f.delivery_attempts,
        motivo: f.cancellation_reason ?? '',
        status: f.status,
      })),
      {
        cliente: 'Cliente',
        direccion: 'Direccion',
        intentos: 'Intentos',
        motivo: 'Ultimo motivo',
        status: 'Status',
      },
    )
  }

  const s = summary.data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Entregas</h2>
          <p className="text-sm text-gray-500 mt-1">Desglose por status y motivos de cancelacion</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded border border-gray-200 bg-white"
        >
          <Download size={12} />
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Total paradas" value={formatNumber(s?.total_stops ?? 0)} />
        <KPICard label="Completadas" value={formatNumber(s?.stops_completed ?? 0)} valueColor="text-green-600" />
        <KPICard label="Canceladas" value={formatNumber(s?.stops_cancelled ?? 0)} valueColor="text-red-500" />
        <KPICard label="Incompletas" value={formatNumber(s?.stops_incomplete ?? 0)} valueColor="text-orange-500" />
        <KPICard label="Pendientes" value={formatNumber(s?.stops_pending ?? 0)} valueColor="text-yellow-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Distribucion de status" subtitle="Porcentaje por estado de entrega">
          {summary.loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : statusPie.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusPie}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={(entry: { name?: string; percent?: number }) =>
                    `${STATUS_LABELS[entry.name as string] ?? entry.name}: ${((entry.percent ?? 0) * 100).toFixed(1)}%`
                  }
                >
                  {statusPie.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                  ))}
                </Pie>
                <Tooltip formatter={((val: number, name: string) => [val, STATUS_LABELS[name] ?? name]) as never} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top 10 motivos de cancelacion" subtitle="Razones mas frecuentes">
          {reasons.loading ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
          ) : reasonsChart.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reasonsChart} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#9ca3af" fontSize={11} />
                <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={10} width={140} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" name="Cantidad" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Paradas con mas intentos fallidos" subtitle="Top 20 paradas con mas de 1 intento">
        {failedLoading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Cargando...</div>
        ) : failedError ? (
          <div className="text-sm text-red-500 py-6 text-center">Error: {failedError}</div>
        ) : failed.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Sin paradas con reintentos en el periodo</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="p-2 font-medium">Cliente</th>
                  <th className="p-2 font-medium">Direccion</th>
                  <th className="p-2 font-medium text-center">Intentos</th>
                  <th className="p-2 font-medium">Ultimo motivo</th>
                  <th className="p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {failed.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="p-2 font-medium">{row.stop?.customer_name ?? row.stop?.name ?? '-'}</td>
                    <td className="p-2 text-gray-500 max-w-xs truncate">{row.stop?.address ?? '-'}</td>
                    <td className="p-2 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
                        {row.delivery_attempts}
                      </span>
                    </td>
                    <td className="p-2 text-gray-500 max-w-xs truncate">{row.cancellation_reason ?? '-'}</td>
                    <td className="p-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          color: STATUS_COLORS[row.status] ?? '#6b7280',
                          backgroundColor: `${STATUS_COLORS[row.status] ?? '#6b7280'}15`,
                        }}
                      >
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
