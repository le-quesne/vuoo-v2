import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { colors, radius, spacing } from '@/theme'

interface TrackingBadgeProps {
  active: boolean
}

/**
 * Pill that shows "GPS activo" with a pulsing dot whenever background/fg
 * location tracking is on. Renders nothing when inactive.
 */
export function TrackingBadge({ active }: TrackingBadgeProps) {
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!active) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active, pulse])

  if (!active) return null

  return (
    <View style={styles.pill}>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
      <Text style={styles.text}>GPS activo</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.success,
    alignSelf: 'flex-start',
    marginLeft: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
})
