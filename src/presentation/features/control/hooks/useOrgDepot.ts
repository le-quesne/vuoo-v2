import { useEffect, useState } from 'react';
import { fetchOrgDepot, type OrgDepot } from '@/data/services/control';

export function useOrgDepot(orgId: string | null): OrgDepot | null {
  const [depot, setDepot] = useState<OrgDepot | null>(null);

  useEffect(() => {
    if (!orgId) {
      setDepot(null);
      return;
    }
    let cancelled = false;
    void fetchOrgDepot(orgId).then((res) => {
      if (cancelled) return;
      setDepot(res.success ? res.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return depot;
}
