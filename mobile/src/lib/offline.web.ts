export type OfflineAction =
  | 'update_plan_stop'
  | 'upload_photo'
  | 'upload_signature'
  | 'insert_location'

export interface UpdatePlanStopPayload {
  id: string
  fields: Record<string, unknown>
}

export interface UploadPhotoPayload {
  planStopId: string
  path: string
  appendToReportImages?: boolean
}

export interface UploadSignaturePayload {
  planStopId: string
  path: string
}

export interface InsertLocationPayload {
  driver_id?: string | null
  route_id?: string | null
  lat: number
  lng: number
  recorded_at: string
  [key: string]: unknown
}

export async function initOfflineDb(): Promise<void> {}

export async function getPendingCount(): Promise<number> {
  return 0
}

export async function enqueueOperation(
  _action: OfflineAction,
  _payload: unknown,
  _filePath?: string | null,
): Promise<number | null> {
  return null
}

export async function processSyncQueue(): Promise<void> {}

export function startOfflineSync(): () => void {
  return () => {}
}
