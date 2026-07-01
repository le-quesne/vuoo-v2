import { Hono } from 'hono';
import { supabaseUnsafeServiceRole } from '../lib/supabase.js';
import { signState, normalizeShopDomain } from '../lib/shopifyState.js';
import { backendBaseUrl } from '../lib/shopifyInstall.js';

export const shopifyConnectRoutes = new Hono();

const SCOPES = process.env.SHOPIFY_SCOPES ?? 'read_orders,write_fulfillments';

/**
 * GET /shopify/connect/start?shop=<dominio>
 *
 * Autenticado (JWT del usuario). Genera la URL de autorización OAuth de Shopify
 * con un `state` firmado que liga la instalación a la org del usuario. La UI
 * redirige el navegador a `authorize_url`.
 */
shopifyConnectRoutes.get('/connect/start', (c) => {
  const auth = c.var.auth;
  const secret = process.env.SHOPIFY_API_SECRET;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  if (!secret || !clientId) return c.json({ error: 'not_configured' }, 503);

  const shop = normalizeShopDomain(c.req.query('shop') ?? '');
  if (!shop) return c.json({ error: 'invalid_shop', detail: 'Dominio inválido. Usá tu-tienda.myshopify.com' }, 400);

  const state = signState(secret, auth.orgId, shop);
  const redirectUri = `${backendBaseUrl()}/shopify/callback`;
  const authorizeUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  return c.json({ authorize_url: authorizeUrl, shop });
});

/**
 * GET /shopify/installations
 *
 * Autenticado. Lista las tiendas Shopify conectadas de la org (sin exponer el
 * access_token). Usa service_role + filtro explícito por org.
 */
shopifyConnectRoutes.get('/installations', async (c) => {
  const auth = c.var.auth;
  const db = supabaseUnsafeServiceRole;
  if (!db) return c.json({ error: 'service_role_not_configured' }, 501);

  const { data, error } = await db
    .from('shopify_installations')
    .select('id, shop_domain, scopes, status, installed_at, uninstalled_at')
    .eq('org_id', auth.orgId)
    .order('installed_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ installations: data ?? [] });
});

/**
 * POST /shopify/disconnect  { shop_domain }
 *
 * Autenticado. Marca la instalación como desinstalada (soft) y borra el token.
 * Solo afecta instalaciones de la propia org.
 */
shopifyConnectRoutes.post('/disconnect', async (c) => {
  const auth = c.var.auth;
  const db = supabaseUnsafeServiceRole;
  if (!db) return c.json({ error: 'service_role_not_configured' }, 501);

  const body = (await c.req.json().catch(() => ({}))) as { shop_domain?: string };
  const shop = body.shop_domain;
  if (!shop) return c.json({ error: 'missing_shop_domain' }, 400);

  const { error } = await db
    .from('shopify_installations')
    .update({
      status: 'uninstalled',
      access_token: '',
      uninstalled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', auth.orgId)
    .eq('shop_domain', shop);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});
