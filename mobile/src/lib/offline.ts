import * as SQLite from 'expo-sqlite'
import NetInfo from '@react-native-community/netinfo'
import { AppState, type AppStateStatus } from 'react-native'
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
  attempt_count: number | null
  last_error: string | null
  last_attempted_at: string | null
}

export interface PendingItemDebug {
  id: number
  action: OfflineAction
  createdAt: string
  attemptCount: number
  lastError: string | null
  lastAttemptedAt: string | null
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null
let processing = false
// Single-flight con re-run: si llega un pedido mientras procesamos, lo
// agendamos para una segunda pasada al terminar. Evita que un drain inicial
// "se pierda" filas insertadas mientras corría el SELECT.
let rerunRequested = false

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
    // Migración aditiva: SQLite no tiene `ADD COLUMN IF NOT EXISTS`, por lo
    // que probamos cada ALTER y silenciamos el error si la columna ya existe.
    // Esto mantiene compatibilidad con instalaciones previas a este cambio.
    for (const sql of [
      `ALTER TABLE sync_queue ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE sync_queue ADD COLUMN last_error TEXT;`,
      `ALTER TABLE sync_queue ADD COLUMN last_attempted_at TEXT;`,
    ]) {
      try {
        await db.execAsync(sql)
      } catch {
        // Columna ya existe — ignorar.
      }
    }
  } catch (err) {
    // Expo Go u otros entornos pueden no soportar SQLite — fallo silencioso.
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

/**
 * Snapshot de los items pendientes con su último error y conteo de intentos.
 * Útil para una pantalla de diagnóstico en campo o para reportar issues sin
 * acceso al device.
 */
export async function getPendingDebug(): Promise<PendingItemDebug[]> {
  try {
    const db = await getDb()
    const rows = await db.getAllAsync<SyncQueueRow>(
      `SELECT id, action, payload, file_path, created_at, synced_at,
              attempt_count, last_error, last_attempted_at
       FROM sync_queue
       WHERE synced_at IS NULL
       ORDER BY id ASC;`,
    )
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      createdAt: r.created_at,
      attemptCount: r.attempt_count ?? 0,
      lastError: r.last_error,
      lastAttemptedAt: r.last_attempted_at,
    }))
  } catch {
    return []
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
    // Best-effort drain: si hay red, intentamos vaciar de inmediato en lugar
    // de esperar a la próxima transición de conectividad. Sin await para no
    // bloquear al caller (la UI ya cerró el flujo).
    void processSyncQueue()
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
      `UPDATE sync_queue
       SET synced_at = ?, last_error = NULL
       WHERE id = ?;`,
      new Date().toISOString(),
      id,
    )
  } catch (err) {
    console.warn('[offline] markRowSynced failed:', err)
  }
}

