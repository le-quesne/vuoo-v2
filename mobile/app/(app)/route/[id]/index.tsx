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
import { Ionicons } from '@expo/vector-icons'
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
import IncidentReportModal from '@/components/IncidentReportModal'

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
  const { driver, refreshDriver, user } = useAuth()
  const [incidentModalOpen, setIncidentModalOpen] = useState(false)
  const [route, setRoute] = useState<RouteWithRelations | null>(null)
  const [stops, setStops] = useState<PlanStopRow[]>([])
  const [loading, setLoading] = useState(true)
  const [stopsExpanded, setStopsExpanded] = useState(false)
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

  // Realtime: cambios hechos por el dispatcher (reasignación de paradas,
  // reorden, nuevas paradas, cambio de driver asignado, cancelación de la
  // ruta). Corre mientras haya `id`, independiente del status.
  useEffect(() => {
    if (!id || !driver?.id) return

    // Nombre unico por mount: si re-entramos a la pantalla antes de que
    // supabase termine de limpiar el canal anterior, un nombre estatico nos
    // devuelve el canal cacheado ya en estado `subscribed` y .on() falla con
    // "cannot add postgres_changes callbacks after subscribe()".
    const channelName = `route-sync-${id}-${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plan_stops',
          filter: `route_id=eq.${id}`,
        },
        () => {
          load()
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'routes',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Route | undefined
          if (!row) return
          if (row.driver_id && row.driver_id !== driver.id) {
            Alert.alert(
              'Ruta reasignada',
              'Esta ruta ya no está asignada a ti. Serás devuelto a la lista de rutas.',
              [{ text: 'Entendido', onPress: () => router.replace('/(app)/(tabs)') }],
            )
            return
          }
          load()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, driver?.id, load])

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
      .channel(`driver-location-${driver.id}-${Date.now()}`)
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
      // Marcar al chofer como "online" automáticamente al arrancar la ruta
      // para que el dispatcher lo vea disponible sin necesidad de que lo
      // haga manualmente desde el perfil.
      if (driver.availability !== 'online') {
        await supabase
          .from('drivers')
          .update({ availability: 'online' })
          .eq('id', driver.id)
        await refreshDriver()
      }
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
  const nextPendingIndex = nextPending
    ? stops.findIndex((s) => s.id === nextPending.id)
    : -1
  const completedCount = stops.filter((s) => s.status === 'completed').length
  // Cuando la ruta esta en curso, el "siguiente" se muestra como tarjeta
  // destacada arriba — lo sacamos de la lista para evitar duplicarlo.
  const showNextCard = !!nextPending && route?.status !== 'not_started'
  // Pendientes arriba en orden de ruta, ya reportadas (completed/incomplete/cancelled)
  // al final con opacidad reducida — el chofer foco en lo que falta.
  const listStops = (() => {
    const indexed = stops.map((s, originalIndex) => ({ stop: s, originalIndex }))
    const filtered = indexed.filter(
      ({ stop }) => !(showNextCard && stop.id === nextPending?.id),
    )
    const pending = filtered.filter(({ stop }) => stop.status === 'pending')
    const done = filtered.filter(({ stop }) => stop.status !== 'pending')
    return [...pending, ...done]
  })()

  const canReportIncident =
    !!driver?.org_id && route?.status !== 'completed'

  // Asumimos round-trip cuando hay depot configurado: el chofer debe volver
  // al depot antes de poder cerrar la ruta. Si la org no tiene depot, no
  // exigimos proximidad y "Finalizar" aparece cuando todas estan reportadas.
  const pendingCount = stops.filter((s) => s.status === 'pending').length
  const hasDepot = !!depot
  const nearDepot = (() => {
    if (!depot || !driverLocation) return false
    return haversineMeters(driverLocation, depot) <= 150
  })()
  const canFinishRoute =
    route?.status === 'in_transit' &&
    pendingCount === 0 &&
    (!hasDepot || nearDepot)
  const waitingForDepot =
    route?.status === 'in_transit' &&
    pendingCount === 0 &&
    hasDepot &&
    !nearDepot

  const failedCount = stops.filter(
    (s) => s.status === 'incomplete' || s.status === 'cancelled',
  ).length
  const completedPct =
    stops.length > 0 ? Math.min(1, completedCount / stops.length) : 0
  const failedPct =
    stops.length > 0 ? Math.min(1 - completedPct, failedCount / stops.length) : 0
  const reportedCount = completedCount + failedCount

  const listHeader = (
    <View>
      <SyncStatusBar />

      {(mapStops.length > 0 || depot) && (
        <RouteMapWebView
          stops={mapStops}
          driverLocation={driverLocation}
          depot={depot}
          style={styles.map}
        />
      )}

      <View style={styles.actionRow}>
        {route?.status === 'not_started' && (
          <Pressable
            onPress={handleStartRoute}
            disabled={startingRoute}
            style={({ pressed }) => [styles.startButton, styles.actionBtn, pressed && { opacity: 0.85 }]}
          >
            {startingRoute ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Iniciar ruta</Text>
            )}
          </Pressable>
        )}
        {canFinishRoute && (
          <Pressable
            onPress={handleFinishRoute}
            disabled={finishingRoute}
            style={({ pressed }) => [styles.finishButton, styles.actionBtn, pressed && { opacity: 0.85 }]}
          >
            {finishingRoute ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Finalizar ruta</Text>
            )}
          </Pressable>
        )}
        {waitingForDepot && (
          <Text style={styles.waitDepotHint}>
            Vuelve al centro de distribución
          </Text>
        )}
        {route?.status === 'completed' && (
          <Pressable
            onPress={handleReopenRoute}
            disabled={finishingRoute}
            style={({ pressed }) => [styles.reopenButton, styles.actionBtn, pressed && { opacity: 0.85 }]}
          >
            {finishingRoute ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.reopenButtonText}>Reabrir ruta</Text>
            )}
          </Pressable>
        )}
      </View>

      {nextPending && route?.status !== 'not_started' && (
        <View style={styles.nextBanner}>
          <Text style={styles.nextBannerLabel}>Siguiente parada</Text>
          <View style={styles.nextTitleRow}>
            {nextPendingIndex >= 0 && (
              <View style={styles.nextOrderBadge}>
                <Text style={styles.nextOrderBadgeText}>
                  {nextPendingIndex + 1}
                </Text>
              </View>
            )}
            <Text style={styles.nextBannerTitle}>{nextPending.stop?.name}</Text>
          </View>
          {nextPending.stop?.address && (
            <Text style={styles.nextBannerAddress}>{nextPending.stop.address}</Text>
          )}
          <View style={styles.nextActions}>
            <Pressable
              onPress={() => openMapsFor(nextPending.stop)}
              style={({ pressed }) => [styles.mapsBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.mapsBtnText}>Abrir en Maps</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/(app)/stop/${nextPending.id}`)}
              style={({ pressed }) => [styles.arrivedBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.arrivedBtnText}>Ya llegué</Text>
            </Pressable>
          </View>
        </View>
      )}

      {listStops.length > 0 && (
        <Pressable
          onPress={() => setStopsExpanded((v) => !v)}
          hitSlop={8}
          accessibilityLabel={
            stopsExpanded ? 'Ocultar próximas paradas' : 'Mostrar próximas paradas'
          }
          style={({ pressed }) => [styles.expandBtn, pressed && { opacity: 0.6 }]}
        >
          <Ionicons
            name={stopsExpanded ? 'chevron-up' : 'ellipsis-horizontal'}
            size={18}
            color={colors.textMuted}
          />
          <Text style={styles.expandBtnText}>
            {stopsExpanded
              ? 'Ocultar próximas paradas'
              : `Ver ${listStops.length} parada${listStops.length === 1 ? '' : 's'} más`}
          </Text>
        </Pressable>
      )}
    </View>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: route?.plan?.name ?? 'Ruta',
          headerRight: () =>
            canReportIncident ? (
              <Pressable
                onPress={() => setIncidentModalOpen(true)}
                hitSlop={12}
                accessibilityLabel="Reportar emergencia"
                style={({ pressed }) => [
                  styles.emergencyHeaderBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="warning" size={22} color={colors.danger} />
              </Pressable>
            ) : null,
        }}
      />

      <View style={styles.miniProgress}>
        <View style={styles.miniProgressTrack}>
          {stops.map((s) => {
            const bg =
              s.status === 'completed'
                ? colors.success
                : s.status === 'incomplete' || s.status === 'cancelled'
                  ? colors.warning
                  : 'transparent'
            return (
              <View
                key={s.id}
                style={[styles.miniProgressSegment, { backgroundColor: bg }]}
              />
            )
          })}
        </View>
        <Text style={styles.miniProgressText}>
          {reportedCount}/{stops.length}
        </Text>
        <TrackingBadge active={tracking && route?.status === 'in_transit'} />
      </View>

      {driver?.org_id && driver?.id && user?.id && (
        <IncidentReportModal
          visible={incidentModalOpen}
          orgId={driver.org_id}
          driverId={driver.id}
          routeId={id ?? null}
          userId={user.id}
          onClose={() => setIncidentModalOpen(false)}
          onReported={() => {}}
          onFinishRouteEarly={
            route?.status === 'in_transit' && !canFinishRoute
              ? handleFinishRoute
              : undefined
          }
        />
      )}

      <FlatList
        data={stopsExpanded ? listStops : []}
        keyExtractor={({ stop }) => stop.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          // Solo mostramos placeholder cuando realmente no hay paradas. Si la
          // lista esta colapsada, el botón "Ver N paradas más" en el header
          // ya comunica que hay items ocultos.
          stopsExpanded || listStops.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {showNextCard ? 'No hay más paradas pendientes.' : 'Esta ruta no tiene paradas.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.stopRowWrap}>
            <StopRow
              planStop={item.stop}
              index={item.originalIndex}
              onPress={() => router.push(`/(app)/stop/${item.stop.id}`)}
            />
          </View>
        )}
      />
    </SafeAreaView>
  )
}

