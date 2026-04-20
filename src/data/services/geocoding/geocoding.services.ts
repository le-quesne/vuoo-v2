import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { fail, ok, toErrorMessage } from '@/data/services/_shared/response';
import type {
  GeocodeAddressInput,
  GeocodeBatchResponse,
  GeocodeResult,
} from './geocoding.types';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function batch(
  addresses: GeocodeAddressInput[],
): Promise<ServiceResult<GeocodeResult[]>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  if (addresses.length === 0) return ok([]);

  try {
    const res = await fetch(`${ROUTING_BASE}/geocode/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ addresses }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return fail(body.error ?? `HTTP ${res.status}`);
    }

    const data = (await res.json()) as GeocodeBatchResponse;
    return ok(data.results ?? []);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
