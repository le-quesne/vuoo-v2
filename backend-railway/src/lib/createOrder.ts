import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Origen de la orden. Coincide con el enum `OrderSource` del frontend
 * (`src/presentation/features/orders/utils/constants.ts`).
 */
export type OrderSource = 'manual' | 'csv' | 'shopify' | 'vtex' | 'api' | 'whatsapp';

/**
 * Input normalizado de una orden entrante. Es la forma canónica a la que
 * cualquier conector (API pública, Shopify, VTEX…) debe mapear antes de
 * persistir. Un cambio de formato en un conector se resuelve en su transform,
 * no acá.
 */
export const OrderInputSchema = z.object({
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

export type OrderInput = z.infer<typeof OrderInputSchema>;

export type CreateOrderOutcome =
  | {
      ok: true;
      /** 201 si se creó, 200 si ya existía (idempotente). */
      status: 200 | 201;
      id: string;
      stop_id: string | null;
      match_quality: 'high' | 'medium' | 'low' | 'none';
      idempotent: boolean;
    }
  | { ok: false; status: number; code: string; detail?: string };

/**
 * Crea una orden para una org: dedupe idempotente → `match_stop_for_order`
 * (Fase B) → crea stop si corresponde → INSERT en `orders`.
 *
 * Comparte exactamente la lógica del endpoint público `/api/v1/orders` y del
 * webhook de Shopify. El `db` debe ser el cliente service-role (bypassa RLS),
 * por eso cada query filtra `org_id` manualmente.
 *
 * `idempotencyKey` se hashea junto al `orgId` y se guarda como `external_id`.
 * Reenviar la misma key devuelve la orden existente sin duplicar.
 */
export async function createOrderForOrg(opts: {
  db: SupabaseClient;
  orgId: string;
  source: OrderSource;
  idempotencyKey: string;
  input: OrderInput;
}): Promise<CreateOrderOutcome> {
  const { db, orgId, source, idempotencyKey, input } = opts;

  const externalIdKey = `idem:${hashIdemKey(orgId, idempotencyKey)}`;

  // Dedupe: si ya existe una order con este external_id en la org, devuelve la existente.
  const { data: existing } = await db
    .from('orders')
    .select('id, stop_id, match_quality')
    .eq('org_id', orgId)
    .eq('external_id', externalIdKey)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      status: 200,
      id: existing.id,
      stop_id: existing.stop_id,
      match_quality: existing.match_quality,
      idempotent: true,
    };
  }

  // match_stop_for_order (Fase B).
  const { data: matchRows, error: matchErr } = await db.rpc('match_stop_for_order', {
    p_org_id: orgId,
    p_address: input.address,
    p_customer_name: input.customer_name,
    p_customer_id: null,
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
  });
  if (matchErr || !matchRows || matchRows.length === 0) {
    return { ok: false, status: 500, code: 'match_failed', detail: matchErr?.message };
  }

  const match = matchRows[0] as {
    stop_id: string | null;
    match_quality: 'high' | 'medium' | 'low' | 'none';
    should_create_new: boolean;
  };

  let stopId = match.stop_id;
  if (match.should_create_new) {
    // `stops.user_id` es NOT NULL (owner del stop curado). Las órdenes externas
    // no tienen usuario humano → se atribuyen al owner de la org.
    const ownerId = await resolveOrgOwner(db, orgId);
    if (!ownerId) {
      return { ok: false, status: 500, code: 'no_org_owner', detail: `org ${orgId} sin miembros` };
    }
    const { data: newStop, error: sErr } = await db
      .from('stops')
      .insert({
        org_id: orgId,
        user_id: ownerId,
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
      return { ok: false, status: 500, code: 'stop_create_failed', detail: sErr?.message };
    }
    stopId = newStop.id;
  }

  // Heredar customer_id del stop si está vinculado, para que el JOIN del
  // frontend hidrate email/phone desde el master.
  let resolvedCustomerId: string | null = null;
  if (stopId) {
    const { data: stopRow } = await db
      .from('stops')
      .select('customer_id')
      .eq('id', stopId)
      .maybeSingle();
    if (stopRow?.customer_id) {
      resolvedCustomerId = (stopRow as { customer_id: string }).customer_id;
    }
  }

  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      org_id: orgId,
      order_number: input.order_number ?? null,
      external_id: externalIdKey,
      customer_name: input.customer_name,
      customer_id: resolvedCustomerId,
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
      source,
      status: 'pending',
      stop_id: stopId,
      match_quality: match.match_quality,
      match_review_needed: match.match_quality === 'medium',
      tags: input.tags ?? [],
    })
    .select('id')
    .single();

  if (oErr || !order) {
    return { ok: false, status: 500, code: 'order_insert_failed', detail: oErr?.message };
  }

  return {
    ok: true,
    status: 201,
    id: order.id,
    stop_id: stopId,
    match_quality: match.match_quality,
    idempotent: false,
  };
}

function hashIdemKey(orgId: string, key: string): string {
  return createHash('sha256').update(`${orgId}::${key}`).digest('hex');
}

/**
 * Resuelve el usuario al que se atribuyen los stops creados por conectores
 * externos: owner de la org, con fallback a admin y luego a cualquier miembro.
 * Usa el cliente service-role (bypassa RLS), por eso se filtra `org_id`.
 */
async function resolveOrgOwner(db: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await db
    .from('organization_members')
    .select('user_id, role')
    .eq('org_id', orgId);
  if (!data || data.length === 0) return null;
  const rows = data as Array<{ user_id: string; role: string | null }>;
  const pick =
    rows.find((m) => m.role === 'owner') ??
    rows.find((m) => m.role === 'admin') ??
    rows[0];
  return pick.user_id;
}