// Distancia haversine en metros entre dos puntos (lat/lng en grados).
function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
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

  return (
    <View
      style={[
        styles.stopCard,
        !pending && styles.stopCardDone,
      ]}
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
        {tw && (
          <View style={styles.stopFooter}>
            <Text style={styles.stopMeta}>{tw}</Text>
          </View>
        )}
      </View>
      <Pressable
        onPress={onPress}
        hitSlop={12}
        accessibilityLabel="Ver detalle de la parada"
        style={({ pressed }) => [styles.stopChevronBtn, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  miniProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  miniProgressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  miniProgressSegment: {
    flex: 1,
    height: '100%',
  },
  miniProgressText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  actionRow: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  actionBtn: {
    width: '100%',
    alignItems: 'center',
  },
  waitDepotHint: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: spacing.md,
  },
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
    height: 400,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  emergencyHeaderBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  nextBanner: {
    margin: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
  },
  nextBannerLabel: { color: '#c7d2fe', fontSize: 11, textTransform: 'uppercase', fontWeight: '600' },
  nextTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  nextOrderBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextOrderBadgeText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  nextBannerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  nextBannerAddress: { color: '#e0e7ff', fontSize: 13, marginTop: 2 },
  nextActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  mapsBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  mapsBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  arrivedBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.success,
    alignItems: 'center',
  },
  arrivedBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  expandBtnText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textLight },
  listContent: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  stopRowWrap: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  stopCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  stopCardDone: { opacity: 0.5 },
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
  stopChevronBtn: {
    marginLeft: spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
})
