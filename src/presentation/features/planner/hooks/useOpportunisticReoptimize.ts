import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/application/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export interface UseOpportunisticReoptimizeReturn {
  /** # de orders pendientes (scheduled, sin plan_stop_id) llegados desde el último dismiss. */
  pendingCount: number;
  /** true cuando hay ≥ 1 order nueva y existe un plan `planned` para la fecha. */
  shouldProposeReopt: boolean;
  /** Resetea el contador (cuando el operador descarta el toast o acepta re-optimizar). */
  dismiss: () => void;
}

interface RealtimeOrderRow {
  id: string;
  org_id: string;
  requested_date: string | null;
  scheduled_date?: string | null;
  plan_stop_id: string | null;
  status: string;
}

/**
 * Fase D.2 — Re-optimización oportunista.
 *
 * Suscribe a INSERTs en `orders` para la org + fecha. Cuenta los eventos que:
 *   - `requested_date = date`
 *   - `plan_stop_id is null`
 *   - `status` en { 'pending' | 'scheduled' }
 *
 * No dispara acción; solo expone `shouldProposeReopt` para que la UI muestre
 * un toast "X pedidos nuevos — ¿Re-optimizar?" cuando **además** existe un plan
 * con `status='planned'` para esa fecha. La decisión siempre es del operador.
 */
export function useOpportunisticReoptimize(
  orgId: string | undefined,
  date: string | undefined,
): UseOpportunisticReoptimizeReturn {
  const [pendingCount, setPendingCount] = useState(0);
  const [planExists, setPlanExists] = useState(false);
  const sinceRef = useRef<number>(Date.now());

  const dismiss = useCallback(() => {
    sinceRef.current = Date.now();
    setPendingCount(0);
  }, []);

  // ── Check si existe un plan `planned` para la fecha (gate del toast) ──
  useEffect(() => {
    if (!orgId || !date) {
      setPlanExists(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      // `plans` actual no tiene columna `status` en el schema tipado; asumimos
      // que Fase A la añade (draft | optimizing | planned | live | archived).
      // Mientras tanto consideramos que "existe plan" si hay fila para la fecha.
      const { data, error } = await supabase
        .from('plans')
        .select('id,status')
        .eq('org_id', orgId)
        .eq('date', date)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setPlanExists(false);
        return;
      }
      const status = (data as { status?: string }).status;
      setPlanExists(status ? status === 'planned' : true);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, date]);

  // ── Realtime: cuenta inserts relevantes ──
  useEffect(() => {
    if (!orgId || !date) return;

    const channel = supabase
      .channel(`orders-opportunistic-${orgId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `org_id=eq.${orgId}`,
        },
        (payload: RealtimePostgresChangesPayload<RealtimeOrderRow>) => {
          const row = payload.new as RealtimeOrderRow;
          const sameDate =
            row.requested_date === date || row.scheduled_date === date;
          const unplanned = row.plan_stop_id == null;
          const relevantStatus =
            row.status === 'pending' || row.status === 'scheduled';
          if (sameDate && unplanned && relevantStatus) {
            setPendingCount((c) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
    };
  }, [orgId, date]);

  return {
    pendingCount,
    shouldProposeReopt: planExists && pendingCount > 0,
    dismiss,
  };
}
