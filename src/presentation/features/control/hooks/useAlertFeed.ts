import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/application/lib/supabase';
import {
  acknowledgeAlert as ackAlertService,
  fetchPersistedAlerts,
} from '@/data/services/control';
import { alertRowToLive, mergeAlerts } from '@/domain/adapters/liveControl.adapter';
import type { AlertRow, LiveAlert } from '@/domain/entities/liveControl';
import { playAlertBeep } from '@/application/lib/alertSound';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface UseAlertFeedReturn {
  alerts: LiveAlert[];
  toastQueue: LiveAlert[];
  knownAlertIdsRef: React.MutableRefObject<Set<string>>;
  pushAlerts: (incoming: LiveAlert[]) => void;
  acknowledge: (alertId: string) => void;
  dismissToast: (alertId: string) => void;
  highUnackedCount: number;
}

export function useAlertFeed(
  orgId: string | null,
  userId: string | null,
): UseAlertFeedReturn {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [toastQueue, setToastQueue] = useState<LiveAlert[]>([]);
  const knownAlertIdsRef = useRef<Set<string>>(new Set());

  const pushAlerts = useCallback((incoming: LiveAlert[]) => {
    if (incoming.length === 0) return;
    setAlerts((prev) => {
      const merged = mergeAlerts(prev, incoming);
      const newHighs = incoming.filter(
        (a) => a.priority === 'high' && !knownAlertIdsRef.current.has(a.id),
      );
      incoming.forEach((a) => knownAlertIdsRef.current.add(a.id));
      if (newHighs.length > 0) {
        setToastQueue((q) => [...newHighs, ...q].slice(0, 3));
        playAlertBeep();
      }
      return merged;
    });
  }, []);

  const acknowledge = useCallback(
    (alertId: string) => {
      // UI optimista: marcamos local y removemos del toast queue.
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)));
      setToastQueue((q) => q.filter((a) => a.id !== alertId));
      // Solo persistir si el ID es UUID de DB (las derivadas usan IDs sintéticos).
      if (!UUID_RE.test(alertId) || !userId) return;
      void ackAlertService(alertId, userId);
    },
    [userId],
  );

  const dismissToast = useCallback((alertId: string) => {
    setToastQueue((q) => q.filter((a) => a.id !== alertId));
  }, []);

  // Carga inicial + realtime de alertas persistidas.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    void fetchPersistedAlerts(orgId).then((res) => {
      if (cancelled || !res.success) return;
      const live = res.data.map(alertRowToLive);
      // Seed directo (sin pushAlerts) para no disparar beep en la carga.
      setAlerts((prev) => mergeAlerts(prev, live));
      live.forEach((a) => knownAlertIdsRef.current.add(a.id));
    });

    const channel = supabase
      .channel(`alerts-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as AlertRow | undefined;
          if (!row) return;
          pushAlerts([alertRowToLive(row)]);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as AlertRow | undefined;
          if (!row) return;
          const acked = row.acknowledged_at !== null;
          setAlerts((prev) =>
            prev.map((a) => (a.id === row.id ? { ...a, acknowledged: acked } : a)),
          );
          if (acked) setToastQueue((q) => q.filter((a) => a.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orgId, pushAlerts]);

  const highUnackedCount = alerts.filter(
    (a) => a.priority === 'high' && !a.acknowledged,
  ).length;

  return {
    alerts,
    toastQueue,
    knownAlertIdsRef,
    pushAlerts,
    acknowledge,
    dismissToast,
    highUnackedCount,
  };
}
