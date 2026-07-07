import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { supabaseUnsafeServiceRole } from '../lib/supabase.js';
import { requireScope } from '../middleware/auth.js';
import { OrderInputSchema, createOrderForOrg } from '../lib/createOrder.js';

export const ordersApiRoutes = new Hono();

// El proceso Node es compartido por todos los tenants: sin tope, un solo
// token puede hacer OOM al servicio con un body gigante. 1 MB sobra para un
// pedido (items va acotado a 500 líneas en el schema).
const ORDER_BODY_LIMIT_BYTES = 1024 * 1024;

/**
 * POST /api/v1/orders
 *
 * Endpoint público autenticado por token opaco de `org_api_tokens`.
 *
 * Headers:
 *   Authorization: Bearer <org_api_token>
 *   Idempotency-Key: <id único del pedido en el sistema del integrador>
 *                    ← requerido, dedupe permanente por org
 *
 * Body: ver OrderInputSchema (`lib/createOrder.ts`).
 *
 * Respuesta:
 *   201 { id, match_quality, stop_id }
 *   200 { id, match_quality, stop_id, idempotent: true }  ← si ya existía
 *   409 { error: duplicate_order_number }                 ← order_number repetido
 */
ordersApiRoutes.post(
  '/',
  bodyLimit({
    maxSize: ORDER_BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: 'payload_too_large', detail: 'Máximo 1 MB por pedido.' }, 413),
  }),
  requireScope('orders:write'),
  async (c) => {
  const auth = c.var.auth;
  const db = supabaseUnsafeServiceRole;
  if (!db) {
    return c.json(
      {
        error: 'service_role_not_configured',
        detail: 'Este endpoint requiere SUPABASE_SERVICE_ROLE_KEY. Provisionalo en Railway.',
      },
      501,
    );
  }
  const idempotencyKey = c.req.header('Idempotency-Key');
  if (!idempotencyKey) {
    return c.json({ error: 'missing_idempotency_key' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = OrderInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', detail: parsed.error.issues }, 400);
  }

  const result = await createOrderForOrg({
    db,
    orgId: auth.orgId,
    source: auth.source,
    idempotencyKey,
    input: parsed.data,
  });

  if (!result.ok) {
    return c.json({ error: result.code, detail: result.detail }, result.status as ContentfulStatusCode);
  }

  return c.json(
    {
      id: result.id,
      match_quality: result.match_quality,
      stop_id: result.stop_id,
      ...(result.idempotent ? { idempotent: true } : {}),
    },
    result.status,
  );
  },
);
