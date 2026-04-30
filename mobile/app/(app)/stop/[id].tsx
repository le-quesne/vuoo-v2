import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
  StyleSheet,
  Modal,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import NetInfo from '@react-native-community/netinfo'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { enqueueOperation } from '@/lib/offline'
import {
  loadPodDraft,
  savePodDraft,
  clearPodDraft,
  type PodUploadStatus,
} from '@/lib/podDraft'
import SignatureCapture from '@/components/SignatureCapture'
import type { PlanStop, Stop } from '@/types/database'
import { colors, spacing, radius } from '@/theme'

interface PlanStopDetail extends PlanStop {
  stop: Stop
}

const FAIL_REASONS = [
  { value: 'no_hay_nadie', label: 'No habia nadie' },
  { value: 'direccion_incorrecta', label: 'Direccion incorrecta' },
  { value: 'rechazado', label: 'Rechazado por cliente' },
  { value: 'otro', label: 'Otro motivo' },
]

// Convert a base64 string (without data URL prefix) to a Uint8Array.
function base64ToUint8Array(base64: string): Uint8Array {
  // Strip optional data URL prefix.
  const cleaned = base64.includes(',') ? base64.split(',')[1] : base64
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i

  let bufferLength = Math.floor((cleaned.length * 3) / 4)
  if (cleaned[cleaned.length - 1] === '=') bufferLength -= 1
  if (cleaned[cleaned.length - 2] === '=') bufferLength -= 1

  const bytes = new Uint8Array(bufferLength)
  let p = 0
  for (let i = 0; i < cleaned.length; i += 4) {
    const e1 = lookup[cleaned.charCodeAt(i)]
    const e2 = lookup[cleaned.charCodeAt(i + 1)]
    const e3 = lookup[cleaned.charCodeAt(i + 2)]
    const e4 = lookup[cleaned.charCodeAt(i + 3)]
    if (p < bufferLength) bytes[p++] = (e1 << 2) | (e2 >> 4)
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2)
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63)
  }
  return bytes
}

async function resolveStorageUrl(
  bucket: 'delivery-photos' | 'signatures',
  pathOrUrl: string,
): Promise<string | null> {
  // Si ya es URL absoluta, úsala tal cual.
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(pathOrUrl, 60 * 60)
    if (error) {
      console.warn('[stop] createSignedUrl error:', bucket, pathOrUrl, error.message)
      return null
    }
    return data?.signedUrl ?? null
  } catch (err) {
    console.warn('[stop] createSignedUrl threw:', bucket, pathOrUrl, err)
    return null
  }
}

