import { Hono } from 'hono';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { supabaseUnsafeServiceRole } from '../lib/supabase.js';
import { requireScope } from '../middleware/auth.js';

export const ordersApiRoutes = new Hono();

const OrderSchema = z.object({
  order_number: z.string().optional(),
  external_id: z.string().optional(),
  customer_name: z.string().min(1),
  customer_phone: z.string().nullable().optional(),
  customer_email: z.string().email().nullable().optional(),
  address: z.string().min(1),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().positive(),
        sku: z.string().optional(),
      }),
    )
    .optional(),
  total_weight_kg: z.number().nonnegative().optional(),
  total_volume_m3: z.number().nonnegative().nullable().optional(),
  time_window_start: z.string().nullable().optional(),
  time_window_end: z.string().nullable().optional(),
  priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
  requires_signature: z.boolean().optional(),
  requires_photo: z.boolean().optional(),
  requested_date: z.string().nullable().optional(),
  delivery_instructions: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * POST /api/v1/orders
 *
 * Endpoint público autenticado por token opaco de `org_api_tokens`.
 *
 * Headers:
 *   Authorization: Bearer <org_api_token>
 *   Idempotency-Key: <uuid>   ← requerido, dedupe 24 h
 *
 * Body: ver OrderSchema.
 *
 * Respuesta:
 *   201 { id, match_quality, stop_id }
 *   200 { id, match_quality, stop_id, idempotent: true }  ← si ya existía
 */
ordersApiRoutes.post('/', requireScope('orders:write'), async (c) => {
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
  const parsed = OrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', detail: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  const externalIdKey = `idem:${hashIdemKey(auth.orgId, idempotencyKey)}`;

  // Dedupe: si ya existe una order con este external_id en la org, devuelve la existente.
  const { data: existing } = await db
    .from('orders')
    .select('id, stop_id, match_quality')
    .eq('org_id', auth.orgId)
    .eq('external_id', externalIdKey)
    .maybeSingle();

  if (existing) {
    return c.json(
      {
        id: existing.id,
        match_quality: existing.match_quality,
        stop_id: existing.stop_id,
        idempotent: true,
      },
      200,
    );
  }

  // match_stop_for_order (Fase B).
  const { data: matchRows, error: matchErr } = await db.rpc(
    'match_stop_for_order',
    {
      p_org_id: auth.orgId,
      p_address: input.address,
      p_customer_name: input.customer_name,
      p_customer_id: null,
      p_lat: input.lat ?? null,
      p_lng: input.lng ?? null,
    },
  );
  if (matchErr || !matchRows || matchRows.length === 0) {
    return c.json({ error: 'match_failed', detail: matchErr?.message }, 500);
  }

  const match = matchRows[0] as {
    stop_id: string | null;
    match_quality: 'high' | 'medium' | 'low' | 'none';
    should_create_new: boolean;
  };

  let stopId = match.stop_id;
  if (match.should_create_new) {
    const { data: newStop, error: sErr } = await db
      .from('stops')
      .insert({
        org_id: auth.orgId,
        name: input.customer_name,
        address: input.address,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        customer_name: input.customer_name,
        customer_phone: input.customer_phone ?? null,
        customer_email: input.customer_email ?? null,
      })
      .select('id')
      .single();
    if (sErr || !newStop) {
      return c.json({ error: 'stop_create_failed', detail: sErr?.message }, 500);
    }
    stopId = newStop.id;
  }

  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      org_id: auth.orgId,
      order_number: input.order_number ?? null,
      external_id: externalIdKey,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      customer_email: input.customer_email ?? null,
      address: input.address,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      items: input.items ?? [],
      total_weight_kg: input.total_weight_kg ?? 0,
      total_volume_m3: input.total_volume_m3 ?? null,
      time_window_start: input.time_window_start ?? null,
      time_window_end: input.time_window_end ?? null,
      priority: input.priority ?? 'normal',
      requires_signature: input.requires_signature ?? false,
      requires_photo: input.requires_photo ?? false,
      requested_date: input.requested_date ?? null,
      delivery_instructions: input.delivery_instructions ?? null,
      source: auth.source,
      status: 'pending',
      stop_id: stopId,
      match_quality: match.match_quality,
      match_review_needed: match.match_quality === 'medium',
      tags: input.tags ?? [],
    })
    .select('id')
    .single();

  if (oErr || !order) {
    return c.json({ error: 'order_insert_failed', detail: oErr?.message }, 500);
  }

  return c.json(
    {
      id: order.id,
      match_quality: match.match_quality,
      stop_id: stopId,
    },
    201,
  );
});

function hashIdemKey(orgId: string, key: string): string {
  return createHash('sha256').update(`${orgId}::${key}`).digest('hex');
}
