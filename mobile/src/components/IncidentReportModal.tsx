import { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native'
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated'
import { supabase } from '@/lib/supabase'
import { colors, spacing, radius } from '@/theme'

type IncidentType =
  | 'vehicle_breakdown'
  | 'accident'
  | 'weather'
  | 'customer_issue'
  | 'other'

const TYPE_OPTIONS: { value: IncidentType; label: string }[] = [
  { value: 'vehicle_breakdown', label: 'Avería de vehículo' },
  { value: 'accident', label: 'Accidente' },
  { value: 'weather', label: 'Clima' },
  { value: 'customer_issue', label: 'Problema con cliente' },
  { value: 'other', label: 'Otro' },
]

interface IncidentReportModalProps {
  visible: boolean
  orgId: string
  driverId: string
  routeId: string | null
  userId: string
  onClose: () => void
  onReported: () => void
  /** Si la ruta esta en curso, permite cerrarla anticipadamente desde aqui. */
  onFinishRouteEarly?: () => void
}

export default function IncidentReportModal({
  visible,
  orgId,
  driverId,
  routeId,
  userId,
  onClose,
  onReported,
  onFinishRouteEarly,
}: IncidentReportModalProps) {
  const [type, setType] = useState<IncidentType>('vehicle_breakdown')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Drag-to-dismiss con gesture-handler + reanimated. Toda la animacion vive
  // en el UI thread — no hay puente JS, asi que no hay saltos por tareas
  // pendientes en el JS thread (causa principal del bug en RN/Fabric).
  const translateY = useSharedValue(0)
  const startY = useSharedValue(0)
  // Cuando activeOffsetY captura el gesto, e.translationY ya vale ~10. Sin
  // este offset, el card "saltaria" 10px al activarse. Lo capturamos en
  // onStart y lo restamos en onUpdate para que el drag arranque desde 0.
  const gestureOffset = useSharedValue(0)

  // activeOffsetY([10, 999]) → el pan solo "se queda" con el gesto cuando el
  // usuario ya bajo 10px. Antes de eso, taps en los botones y scroll interno
  // siguen funcionando normalmente. failOffsetX evita capturar swipes
  // horizontales accidentales.
  const panGesture = Gesture.Pan()
    .activeOffsetY([10, 999])
    .failOffsetX([-20, 20])
    .onStart((e) => {
      startY.value = translateY.value
      gestureOffset.value = e.translationY
    })
    .onUpdate((e) => {
      translateY.value = Math.max(
        0,
        startY.value + (e.translationY - gestureOffset.value),
      )
    })
    .onEnd((e) => {
      if (translateY.value > 80 || e.velocityY > 800) {
        // Cerramos el modal cuando el card terminó de salir de pantalla.
        // NO reseteamos translateY a 0 aqui — eso haria que el card
        // reaparezca brevemente antes de que el Modal se desmonte. El reset
        // se hace en el useEffect cuando visible vuelve a true.
        translateY.value = withTiming(600, { duration: 200 }, (done) => {
          if (done) runOnJS(onClose)()
        })
      } else {
        translateY.value = withSpring(0, { damping: 18 })
      }
    })

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  // El backdrop se desvanece a medida que el card baja: 0px = full opacidad,
  // 300px = transparente. Asi al deslizar para cerrar, el oscurecimiento de
  // atras se va junto con el card.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, 300],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }))

  // Animacion de apertura: el card arranca off-screen y sube a 0. Como el
  // backdrop opacity se interpola sobre translateY, tambien hace fade-in.
  useEffect(() => {
    if (visible) {
      translateY.value = 600
      startY.value = 0
      translateY.value = withTiming(0, { duration: 260 })
    }
  }, [visible, translateY, startY])

  // Cierra el modal con animacion de slide-down (mismo gesto que cuando el
  // usuario lo desliza). Usado por el tap fuera para que la salida sea
  // consistente con el swipe.
  function closeWithAnimation() {
    translateY.value = withTiming(600, { duration: 220 }, (done) => {
      if (done) runOnJS(onClose)()
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    const { error } = await supabase.from('operational_incidents').insert({
      org_id: orgId,
      driver_id: driverId,
      route_id: routeId,
      created_by: userId,
      type,
      description: description.trim() || null,
      resolved: false,
    })
    setSubmitting(false)
    if (error) {
      Alert.alert('Error', 'No se pudo reportar el incidente. Intenta de nuevo.')
      return
    }
    setDescription('')
    setType('vehicle_breakdown')
    onReported()
    onClose()
    // Si el contexto permite cerrar la ruta antes de tiempo, lo hacemos como
    // parte del mismo flujo: el chofer reporta el problema y la ruta se cierra.
    if (onFinishRouteEarly) onFinishRouteEarly()
  }

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, backdropStyle]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitting ? undefined : closeWithAnimation}
        />
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.card, cardStyle]}>
            <View style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>
            <Text style={styles.title}>Reportar incidente</Text>
          <Text style={styles.subtitle}>
            La central recibe este aviso en tiempo real.
          </Text>

          <Text style={styles.label}>Tipo</Text>
          <ScrollView style={styles.typeList} showsVerticalScrollIndicator={false}>
            {TYPE_OPTIONS.map((opt) => {
              const selected = type === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setType(opt.value)}
                  style={({ pressed }) => [
                    styles.typeRow,
                    selected && styles.typeRowSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeText,
                      selected && { color: colors.primary, fontWeight: '600' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <Text style={styles.label}>Qué pasó? (opcional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe brevemente"
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={3}
            style={styles.textarea}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (onFinishRouteEarly) {
                  onClose()
                  onFinishRouteEarly()
                } else {
                  onClose()
                }
              }}
              disabled={submitting}
              style={({ pressed }) => [
                styles.cancelBtn,
                onFinishRouteEarly && styles.dangerBtn,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.cancelText,
                  onFinishRouteEarly && styles.dangerText,
                ]}
              >
                {onFinishRouteEarly ? 'Terminar ruta' : 'Cancelar'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitBtn,
                submitting && { opacity: 0.5 },
                pressed && !submitting && { opacity: 0.85 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Reportar</Text>
              )}
            </Pressable>
          </View>

            {onFinishRouteEarly && (
              <Text style={styles.finishHint}>
                "Terminar ruta" cierra la ruta. "Reportar" envía el aviso y también la cierra.
              </Text>
            )}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  dragHandleArea: {
    paddingVertical: spacing.md,
    marginTop: -spacing.md,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: spacing.md },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  typeList: { maxHeight: 220 },
  typeRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  typeRowSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  typeText: { fontSize: 14, color: colors.text },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: { color: colors.textMuted, fontWeight: '600' },
  dangerBtn: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  dangerText: { color: '#fff', fontWeight: '700' },
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.warning,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700' },
  finishHint: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
})
