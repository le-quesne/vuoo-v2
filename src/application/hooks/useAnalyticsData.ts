import { useEffect, useState } from 'react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from './useAuth'
import type {
  AnalyticsSummary,
  DailyTrendRow,
  DriverPerformanceRow,
  CancellationReasonRow,
  FeedbackSummary,
} from '@/data/types/database'

interface State<T> {
  data: T
  loading: boolean
  error: string | null
}

function initial<T>(fallback: T): State<T> {
  return { data: fallback, loading: true, error: null }
}

export function useAnalyticsSummary(from: string, to: string) {
  const { currentOrg } = useAuth()
  const [state, setState] = useState<State<AnalyticsSummary | null>>(() => initial(null))

  useEffect(() => {
    if (!currentOrg?.id) {
      setState({ data: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    supabase
      .rpc('get_analytics_summary', { p_org_id: currentOrg.id, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: null, loading: false, error: error.message })
        } else {
          setState({ data: (data as AnalyticsSummary | null) ?? null, loading: false, error: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  return state
}

export function useDailyTrend(from: string, to: string) {
  const { currentOrg } = useAuth()
  const [state, setState] = useState<State<DailyTrendRow[]>>(() => initial<DailyTrendRow[]>([]))

  useEffect(() => {
    if (!currentOrg?.id) {
      setState({ data: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    supabase
      .rpc('get_daily_trend', { p_org_id: currentOrg.id, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: [], loading: false, error: error.message })
        } else {
          setState({ data: (data as DailyTrendRow[] | null) ?? [], loading: false, error: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  return state
}

export function useDriverPerformance(from: string, to: string) {
  const { currentOrg } = useAuth()
  const [state, setState] = useState<State<DriverPerformanceRow[]>>(() => initial<DriverPerformanceRow[]>([]))

  useEffect(() => {
    if (!currentOrg?.id) {
      setState({ data: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    supabase
      .rpc('get_driver_performance', { p_org_id: currentOrg.id, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: [], loading: false, error: error.message })
        } else {
          setState({ data: (data as DriverPerformanceRow[] | null) ?? [], loading: false, error: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  return state
}

export function useCancellationReasons(from: string, to: string) {
  const { currentOrg } = useAuth()
  const [state, setState] = useState<State<CancellationReasonRow[]>>(() => initial<CancellationReasonRow[]>([]))

  useEffect(() => {
    if (!currentOrg?.id) {
      setState({ data: [], loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    supabase
      .rpc('get_cancellation_reasons', { p_org_id: currentOrg.id, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: [], loading: false, error: error.message })
        } else {
          setState({ data: (data as CancellationReasonRow[] | null) ?? [], loading: false, error: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  return state
}

export function useFeedbackSummary(from: string, to: string) {
  const { currentOrg } = useAuth()
  const [state, setState] = useState<State<FeedbackSummary | null>>(() => initial(null))

  useEffect(() => {
    if (!currentOrg?.id) {
      setState({ data: null, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    supabase
      .rpc('get_feedback_summary', { p_org_id: currentOrg.id, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setState({ data: null, loading: false, error: error.message })
        } else {
          setState({ data: (data as FeedbackSummary | null) ?? null, loading: false, error: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [currentOrg?.id, from, to])

  return state
}
