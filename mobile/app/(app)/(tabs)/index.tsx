import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native'
import {
  LoadingStrip,
  PullRefreshIndicator,
  usePullRefresh,
} from '@/components/PullRefreshIndicator'
import { SyncStatusBar } from '@/components/SyncStatusBar'
import { router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Route, Plan, Vehicle, StopStatus } from '@/types/database'
import { colors, spacing, radius, shadow } from '@/theme'

interface RouteCard extends Route {
  plan: Plan
  vehicle: Vehicle | null
  stops_total: number
  stops_completed: number
  stops_statuses: StopStatus[]
}

function todayIso(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const DAYS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miercoles',
  'Jueves',
  'Viernes',
  'Sabado',
]

const MONTHS_ES = [
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

function formatToday(): string {
  const d = new Date()
  return `${DAYS_ES[d.getDay()]}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`
}

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<RouteCard>)

export default function HomeScreen() {
  const { driver } = useAuth()
  const [routes, setRoutes] = useState<RouteCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  const todayLabel = useMemo(() => formatToday(), [])

  const loadRoutes = useCallback(async () => {
    if (!driver) return
    const today = todayIso()

    const { data: routesData, error: routesError } = await supabase
      .from('routes')
      .select('*, plan:plans!inner(*), vehicle:vehicles(*)')
      .eq('driver_id', driver.id)
      .eq('plan.date', today)

    if (routesError || !routesData) {
      setRoutes([])
      return
    }

    const routeIds = routesData.map((r) => r.id)
    const statusesByRoute: Record<string, StopStatus[]> = {}

    if (routeIds.length > 0) {
      const { data: stopsData } = await supabase
        .from('plan_stops')
        .select('route_id, status, order_index')
        .in('route_id', routeIds)
        .order('order_index', { ascending: true })

      for (const ps of stopsData ?? []) {
        const rid = ps.route_id as string
        if (!statusesByRoute[rid]) statusesByRoute[rid] = []
        statusesByRoute[rid].push(ps.status as StopStatus)
      }
    }

    const enriched: RouteCard[] = routesData.map((r) => {
      const statuses = statusesByRoute[(r as any).id] ?? []
      return {
        ...(r as unknown as Route),
        plan: (r as any).plan as Plan,
        vehicle: (r as any).vehicle as Vehicle | null,
        stops_total: statuses.length,
        stops_completed: statuses.filter((s) => s === 'completed').length,
        stops_statuses: statuses,
      }
    })

    setRoutes(enriched)
  }, [driver])

  useEffect(() => {
    loadRoutes().finally(() => setLoading(false))
  }, [loadRoutes])

  // Realtime: reaccionar a cambios hechos por el dispatcher en cualquier
  // ruta del día (asignación, cambio de status, reasignación de driver).
  // Los filtros de postgres_changes no soportan combinar driver_id + plan.date,
  // así que nos suscribimos a todas las rutas del driver y filtramos por fecha
  // en el handler recargando la lista completa (es barato: pocas rutas/día).
  useEffect(() => {
    if (!driver?.id) return

    const channel = supabase
      .channel(`driver-routes-${driver.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'routes',
          filter: `driver_id=eq.${driver.id}`,
        },
        () => {
          loadRoutes()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plan_stops',
        },
        () => {
          loadRoutes()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [driver?.id, loadRoutes])

  const handleRefresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    try {
      await loadRoutes()
    } finally {
      setRefreshing(false)
      refreshingRef.current = false
    }
  }, [loadRoutes])

  const { scrollY, onScroll, onScrollEndDrag } = usePullRefresh(handleRefresh)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const routesCountLabel =
    routes.length === 0
      ? 'No tienes rutas asignadas para hoy'
      : `${routes.length} ruta${routes.length === 1 ? '' : 's'} para hoy`

  return (
    <View style={styles.safe}>
      <PullRefreshIndicator scrollY={scrollY} />
      <AnimatedFlatList
        data={routes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.listContent}
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View>
            <View style={styles.greetingBanner}>
              <Text style={styles.greetingHello}>
                Hola, {driver?.first_name ?? 'conductor'}
              </Text>
              <Text style={styles.greetingDate}>{todayLabel}</Text>
              <Text style={styles.greetingCount}>{routesCountLabel}</Text>
            </View>
            <SyncStatusBar />
            <LoadingStrip visible={refreshing} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sin rutas</Text>
            <Text style={styles.emptyText}>
              Si esperabas rutas para hoy, desliza hacia abajo para refrescar.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <RouteItemCard
            route={item}
            onPress={() => router.push(`/(app)/route/${item.id}`)}
          />
        )}
      />
    </View>
  )
}

function RouteItemCard({
  route,
  onPress,
}: {
  route: RouteCard
  onPress: () => void
}) {
  const failedCount = route.stops_statuses.filter(
    (s) => s === 'incomplete' || s === 'cancelled',
  ).length
  const reportedCount = route.stops_completed + failedCount

  const statusLabel: Record<string, string> = {
    not_started: 'Por iniciar',
    in_transit: 'En curso',
    completed: 'Completada',
  }

  const statusBg: Record<string, string> = {
    not_started: '#f1f5f9', // slate-100
    in_transit: colors.infoBg,
    completed: colors.successBg,
  }

  const statusFg: Record<string, string> = {
    not_started: colors.textMuted,
    in_transit: colors.info,
    completed: colors.success,
  }

  const label = statusLabel[route.status] ?? route.status
  const bg = statusBg[route.status] ?? '#f1f5f9'
  const fg = statusFg[route.status] ?? colors.textMuted

  const vehicleInitial = (route.vehicle?.name ?? 'V').trim().charAt(0).toUpperCase()

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {route.plan?.name ?? 'Ruta'}
          </Text>
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
          </View>
        </View>
        <View style={styles.chevron}>
          <Text style={styles.chevronIcon}>›</Text>
        </View>
      </View>

      {route.vehicle && (
        <View style={styles.vehicleRow}>
          <View style={styles.vehicleBadge}>
            <Text style={styles.vehicleBadgeText}>{vehicleInitial}</Text>
          </View>
          <Text style={styles.vehicleText} numberOfLines={1}>
            {route.vehicle.name}
            {route.vehicle.license_plate ? ` · ${route.vehicle.license_plate}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>Progreso</Text>
        <Text style={styles.progressCount}>
          {reportedCount} / {route.stops_total} paradas
        </Text>
      </View>
      <View style={styles.progressBar}>
        {route.stops_statuses.map((s, i) => {
          const bg =
            s === 'completed'
              ? colors.success
              : s === 'incomplete' || s === 'cancelled'
                ? colors.warning
                : 'transparent'
          return (
            <View
              key={i}
              style={[styles.progressSegment, { backgroundColor: bg }]}
            />
          )
        })}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // El padre del scroll va en gris para que el BOTTOM bounce muestre gris.
  // El TOP bounce se cubre con el stretchy header del greeting (margin negativo).
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  listContent: {
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  // Stretchy header: el greeting usa el MISMO color que el nav header
  // (navy950) y se extiende con padding negativo hacia arriba para que
  // el pull-to-refresh muestre el mismo tono sin costuras.
  greetingBanner: {
    backgroundColor: colors.navy950,
    paddingHorizontal: spacing.lg,
    paddingTop: 500 + spacing.lg,
    marginTop: -500,
    paddingBottom: spacing.xl,
    marginBottom: spacing.md,
  },
  greetingHello: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  greetingDate: {
    fontSize: 13,
    color: '#cbd5e1', // slate-300
    marginTop: 4,
    textTransform: 'capitalize',
  },
  greetingCount: {
    fontSize: 13,
    color: '#cbd5e1', // slate-300
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 13 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginHorizontal: spacing.lg,
    ...shadow.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitleWrap: { flex: 1, gap: spacing.sm },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  chevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronIcon: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: '600',
    lineHeight: 24,
    marginTop: -2,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  vehicleBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryBgSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  vehicleText: { fontSize: 13, color: colors.textMuted, flex: 1 },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  progressCount: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  progressSegment: { flex: 1, height: '100%' },
})
