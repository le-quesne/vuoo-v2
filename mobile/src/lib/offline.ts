import * as SQLite from 'expo-sqlite'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface SyncQueueRow {
  id: number
  action: OfflineAction
  payload: string
  file_path: string | null
  created_at: string
  synced_at: string | null
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null
let processing = false

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('vuoo.db')
  }
  return dbPromise
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export async function initOfflineDb(): Promise<void> {
  try {
    const db = await getDb()
    await db.execAsync(
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        file_path TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT
      );`,
    )
  } catch (err) {
    // Expo Go or other environments may not support SQLite — fail gracefully.
    console.warn('[offline] initOfflineDb failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Queue introspection
// ---------------------------------------------------------------------------

export async function getPendingCount(): Promise<number> {
  try {
    const db = await getDb()
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT count(*) as count FROM sync_queue WHERE synced_at IS NULL;`,
    )
    return row?.count ?? 0
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export async function enqueueOperation(
  action: OfflineAction,
  payload: unknown,
  filePath?: string | null,
): Promise<number | null> {
  try {
    const db = await getDb()
    const result = await db.runAsync(
      `INSERT INTO sync_queue (action, payload, file_path, created_at, synced_at)
       VALUES (?, ?, ?, ?, NULL);`,
      action,
      JSON.stringify(payload ?? {}),
      filePath ?? null,
      new Date().toISOString(),
    )
    return result.lastInsertRowId ?? null
  } catch (err) {
    console.warn('[offline] enqueueOperation failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function uploadLocalFileToBucket(
  bucket: string,
  destinationPath: string,
  fileUri: string,
  contentType: string,
): Promise<{ error: string | null }> {
  try {
    const response = await fetch(fileUri)
    const blob = await response.blob()
    const arrayBuffer = await new Response(blob).arrayBuffer()

    const { error } = await supabase.storage
      .from(bucket)
      .upload(destinationPath, arrayBuffer, {
        contentType,
        upsert: true,
      })
    return { error: error?.message ?? null }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Upload failed',
    }
  }
}

async function markRowSynced(id: number): Promise<void> {
  try {
    const db = await getDb()
    await db.runAsync(
      `UPDATE sync_queue SET synced_at = ? WHERE id = ?;`,
      new Date().toISOString(),
      id,
    )
  } catch (err) {
    console.warn('[offline] markRowSynced failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Process queue
// ---------------------------------------------------------------------------

export async function processSyncQueue(): Promise<void> {
  if (processing) return
  processing = true
  try {
    const db = await getDb()
    const rows = await db.getAllAsync<SyncQueueRow>(
      `SELECT id, action, payload, file_path, created_at, synced_at
       FROM sync_queue
       WHERE synced_at IS NULL
       ORDER BY id ASC;`,
    )

    for (const row of rows) {
      try {
        let payload: unknown = {}
        try {
          payload = JSON.parse(row.payload)
        } catch {
          payload = {}
        }

        const ok = await runOperation(
          row.action,
          payload,
          row.file_path,
        )
        if (ok) {
          await markRowSynced(row.id)
        }
      } catch (err) {
        console.warn(`[offline] row ${row.id} (${row.action}) failed:`, err)
        // Leave row pending — no rollback.
      }
    }
  } catch (err) {
    console.warn('[offline] processSyncQueue failed:', err)
  } finally {
    processing = false
  }
}

async function runOperation(
  action: OfflineAction,
  payload: unknown,
  filePath: string | null,
): Promise<boolean> {
  switch (action) {
    case 'update_plan_stop': {
      const p = payload as UpdatePlanStopPayload
      if (!p?.id || !p?.fields) return false
      const { error } = await supabase
        .from('plan_stops')
        .update(p.fields)
        .eq('id', p.id)
      if (error) {
        console.warn('[offline] update_plan_stop error:', error.message)
        return false
      }
      return true
    }

    case 'upload_photo': {
      const p = payload as UploadPhotoPayload
      if (!p?.planStopId || !p?.path || !filePath) return false
      const { error } = await uploadLocalFileToBucket(
        'delivery-photos',
        p.path,
        filePath,
        'image/jpeg',
      )
      if (error) {
        console.warn('[offline] upload_photo error:', error)
        return false
      }
      // Append path to report_images[] on the plan_stop.
      const { data: existing, error: fetchError } = await supabase
        .from('plan_stops')
        .select('report_images')
        .eq('id', p.planStopId)
        .maybeSingle()
      if (fetchError) {
        console.warn('[offline] upload_photo fetch error:', fetchError.message)
        return false
      }
      const existingImages = (existing?.report_images as string[] | null) ?? []
      const nextImages = existingImages.includes(p.path)
        ? existingImages
        : [...existingImages, p.path]
      const { error: updateError } = await supabase
        .from('plan_stops')
        .update({ report_images: nextImages })
        .eq('id', p.planStopId)
      if (updateError) {
        console.warn('[offline] upload_photo update error:', updateError.message)
        return false
      }
      return true
    }

    case 'upload_signature': {
      const p = payload as UploadSignaturePayload
      if (!p?.planStopId || !p?.path || !filePath) return false
      const { error } = await uploadLocalFileToBucket(
        'signatures',
        p.path,
        filePath,
        'image/png',
      )
      if (error) {
        console.warn('[offline] upload_signature error:', error)
        return false
      }
      const { error: updateError } = await supabase
        .from('plan_stops')
        .update({ report_signature_url: p.path })
        .eq('id', p.planStopId)
      if (updateError) {
        console.warn(
          '[offline] upload_signature update error:',
          updateError.message,
        )
        return false
      }
      return true
    }

    case 'insert_location': {
      const p = payload as InsertLocationPayload
      if (!p) return false
      const { error } = await supabase.from('driver_locations').insert(p)
      if (error) {
        console.warn('[offline] insert_location error:', error.message)
        return false
      }
      return true
    }

    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Auto-sync on connectivity changes
// ---------------------------------------------------------------------------

export function startOfflineSync(): () => void {
  try {
    let lastConnected: boolean | null = null
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected === true
      if (isConnected && lastConnected !== true) {
        // Transitioned to connected: try flushing the queue.
        void processSyncQueue()
      }
      lastConnected = isConnected
    })
    return () => {
      try {
        unsubscribe()
      } catch (err) {
        console.warn('[offline] unsubscribe failed:', err)
      }
    }
  } catch (err) {
    console.warn('[offline] startOfflineSync failed:', err)
    return () => {}
  }
}
