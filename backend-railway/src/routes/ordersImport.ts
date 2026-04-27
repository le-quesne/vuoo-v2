import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseFromJWT } from '../lib/supabase.js';

/** Replica vuoo_normalize_address de Postgres en JS. */
function normalizeAddressHash(addr: string): string {
  return addr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const ordersImportRoutes = new Hono();

const RowSchema = z
  .object({
    customer_name: z.string(),
    customer_phone: z.string().nullable().optional(),
    customer_email: z.string().nullable().optional(),
    customer_code: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    items: z.array(z.unknown()).optional(),
    total_weight_kg: z.number().optional(),
    total_volume_m3: z.number().nullable().optional(),
    time_window_start: z.string().nullable().optional(),
    time_window_end: z.string().nullable().optional(),
    priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
    requested_date: z.string().nullable().optional(),
    order_number: z.string().optional(),
    internal_notes: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (r) => (r.address && r.address.trim().length > 0) || (r.customer_code && r.customer_code.trim().length > 0),
    { message: 'Cada fila requiere address o customer_code' },
  );

const ImportBodySchema = z.object({
  templateId: z.string().nullable().optional(),
  rows: z.array(RowSchema).min(1).max(2000),
});

/**
 * POST /orders/import
 *
 * Pipeline:
 *   1. Aplica template si viene (column_map → normaliza filas).
 *   2. Pide lat/lng (o usa las provistas) via /geocode/batch internamente.
 *      NOTA: en este scaffold asumimos que el cliente ya mandó filas con `address`
 *      y el pipeline local re-geocodea solo misses.
 *   3. Para cada fila geocodeada, invoca la RPC `match_stop_for_order` (Fase B)
 *      para decidir reusar vs crear stop.
 *   4. INSERT transaccional de orders con `stop_id`, `match_quality`.
 *   5. Devuelve ImportReport.
 *
 * Respuesta:
 *   { created, failed, warnings, orderIds, matchStats: { high, medium, low, created } }
 */
ordersImportRoutes.post('/', async (c) => {
  const auth = c.var.auth;
  const db = supabaseFromJWT(auth.authHeader);
  const body = await c.req.json().catch(() => null);
  const parsed = ImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', detail: parsed.error.issues }, 400);
  }

  const { rows } = parsed.data;
  const orgId = auth.orgId;

  const orderIds: string[] = [];
  const warnings: string[] = [];
  const matchStats = { high: 0, medium: 0, low: 0, none: 0, created: 0 };
  let failed = 0;

  console.log(`[orders/import] org=${orgId} user=${auth.userId} rows=${rows.length}`);

  // TODO(fase-B.2): envolver en una transacción (pg-promise o plantear RPC
  // Postgres bulk para no hacer N round-trips desde Railway).
  for (const row of rows) {
    try {
      const hasAddress = !!row.address && row.address.trim().length > 0;
      const hasCode = !!row.customer_code && row.customer_code.trim().length > 0;

      let stopId: string | null = null;
      let matchQuality: 'high' | 'medium' | 'low' | 'none' = 'none';
      let resolvedAddress = row.address ?? null;
      let resolvedLat = row.lat ?? null;
      let resolvedLng = row.lng ?? null;
      let pendingAddress = false;

      // ─────────────────────────────────────────────────────────────────
      // Caso A: hay address. Flujo clásico de match_stop_for_order.
      // ─────────────────────────────────────────────────────────────────
      if (hasAddress) {
        const { data: matchRows, error: matchErr } = await db.rpc('match_stop_for_order', {
          p_org_id: orgId,
          p_address: row.address!,
          p_customer_name: row.customer_name,
          p_customer_id: null,
          p_lat: row.lat ?? null,
          p_lng: row.lng ?? null,
        });

        if (matchErr || !matchRows || matchRows.length === 0) {
          failed++;
          const detail = matchErr?.message ?? 'no rows';
          console.error('[orders/import] match_failed', { address: row.address, detail, matchErr });
          warnings.push(`match_failed [${row.address}]: ${detail}`);
          continue;
        }

        const match = matchRows[0] as {
          stop_id: string | null;
          match_quality: 'high' | 'medium' | 'low' | 'none';
          should_create_new: boolean;
        };
        matchQuality = match.match_quality;
        stopId = match.stop_id;

        if (match.should_create_new) {
          const { data: newStop, error: sErr } = await db
            .from('stops')
            .insert({
              org_id: orgId,
              user_id: auth.userId,
              name: row.customer_name,
              address: row.address!,
              lat: row.lat ?? null,
              lng: row.lng ?? null,
              customer_name: row.customer_name,
              customer_phone: row.customer_phone ?? null,
              customer_email: row.customer_email ?? null,
              address_hash: normalizeAddressHash(row.address!),
              geocoding_confidence: row.lat != null && row.lng != null ? 0.8 : null,
              geocoding_provider: 'mapbox',
            })
            .select('id')
            .single();
          if (sErr || !newStop) {
            failed++;
            console.error('[orders/import] stop_create_failed', { address: row.address, sErr });
            warnings.push(`stop_create_failed [${row.address}]: ${sErr?.message ?? 'unknown'}`);
            continue;
          }
          stopId = newStop.id;
          matchStats.created++;
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // Caso B: solo customer_code (sin address). Resolver desde catálogo.
      // ─────────────────────────────────────────────────────────────────
      else if (hasCode) {
        // 1) Buscar customer por código
        const { data: customer } = await db
          .from('customers')
          .select('id')
          .eq('org_id', orgId)
          .eq('customer_code', row.customer_code!.trim())
          .maybeSingle();

        if (customer?.id) {
          // 2) Buscar stops del customer (pickeamos el más usado / más reciente)
          const { data: stops } = await db
            .from('stops')
            .select('id, address, lat, lng')
            .eq('org_id', orgId)
            .eq('customer_id', customer.id)
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
            // Customer existe pero sin stops; queda pendiente de dirección.
            pendingAddress = true;
            matchStats.none++;
            warnings.push(
              `[${row.customer_code}] cliente sin dirección registrada; pedido importado como pendiente.`,
            );
          }
        } else {
          // Customer nuevo: lo creamos con datos básicos para que el dispatcher pueda
          // luego completar la dirección desde OrdersPage.
          const { data: newCustomer, error: cErr } = await db
            .from('customers')
            .insert({
              org_id: orgId,
              customer_code: row.customer_code!.trim(),
              name: row.customer_name,
              phone: row.customer_phone ?? null,
              email: row.customer_email ?? null,
              is_active: true,
            })
            .select('id')
            .single();
          if (cErr) {
            console.error('[orders/import] customer_create_failed', { code: row.customer_code, cErr });
            warnings.push(
              `[${row.customer_code}] no se pudo crear cliente: ${cErr.message}; pedido pendiente sin vínculo.`,
            );
          } else {
            console.log('[orders/import] customer_created', { code: row.customer_code, id: newCustomer?.id });
          }
          pendingAddress = true;
          matchStats.none++;
        }
      }

      // 4. Resolver order_number: usa el del CSV si viene, si no genera con RPC.
      let orderNumber = row.order_number?.trim();
      if (!orderNumber) {
        const { data: gen, error: gErr } = await db.rpc('generate_order_number', {
          p_org_id: orgId,
        });
        if (gErr || !gen) {
          failed++;
          console.error('[orders/import] generate_order_number_failed', { gErr });
          warnings.push(
            `order_number_missing [${row.customer_name}]: ${gErr?.message ?? 'no pudo autogenerar'}`,
          );
          continue;
        }
        orderNumber = gen as string;
      }

      // 5. INSERT order. address puede ser null cuando se importa solo con
      // customer_code y el customer no tiene stop registrado.
      const { data: order, error: oErr } = await db
        .from('orders')
        .insert({
          org_id: orgId,
          order_number: orderNumber,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone ?? null,
          customer_email: row.customer_email ?? null,
          customer_code: row.customer_code?.trim() || null,
          address: resolvedAddress,
          lat: resolvedLat,
          lng: resolvedLng,
          items: row.items ?? [],
          total_weight_kg: row.total_weight_kg ?? 0,
          total_volume_m3: row.total_volume_m3 ?? null,
          time_window_start: row.time_window_start ?? null,
          time_window_end: row.time_window_end ?? null,
          priority: row.priority ?? 'normal',
          requested_date: row.requested_date ?? null,
          source: 'csv',
          status: 'pending',
          stop_id: stopId,
          match_quality: matchQuality,
          match_review_needed: matchQuality === 'medium' || pendingAddress,
          tags: row.tags ?? [],
          internal_notes: row.internal_notes ?? null,
          created_by: auth.userId,
        })
        .select('id')
        .single();

      if (oErr || !order) {
        failed++;
        console.error('[orders/import] order_insert_failed', {
          customer: row.customer_name,
          address: resolvedAddress,
          code: oErr?.code,
          message: oErr?.message,
          details: oErr?.details,
          hint: oErr?.hint,
        });
        warnings.push(
          `order_insert_failed [${row.customer_name}]: ${oErr?.message ?? 'unknown'}${oErr?.hint ? ' — ' + oErr.hint : ''}`,
        );
        continue;
      }

      orderIds.push(order.id);
      if (matchQuality !== 'none') matchStats[matchQuality]++;
    } catch (e) {
      failed++;
      warnings.push(e instanceof Error ? e.message : 'unknown');
    }
  }

  console.log(
    `[orders/import] done org=${orgId} created=${orderIds.length} failed=${failed} warnings=${warnings.length}`,
  );

  return c.json({
    created: orderIds.length,
    failed,
    warnings,
    orderIds,
    matchStats,
  });
});
