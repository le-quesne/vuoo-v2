import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseUnsafeServiceRole } from '../lib/supabase.js';
import { createOrderForOrg, type OrderInput } from '../lib/createOrder.js';

export const shopifyWebhookRoutes = new Hono();

/**
 * Secret compartido de la app de Shopify (= "Client secret" / API secret key
 * del Dev Dashboard). Shopify firma cada webhook con este secret; sin él no se
 * puede verificar la autenticidad de las peticiones.
 */
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

/**
 * Resuelve `shop.myshopify.com` → `org_id` de Vuoo (multi-tenant).
 * Prioridad: instalación OAuth activa en `shopify_installations` →
 * `SHOPIFY_ORG_MAP` (JSON) → `SHOPIFY_DEFAULT_ORG_ID` (piloto).
 */
async function resolveOrgId(
  db: SupabaseClient,
  shopDomain: string | undefined,
): Promise<string | null> {
  if (shopDomain) {
    const { data } = await db
      .from('shopify_installations')
      .select('org_id')
      .eq('shop_domain', shopDomain)
      .eq('status', 'active')
      .maybeSingle();
    if (data?.org_id) return data.org_id as string;

    const raw = process.env.SHOPIFY_ORG_MAP;
    if (raw) {
      try {
        const map = JSON.parse(raw) as Record<string, string>;
        if (map[shopDomain]) return map[shopDomain];
      } catch {
        // JSON inválido: ignora el map y cae al default.
      }
    }
  }
  return process.env.SHOPIFY_DEFAULT_ORG_ID ?? null;
}

/**
 * POST /webhooks/shopify/orders-create
 *
 * Recibe el webhook `orders/create` de Shopify. NO usa el middleware de auth de
 * Vuoo: la autenticidad se verifica con el HMAC-SHA256 (base64) que firma
 * Shopify con el secret de la app.
 *
 * Flujo: verificar HMAC → mapear tienda→org → transformar payload → crear orden
 * (idempotente por el id de la orden de Shopify).
 */
