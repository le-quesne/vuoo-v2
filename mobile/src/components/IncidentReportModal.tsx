import { useState } from 'react'
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
}

export default function IncidentReportModal({
  visible,
  orgId,
  driverId,
  routeId,
  userId,
  onClose,
  onReported,
}: IncidentReportModalProps) {
  const [type, setType] = useState<IncidentType>('vehicle_breakdown')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

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
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
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
              onPress={onClose}
              disabled={submitting}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
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
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
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
  submitBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.warning,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontWeight: '700' },
})
