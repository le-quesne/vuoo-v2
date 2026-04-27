/**
 * useImportRecovery — persiste un snapshot del wizard en localStorage para
 * que el usuario pueda continuar tras cerrar la pestaña por error.
 *
 * Diseño:
 * - Una key por org (multi-tenant): vuoo:import-wizard:{orgId}.
 * - TTL de 1h. Snapshot más viejo se ignora silencioso (load → null).
 * - Auto-save cada 5s (debounced via setInterval) si hay un currentSnapshot.
 * - El File object NO es serializable; el usuario tiene que re-seleccionar
 *   el archivo. Sí preservamos fileName, headers, rawRows, mapping y
 *   previewRows para que el work hecho no se pierda.
 *
 * El componente que use este hook llama save(snapshot) cuando el state cambia
 * de manera relevante. Si quiere autosave, lo monta con startAutosave(getter).
 */
import { useCallback, useEffect, useRef } from 'react';
import { recoveryStorageKey, RECOVERY_TTL_MS, RECOVERY_AUTOSAVE_INTERVAL_MS } from '../constants';
import type { MappingConfig, PreviewRow, WizardState } from '../types/import.types';

export interface RecoverySnapshot {
  step: WizardState['step'];
  fileName: string;
  headers: string[];
  rawRows: Record<string, string>[];
  mapping: MappingConfig;
  templateId: string | null;
  previewRows: PreviewRow[];
  savedAt: number;
}

interface StoredEnvelope {
  v: 1;
  data: RecoverySnapshot;
}

export interface UseImportRecoveryReturn {
  load: () => RecoverySnapshot | null;
  save: (snapshot: Omit<RecoverySnapshot, 'savedAt'>) => void;
  clear: () => void;
  startAutosave: (getter: () => Omit<RecoverySnapshot, 'savedAt'> | null) => void;
  stopAutosave: () => void;
}

export function useImportRecovery(orgId: string | undefined): UseImportRecoveryReturn {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const key = orgId ? recoveryStorageKey(orgId) : null;

  const load = useCallback((): RecoverySnapshot | null => {
    if (!key) return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredEnvelope;
      if (parsed?.v !== 1 || !parsed.data) return null;
      const ageMs = Date.now() - parsed.data.savedAt;
      if (ageMs > RECOVERY_TTL_MS) {
        window.localStorage.removeItem(key);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }, [key]);

  const save = useCallback(
    (snapshot: Omit<RecoverySnapshot, 'savedAt'>) => {
      if (!key) return;
      try {
        const envelope: StoredEnvelope = {
          v: 1,
          data: { ...snapshot, savedAt: Date.now() },
        };
        window.localStorage.setItem(key, JSON.stringify(envelope));
      } catch {
        // Quota exceeded o storage deshabilitado: silencioso, no crítico.
      }
    },
    [key],
  );

  const clear = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  const startAutosave = useCallback(
    (getter: () => Omit<RecoverySnapshot, 'savedAt'> | null) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        const snap = getter();
        if (snap) save(snap);
      }, RECOVERY_AUTOSAVE_INTERVAL_MS);
    },
    [save],
  );

  const stopAutosave = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { load, save, clear, startAutosave, stopAutosave };
}
