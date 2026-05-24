import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LineChart,
  Line,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { Star, TrendingUp, Users as UsersIcon, MessageSquare, AlertTriangle } from 'lucide-react'
import { feedbackService } from '@/data/services/feedback'
import type { FeedbackNPSSummary } from '@/data/services/feedback'
import { useAuth } from '@/application/hooks/useAuth'
import { KPICard } from './KPICard'
import { ChartCard } from './ChartCard'

interface Props {
  from: string
  to: string
  completedStops: number
}

const RATING_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#facc15',
  4: '#84cc16',
  5: '#22c55e',
}

function npsColorClass(nps: number | null): string {
  if (nps == null) return 'text-gray-400'
  if (nps > 50) return 'text-green-600'
  if (nps >= 0) return 'text-yellow-500'
  return 'text-red-500'
}

function npsBucketLabel(nps: number | null): string | undefined {
  if (nps == null) return undefined
  if (nps > 50) return 'Excelente'
  if (nps >= 0) return 'Mejorable'
  return 'Critico'
}

export function NPSDashboard({ from, to, completedStops }: Props) {
  const { currentOrg } = useAuth()
  const [data, setData] = useState<FeedbackNPSSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrg?.id) {
      setData(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    feedbackService
      .summaryForOrg(currentOrg.id, { from, to }, completedStops)
      .then((res) => {
        if (cancelled) return
        if (!res.success) {
          setError(res.error)
          setData(null)
        } else {
          setData(res.data)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to, completedStops])

  const distributionData = useMemo(() => {
    if (!data) return []
    return ([1, 2, 3, 4, 5] as const).map((r) => ({
      rating: String(r),
      count: data.summary.distribution[r],
      color: RATING_COLORS[r],
    }))
  }, [data])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-400">
        Cargando NPS...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-600">
        Error cargando NPS: {error}
      </div>
    )
  }

  if (!data) return null

  const { summary, topDrivers, bottomDrivers, trend, negativeComments } = data

  return (
    <div className="space-y-6" data-testid="nps-dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="NPS Score"
          value={
            <span data-testid="nps-score">
              {summary.nps != null ? summary.nps : '-'}
            </span>
          }
          icon={<TrendingUp size={18} />}
          valueColor={npsColorClass(summary.nps)}
          hint={npsBucketLabel(summary.nps)}
        />
        <KPICard
          label="Rating promedio"
          value={
            summary.avgRating != null ? (
              <span className="inline-flex items-center gap-1">
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
                <span data-testid="nps-avg-rating">{summary.avgRating}</span>
              </span>
            ) : (
              '-'
            )
          }
          icon={<Star size={18} />}
        />
        <KPICard
          label="Total encuestas"
          value={<span data-testid="nps-total-responses">{summary.totalResponses}</span>}
          icon={<MessageSquare size={18} />}
        />
        <KPICard
          label="Tasa de respuesta"
          value={summary.responseRatePct != null ? `${summary.responseRatePct}%` : '-'}
          icon={<UsersIcon size={18} />}
          hint="de entregas completadas"
        />
      </div>

      <ChartCard title="Distribucion de ratings" subtitle="Respuestas por estrella">
        {summary.totalResponses === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
            Sin encuestas en el periodo
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="rating" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Respuestas">
                {distributionData.map((entry) => (
                  <Cell key={entry.rating} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Tendencia semanal" subtitle="Rating promedio por semana">
        {trend.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">
            Sin datos suficientes
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="weekStart"
                stroke="#9ca3af"
                fontSize={11}
                tickFormatter={(v) => format(parseISO(v as string), 'dd MMM')}
              />
              <YAxis stroke="#9ca3af" fontSize={11} domain={[1, 5]} />
              <Tooltip
                labelFormatter={(v) => format(parseISO(v as string), 'dd MMM yyyy')}
                formatter={(value) => [value as number, 'Rating promedio']}
              />
              <Line type="monotone" dataKey="avgRating" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Mejores conductores" subtitle="Top 5 por rating (min 3 respuestas)">
          {topDrivers.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">Sin datos suficientes</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {topDrivers.map((d, i) => (
                <li key={d.driverId} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-semibold w-5 text-gray-400">{i + 1}</span>
                    <span className="text-sm text-gray-900 truncate">{d.driverName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">{d.totalResponses}</span>
                    <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                      <Star size={12} className="fill-yellow-400 text-yellow-400" />
                      {d.avgRating}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Conductores a coachear" subtitle="Bottom 5 por rating (min 3 respuestas)">
          {bottomDrivers.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">Sin datos suficientes</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {bottomDrivers.map((d, i) => (
                <li key={d.driverId} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-semibold w-5 text-gray-400">{i + 1}</span>
                    <span className="text-sm text-gray-900 truncate">{d.driverName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400">{d.totalResponses}</span>
                    <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                      <Star size={12} className="fill-yellow-400 text-yellow-400" />
                      {d.avgRating}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Comentarios negativos"
        subtitle={`${negativeComments.length} con rating ≤ 2`}
      >
        {negativeComments.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">Ningún comentario negativo</div>
        ) : (
          <ul className="space-y-3">
            {negativeComments.map((n) => (
              <li
                key={n.feedback.id}
                className="border border-red-100 bg-red-50/40 rounded-lg p-3"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-medium text-red-700">{n.feedback.rating} ★</span>
                      <span>·</span>
                      <span>{format(parseISO(n.feedback.submittedAt), 'dd/MM/yyyy HH:mm')}</span>
                      {n.driverName && (
                        <>
                          <span>·</span>
                          <span className="truncate">{n.driverName}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1 italic">"{n.feedback.comment}"</p>
                    <div className="mt-1 text-xs text-gray-500 flex items-center gap-2">
                      {n.customerName && <span>{n.customerName}</span>}
                      <Link
                        to={`/plans/stop/${n.feedback.planStopId}`}
                        className="text-blue-600 hover:underline"
                      >
                        Ver parada
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  )
}
