import AsyncStorage from '@react-native-async-storage/async-storage'

export type PodUploadStatus = 'idle' | 'uploading' | 'uploaded' | 'queued'

export interface PodDraft {
  photoUri: string | null
  photoPath: string | null
  photoStatus: PodUploadStatus
  signatureBase64: string | null
  signaturePath: string | null
  signatureStatus: PodUploadStatus
  comments: string
  updatedAt: string
}

function key(planStopId: string): string {
  return `pod_draft_${planStopId}`
}

export async function loadPodDraft(planStopId: string): Promise<PodDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(planStopId))
    if (!raw) return null
    return JSON.parse(raw) as PodDraft
  } catch {
    return null
  }
}

export async function savePodDraft(
  planStopId: string,
  draft: Omit<PodDraft, 'updatedAt'>,
): Promise<void> {
  try {
    const payload: PodDraft = { ...draft, updatedAt: new Date().toISOString() }
    await AsyncStorage.setItem(key(planStopId), JSON.stringify(payload))
  } catch {
    // Ignorar — peor caso, perdemos el draft entre reinicios.
  }
}

export async function clearPodDraft(planStopId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(planStopId))
  } catch {
    // Ignorar.
  }
}
