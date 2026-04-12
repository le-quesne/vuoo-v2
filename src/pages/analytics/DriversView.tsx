import { useMemo, useState } from 'react'
import { Download, Star, ChevronDown, ChevronUp } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { useDriverPerformance } from '../../hooks/useAnalyticsData'
import { ChartCard } from '../../components/analytics/ChartCard'
import { formatNumber, formatDistance, formatPercent } from '../../lib/analyticsFormat'
import { exportToCSV } from '../../lib/csvExport'
import type { DriverPerformanceRow } from '../../types/database'

interface Props {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

export function DriversView({ from, to }: Props) {
  const perf = useDriverPerformance(from, to)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rows = useMemo(() => perf.data, [perf.data])

  const chartData = useMemo(() => {
    return rows.map((r) => ({
      name: r.driver_name,
      completed: Number(r.completed),
      failed: Number(r.cancelled) + Number(r.incomplete),
    }))
  }, [rows])

  function handleExport() {
    exportToCSV(
      `conductores_${from}_${to}.csv`,
      rows.map((r, i) => ({
        rank: i + 1,
        name: r.driver_name,
        total: r.total_stops,
        completed: r.completed,
        success_rate: r.success_rate,
        avg_rating: r.avg_rating ?? '',
        distance: r.total_distance_km,
        feedback: r.total_feedback,
      })),
      {
        rank: '#',
        name: 'Conductor',
        total: 'Total paradas',
        completed: 'Completadas',
        success_rate: 'Exito %',
        avg_rating: 'Rating',
        distance: 'Distancia km',
        feedback: 'Feedback',
      },
    )
  }

  const expanded = rows.find((r) => r.driver_id === expandedId) ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Conductores</h2>
          <p className="text-sm text-gray-500 mt-1">Ranking de performance en el periodo</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded border border-gray-200 bg-white"
        >
          <Download size={12} />
          Exportar CSV
        </button>
      </div>

      <ChartCard title="Ranking de conductores" subtitle={`${rows.length} conductores activos`}>
        {perf.loading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Cargando...</div>
        ) : perf.error ? (
          <div className="text-sm text-red-500 py-6 text-center">Error: {perf.error}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Sin conductores activos</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="p-2 font-medium w-10">#</th>
                  <th className="p-2 font-medium">Conductor</th>
                  <th className="p-2 font-medium text-right">Entregas</th>
                  <th className="p-2 font-medium text-right">Exito</th>
                  <th className="p-2 font-medium text-right">Rating</th>
                  <th className="p-2 font-medium text-right">Distancia</th>
                  <th className="p-2 font-medium text-right">Feedback</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const isExpanded = expandedId === row.driver_id
                  return (
                    <tr
                      key={row.driver_id}
                      onClick={() => setExpandedId(isExpanded ? null : row.driver_id)}
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                        isExpanded ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="p-2 font-semibold text-gray-400">{i + 1}</td>
                      <td className="p-2 font-medium">{row.driver_name}</td>
                      <td className="p-2 text-right">{formatNumber(row.completed)}</td>
                      <td className="p-2 text-right">
                        <span className={row.success_rate >= 90 ? 'text-green-600' : row.success_rate >= 70 ? 'text-orange-500' : 'text-red-500'}>
                          {formatPercent(row.success_rate)}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        {row.avg_rating != null ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Star size={12} className="fill-yellow-400 text-yellow-400" />
                            {row.avg_rating}
                          </span>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="p-2 text-right text-gray-600">{formatDistance(row.total_distance_km)}</td>
                      <td className="p-2 text-right text-gray-600">{formatNumber(row.total_feedback)}</td>
                      <td className="p-2 text-gray-400">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {expanded && <DriverDetailPanel driver={expanded} onClose={() => setExpandedId(null)} />}

      <ChartCard title="Entregas por conductor" subtitle="Completadas vs fallidas">
        {perf.loading ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" stroke="#9ca3af" fontSize={11} />
              <YAxis dataKey="name" type="category" stroke="#9ca3af" fontSize={11} width={140} />
              <Tooltip />
              <Legend />
              <Bar dataKey="completed" name="Completadas" stackId="s" fill="#22c55e" />
              <Bar dataKey="failed" name="Fallidas" stackId="s" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}

function DriverDetailPanel({ driver, onClose }: { driver: DriverPerformanceRow; onClose: () => void }) {
  return (
    <div className="bg-white border border-blue-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">{driver.driver_name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Detalle del conductor en el periodo</p>
        </div>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">
          Cerrar
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricBox label="Total paradas" value={formatNumber(driver.total_stops)} />
        <MetricBox label="Completadas" value={formatNumber(driver.completed)} color="text-green-600" />
        <MetricBox label="Canceladas" value={formatNumber(driver.cancelled)} color="text-red-500" />
        <MetricBox label="Incompletas" value={formatNumber(driver.incomplete)} color="text-orange-500" />
        <MetricBox label="Tasa de exito" value={formatPercent(driver.success_rate)} />
        <MetricBox
          label="Rating promedio"
          value={driver.avg_rating != null ? `${driver.avg_rating} / 5` : 'Sin data'}
        />
        <MetricBox label="Distancia total" value={formatDistance(driver.total_distance_km)} />
        <MetricBox label="Feedback recibido" value={formatNumber(driver.total_feedback)} />
      </div>
    </div>
  )
}

function MetricBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold mt-1 ${color ?? 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
