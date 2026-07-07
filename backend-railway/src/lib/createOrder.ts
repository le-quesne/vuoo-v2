import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Origen de la orden. Coincide con el enum `OrderSource` del frontend
 * (`src/presentation/features/orders/utils/constants.ts`).
 */
export type OrderSource = 'manual' | 'csv' | 'shopify' | 'vtex' | 'api' | 'whatsapp';

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-13-45" pasa el regex pero revienta en Postgres como 500; esto lo corta en 400. */
function isRealYmdDate(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Input normalizado de una orden entrante. Es la forma canónica a la que
 * cualquier conector (API pública, Shopify, VTEX…) debe mapear antes de
 * persistir. Un cambio de formato en un conector se resuelve en su transform,
 * no acá.
 *
 * El destino se resuelve por `address` o por `customer_code` (cliente del
 * catálogo con dirección registrada) — al menos uno es obligatorio.
 */
export const OrderInputSchema = z
  .object({
    order_number: z.string().max(64).optional(),
    customer_code: z.string().max(64).optional(),
    customer_name: z.string().min(1).max(200),
    customer_phone: z.string().max(50).nullable().optional(),
    customer_email: z.string().email().max(254).nullable().optional(),
    /** Nombre del punto de entrega (sucursal, local). Si falta, el stop
     *  creado hereda `customer_name`. */
    place_name: z.string().max(200).nullable().optional(),
    address: z.string().min(1).max(500).nullish(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    items: z
      .array(
        z.object({
          name: z.string().max(200),
          quantity: z.number().int().positive(),
          sku: z.string().max(64).optional(),
        }),
      )
      .max(500)
      .optional(),
    total_weight_kg: z.number().nonnegative().nullable().optional(),
    total_volume_m3: z.number().nonnegative().nullable().optional(),
    total_price: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).optional(),
    service_duration_minutes: z.number().int().positive().nullable().optional(),
    time_window_start: z.string().regex(HHMM_REGEX, 'formato esperado "HH:MM"').nullable().optional(),
    time_window_end: z.string().regex(HHMM_REGEX, 'formato esperado "HH:MM"').nullable().optional(),
    priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
    requires_signature: z.boolean().optional(),
    requires_photo: z.boolean().optional(),
    requested_date: z
      .string()
      .regex(YMD_REGEX, 'formato esperado "YYYY-MM-DD"')
      .refine(isRealYmdDate, 'fecha inexistente')
      .nullable()
      .optional(),
    delivery_instructions: z.string().max(2000).nullable().optional(),
    internal_notes: z.string().max(5000).nullable().optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
  })
  .refine((o) => Boolean(o.address?.trim()) || Boolean(o.customer_code?.trim()), {
    message: 'Se requiere address o customer_code',
    path: ['address'],
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
 * Crea una orden para una org: dedupe idempotente → resolución de customer por
 * `customer_code` → `match_stop_for_order` (Fase B) → crea stop si corresponde
 * → INSERT en `orders`.
 *
 * Comparte exactamente la lógica del endpoint público `/api/v1/orders` y del
 * webhook de Shopify. El `db` debe ser el cliente service-role (bypassa RLS),
 * por eso cada query filtra `org_id` manualmente.
 *
 * `idempotencyKey` se hashea junto al `orgId` y se guarda como `external_id`
 * (con unique parcial en DB). Reenviar la misma key devuelve la orden
 * existente sin duplicar, incluso ante requests concurrentes.
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
  const existing = await findByExternalId(db, orgId, externalIdKey);
  if (existing) return existing;

  // ─── Resolver customer por código (catálogo `customers`) ───────────
  // Si el código no existe, se crea el cliente con los datos básicos del
  // pedido (mismo comportamiento que el import CSV): el ERP es la fuente de
  // verdad de su propio catálogo.
  const customerCode = input.customer_code?.trim() || null;
  let customerId: string | null = null;
  if (customerCode) {
    customerId = await resolveOrCreateCustomer(db, orgId, customerCode, input);
  }

  const hasAddress = Boolean(input.address?.trim());

  let stopId: string | null = null;
  let matchQuality: 'high' | 'medium' | 'low' | 'none' = 'none';
  let resolvedAddress = input.address ?? null;
  let resolvedLat = input.lat ?? null;
  let resolvedLng = input.lng ?? null;
  let pendingAddress = false;

  if (hasAddress) {
    // ─── Caso A: hay address → match_stop_for_order (Fase B) ─────────
    // `p_customer_id` activa la rama de mayor confianza del RPC: dirección
    // igual + mismo cliente → match high directo.
    const { data: matchRows, error: matchErr } = await db.rpc('match_stop_for_order', {
      p_org_id: orgId,
      p_address: input.address!,
      p_customer_name: input.customer_name,
      p_customer_id: customerId,
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
    stopId = match.stop_id;
    matchQuality = match.match_quality;

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
          // El nombre del stop es el LUGAR, no el cliente. Sin place_name
          // explícito cae a customer_name (caso B2C donde coinciden).
          name: input.place_name?.trim() || input.customer_name,
          address: input.address!,
          // address_hash lo calcula el trigger trg_stops_address_hash en
          // Postgres (única fuente de verdad del hash de matching).
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          customer_id: customerId,
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
  } else if (customerId) {
    // ─── Caso B: solo customer_code → dirección desde el catálogo ────
    // Se reusa el stop más usado del cliente (mismo criterio que el import CSV).
    const { data: stops } = await db
      .from('stops')
      .select('id, address, lat, lng')
      .eq('org_id', orgId)
      .eq('customer_id', customerId)
      .order('use_count', { ascending: false, nullsFirst: false })
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .limit(1);

    if (stops && stops.length > 0) {
      const stop = stops[0] as { id: string; address: string; lat: number | null; lng: number | null };
      stopId = stop.id;
      resolvedAddress = stop.address;
      resolvedLat = stop.lat;
      resolvedLng = stop.lng;
      matchQuality = 'high';
    } else {
      // Cliente sin dirección registrada: la orden entra pendiente y el
      // dispatcher la completa desde el panel.
      pendingAddress = true;
    }
  } else {
    // customer_code vino pero no se pudo resolver ni crear el cliente.
    pendingAddress = true;
  }

  // Heredar customer_id del stop si está vinculado, para que el JOIN del
  // frontend hidrate email/phone desde el master.
  if (!customerId && stopId) {
    const { data: stopRow } = await db
      .from('stops')
      .select('customer_id')
      .eq('id', stopId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (stopRow?.customer_id) {
      customerId = (stopRow as { customer_id: string }).customer_id;
    }
  }

  // `orders.order_number` es NOT NULL con unique (org_id, order_number). Si el
  // conector no lo provee (la API pública puede omitirlo), lo autogeneramos con
  // la misma RPC que usa el import CSV para mantener el formato `ORD-00001`.
  let orderNumber = input.order_number?.trim() || null;
  if (!orderNumber) {
    const { data: gen, error: gErr } = await db.rpc('generate_order_number', {
      p_org_id: orgId,
    });
    if (gErr || !gen) {
      return {
        ok: false,
        status: 500,
        code: 'order_number_generation_failed',
        detail: gErr?.message,
      };
    }
    orderNumber = gen as string;
  }

  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      org_id: orgId,
      order_number: orderNumber,
      external_id: externalIdKey,
      customer_name: input.customer_name,
      customer_code: customerCode,
      customer_id: customerId,
      address: resolvedAddress,
      lat: resolvedLat,
      lng: resolvedLng,
      items: input.items ?? [],
      total_weight_kg: input.total_weight_kg ?? 0,
      total_volume_m3: input.total_volume_m3 ?? null,
      total_price: input.total_price ?? null,
      ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
      ...(input.service_duration_minutes
        ? { service_duration_minutes: input.service_duration_minutes }
        : {}),
      time_window_start: input.time_window_start ?? null,
      time_window_end: input.time_window_end ?? null,
      priority: input.priority ?? 'normal',
      requires_signature: input.requires_signature ?? false,
      requires_photo: input.requires_photo ?? false,
      requested_date: input.requested_date ?? null,
      delivery_instructions: input.delivery_instructions ?? null,
      internal_notes: input.internal_notes ?? null,
      source,
      status: 'pending',
      stop_id: stopId,
      match_quality: matchQuality,
      match_review_needed: matchQuality === 'medium' || pendingAddress,
      tags: input.tags ?? [],
    })
    .select('id')
    .single();

  if (oErr || !order) {
    if (oErr?.code === '23505') {
      // Race idempotente: otra request con la misma key ganó el INSERT.
      if (oErr.message.includes('orders_org_external_id_unique')) {
        const winner = await findByExternalId(db, orgId, externalIdKey);
        if (winner) return winner;
      }
      // order_number repetido: error del integrador, no reintentable.
      if (oErr.message.includes('orders_order_number_unique')) {
        return {
          ok: false,
          status: 409,
          code: 'duplicate_order_number',
          detail: `Ya existe un pedido con order_number "${orderNumber}" en tu organización.`,
        };
      }
    }
    return { ok: false, status: 500, code: 'order_insert_failed', detail: oErr?.message };
  }

  return {
    ok: true,
    status: 201,
    id: order.id,
    stop_id: stopId,
    match_quality: matchQuality,
    idempotent: false,
  };
}

function hashIdemKey(orgId: string, key: string): string {
  return createHash('sha256').update(`${orgId}::${key}`).digest('hex');
}

async function findByExternalId(
  db: SupabaseClient,
  orgId: string,
  externalIdKey: string,
): Promise<Extract<CreateOrderOutcome, { ok: true }> | null> {
  const { data } = await db
    .from('orders')
    .select('id, stop_id, match_quality')
    .eq('org_id', orgId)
    .eq('external_id', externalIdKey)
    .maybeSingle();
  if (!data) return null;
  return {
    ok: true,
    status: 200,
    id: data.id,
    stop_id: data.stop_id,
    match_quality: data.match_quality,
    idempotent: true,
  };
}

/**
 * Resuelve el cliente del catálogo por `customer_code`; si no existe lo crea
 * con los datos básicos del pedido. Ante un error (p. ej. race con el unique
 * de customers) reintenta el SELECT; si aun así falla, devuelve null y la
 * orden sigue sin vínculo — el matching nunca bloquea.
 */
async function resolveOrCreateCustomer(
  db: SupabaseClient,
  orgId: string,
  customerCode: string,
  input: Pick<OrderInput, 'customer_name' | 'customer_phone' | 'customer_email'>,
): Promise<string | null> {
  const { data: found } = await db
    .from('customers')
    .select('id')
    .eq('org_id', orgId)
    .eq('customer_code', customerCode)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data: created, error: cErr } = await db
    .from('customers')
    .insert({
      org_id: orgId,
      customer_code: customerCode,
      name: input.customer_name,
      phone: input.customer_phone ?? null,
      email: input.customer_email ?? null,
      is_active: true,
    })
    .select('id')
    .single();
  if (created?.id) return created.id as string;

  if (cErr?.code === '23505') {
    const { data: retry } = await db
      .from('customers')
      .select('id')
      .eq('org_id', orgId)
      .eq('customer_code', customerCode)
      .maybeSingle();
    if (retry?.id) return retry.id as string;
  }
  console.error('[createOrder] customer_create_failed', { orgId, customerCode, cErr });
  return null;
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