async function markRowFailed(id: number, error: string): Promise<void> {
  try {
    const db = await getDb()
    await db.runAsync(
      `UPDATE sync_queue
       SET attempt_count = COALESCE(attempt_count, 0) + 1,
           last_error = ?,
           last_attempted_at = ?
       WHERE id = ?;`,
      error.slice(0, 500),
      new Date().toISOString(),
      id,
    )
  } catch (err) {
    console.warn('[offline] markRowFailed failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Process queue
// ---------------------------------------------------------------------------

type OperationResult = { ok: true } | { ok: false; error: string }

export async function processSyncQueue(): Promise<void> {
  if (processing) {
    // Hay un drain en curso. Pedimos una segunda pasada para no perder filas
    // insertadas después del SELECT inicial.
    rerunRequested = true
    return
  }
  processing = true
  try {
    do {
      rerunRequested = false
      await drainOnce()
    } while (rerunRequested)
  } catch (err) {
    console.warn('[offline] processSyncQueue failed:', err)
  } finally {
    processing = false
  }
}

async function drainOnce(): Promise<void> {
  const db = await getDb()
  const rows = await db.getAllAsync<SyncQueueRow>(
    `SELECT id, action, payload, file_path, created_at, synced_at,
            attempt_count, last_error, last_attempted_at
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

      const result = await runOperation(
        row.action,
        payload,
        row.file_path,
      )
      if (result.ok) {
        await markRowSynced(row.id)
      } else {
        console.warn(
          `[offline] row ${row.id} (${row.action}) failed: ${result.error}`,
        )
        await markRowFailed(row.id, result.error)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error'
      console.warn(`[offline] row ${row.id} (${row.action}) threw:`, err)
      await markRowFailed(row.id, msg)
      // Leave row pending — no rollback.
    }
  }
}

async function runOperation(
  action: OfflineAction,
  payload: unknown,
  filePath: string | null,
): Promise<OperationResult> {
  switch (action) {
    case 'update_plan_stop': {
      const p = payload as UpdatePlanStopPayload
      if (!p?.id || !p?.fields) {
        return { ok: false, error: 'invalid update_plan_stop payload' }
      }
      const { error } = await supabase
        .from('plan_stops')
        .update(p.fields)
        .eq('id', p.id)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    case 'upload_photo': {
      const p = payload as UploadPhotoPayload
      if (!p?.planStopId || !p?.path || !filePath) {
        return { ok: false, error: 'invalid upload_photo payload' }
      }
      const { error } = await uploadLocalFileToBucket(
        'delivery-photos',
        p.path,
        filePath,
        'image/jpeg',
      )
      if (error) return { ok: false, error: `storage: ${error}` }
      // Append path to report_images[] on the plan_stop.
      const { data: existing, error: fetchError } = await supabase
        .from('plan_stops')
        .select('report_images')
        .eq('id', p.planStopId)
        .maybeSingle()
      if (fetchError) return { ok: false, error: `fetch: ${fetchError.message}` }
      const existingImages = (existing?.report_images as string[] | null) ?? []
      const nextImages = existingImages.includes(p.path)
        ? existingImages
        : [...existingImages, p.path]
      const { error: updateError } = await supabase
        .from('plan_stops')
        .update({ report_images: nextImages })
        .eq('id', p.planStopId)
      if (updateError) return { ok: false, error: `update: ${updateError.message}` }
      return { ok: true }
    }

    case 'upload_signature': {
      const p = payload as UploadSignaturePayload
      if (!p?.planStopId || !p?.path || !filePath) {
        return { ok: false, error: 'invalid upload_signature payload' }
      }
      const { error } = await uploadLocalFileToBucket(
        'signatures',
        p.path,
        filePath,
        'image/png',
      )
      if (error) return { ok: false, error: `storage: ${error}` }
      const { error: updateError } = await supabase
        .from('plan_stops')
        .update({ report_signature_url: p.path })
        .eq('id', p.planStopId)
      if (updateError) return { ok: false, error: `update: ${updateError.message}` }
      return { ok: true }
    }

    case 'insert_location': {
      const p = payload as InsertLocationPayload
      if (!p) return { ok: false, error: 'invalid insert_location payload' }
      const { error } = await supabase.from('driver_locations').insert(p)
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    }

    default:
      return { ok: false, error: `unknown action: ${String(action)}` }
  }
}

// ---------------------------------------------------------------------------
// Auto-sync on connectivity changes
// ---------------------------------------------------------------------------

// Cuánto esperar entre intentos de drenar la cola cuando quedan pendientes.
// 30s es suficientemente bajo para no dejar al chofer mirando "sincronizando"
// y suficientemente alto para no martillar Supabase si hay un error persistente.
const RETRY_INTERVAL_MS = 30_000

export function startOfflineSync(): () => void {
  try {
    let lastConnected: boolean | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null

    async function tickIfPending() {
      const pending = await getPendingCount()
      if (pending > 0) void processSyncQueue()
    }

    const netUnsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected === true
      if (isConnected && lastConnected !== true) {
        void processSyncQueue()
      }
      lastConnected = isConnected
    })

    // Estado inicial: si la app arranca con red y hay pendientes, drena ya.
    NetInfo.fetch()
      .then((state) => {
        if (state.isConnected === true) void tickIfPending()
      })
      .catch(() => {})

    // Volver del background a foreground: drena la cola.
    const appStateSub = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status === 'active') void tickIfPending()
      },
    )

    // Retry periódico: cubre fallos transitorios (timeout supabase, RLS
    // intermitente, storage) sin requerir transición de red ni navegación.
    intervalId = setInterval(() => {
      void tickIfPending()
    }, RETRY_INTERVAL_MS)

    return () => {
      try {
        netUnsubscribe()
      } catch (err) {
        console.warn('[offline] netinfo unsubscribe failed:', err)
      }
      try {
        appStateSub.remove()
      } catch (err) {
        console.warn('[offline] appstate unsubscribe failed:', err)
      }
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
  } catch (err) {
    console.warn('[offline] startOfflineSync failed:', err)
    return () => {}
  }
}
