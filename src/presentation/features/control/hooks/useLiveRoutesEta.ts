import { useEffect, useRef, useState } from 'react';
import { fetchLiveRoutesEta } from '@/data/services/control';
import type { RouteEtaMap } from '@/data/services/control';

const REFRESH_INTERVAL_MS = 90_000; // 90s: balance entre frescura y costo Mapbox

export interface UseLiveRoutesEtaReturn {
  etaByRouteId: RouteEtaMap;
  loading: boolean;
}

export function useLiveRoutesEta(
  orgId: string | null,
  date: string,
  activeRouteIds: string[],
): UseLiveRoutesEtaReturn {
  const [etaByRouteId, setEtaByRouteId] = useState<RouteEtaMap>({});
  const [loading, setLoading] = useState(false);

  // Estabilizar el effect por el contenido del array, no por la referencia.
  const idsKey = activeRouteIds.slice().sort().join(',');
  const idsKeyRef = useRef(idsKey);
  idsKeyRef.current = idsKey;

  useEffect(() => {
    if (!orgId || idsKey.length === 0) {
      setEtaByRouteId({});
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const res = await fetchLiveRoutesEta(orgId, date);
      if (cancelled) return;
      if (res.success) setEtaByRouteId(res.data);
      setLoading(false);
    };

    void run();
    const interval = window.setInterval(() => {
      void run();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [orgId, date, idsKey]);

  return { etaByRouteId, loading };
}
