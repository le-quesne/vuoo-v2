import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type {
  ApiTokenCreateInput,
  ApiTokenCreateResult,
  ApiTokenRow,
} from './apiTokens.types';

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
 * Lista tokens de una org. Hits Supabase directo (RLS filtra por org).
 * NO devuelve hashes ni tokens en claro — solo `token_prefix` para display.
 */
export async function list(orgId: string): Promise<ServiceResult<ApiTokenRow[]>> {
  try {
    const { data, error } = await supabase
      .from('org_api_tokens')
      .select(
        'id, org_id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, created_by',
      )
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return fail(error.message);
    return ok((data ?? []) as ApiTokenRow[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * Crea un token via backend Railway. El backend genera bytes seguros,
 * hashea el secreto y devuelve el token en claro UNA SOLA VEZ.
 */
export async function create(
  input: ApiTokenCreateInput,
): Promise<ServiceResult<ApiTokenCreateResult>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const res = await fetch(`${ROUTING_BASE}/settings/api-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        org_id: input.orgId,
        name: input.name,
        scopes: input.scopes,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return fail(body.error ?? `HTTP ${res.status}`);
    }

    const payload = (await res.json()) as {
      token: ApiTokenRow;
      plaintext: string;
    };
    return ok(payload);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * Marca el token como revocado. No lo borra (auditoría).
 */
export async function revoke(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('org_api_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
