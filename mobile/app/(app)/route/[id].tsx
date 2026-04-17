import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  StyleSheet,
  Alert,
} from 'react-native'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { isTrackingActive, startTracking, stopTracking } from '@/lib/location'
import { useAuth } from '@/contexts/AuthContext'
import type { PlanStop, Stop, Route, Plan, StopStatus } from '@/types/database'
import { colors, spacing, radius } from '@/theme'
import {
  RouteMapWebView,
  type DepotLocation,
  type RouteMapStop,
} from '@/components/RouteMapWebView'
import { TrackingBadge } from '@/components/TrackingBadge'
import { SyncStatusBar } from '@/components/SyncStatusBar'

interface PlanStopRow extends PlanStop {
  stop: Stop
}

type RouteWithRelations = Route & { plan?: Plan }

const STATUS_STYLES: Record<StopStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: colors.textMuted, bg: colors.border },
  completed: { label: 'Completada', color: colors.success, bg: colors.successBg },
  incomplete: { label: 'Fallida', color: colors.warning, bg: colors.warningBg },
  cancelled: { label: 'Cancelada', color: colors.danger, bg: colors.dangerBg },
}

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { driver } = useAuth()
  const [route, setRoute] = useState<RouteWithRelations | null>(null)
  const [stops, setStops] = useState<PlanStopRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [startingRoute, setStartingRoute] = useState(false)
  const [finishingRoute, setFinishingRoute] = useState(false)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [tracking, setTracking] = useState(false)
  const [depot, setDepot] = useState<DepotLocation | null>(null)

  const load = useCallback(async () => {
    if (!id) return

    const { data: routeData } = await supabase
      .from('routes')
      .select('*, plan:plans(*)')
      .eq('id', id)
      .maybeSingle()

    if (routeData) setRoute(routeData as unknown as RouteWithRelations)

    const { data: stopsData } = await supabase
      .from('plan_stops')
      .select('*, stop:stops(*)')
      .eq('route_id', id)
      .order('order_index', { ascending: true })

    setStops((stopsData as unknown as PlanStopRow[]) ?? [])
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Fetch org depot so the map mirrors the web: depot as start/end of the
  // route line plus a distinct house-icon marker.
  useEffect(() => {
    if (!driver?.org_id) {
      setDepot(null)
      return
    }
    let cancelled = false
    supabase
      .from('organizations')
      .select('default_depot_lat, default_depot_lng, default_depot_address')
      .eq('id', driver.org_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const lat = data.default_depot_lat as number | null
        const lng = data.default_depot_lng as number | null
        if (typeof lat === 'number' && typeof lng === 'number') {
          setDepot({
            lat,
            lng,
            address: (data.default_depot_address as string | null) ?? null,
          })
        } else {
          setDepot(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [driver?.org_id])

  // Reflect actual tracking state on mount — if the app was backgrounded and
  // the OS kept the location task alive, we want the badge to show up
  // immediately instead of waiting for the next Iniciar/Finalizar tap.
  useEffect(() => {
    let cancelled = false
    isTrackingActive()
      .then((active) => {
        if (!cancelled) setTracking(active)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // Refetch cada vez que la pantalla gana foco (e.g. al volver de stop/[id]).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      load().then(() => {
        if (cancelled) return
      })
      return () => {
        cancelled = true
      }
    }, [load]),
  )

  // Realtime: driver location updates while the route is in transit.
  useEffect(() => {
    if (!driver?.id || route?.status !== 'in_transit') {
      setDriverLocation(null)
      return
    }

    let cancelled = false

    // Seed with the latest known location (if any) so the marker shows up
    // immediately without waiting for the first realtime event.
    supabase
      .from('driver_locations')
      .select('lat, lng, recorded_at')
      .eq('driver_id', driver.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        if (typeof data.lat === 'number' && typeof data.lng === 'number') {
          setDriverLocation({ lat: data.lat, lng: data.lng })
        }
      })

    const channel = supabase
      .channel(`driver-location-${driver.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${driver.id}`,
        },
        (payload) => {
          const row = payload.new as { lat?: number; lng?: number } | null
          if (row && typeof row.lat === 'number' && typeof row.lng === 'number') {
            setDriverLocation({ lat: row.lat, lng: row.lng })
          }
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [driver?.id, route?.status])

  const mapStops = useMemo<RouteMapStop[]>(() => {
    return stops
      .map((s, index) => {
        const lat = s.stop?.lat
        const lng = s.stop?.lng
        if (typeof lat !== 'number' || typeof lng !== 'number') return null
        return {
          id: s.id,
          lat,
          lng,
          name: s.stop?.name ?? `Parada ${index + 1}`,
          order: index + 1,
          status: s.status,
        } satisfies RouteMapStop
      })
      .filter((s): s is RouteMapStop => s !== null)
  }, [stops])

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function handleStartRoute() {
    if (!route) return
    setStartingRoute(true)
    await supabase
      .from('routes')
      .update({ status: 'in_transit' })
      .eq('id', route.id)

    if (driver?.id) {
      const ok = await startTracking(route.id, driver.id)
      setTracking(ok)
      if (!ok) {
        Alert.alert(
          'Seguimiento de ubicacion',
          'No se pudo iniciar el seguimiento GPS en background. La ruta sigue activa pero las ubicaciones no se enviaran.',
        )
      }
    } else {
      Alert.alert(
        'Seguimiento de ubicacion',
        'No se encontro el conductor asociado al usuario; el seguimiento GPS no se iniciara.',
      )
    }

    setStartingRoute(false)
    await load()
  }

  async function finalizeRoute() {
    if (!route) return
    setFinishingRoute(true)
    await supabase
      .from('routes')
      .update({ status: 'completed' })
      .eq('id', route.id)
    await stopTracking()
    setTracking(false)
    setFinishingRoute(false)
    await load()
  }

  async function reopenRoute() {
    if (!route || !driver?.id) return
    setFinishingRoute(true)
    await supabase
      .from('routes')
      .update({ status: 'in_transit' })
      .eq('id', route.id)
    // Reanuda el GPS tracking para que el dispatcher lo vea en vivo.
    const ok = await startTracking(route.id, driver.id).catch(() => false)
    setTracking(!!ok)
    setFinishingRoute(false)
    await load()
  }

  function handleReopenRoute() {
    if (!route) return
    Alert.alert(
      'Reabrir ruta',
      'La ruta volverá a estar activa y el seguimiento GPS se reanudará. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reabrir', style: 'default', onPress: reopenRoute },
      ],
    )
  }

  function handleFinishRoute() {
    if (!route) return
    const pendingCount = stops.filter((s) => s.status === 'pending').length
    const total = stops.length

    if (pendingCount === 0) {
      // Camino feliz: todas reportadas → confirmación simple.
      Alert.alert(
        'Finalizar ruta',
        `Vas a cerrar esta ruta con ${total} paradas reportadas. ¿Continuar?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Finalizar', style: 'default', onPress: finalizeRoute },
        ],
      )
      return
    }

    // Hay pendientes: doble confirmación con tono de advertencia.
    Alert.alert(
      `Quedan ${pendingCount} parada${pendingCount === 1 ? '' : 's'} sin reportar`,
      `Si finalizas ahora, esa${pendingCount === 1 ? '' : 's'} ${pendingCount} parada${pendingCount === 1 ? '' : 's'} quedará${pendingCount === 1 ? '' : 'n'} sin entrega registrada. Esta accion no se puede deshacer.`,
      [
        { text: 'Seguir en la ruta', style: 'cancel' },
        {
          text: 'Finalizar igualmente',
          style: 'destructive',
          onPress: () => {
            // Segundo alert para evitar taps accidentales.
            Alert.alert(
              'Confirmar cierre',
              `Se cerrara la ruta con ${pendingCount} de ${total} paradas pendientes. ¿Estas seguro?`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Si, finalizar',
                  style: 'destructive',
                  onPress: finalizeRoute,
                },
              ],
            )
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  const nextPending = stops.find((s) => s.status === 'pending')
  const completedCount = stops.filter((s) => s.status === 'completed').length

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: route?.plan?.name ?? 'Ruta' }} />

      <View style={styles.summary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Progreso</Text>
          <View style={styles.summaryValueRow}>
            <Text style={styles.summaryValue}>
              {completedCount} / {stops.length} paradas
            </Text>
            <TrackingBadge active={tracking && route?.status === 'in_transit'} />
          </View>
        </View>
        {route?.status === 'not_started' && (
          <Pressable
            onPress={handleStartRoute}
            disabled={startingRoute}
            style={({ pressed }) => [styles.startButton, pressed && { opacity: 0.85 }]}
          >
            {startingRoute ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Iniciar ruta</Text>
            )}
          </Pressable>
        )}
        {route?.status === 'in_transit' && (
          <Pressable
            onPress={handleFinishRoute}
            disabled={finishingRoute}
            style={({ pressed }) => [styles.finishButton, pressed && { opacity: 0.85 }]}
          >
            {finishingRoute ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Finalizar ruta</Text>
            )}
          </Pressable>
        )}
        {route?.status === 'completed' && (
          <Pressable
            onPress={handleReopenRoute}
            disabled={finishingRoute}
            style={({ pressed }) => [styles.reopenButton, pressed && { opacity: 0.85 }]}
          >
            {finishingRoute ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.reopenButtonText}>Reabrir ruta</Text>
            )}
          </Pressable>
        )}
      </View>

      <SyncStatusBar />

      {(mapStops.length > 0 || depot) && (
        <RouteMapWebView
          stops={mapStops}
          driverLocation={driverLocation}
          depot={depot}
          style={styles.map}
        />
      )}

      {nextPending && route?.status !== 'not_started' && (
        <Pressable
          onPress={() => openMapsFor(nextPending.stop)}
          style={({ pressed }) => [styles.nextBanner, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.nextBannerLabel}>Siguiente parada · Tocar para navegar</Text>
          <Text style={styles.nextBannerTitle}>{nextPending.stop?.name}</Text>
          {nextPending.stop?.address && (
            <Text style={styles.nextBannerAddress}>{nextPending.stop.address}</Text>
          )}
        </Pressable>
      )}

      <FlatList
        data={stops}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Esta ruta no tiene paradas.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <StopRow
            planStop={item}
            index={index}
            onPress={() => router.push(`/(app)/stop/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  )
}

function openMapsFor(stop: Stop | null | undefined): void {
  if (!stop) return
  const { lat, lng, address } = stop
  if (typeof lat === 'number' && typeof lng === 'number') {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    )
  } else if (address) {
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
    )
  }
}

function StopRow({
  planStop,
  index,
  onPress,
}: {
  planStop: PlanStopRow
  index: number
  onPress: () => void
}) {
  const styleDef = STATUS_STYLES[planStop.status]
  const tw = planStop.stop?.time_window_start && planStop.stop?.time_window_end
    ? `${planStop.stop.time_window_start.slice(0, 5)} - ${planStop.stop.time_window_end.slice(0, 5)}`
    : null
  const pending = planStop.status === 'pending'
  const ctaLabel = pending ? 'Completar' : 'Ver detalle'

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stopCard, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.stopOrder}>
        <Text style={styles.stopOrderText}>{index + 1}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.stopHeader}>
          <Text style={styles.stopName} numberOfLines={1}>
            {planStop.stop?.name}
          </Text>
          <View style={[styles.stopBadge, { backgroundColor: styleDef.bg }]}>
            <Text style={[styles.stopBadgeText, { color: styleDef.color }]}>
              {styleDef.label}
            </Text>
          </View>
        </View>
        {planStop.stop?.address && (
          <Text style={styles.stopAddress} numberOfLines={2}>
            {planStop.stop.address}
          </Text>
        )}
        <View style={styles.stopFooter}>
          {tw && <Text style={styles.stopMeta}>{tw}</Text>}
          <Pressable
            onPress={onPress}
            hitSlop={8}
            style={({ pressed }) => [
              pending ? styles.ctaPrimary : styles.ctaSecondary,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={pending ? styles.ctaPrimaryText : styles.ctaSecondaryText}>
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  summaryLabel: { fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' },
  summaryValueRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  summaryValue: { fontSize: 18, fontWeight: '600', color: colors.text },
  startButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  finishButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  reopenButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.md,
  },
  reopenButtonText: { color: colors.primary, fontWeight: '600' },
  startButtonText: { color: '#fff', fontWeight: '600' },
  map: {
    height: 280,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  nextBanner: {
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  nextBannerLabel: { color: '#c7d2fe', fontSize: 11, textTransform: 'uppercase', fontWeight: '600' },
  nextBannerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 4 },
  nextBannerAddress: { color: '#e0e7ff', fontSize: 13, marginTop: 2 },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textLight },
  stopCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  stopOrder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopOrderText: { fontSize: 12, fontWeight: '700', color: colors.text },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stopName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  stopAddress: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  stopBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  stopBadgeText: { fontSize: 10, fontWeight: '600' },
  stopFooter: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm, gap: spacing.md },
  stopMeta: { fontSize: 12, color: colors.textMuted },
  ctaPrimary: {
    marginLeft: 'auto',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  ctaPrimaryText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  ctaSecondary: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaSecondaryText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
})
