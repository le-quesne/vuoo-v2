import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function optimizePlan<TRequest, TResponse>(
  req: TRequest,
): Promise<ServiceResult<TResponse>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const res = await fetch(`${ROUTING_BASE}/vroom/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return fail(body.error ?? `HTTP ${res.status}`);
    }
    return ok((await res.json()) as TResponse);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
