import { useEffect, useMemo, useState } from 'react'
import { Download, Star } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { useAnalyticsSummary } from '@/presentation/features/analytics/hooks/useAnalyticsData'
import { ChartCard } from '@/presentation/features/analytics/components/ChartCard'
import { NPSDashboard } from '@/presentation/features/analytics/components/NPSDashboard'
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

export function CustomersView({ from, to }: Props) {
  const { currentOrg } = useAuth()
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

  const completedStops = summary.data?.stops_completed ?? 0

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

      <NPSDashboard from={from} to={to} completedStops={completedStops} />

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
