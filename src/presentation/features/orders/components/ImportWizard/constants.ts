/**
 * Constantes operacionales del ImportWizard.
 *
 * Tunear acá; los lugares que las consumen son:
 * - Step1FileDrop (size guards)
 * - useImportSubmit (chunking + timeout + retry)
 * - useImportRecovery (TTL del snapshot)
 * - Step3Preview (chunking geocoding)
 * - utils/parsing (max columns guard)
 */

/** 10 MB hard limit. Sobre esto, rechazamos en Step 1. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** 5 MB warning. Entre 2 y 5 MB main thread; sobre 2 MB usamos worker. */
export const FILE_SIZE_WARNING_BYTES = 5 * 1024 * 1024;

/** Umbral para activar Web Worker en parsing XLSX. */
export const FILE_SIZE_WORKER_BYTES = 2 * 1024 * 1024;

/** Cap defensivo contra CSVs maliciosos con cientos de columnas. */
export const MAX_COLUMNS = 100;

/** Filas por chunk al submit. Backend cap es 2K — 500 da margen + 4 chunks típicos. */
export const IMPORT_CHUNK_SIZE = 500;

/** Direcciones por chunk al geocodificar. Provider rate ~200/s. */
export const GEOCODING_CHUNK_SIZE = 200;

/** 5 minutos por chunk. Cubre cold start Railway + procesamiento. */
export const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;

/** 30s por chunk de geocoding. */
export const GEOCODING_TIMEOUT_MS = 30 * 1000;

/** Reintentos por chunk con backoff exponencial 2s/4s/8s. */
export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 2000;

/** TTL del snapshot localStorage (1 hora). */
export const RECOVERY_TTL_MS = 60 * 60 * 1000;

/** Throttle del auto-save (cada 5s). */
export const RECOVERY_AUTOSAVE_INTERVAL_MS = 5_000;

/** Key del snapshot en localStorage (incluye org para multi-tenant). */
export function recoveryStorageKey(orgId: string): string {
  return `vuoo:import-wizard:${orgId}`;
}
