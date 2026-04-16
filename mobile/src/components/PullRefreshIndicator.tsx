import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors, spacing } from '@/theme'

// Umbral visual del drag: cuánto hay que arrastrar para que el arco se
// complete y se dispare el refresh.
export const PULL_FULL_DISTANCE = 130

const ARC_RADIUS = 15
const ARC_STROKE = 3
const ARC_CIRC = 2 * Math.PI * ARC_RADIUS
const SVG_SIZE = (ARC_RADIUS + ARC_STROKE) * 2

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * Hook que expone el `scrollY` animado, el `onScroll` handler y un
 * `onScrollEndDrag` que dispara `onTrigger` cuando el usuario soltó el
 * pull más allá del umbral. Pensado para reemplazar al `RefreshControl`
 * nativo — así evitamos duplicar spinners.
 */
export function usePullRefresh(onTrigger?: () => void) {
  const scrollY = useRef(new Animated.Value(0)).current

  const onScroll = useMemo(
    () =>
      Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: false },
      ),
    [scrollY],
  )

  // Leemos el offset directamente del evento para evitar race conditions con
  // el `addListener` asíncrono. Si el user soltó más allá del umbral, dispara.
  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y
      if (y <= -PULL_FULL_DISTANCE && onTrigger) {
        onTrigger()
      }
    },
    [onTrigger],
  )

  return { scrollY, onScroll, onScrollEndDrag }
}

interface ArcProps {
  scrollY: Animated.Value
  color?: string
  trackColor?: string
}

/**
 * Arco absoluto que se completa durante el drag hacia abajo.
 * Se monta con `position: absolute` encima del header. Cuando el usuario
 * suelta, desaparece naturalmente porque `scrollY` vuelve a 0. El estado
 * de carga se representa aparte con `<LoadingStrip />`.
 */
export function PullRefreshIndicator({
  scrollY,
  color = '#ffffff',
  trackColor = 'rgba(255, 255, 255, 0.18)',
}: ArcProps) {
  const dashOffset = scrollY.interpolate({
    inputRange: [-PULL_FULL_DISTANCE, 0],
    outputRange: [0, ARC_CIRC],
    extrapolate: 'clamp',
  })
  const arcOpacity = scrollY.interpolate({
    inputRange: [-24, -6],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  })

  const cx = SVG_SIZE / 2
  const cy = SVG_SIZE / 2

  return (
    <View style={styles.overlayWrap} pointerEvents="none">
      <Animated.View
        style={{
          opacity: arcOpacity,
          transform: [{ rotate: '-90deg' }],
        }}
      >
        <Svg width={SVG_SIZE} height={SVG_SIZE}>
          <Circle
            cx={cx}
            cy={cy}
            r={ARC_RADIUS}
            stroke={trackColor}
            strokeWidth={ARC_STROKE}
            fill="none"
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={ARC_RADIUS}
            stroke={color}
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${ARC_CIRC}`}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      </Animated.View>
    </View>
  )
}

interface StripProps {
  visible: boolean
  color?: string
  trackColor?: string
}

const STRIP_HEIGHT = 58

/**
 * Banda de carga inline. Se monta en el flujo del contenido (típicamente
 * dentro del `ListHeaderComponent`, justo DESPUÉS del hero/banner). Colapsa
 * su altura a 0 cuando no está visible para que no deje huecos.
 */
export function LoadingStrip({
  visible,
  color = colors.primary,
  trackColor = 'rgba(59, 130, 246, 0.2)',
}: StripProps) {
  // Valor JS para animar height + opacity (height no es nativeDriver-safe).
  const reveal = useRef(new Animated.Value(0)).current
  // Valor nativo para la rotación del spinner (sí nativeDriver-safe).
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(reveal, {
      toValue: visible ? 1 : 0,
      duration: 240,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start()
  }, [visible, reveal])

  useEffect(() => {
    if (!visible) {
      spinAnim.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
        easing: Easing.linear,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [visible, spinAnim])

  const height = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, STRIP_HEIGHT],
  })

  const spinRot = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const cx = SVG_SIZE / 2
  const cy = SVG_SIZE / 2
  const partialOffset = ARC_CIRC * 0.75

  return (
    <Animated.View
      style={[styles.stripWrap, { height, opacity: reveal }]}
      pointerEvents="none"
    >
      <Animated.View style={{ transform: [{ rotate: spinRot }] }}>
        <Svg width={SVG_SIZE} height={SVG_SIZE}>
          <Circle
            cx={cx}
            cy={cy}
            r={ARC_RADIUS}
            stroke={trackColor}
            strokeWidth={ARC_STROKE}
            fill="none"
          />
          <Circle
            cx={cx}
            cy={cy}
            r={ARC_RADIUS}
            stroke={color}
            strokeWidth={ARC_STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${ARC_CIRC}`}
            strokeDashoffset={partialOffset}
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  overlayWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.sm,
    zIndex: 20,
  },
  stripWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
