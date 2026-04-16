import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { PlanStop, Stop, StopStatus } from '@/types/database'
import VuooLogo from '@/components/VuooLogo'
import {
  LoadingStrip,
  PullRefreshIndicator,
  usePullRefresh,
} from '@/components/PullRefreshIndicator'
import { colors, spacing, radius, shadow } from '@/theme'

type HistoryItem = PlanStop & { stop: Stop | null }

interface HistorySection {
  title: string
  data: HistoryItem[]
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function itemDateKey(item: HistoryItem): string {
  if (item.execution_date) return item.execution_date
  if (item.report_time) {
    const d = new Date(item.report_time)
    if (!isNaN(d.getTime())) return isoDate(d)
  }
  return '—'
}

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function formatDateLabel(dateKey: string): string {
  if (!dateKey || dateKey === '—') return 'Sin fecha'
  // dateKey is YYYY-MM-DD
  const parts = dateKey.split('-')
  if (parts.length !== 3) return dateKey
  const [y, m, d] = parts.map((p) => Number(p))
  if (!y || !m || !d) return dateKey
  const dt = new Date(y, m - 1, d)
  if (isNaN(dt.getTime())) return dateKey

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const dtMid = new Date(dt)
  dtMid.setHours(0, 0, 0, 0)

  if (dtMid.getTime() === today.getTime()) return 'Hoy'
  if (dtMid.getTime() === yesterday.getTime()) return 'Ayer'

  return `${DAY_SHORT[dt.getDay()]} ${pad2(d)} de ${MONTH_NAMES[m - 1]}`
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function statusBadge(status: StopStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completada', color: colors.success, bg: colors.successBg }
    case 'incomplete':
      return { label: 'Incompleta', color: colors.warning, bg: colors.warningBg }
    case 'cancelled':
      return { label: 'Cancelada', color: colors.danger, bg: colors.dangerBg }
    default:
      return { label: 'Pendiente', color: colors.textMuted, bg: colors.border }
  }
}

export default function HistoryScreen() {
  const { driver } = useAuth()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  const loadHistory = useCallback(async () => {
    if (!driver) {
      setItems([])
      return
    }

    // Step 1 — obtener route_ids del conductor.
    const { data: routesData, error: routesErr } = await supabase
      .from('routes')
      .select('id')
      .eq('driver_id', driver.id)

    if (routesErr || !routesData || routesData.length === 0) {
      setItems([])
      return
    }

    const routeIds = routesData.map((r: { id: string }) => r.id)

    // Step 2 — plan_stops de esas rutas, solo completadas / incompletas.
    const { data: stopsData, error: stopsErr } = await supabase
      .from('plan_stops')
      .select('*, stop:stops(*)')
      .in('route_id', routeIds)
      .in('status', ['completed', 'incomplete'])
      .order('report_time', { ascending: false })
      .limit(100)

    if (stopsErr || !stopsData) {
      setItems([])
      return
    }

    setItems(stopsData as unknown as HistoryItem[])
  }, [driver])

  useEffect(() => {
    loadHistory().finally(() => setLoading(false))
  }, [loadHistory])

  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      await loadHistory()
    } finally {
      setRefreshing(false)
      refreshingRef.current = false
    }
  }, [loadHistory])

  const { scrollY, onScroll, onScrollEndDrag } = usePullRefresh(handleRefresh)

  const sections: HistorySection[] = useMemo(() => {
    const groups = new Map<string, HistoryItem[]>()
    for (const it of items) {
      const key = itemDateKey(it)
      const arr = groups.get(key) ?? []
      arr.push(it)
      groups.set(key, arr)
    }
    // Sort keys descending (most recent first). '—' goes last.
    const keys = Array.from(groups.keys()).sort((a, b) => {
      if (a === '—') return 1
      if (b === '—') return -1
      return a < b ? 1 : a > b ? -1 : 0
    })
    return keys.map((k) => ({
      title: formatDateLabel(k),
      data: groups.get(k) ?? [],
    }))
  }, [items])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  return (
    <View style={styles.safe}>
      <PullRefreshIndicator
        scrollY={scrollY}
        color={colors.primary}
        trackColor="rgba(59, 130, 246, 0.2)"
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        ListHeaderComponent={<LoadingStrip visible={refreshing} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <HistoryCard
            item={item}
            onPress={() => router.push(`/(app)/stop/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <VuooLogo size={56} color={colors.textLight} />
            <Text style={styles.emptyText}>
              Aún no tienes entregas registradas. Cuando completes paradas, aparecerán aquí.
            </Text>
          </View>
        }
      />
    </View>
  )
}

function HistoryCard({ item, onPress }: { item: HistoryItem; onPress: () => void }) {
  const badge = statusBadge(item.status)
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.stopName} numberOfLines={1}>
          {item.stop?.name ?? 'Parada'}
        </Text>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      {item.stop?.address ? (
        <Text style={styles.address} numberOfLines={2}>
          {item.stop.address}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{formatTime(item.report_time)}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stopName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  address: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
  },
  metaRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  meta: {
    fontSize: 12,
    color: colors.textLight,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
})

