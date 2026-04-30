import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { colors, spacing, radius } from '@/theme'

interface DoneSearchParams {
  id?: string
  delivered?: string
  failed?: string
  total?: string
  /** 'success' | 'partial' | 'all-failed' — controla titulo, color y haptic. */
  outcome?: string
}

interface DepotInfo {
  lat: number
  lng: number
  address?: string | null
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
// Diametro del circulo "fill" — debe cubrir la diagonal de la pantalla.
const FILL_DIAMETER = Math.ceil(Math.sqrt(SCREEN_W ** 2 + SCREEN_H ** 2) * 1.15)

export default function RouteDoneScreen() {
  const params = useLocalSearchParams() as unknown as DoneSearchParams
  const { driver } = useAuth()
  const routeId = typeof params.id === 'string' ? params.id : null
  const delivered = parseIntSafe(params.delivered)
  const failed = parseIntSafe(params.failed)
  const total = parseIntSafe(params.total)
  const outcome: 'success' | 'partial' | 'all-failed' =
    params.outcome === 'all-failed'
      ? 'all-failed'
      : params.outcome === 'partial'
        ? 'partial'
        : 'success'

  const isFailure = outcome === 'all-failed'
  const accent = isFailure ? colors.warning : colors.success
  const iconName: keyof typeof Ionicons.glyphMap = isFailure
    ? 'alert-circle'
    : 'checkmark-circle'

  const [depot, setDepot] = useState<DepotInfo | null>(null)
  // Calculo aqui (depende de depot) el copy. Cuando hay depot, la ruta aun
  // no termino — el chofer todavia tiene que volver para finalizar. No
  // mostramos "Ruta completada" porque seria prematuro y daria incentivo
  // a cerrar la app antes de tiempo.
  const title = isFailure
    ? 'Ruta cerrada con incidencias'
    : depot
      ? 'Pedidos completados'
      : 'Ruta completada'
  const greeting = isFailure
    ? `${failed} parada${failed === 1 ? '' : 's'} sin entrega`
    : depot
      ? 'Vuelve al centro de distribución para finalizar'
      : driver?.first_name
        ? `Buen trabajo, ${driver.first_name}`
        : ''

  useEffect(() => {
    if (!driver?.org_id) return
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
        }
      })
    return () => {
      cancelled = true
    }
  }, [driver?.org_id])

  // Animacion: el accent color crece desde el centro (radial fill) y llena
  // toda la pantalla. Despues entra el icono con un spring grande, y al final
  // el texto y los botones suben en bloque. Se acompana con un haptic chain
  // que se siente "satisfactorio" — selection click + heavy impact + success.
  const fillScale = useSharedValue(0)
  const iconScale = useSharedValue(0)
  const contentOpacity = useSharedValue(0)
  const contentY = useSharedValue(24)

  useEffect(() => {
    fillScale.value = withTiming(1, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
    })
    iconScale.value = withDelay(
      280,
      withSpring(1, { damping: 11, stiffness: 130 }),
    )
    contentOpacity.value = withDelay(540, withTiming(1, { duration: 380 }))
    contentY.value = withDelay(
      540,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    )

    // Haptic chain — pequeno click al toque, golpe satisfactorio cuando el
    // fill termina de cubrir la pantalla, ding final cuando aparece el icono.
    void Haptics.selectionAsync()
    const t1 = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    }, 380)
    const t2 = setTimeout(() => {
      void Haptics.notificationAsync(
        isFailure
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success,
      )
    }, 640)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [
    fillScale,
    iconScale,
    contentOpacity,
    contentY,
    isFailure,
  ])

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fillScale.value }],
  }))
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }))
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }))

  function goBackToRoute() {
    if (routeId) {
      router.replace({ pathname: '/(app)/route/[id]', params: { id: routeId } })
    } else {
      router.replace('/(app)/(tabs)')
    }
  }

  // Volver al detalle de la ruta. NO abre Maps externo — el chofer ya tiene
  // su navegacion de cabecera, y desde la ruta vera el hint "Vuelve al
  // centro de distribución" + el boton "Finalizar ruta" cuando llegue.
  function navigateToDepot() {
    goBackToRoute()
  }

  if (!routeId) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Capa accent que crece desde el centro hasta cubrir la pantalla. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fillLayer,
          {
            width: FILL_DIAMETER,
            height: FILL_DIAMETER,
            borderRadius: FILL_DIAMETER / 2,
            backgroundColor: accent,
            top: (SCREEN_H - FILL_DIAMETER) / 2,
            left: (SCREEN_W - FILL_DIAMETER) / 2,
          },
          fillStyle,
        ]}
      />

      <SafeAreaView style={styles.contentSafe} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Animated.View style={iconStyle}>
              <Ionicons name={iconName} size={140} color="#ffffff" />
            </Animated.View>
          </View>

          <Animated.View style={[styles.textBlock, contentStyle]}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {!!greeting && <Text style={styles.greeting}>{greeting}</Text>}

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Entregadas</Text>
                <Text style={styles.summaryValue}>{delivered}</Text>
              </View>
              {failed > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Fallidas</Text>
                  <Text style={styles.summaryValue}>{failed}</Text>
                </View>
              )}
              <View style={[styles.summaryRow, styles.summaryRowLast]}>
                <Text style={styles.summaryLabel}>Total</Text>
                <Text style={styles.summaryValue}>{total}</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View style={[styles.actions, contentStyle]}>
            {depot && !isFailure ? (
              <Pressable
                onPress={navigateToDepot}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Ionicons name="navigate" size={18} color={accent} />
                <Text style={[styles.primaryBtnText, { color: accent }]}>
                  Volver al centro de distribución
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={goBackToRoute}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.primaryBtnText, { color: accent }]}>
                  Volver a la ruta
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  )
}

function parseIntSafe(v: string | string[] | undefined): number {
  if (typeof v !== 'string') return 0
  const n = parseInt(v, 10)
  return isNaN(n) ? 0 : n
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fillLayer: {
    position: 'absolute',
  },
  contentSafe: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
  },
  textBlock: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  greeting: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.25)',
  },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500',
  },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '600',
  },
})
