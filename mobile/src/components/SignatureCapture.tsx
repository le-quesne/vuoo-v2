import { useRef } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import Signature, {
  type SignatureViewRef,
} from 'react-native-signature-canvas'
import { colors, radius, spacing } from '@/theme'

interface SignatureCaptureProps {
  visible: boolean
  onClose: () => void
  onSave: (base64: string) => void
}

export default function SignatureCapture({
  visible,
  onClose,
  onSave,
}: SignatureCaptureProps) {
  const ref = useRef<SignatureViewRef>(null)

  const handleOK = (signature: string) => {
    // signature is a base64 data URL: "data:image/png;base64,...."
    onSave(signature)
  }

  const handleEmpty = () => {
    // User hit save with no strokes — just close.
    onClose()
  }

  const handleClear = () => {
    ref.current?.clearSignature()
  }

  const handleConfirm = () => {
    ref.current?.readSignature()
  }

  // Hide the library's built-in buttons — we render our own below.
  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; }
    .m-signature-pad--body { border: 1px solid ${colors.border}; border-radius: ${radius.md}px; }
    .m-signature-pad--footer { display: none; margin: 0; }
    body, html { background-color: ${colors.bg}; }
  `

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.closeText}>Cancelar</Text>
          </Pressable>
          <Text style={styles.title}>Firma del cliente</Text>
          <View style={{ width: 70 }} />
        </View>

        <View style={styles.canvasContainer}>
          <Signature
            ref={ref}
            onOK={handleOK}
            onEmpty={handleEmpty}
            webStyle={webStyle}
            descriptionText=""
            imageType="image/png"
            backgroundColor={colors.card}
            penColor={colors.text}
            dataURL=""
            trimWhitespace
          />
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.secondaryBtnText}>Limpiar</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { backgroundColor: colors.primaryDark },
            ]}
          >
            <Text style={styles.primaryBtnText}>Guardar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    width: 70,
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  canvasContainer: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.bg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  secondaryBtnText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
})
