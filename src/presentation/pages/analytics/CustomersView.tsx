import { useEffect, useMemo, useState } from 'react'
import { Download, Star, MessageSquare, Users as UsersIcon, TrendingUp } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { useAnalyticsSummary, useFeedbackSummary } from '@/application/hooks/useAnalyticsData'
import { KPICard } from '../../components/analytics/KPICard'
import { ChartCard } from '../../components/analytics/ChartCard'
import { formatNumber, formatPercent } from '@/application/utils/analyticsFormat'
import { exportToCSV } from '@/application/utils/csvExport'

interface Props {
  from: string
  to: string
  previousFrom: string
  previousTo: string
}

type FeedbackFilter = 'all' | 'positive' | 'negative'

interface FeedbackRow {
  id: string
  rating: number
  comment: string | null
  submitted_at: string
  driver: { first_name: string; last_name: string } | null
  plan_stops: {
    stop: {
      customer_name: string | null
      name: string
      address: string | null
    } | null
  } | null
}

const RATING_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#facc15',
  4: '#84cc16',
  5: '#22c55e',
}

export function CustomersView({ from, to }: Props) {
  const { currentOrg } = useAuth()
  const feedback = useFeedbackSummary(from, to)
  const summary = useAnalyticsSummary(from, to)

  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FeedbackFilter>('all')

  useEffect(() => {
    if (!currentOrg?.id) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('delivery_feedback')
      .select(
        'id, rating, comment, submitted_at, driver:drivers(first_name, last_name), plan_stops!inner(stop:stops(customer_name, name, address))',
      )
      .eq('org_id', currentOrg.id)
      .gte('submitted_at', from)
      .lte('submitted_at', `${to}T23:59:59`)
      .order('submitted_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled) return
        setFeedbacks((data as unknown as FeedbackRow[]) ?? [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  const fb = feedback.data

  const npsColor = useMemo(() => {
    if (!fb || fb.nps == null) return 'text-gray-400'
    if (fb.nps > 50) return 'text-green-600'
    if (fb.nps >= 0) return 'text-yellow-500'
    return 'text-red-500'
  }, [fb])

  const ratingDistribution = useMemo(() => {
    if (!fb) return []
    return [
      { rating: '1', count: fb.rating_1, color: RATING_COLORS[1] },
      { rating: '2', count: fb.rating_2, color: RATING_COLORS[2] },
      { rating: '3', count: fb.rating_3, color: RATING_COLORS[3] },
      { rating: '4', count: fb.rating_4, color: RATING_COLORS[4] },
      { rating: '5', count: fb.rating_5, color: RATING_COLORS[5] },
    ]
  }, [fb])

  const responseRate = useMemo(() => {
    if (!fb || !summary.data || summary.data.stops_completed === 0) return null
    return (fb.total_responses / summary.data.stops_completed) * 100
  }, [fb, summary.data])

  const filteredFeedbacks = useMemo(() => {
    if (filter === 'all') return feedbacks
    if (filter === 'positive') return feedbacks.filter((f) => f.rating >= 4)
    return feedbacks.filter((f) => f.rating <= 3)
  }, [feedbacks, filter])

  function handleExport() {
    exportToCSV(
      `satisfaccion_${from}_${to}.csv`,
      filteredFeedbacks.map((f) => ({
        date: f.submitted_at,
        rating: f.rating,
        customer: f.plan_stops?.stop?.customer_name ?? f.plan_stops?.stop?.name ?? '',
        driver: f.driver ? `${f.driver.first_name} ${f.driver.last_name}` : '',
        comment: f.comment ?? '',
      })),
      {
        date: 'Fecha',
        rating: 'Rating',
        customer: 'Cliente',
        driver: 'Conductor',
        comment: 'Comentario',
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Clientes</h2>
          <p className="text-sm text-gray-500 mt-1">Satisfaccion y NPS</p>
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
          label="NPS Score"
          value={fb && fb.nps != null ? Math.round(fb.nps) : '-'}
          icon={<TrendingUp size={18} />}
          valueColor={npsColor}
          hint={fb && fb.nps != null ? (fb.nps > 50 ? 'Excelente' : fb.nps >= 0 ? 'Mejorable' : 'Critico') : undefined}
        />
        <KPICard
          label="Rating promedio"
          value={
            fb && fb.avg_rating != null ? (
              <span className="inline-flex items-center gap-1">
                <Star size={18} className="fill-yellow-400 text-yellow-400" />
                {fb.avg_rating}
              </span>
            ) : (
              '-'
            )
          }
          icon={<Star size={18} />}
        />
        <KPICard
          label="Total encuestas"
          value={formatNumber(fb?.total_responses ?? 0)}
          icon={<MessageSquare size={18} />}
        />
        <KPICard
          label="Tasa de respuesta"
          value={responseRate != null ? formatPercent(responseRate) : '-'}
          icon={<UsersIcon size={18} />}
          hint="de entregas completadas"
        />
      </div>

      <ChartCard title="Distribucion de ratings" subtitle="Respuestas por estrella">
        {feedback.loading ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Cargando...</div>
        ) : !fb || fb.total_responses === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-gray-400">Sin encuestas en el periodo</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ratingDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="rating" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip />
              <Bar dataKey="count" name="Respuestas">
                {ratingDistribution.map((entry) => (
                  <Cell key={entry.rating} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard
        title="Ultimos feedbacks"
        subtitle={`${filteredFeedbacks.length} respuestas`}
        actions={
          <div className="flex gap-1 bg-gray-100 rounded-full p-0.5">
            {(['all', 'positive', 'negative'] as FeedbackFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'positive' ? 'Positivos' : 'Negativos'}
              </button>
            ))}
          </div>
        }
      >
        {loading ? (
          <div className="text-sm text-gray-400 py-6 text-center">Cargando...</div>
        ) : filteredFeedbacks.length === 0 ? (
          <div className="text-sm text-gray-400 py-6 text-center">Sin feedbacks</div>
        ) : (
          <div className="space-y-3">
            {filteredFeedbacks.map((f) => (
              <div key={f.id} className="border border-gray-100 rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={
                              i < f.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'
                            }
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">
                        {format(parseISO(f.submitted_at), 'dd/MM/yyyy HH:mm')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {f.plan_stops?.stop?.customer_name ?? f.plan_stops?.stop?.name ?? 'Cliente'}
                      {f.driver && (
                        <span className="text-gray-400"> - {f.driver.first_name} {f.driver.last_name}</span>
                      )}
                    </div>
                    {f.comment && <p className="text-sm text-gray-600 mt-1 italic">"{f.comment}"</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}
