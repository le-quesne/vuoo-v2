import type { Context } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseUnsafeServiceRole } from '../lib/supabase.js';
import { verifyState, isValidShopDomain } from '../lib/shopifyState.js';
import { exchangeCodeForToken, registerWebhooks, upsertInstallation } from '../lib/shopifyInstall.js';

/**
 * Callback OAuth de instalación de Shopify (flujo productizado multi-tenant).
 *
 * Shopify redirige acá tras el consentimiento del merchant con
 * `?shop=&code=&hmac=&state=`. Flujo:
 *   1. Verificar HMAC de los query params (autenticidad).
 *   2. Verificar el `state` firmado → resolver la org de Vuoo (multi-tenant).
 *      Si no hay `state` (instalación piloto de la app custom), cae a
 *      SHOPIFY_DEFAULT_ORG_ID.
 *   3. Intercambiar el `code` por un access token offline.
 *   4. Guardar la instalación (shop ↔ org ↔ token) y registrar los webhooks.
 *   5. Redirigir a la UI de Vuoo (o mostrar página de éxito).
 *
 * Montado en `GET /shopify/callback` y en `GET /` (application_url).
 */
export async function shopifyOAuthCallback(c: Context) {
  const shop = c.req.query('shop');
  const code = c.req.query('code');
  const hmac = c.req.query('hmac');
  const state = c.req.query('state');

  // Sin params OAuth → landing informativo.
  if (!shop || !hmac) {
    return c.html(
      `<!doctype html><meta charset="utf-8"><title>Vuoo API</title>
       <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center">
       <h1>Vuoo API</h1><p>Servicio activo.</p></body>`,
    );
  }

  const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;
  if (!CLIENT_SECRET) return c.text('not_configured', 503);
  if (!isValidShopDomain(shop)) return c.text('invalid_shop', 400);

  // 1. HMAC de query params (hex sobre params ordenados sin hmac/signature).
  const url = new URL(c.req.url);
  const entries: Array<[string, string]> = [];
  for (const [k, v] of url.searchParams.entries()) {
    if (k === 'hmac' || k === 'signature') continue;
    entries.push([k, v]);
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const message = entries.map(([k, v]) => `${k}=${v}`).join('&');
  const digest = createHmac('sha256', CLIENT_SECRET).update(message).digest('hex');
  const da = Buffer.from(digest);
  const db2 = Buffer.from(hmac);
  if (da.length !== db2.length || !timingSafeEqual(da, db2)) {
    console.error('[shopify] OAuth callback HMAC inválido.');
    return c.text('invalid_hmac', 401);
  }

  // 2. Resolver la org: state firmado (productizado) o default (piloto).
  let orgId: string | null = null;
  let productized = false;
  if (state) {
    const parsed = verifyState(CLIENT_SECRET, state);
    if (!parsed || parsed.shop !== shop) {
      console.error('[shopify] OAuth state inválido o shop mismatch.');
      return c.text('invalid_state', 401);
    }
    orgId = parsed.org_id;
    productized = true;
  } else {
    orgId = process.env.SHOPIFY_DEFAULT_ORG_ID ?? null;
  }
  if (!orgId) {
    console.error(`[shopify] Sin org para la tienda ${shop}.`);
    return c.text('no_org', 400);
  }

  // 3. Intercambiar el code por un token.
  if (!code) return c.text('missing_code', 400);
  const tok = await exchangeCodeForToken(shop, code);
  if ('error' in tok) {
    console.error(`[shopify] token exchange falló: ${tok.error}`);
    return c.text('token_exchange_failed', 502);
  }

  // 4. Guardar instalación + registrar webhooks.
  const db = supabaseUnsafeServiceRole;
  if (db) {
    const up = await upsertInstallation(db, {
      org_id: orgId,
      shop_domain: shop,
      access_token: tok.access_token,
      scopes: tok.scope,
    });
    if (!up.ok) console.error(`[shopify] upsert instalación falló: ${up.error}`);
  } else {
    console.error('[shopify] service_role no configurado — no se guardó la instalación.');
  }
  const wh = await registerWebhooks(shop, tok.access_token);
  console.log(`[shopify] Install ${shop} → org ${orgId}. webhooks: ${wh.registered.join(', ')}${wh.errors.length ? ' | errores: ' + wh.errors.join('; ') : ''}`);

  // 5. Redirigir a la UI de Vuoo, o mostrar página de éxito.
  const appUrl = process.env.SHOPIFY_APP_URL;
  if (productized && appUrl) {
    const to = `${appUrl.replace(/\/$/, '')}/settings/api-tokens?shopify=connected&shop=${encodeURIComponent(shop)}`;
    return c.redirect(to, 302);
  }
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>Vuoo · conectado</title>
     <body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center">
     <h1>✅ Vuoo conectado</h1>
     <p>La app quedó instalada en <b>${shop}</b>. Tus pedidos aparecerán automáticamente en Vuoo.</p>
     <p style="color:#666">Ya podés cerrar esta ventana.</p></body>`,
  );
}