shopifyWebhookRoutes.post('/orders-create', async (c) => {
  if (!SHOPIFY_API_SECRET) {
    console.error('[shopify] SHOPIFY_API_SECRET no configurado — rechazando webhook.');
    return c.json({ error: 'not_configured' }, 503);
  }

  // Body CRUDO: el HMAC se calcula sobre los bytes exactos, antes de parsear.
  const rawBody = Buffer.from(await c.req.arrayBuffer());
  if (!verifyShopifyHmac(rawBody, c.req.header('X-Shopify-Hmac-Sha256'))) {
    return c.json({ error: 'invalid_hmac' }, 401);
  }

  const db = supabaseUnsafeServiceRole;
  if (!db) {
    // 503 → Shopify reintenta más tarde (cuando el service-role esté provisionado).
    return c.json({ error: 'service_role_not_configured' }, 503);
  }

  const shopDomain = c.req.header('X-Shopify-Shop-Domain');
  const orgId = await resolveOrgId(db, shopDomain);
  if (!orgId) {
    console.error(`[shopify] Sin org mapeada para la tienda "${shopDomain}".`);
    // 200 → no reintentar: es un problema de config, no transitorio.
    return c.json({ skipped: 'no_org_mapping' }, 200);
  }

  let payload: ShopifyOrder;
  try {
    payload = JSON.parse(rawBody.toString('utf8')) as ShopifyOrder;
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  const input = shopifyOrderToInput(payload);
  if (!input) {
    // Órdenes sin dirección de envío (digitales, pickup sin dirección) no son
    // ruteables → 200 para que Shopify no reintente.
    return c.json({ skipped: 'no_shipping_address' }, 200);
  }

  // Idempotencia por id de la orden de Shopify: reenvíos/reintentos del mismo
  // pedido no duplican. `X-Shopify-Webhook-Id` sirve de fallback.
  const webhookId = c.req.header('X-Shopify-Webhook-Id');
  const idempotencyKey = `shopify:${shopDomain}:${payload.id ?? webhookId}`;

  const result = await createOrderForOrg({
    db,
    orgId,
    source: 'shopify',
    idempotencyKey,
    input,
  });

  if (!result.ok) {
    // order_number repetido (ej. dos tiendas mapeadas a la misma org generan
    // "#1001" ambas): error determinístico — un no-2xx haría que Shopify
    // reintente ~19 veces sin poder resolverse jamás. 200 para cortar el
    // retry y log para revisión manual.
    if (result.code === 'duplicate_order_number') {
      console.error(
        `[shopify] order_number duplicado en org ${orgId} (shop ${shopDomain}): ${result.detail ?? ''}`,
      );
      return c.json({ skipped: 'duplicate_order_number' }, 200);
    }
    // 500 → Shopify reintenta; la idempotencia evita duplicados.
    console.error(`[shopify] Falló crear orden (${result.code}): ${result.detail ?? ''}`);
    return c.json({ error: result.code }, result.status as 500);
  }

  return c.json(
    { id: result.id, match_quality: result.match_quality, idempotent: result.idempotent },
    200,
  );
});

/**
 * Verifica la firma HMAC-SHA256 (base64) que Shopify pone en el header
 * `X-Shopify-Hmac-Sha256`, calculada sobre el body crudo con el secret de la
 * app. Devuelve false si falta el secret o la firma no coincide.
 */
function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string | undefined): boolean {
  if (!SHOPIFY_API_SECRET || !hmacHeader) return false;
  const digest = createHmac('sha256', SHOPIFY_API_SECRET).update(rawBody).digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── Webhook de compliance GDPR (obligatorio para toda app de Shopify) ───────
//
// Shopify exige responder a los topics `customers/data_request`,
// `customers/redact` y `shop/redact` en cualquier app que acceda a datos de
// clientes. Se firman con el mismo secret (HMAC). Vuoo no almacena datos de
// clientes de Shopify más allá de las órdenes ruteables en la org del merchant,
// así que respondemos 200 y registramos la solicitud para trazabilidad. Un solo
// endpoint despacha los 3 topics según el header `X-Shopify-Topic`.

/**
 * POST /webhooks/shopify/app-uninstalled
 *
 * Shopify lo dispara cuando el merchant desinstala la app. Marca la instalación
 * como desinstalada (el token queda inválido del lado de Shopify).
 */
shopifyWebhookRoutes.post('/app-uninstalled', async (c) => {
  const raw = Buffer.from(await c.req.arrayBuffer());
  if (!verifyShopifyHmac(raw, c.req.header('X-Shopify-Hmac-Sha256'))) {
    return c.json({ error: 'invalid_hmac' }, 401);
  }
  const shop = c.req.header('X-Shopify-Shop-Domain');
  const db = supabaseUnsafeServiceRole;
  if (db && shop) {
    await db
      .from('shopify_installations')
      .update({
        status: 'uninstalled',
        access_token: '',
        uninstalled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('shop_domain', shop);
  }
  console.log(`[shopify] app/uninstalled — ${shop}`);
  return c.json({ ok: true }, 200);
});

/** POST /webhooks/shopify/compliance */
shopifyWebhookRoutes.post('/compliance', async (c) => {
  const raw = Buffer.from(await c.req.arrayBuffer());
  if (!verifyShopifyHmac(raw, c.req.header('X-Shopify-Hmac-Sha256'))) {
    return c.json({ error: 'invalid_hmac' }, 401);
  }
  const topic = c.req.header('X-Shopify-Topic') ?? 'unknown';
  const shop = c.req.header('X-Shopify-Shop-Domain') ?? '';
  console.log(`[shopify] compliance ${topic} — ${shop}`);
  return c.json({ ok: true }, 200);
});

/**
 * GET /webhooks/shopify/callback
 *
 * Landing del flujo OAuth de instalación. Shopify redirige acá tras el consent.
 * El conector obtiene tokens de Admin API vía client-credentials grant, así que
 * acá no hace falta canjear el `code`; solo mostramos una confirmación amigable
 * en vez de un 404 que confundiría al merchant durante el install.
 */
shopifyWebhookRoutes.get('/callback', (c) => {
  const shop = c.req.query('shop') ?? '';
  return c.html(
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Vuoo · Shopify</title></head>
     <body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center">
       <h1>✅ Vuoo conectado</h1>
       <p>La app de Vuoo quedó instalada${shop ? ` en <b>${shop}</b>` : ''}. Ya podés cerrar esta ventana.</p>
       <p style="color:#666">Tus pedidos de Shopify aparecerán automáticamente en Vuoo para rutear.</p>
     </body></html>`,
  );
});

// ─── Transform Shopify `orders/create` → OrderInput ──────────────────────────

interface ShopifyAddress {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface ShopifyOrder {
  id?: number;
  name?: string; // ej. "#1001"
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  tags?: string;
  total_weight?: number; // gramos
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  shipping_address?: ShopifyAddress | null;
  line_items?: Array<{
    name?: string;
    title?: string;
    quantity?: number;
    sku?: string | null;
  }>;
}

/**
 * Mapea una orden de Shopify al input canónico de Vuoo. Devuelve `null` si no
 * hay dirección de envío (la orden no es ruteable).
 */
export function shopifyOrderToInput(order: ShopifyOrder): OrderInput | null {
  const sa = order.shipping_address;
  if (!sa) return null;

  const address = [sa.address1, sa.address2, sa.city, sa.province, sa.zip, sa.country]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(', ');
  if (!address) return null;

  const customerName =
    sa.name?.trim() ||
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ').trim() ||
    order.email?.trim() ||
    'Cliente Shopify';

  const items = (order.line_items ?? [])
    .map((li) => ({
      name: (li.name ?? li.title ?? 'Item').trim(),
      quantity: Math.max(1, Math.trunc(li.quantity ?? 1)),
      sku: li.sku?.trim() || undefined,
    }))
    .filter((li) => li.name.length > 0);

  const tags = (order.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    order_number: order.name?.trim() || (order.id != null ? String(order.id) : undefined),
    customer_name: customerName,
    customer_phone: sa.phone ?? order.customer?.phone ?? order.phone ?? null,
    customer_email: order.email ?? order.customer?.email ?? null,
    address,
    lat: typeof sa.latitude === 'number' ? sa.latitude : null,
    lng: typeof sa.longitude === 'number' ? sa.longitude : null,
    items: items.length > 0 ? items : undefined,
    total_weight_kg: order.total_weight != null ? order.total_weight / 1000 : undefined,
    delivery_instructions: order.note?.trim() || null,
    tags,
  };
}
