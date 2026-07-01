import type { SupabaseClient } from '@supabase/supabase-js';

const API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2025-07';

/** Base pública de este backend (para las callback URLs de los webhooks). */
export function backendBaseUrl(): string {
  return (
    process.env.SHOPIFY_BACKEND_URL ??
    process.env.RAILWAY_PUBLIC_DOMAIN?.replace(/^/, 'https://') ??
    'https://vuoo-api-production.up.railway.app'
  ).replace(/\/$/, '');
}

/** Intercambia el `code` OAuth por un access token offline. */
export async function exchangeCodeForToken(
  shop: string,
  code: string,
): Promise<{ access_token: string; scope: string } | { error: string }> {
  const client_id = process.env.SHOPIFY_CLIENT_ID;
  const client_secret = process.env.SHOPIFY_API_SECRET;
  if (!client_id || !client_secret) return { error: 'not_configured' };
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, client_secret, code }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      scope?: string;
      error?: string;
    };
    if (!res.ok || !data.access_token) {
      return { error: data.error ?? `token_exchange_${res.status}` };
    }
    return { access_token: data.access_token, scope: data.scope ?? '' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'token_exchange_error' };
  }
}

/**
 * Registra los webhooks necesarios en la tienda vía Admin API. Idempotente:
 * consulta los existentes y solo crea los que faltan.
 *  - orders/create   → ingesta de órdenes
 *  - app/uninstalled  → marcar la instalación como desinstalada
 */
export async function registerWebhooks(
  shop: string,
  token: string,
): Promise<{ registered: string[]; errors: string[] }> {
  const base = backendBaseUrl();
  const wanted: Array<{ topic: string; address: string }> = [
    { topic: 'orders/create', address: `${base}/webhooks/shopify/orders-create` },
    { topic: 'app/uninstalled', address: `${base}/webhooks/shopify/app-uninstalled` },
  ];

  const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
  const registered: string[] = [];
  const errors: string[] = [];

  // Existentes (para no duplicar).
  let existing: Array<{ topic: string; address: string }> = [];
  try {
    const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, { headers });
    if (r.ok) {
      const b = (await r.json()) as { webhooks?: Array<{ topic: string; address: string }> };
      existing = b.webhooks ?? [];
    }
  } catch {
    // Si falla el listado, intentamos crear igual.
  }

  for (const w of wanted) {
    if (existing.some((e) => e.topic === w.topic && e.address === w.address)) {
      registered.push(`${w.topic} (ya existía)`);
      continue;
    }
    try {
      const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/webhooks.json`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ webhook: { topic: w.topic, address: w.address, format: 'json' } }),
      });
      if (r.ok) registered.push(w.topic);
      else errors.push(`${w.topic}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
    } catch (e) {
      errors.push(`${w.topic}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
  return { registered, errors };
}

/** Upsert de la instalación (una tienda ↔ una org). */
export async function upsertInstallation(
  db: SupabaseClient,
  input: { org_id: string; shop_domain: string; access_token: string; scopes: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.from('shopify_installations').upsert(
    {
      org_id: input.org_id,
      shop_domain: input.shop_domain,
      access_token: input.access_token,
      scopes: input.scopes,
      status: 'active',
      installed_at: new Date().toISOString(),
      uninstalled_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'shop_domain' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