export default function StopExecutionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { driver } = useAuth()
  const [planStop, setPlanStop] = useState<PlanStopDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [photoStatus, setPhotoStatus] = useState<PodUploadStatus>('idle')
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null)
  const [signaturePath, setSignaturePath] = useState<string | null>(null)
  const [signatureStatus, setSignatureStatus] = useState<PodUploadStatus>('idle')
  const [draftRestored, setDraftRestored] = useState(false)
  // Paradas hermanas en la misma ruta — para detectar si esta es la ultima
  // pendiente y disparar la pantalla "Ruta completada".
  const [siblingStatuses, setSiblingStatuses] = useState<
    { id: string; status: string }[]
  >([])
  const [signatureModalOpen, setSignatureModalOpen] = useState(false)
  const [comments, setComments] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failModalOpen, setFailModalOpen] = useState(false)
  const [failReason, setFailReason] = useState<string | null>(null)
  const [podPhotoUrls, setPodPhotoUrls] = useState<string[]>([])
  const [podSignatureUrl, setPodSignatureUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const { data } = await supabase
      .from('plan_stops')
      .select('*, stop:stops(*)')
      .eq('id', id)
      .maybeSingle()
    const ps = data as unknown as PlanStopDetail | null
    setPlanStop(ps)
    if (ps?.route_id) {
      const { data: siblings } = await supabase
        .from('plan_stops')
        .select('id, status')
        .eq('route_id', ps.route_id)
      setSiblingStatuses((siblings ?? []) as { id: string; status: string }[])
    }
  }, [id])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  // Restaura el draft local del POD (si lo hay) cuando se monta la pantalla.
  // Esto cubre el caso "el chofer toma foto/firma sin red, cierra la app, y
  // vuelve antes de marcar como completada". El estado local se persiste en
  // AsyncStorage y se reinyecta al volver, asi no pierde el progreso.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    loadPodDraft(id).then((draft) => {
      if (cancelled || !draft) {
        setDraftRestored(true)
        return
      }
      setPhotoUri(draft.photoUri)
      setPhotoPath(draft.photoPath)
      setPhotoStatus(draft.photoStatus)
      setSignatureBase64(draft.signatureBase64)
      setSignaturePath(draft.signaturePath)
      setSignatureStatus(draft.signatureStatus)
      setComments(draft.comments)
      setDraftRestored(true)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  // Autosave del draft cada vez que cambia algo. Solo despues de haber
  // intentado la restauracion para no pisar lo persistido con valores vacios.
  useEffect(() => {
    if (!id || !draftRestored) return
    if (planStop && planStop.status !== 'pending') return
    void savePodDraft(id, {
      photoUri,
      photoPath,
      photoStatus,
      signatureBase64,
      signaturePath,
      signatureStatus,
      comments,
    })
  }, [
    id,
    draftRestored,
    planStop,
    photoUri,
    photoPath,
    photoStatus,
    signatureBase64,
    signaturePath,
    signatureStatus,
    comments,
  ])

  // Cuando la parada ya fue reportada, resolvemos signed URLs del POD.
  useEffect(() => {
    if (!planStop || planStop.status === 'pending') {
      setPodPhotoUrls([])
      setPodSignatureUrl(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const photos = planStop.report_images ?? []
      const resolved = await Promise.all(
        photos.map((p) => resolveStorageUrl('delivery-photos', p)),
      )
      if (cancelled) return
      setPodPhotoUrls(resolved.filter((u): u is string => !!u))

      if (planStop.report_signature_url) {
        const sig = await resolveStorageUrl(
          'signatures',
          planStop.report_signature_url,
        )
        if (!cancelled) setPodSignatureUrl(sig)
      } else {
        setPodSignatureUrl(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [planStop])

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'No se puede acceder a la camara.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    })
    if (!result.canceled && result.assets[0] && planStop && driver) {
      const uri = result.assets[0].uri
      const path = `${driver.org_id}/${planStop.id}/photo_${Date.now()}.jpg`
      setPhotoUri(uri)
      setPhotoPath(path)
      // Subimos al instante; si falla, encolamos para que la sync queue lo
      // intente cuando vuelva la red. handleComplete ya no toca storage.
      void uploadPhotoNow(uri, path)
    }
  }

  async function uploadPhotoNow(uri: string, path: string) {
    if (!planStop) return
    setPhotoStatus('uploading')
    const netState = await NetInfo.fetch().catch(() => null)
    const onlineHint = netState?.isConnected !== false
    if (onlineHint) {
      try {
        const response = await fetch(uri)
        const blob = await response.blob()
        const arrayBuffer = await new Response(blob).arrayBuffer()
        const { error } = await supabase.storage
          .from('delivery-photos')
          .upload(path, arrayBuffer, {
            contentType: 'image/jpeg',
            upsert: true,
          })
        if (error) {
          await enqueueOperation(
            'upload_photo',
            { planStopId: planStop.id, path },
            uri,
          )
          setPhotoStatus('queued')
          return
        }
        setPhotoStatus('uploaded')
        return
      } catch {
        await enqueueOperation(
          'upload_photo',
          { planStopId: planStop.id, path },
          uri,
        )
        setPhotoStatus('queued')
        return
      }
    }
    await enqueueOperation(
      'upload_photo',
      { planStopId: planStop.id, path },
      uri,
    )
    setPhotoStatus('queued')
  }

  async function uploadSignatureNow(base64: string, path: string) {
    if (!planStop) return
    setSignatureStatus('uploading')
    const netState = await NetInfo.fetch().catch(() => null)
    const onlineHint = netState?.isConnected !== false
    const dataUrl = base64.startsWith('data:')
      ? base64
      : `data:image/png;base64,${base64}`
    if (onlineHint) {
      try {
        const bytes = base64ToUint8Array(base64)
        const { error } = await supabase.storage
          .from('signatures')
          .upload(path, bytes, {
            contentType: 'image/png',
            upsert: true,
          })
        if (error) {
          await enqueueOperation(
            'upload_signature',
            { planStopId: planStop.id, path },
            dataUrl,
          )
          setSignatureStatus('queued')
          return
        }
        setSignatureStatus('uploaded')
        return
      } catch {
        await enqueueOperation(
          'upload_signature',
          { planStopId: planStop.id, path },
          dataUrl,
        )
        setSignatureStatus('queued')
        return
      }
    }
    await enqueueOperation(
      'upload_signature',
      { planStopId: planStop.id, path },
      dataUrl,
    )
    setSignatureStatus('queued')
  }

  // Resumen offline-friendly basado en paradas cargadas + el efecto local
  // del update de esta parada. No depende de re-query post-submit.
  function summaryAfterThisUpdate(newStatus: 'completed' | 'incomplete'): {
    isLastPending: boolean
    delivered: number
    failed: number
    total: number
  } {
    if (!planStop) {
      return { isLastPending: false, delivered: 0, failed: 0, total: 0 }
    }
    const others = siblingStatuses.filter((r) => r.id !== planStop.id)
    const pendingOthers = others.filter((r) => r.status === 'pending').length
    const deliveredOthers = others.filter((r) => r.status === 'completed').length
    const failedOthers = others.filter(
      (r) => r.status === 'incomplete' || r.status === 'cancelled',
    ).length
    const delivered = deliveredOthers + (newStatus === 'completed' ? 1 : 0)
    const failed = failedOthers + (newStatus === 'incomplete' ? 1 : 0)
    return {
      isLastPending: pendingOthers === 0,
      delivered,
      failed,
      total: siblingStatuses.length,
    }
  }

  async function handleComplete() {
    if (!planStop || !driver) return
    if (!photoPath) {
      Alert.alert(
        'Foto requerida',
        'Toma una foto de prueba de entrega antes de completar.',
      )
      return
    }
    if (!signaturePath) {
      Alert.alert(
        'Firma requerida',
        'El cliente debe firmar para confirmar la entrega.',
      )
      return
    }
    setSubmitting(true)

    const now = new Date()
    const existingImages = planStop.report_images ?? []
    const updateFields: Record<string, unknown> = {
      status: 'completed',
      execution_date: now.toISOString().slice(0, 10),
      report_time: now.toISOString(),
      report_comments: comments || null,
      report_images: [...existingImages, photoPath],
    }
    if (signaturePath) {
      updateFields.report_signature_url = signaturePath
    }

    const netState = await NetInfo.fetch().catch(() => null)
    const onlineHint = netState?.isConnected !== false

    let updateQueued = false
    if (onlineHint) {
      const { error } = await supabase
        .from('plan_stops')
        .update(updateFields)
        .eq('id', planStop.id)
      if (error) {
        await enqueueOperation('update_plan_stop', {
          id: planStop.id,
          fields: updateFields,
        })
        updateQueued = true
      }
    } else {
      await enqueueOperation('update_plan_stop', {
        id: planStop.id,
        fields: updateFields,
      })
      updateQueued = true
    }

    setSubmitting(false)

    // El reporte ya esta o subido o encolado — el draft local cumplio su
    // proposito y se puede borrar para no restaurar datos viejos despues.
    void clearPodDraft(planStop.id)

    if (
      updateQueued ||
      photoStatus === 'queued' ||
      signatureStatus === 'queued'
    ) {
      Alert.alert(
        'Guardado localmente',
        'Se sincronizara cuando vuelva la red.',
      )
    }

    // Si era la ultima parada pendiente, vamos a la pantalla de exito.
    // El haptic chain se dispara dentro de done.tsx sincronizado con la
    // animacion del fill — asi se siente como una sola pieza.
    const summary = summaryAfterThisUpdate('completed')
    if (summary.isLastPending && planStop.route_id) {
      const outcome =
        summary.delivered === 0
          ? 'all-failed'
          : summary.failed > 0
            ? 'partial'
            : 'success'
      router.replace({
        pathname: '/(app)/route/[id]/done',
        params: {
          id: planStop.route_id,
          delivered: String(summary.delivered),
          failed: String(summary.failed),
          total: String(summary.total),
          outcome,
        },
      })
      return
    }
    router.back()
  }

  async function handleFail() {
    if (!planStop || !failReason || !driver) return
    setSubmitting(true)

    const now = new Date()
    const existingImages = planStop.report_images ?? []
    const updateFields: Record<string, unknown> = {
      status: 'incomplete',
      execution_date: now.toISOString().slice(0, 10),
      report_time: now.toISOString(),
      report_comments: comments || null,
      report_images: photoPath
        ? [...existingImages, photoPath]
        : existingImages,
      cancellation_reason: failReason,
      delivery_attempts: (planStop.delivery_attempts ?? 0) + 1,
    }

    const netState = await NetInfo.fetch().catch(() => null)
    const onlineHint = netState?.isConnected !== false

    let updateQueued = false
    if (onlineHint) {
      const { error } = await supabase
        .from('plan_stops')
        .update(updateFields)
        .eq('id', planStop.id)
      if (error) {
        await enqueueOperation('update_plan_stop', {
          id: planStop.id,
          fields: updateFields,
        })
        updateQueued = true
      }
    } else {
      await enqueueOperation('update_plan_stop', {
        id: planStop.id,
        fields: updateFields,
      })
      updateQueued = true
    }

    setSubmitting(false)
    setFailModalOpen(false)

    void clearPodDraft(planStop.id)

    if (updateQueued || photoStatus === 'queued') {
      Alert.alert(
        'Guardado localmente',
        'Se sincronizara cuando vuelva la red.',
      )
    }

    const summary = summaryAfterThisUpdate('incomplete')
    if (summary.isLastPending && planStop.route_id) {
      const outcome =
        summary.delivered === 0
          ? 'all-failed'
          : summary.failed > 0
            ? 'partial'
            : 'success'
      router.replace({
        pathname: '/(app)/route/[id]/done',
        params: {
          id: planStop.route_id,
          delivered: String(summary.delivered),
          failed: String(summary.failed),
          total: String(summary.total),
          outcome,
        },
      })
      return
    }
    router.back()
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    )
  }

  if (!planStop) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.textMuted }}>Parada no encontrada</Text>
      </View>
    )
  }

  const alreadyDone = planStop.status !== 'pending'
  const signaturePreviewUri = signatureBase64
    ? signatureBase64.startsWith('data:')
      ? signatureBase64
      : `data:image/png;base64,${signatureBase64}`
    : null

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: planStop.stop?.name ?? 'Parada' }} />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl }}>
        <View style={styles.card}>
          <Text style={styles.stopName}>{planStop.stop?.name}</Text>
          {planStop.stop?.address && (
            <Text style={styles.stopAddress}>{planStop.stop.address}</Text>
          )}
          <View style={styles.metaRow}>
            {planStop.stop?.weight_kg != null && (
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{planStop.stop.weight_kg} kg</Text>
              </View>
            )}
            {planStop.stop?.duration_minutes != null && (
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>{planStop.stop.duration_minutes} min</Text>
              </View>
            )}
            {planStop.stop?.time_window_start && planStop.stop?.time_window_end && (
              <View style={styles.metaPill}>
                <Text style={styles.metaText}>
                  {planStop.stop.time_window_start.slice(0, 5)} - {planStop.stop.time_window_end.slice(0, 5)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {alreadyDone ? (
          <PODCard
            planStop={planStop}
            photoUrls={podPhotoUrls}
            signatureUrl={podSignatureUrl}
          />
        ) : (
          <>
            <View style={[styles.card, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>Prueba de entrega</Text>
              {photoUri ? (
                <View style={styles.photoPreviewContainer}>
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                  <Pressable
                    onPress={() => {
                      setPhotoUri(null)
                      setPhotoPath(null)
                      setPhotoStatus('idle')
                    }}
                    style={({ pressed }) => [styles.photoReplace, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.photoReplaceText}>Cambiar</Text>
                  </Pressable>
                  <UploadStatus status={photoStatus} />
                </View>
              ) : (
                <Pressable
                  onPress={handleTakePhoto}
                  style={({ pressed }) => [styles.photoButton, pressed && { opacity: 0.85 }]}
                >
                  <Text style={styles.photoButtonText}>Tomar foto</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.card, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>Firma</Text>
              {signaturePreviewUri ? (
                <View style={styles.signaturePreviewContainer}>
                  <Image
                    source={{ uri: signaturePreviewUri }}
                    style={styles.signaturePreview}
                    resizeMode="contain"
                  />
                  <View style={styles.signatureActionsRow}>
                    <Pressable
                      onPress={() => setSignatureModalOpen(true)}
                      style={({ pressed }) => [
                        styles.signatureSmallBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.signatureSmallBtnText}>Re-capturar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setSignatureBase64(null)
                        setSignaturePath(null)
                        setSignatureStatus('idle')
                      }}
                      style={({ pressed }) => [
                        styles.signatureSmallBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.signatureSmallBtnText}>Eliminar</Text>
                    </Pressable>
                  </View>
                  <UploadStatus status={signatureStatus} />
                </View>
              ) : (
                <Pressable
                  onPress={() => setSignatureModalOpen(true)}
                  style={({ pressed }) => [
                    styles.photoButton,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.photoButtonText}>Capturar firma</Text>
                </Pressable>
              )}
            </View>

            <View style={[styles.card, { marginTop: spacing.md }]}>
              <Text style={styles.sectionTitle}>Comentarios (opcional)</Text>
              <TextInput
                value={comments}
                onChangeText={setComments}
                placeholder="Notas sobre la entrega..."
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={4}
                style={styles.textarea}
              />
            </View>

            <Pressable
              onPress={handleComplete}
              disabled={submitting}
              style={({ pressed }) => {
                const ready = !!photoPath && !!signaturePath
                return [
                  styles.primaryBtn,
                  (submitting || !ready) && { opacity: 0.5 },
                  pressed && !submitting && ready && { backgroundColor: colors.primaryDark },
                ]
              }}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Marcar como completada</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setFailModalOpen(true)}
              disabled={submitting}
              style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.secondaryBtnText}>Entrega fallida</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <SignatureCapture
        visible={signatureModalOpen}
        onClose={() => setSignatureModalOpen(false)}
        onSave={(sig) => {
          if (planStop && driver) {
            const path = `${driver.org_id}/${planStop.id}/signature.png`
            setSignatureBase64(sig)
            setSignaturePath(path)
            void uploadSignatureNow(sig, path)
          }
          setSignatureModalOpen(false)
        }}
      />

      <Modal
        visible={failModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFailModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Motivo del fallo</Text>
            {FAIL_REASONS.map((r) => (
              <Pressable
                key={r.value}
                onPress={() => setFailReason(r.value)}
                style={({ pressed }) => [
                  styles.reasonRow,
                  failReason === r.value && styles.reasonRowSelected,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.reasonText,
                    failReason === r.value && { color: colors.primary, fontWeight: '600' },
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable
                onPress={() => setFailModalOpen(false)}
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '600' }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleFail}
                disabled={!failReason || submitting}
                style={({ pressed }) => [
                  styles.modalBtn,
                  { backgroundColor: colors.warning },
                  (!failReason || submitting) && { opacity: 0.5 },
                  pressed && !submitting && { opacity: 0.85 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Confirmar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const STATUS_STYLES: Record<
  'pending' | 'completed' | 'incomplete' | 'cancelled',
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Pendiente', color: colors.textMuted, bg: colors.border },
  completed: { label: 'Completada', color: colors.success, bg: colors.successBg },
  incomplete: { label: 'Fallida', color: colors.warning, bg: colors.warningBg },
  cancelled: { label: 'Cancelada', color: colors.danger, bg: colors.dangerBg },
}

const FAIL_REASON_LABELS: Record<string, string> = {
  no_hay_nadie: 'No habia nadie',
  direccion_incorrecta: 'Direccion incorrecta',
  rechazado: 'Rechazado por cliente',
  otro: 'Otro motivo',
}

function formatReportTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function PODCard({
  planStop,
  photoUrls,
  signatureUrl,
}: {
  planStop: PlanStopDetail
  photoUrls: string[]
  signatureUrl: string | null
}) {
  const style = STATUS_STYLES[planStop.status]
  const reason = planStop.cancellation_reason
  const reasonLabel = reason ? FAIL_REASON_LABELS[reason] ?? reason : null
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  return (
    <View style={[styles.card, { marginTop: spacing.md }]}>
      <View style={styles.podHeader}>
        <Text style={styles.podTitle}>Prueba de entrega</Text>
        <View style={[styles.podBadge, { backgroundColor: style.bg }]}>
          <Text style={[styles.podBadgeText, { color: style.color }]}>
            {style.label}
          </Text>
        </View>
      </View>

      <View style={styles.podRow}>
        <Text style={styles.podLabel}>Hora</Text>
        <Text style={styles.podValue}>
          {formatReportTime(planStop.report_time)}
        </Text>
      </View>

      {planStop.execution_date && (
        <View style={styles.podRow}>
          <Text style={styles.podLabel}>Fecha entrega</Text>
          <Text style={styles.podValue}>{planStop.execution_date}</Text>
        </View>
      )}

      {planStop.report_location && (
        <View style={styles.podRow}>
          <Text style={styles.podLabel}>Ubicacion reportada</Text>
          <Text style={styles.podValue}>{planStop.report_location}</Text>
        </View>
      )}

      {planStop.delivery_attempts > 0 && (
        <View style={styles.podRow}>
          <Text style={styles.podLabel}>Intentos de entrega</Text>
          <Text style={styles.podValue}>{planStop.delivery_attempts}</Text>
        </View>
      )}

      {reasonLabel && (
        <View style={styles.podRow}>
          <Text style={styles.podLabel}>Motivo de fallo</Text>
          <Text style={styles.podValue}>{reasonLabel}</Text>
        </View>
      )}

      {planStop.report_comments && (
        <View style={[styles.podRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <Text style={styles.podLabel}>Comentarios</Text>
          <Text style={[styles.podValue, { marginTop: 4 }]}>
            {planStop.report_comments}
          </Text>
        </View>
      )}

      {photoUrls.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.podLabel}>
            Fotos ({photoUrls.length})
          </Text>
          <View style={styles.photoList}>
            {photoUrls.map((url, i) => (
              <Pressable
                key={`${i}-${url}`}
                onPress={() => setLightboxUrl(url)}
                style={({ pressed }) => [pressed && { opacity: 0.9 }]}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.podPhoto}
                  resizeMode="cover"
                  onError={(e) =>
                    console.warn('[stop] POD photo load error:', url, e.nativeEvent)
                  }
                />
                <View style={styles.photoIndex}>
                  <Text style={styles.photoIndexText}>{i + 1}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Modal
        visible={!!lightboxUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUrl(null)}
      >
        <Pressable
          style={styles.lightboxBackdrop}
          onPress={() => setLightboxUrl(null)}
        >
          {lightboxUrl && (
            <Image
              source={{ uri: lightboxUrl }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.lightboxClose}>
            <Text style={styles.lightboxCloseText}>Cerrar</Text>
          </View>
        </Pressable>
      </Modal>

      <View style={{ marginTop: spacing.md }}>
        <Text style={styles.podLabel}>Firma</Text>
        {signatureUrl ? (
          <View style={styles.signatureBox}>
            <Image
              source={{ uri: signatureUrl }}
              style={styles.signatureImage}
              resizeMode="contain"
              onError={(e) =>
                console.warn(
                  '[stop] POD signature load error:',
                  signatureUrl,
                  e.nativeEvent,
                )
              }
            />
          </View>
        ) : (
          <Text style={[styles.podValue, { marginTop: 4, fontStyle: 'italic', textAlign: 'left' }]}>
            No se capturó firma.
          </Text>
        )}
      </View>
    </View>
  )
}

function UploadStatus({
  status,
}: {
  status: 'idle' | 'uploading' | 'uploaded' | 'queued'
}) {
  if (status === 'idle') return null
  if (status === 'uploading') {
    return (
      <View style={styles.uploadStatusRow}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.uploadStatusText}>Subiendo...</Text>
      </View>
    )
  }
  if (status === 'uploaded') {
    return (
      <View style={styles.uploadStatusRow}>
        <Text style={[styles.uploadStatusText, { color: colors.success }]}>
          ✓ Guardado
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.uploadStatusRow}>
      <Text style={[styles.uploadStatusText, { color: colors.warning }]}>
        Sin red — se subira luego
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopName: { fontSize: 20, fontWeight: '700', color: colors.text },
  stopAddress: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  metaPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaText: { fontSize: 12, color: colors.textMuted },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: spacing.md },
  photoButton: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  photoButtonText: { color: colors.primary, fontWeight: '600' },
  photoPreviewContainer: { position: 'relative' },
  photoPreview: { width: '100%', height: 240, borderRadius: radius.md },
  photoReplace: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  photoReplaceText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  signaturePreviewContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.bg,
  },
  signaturePreview: {
    width: '100%',
    height: 120,
    backgroundColor: '#fff',
    borderRadius: radius.sm,
  },
  signatureActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  signatureSmallBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  signatureSmallBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  textarea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.warning, fontSize: 14, fontWeight: '600' },
  doneLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  doneValue: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  podHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  podTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  podBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  podBadgeText: { fontSize: 11, fontWeight: '700' },
  uploadStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  uploadStatusText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  podRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  podLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  podValue: { fontSize: 13, color: colors.text, textAlign: 'right', flex: 1, marginLeft: spacing.md },
  photoList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  podPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
  },
  photoIndex: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  photoIndexText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '80%',
  },
  lightboxClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  lightboxCloseText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  signatureBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
  },
  signatureImage: {
    width: '100%',
    height: 120,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.md },
  reasonRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  reasonRowSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
  reasonText: { fontSize: 14, color: colors.text },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
})
