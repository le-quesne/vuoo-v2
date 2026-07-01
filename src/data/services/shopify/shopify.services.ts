import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { ShopifyInstallation } from './shopify.types';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function authHeaders(orgId: string): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    'X-Org-Id': orgId,
  };
}

/**
 * Pide al backend la URL de autorización OAuth de Shopify para la tienda dada.
 * La UI redirige el navegador a `authorize_url` para que el merchant apruebe.
 */
export async function getConnectUrl(
  orgId: string,
  shop: string,
): Promise<ServiceResult<{ authorize_url: string; shop: string }>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const res = await fetch(
      `${ROUTING_BASE}/shopify/connect/start?shop=${encodeURIComponent(shop)}`,
      { headers: await authHeaders(orgId) },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return fail(body.detail ?? body.error ?? `HTTP ${res.status}`);
    }
    return ok((await res.json()) as { authorize_url: string; shop: string });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/** Lista las tiendas Shopify conectadas de la org (sin token). */
export async function listInstallations(
  orgId: string,
): Promise<ServiceResult<ShopifyInstallation[]>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const res = await fetch(`${ROUTING_BASE}/shopify/installations`, {
      headers: await authHeaders(orgId),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return fail(body.error ?? `HTTP ${res.status}`);
    }
    const payload = (await res.json()) as { installations: ShopifyInstallation[] };
    return ok(payload.installations ?? []);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/** Desconecta una tienda (soft-uninstall). */
export async function disconnect(orgId: string, shopDomain: string): Promise<ServiceResult<void>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const res = await fetch(`${ROUTING_BASE}/shopify/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders(orgId)) },
      body: JSON.stringify({ shop_domain: shopDomain }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return fail(body.error ?? `HTTP ${res.status}`);
    }
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
