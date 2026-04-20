import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { VroomRequest, VroomResponse } from './vroom.types';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

/**
 * Optimiza un plan llamando al backend Railway (`vuoo-rutas`).
 * Reemplaza la Edge Function `optimize-routes-vroom` ya borrada (PRD 12 §D.3).
 */
export async function optimize(
  req: VroomRequest,
): Promise<ServiceResult<VroomResponse>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const res = await fetch(`${ROUTING_BASE}/vroom/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return fail(body.error ?? `HTTP ${res.status}`);
    }
    return ok((await res.json()) as VroomResponse);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
