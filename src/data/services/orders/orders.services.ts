import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Order, OrderStatus } from '@/data/types/database';
import type {
  AssignAction,
  AssignEntry,
  AssignReport,
  ImportReport,
  OrderInsert,
} from './orders.types';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export type AddressFilter = 'all' | 'pending' | 'resolved';

export interface ListOrdersArgs {
  orgId: string;
  status?: OrderStatus | 'all';
  addressFilter?: AddressFilter;
  search?: string;
  from: number;
  to: number;
}

export async function listOrders({
  orgId,
  status,
  addressFilter = 'all',
  search,
  from,
  to,
}: ListOrdersArgs): Promise<ServiceResult<{ items: Order[]; total: number }>> {
  try {
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(from, to);
    if (status && status !== 'all') query = query.eq('status', status);
    if (addressFilter === 'pending') query = query.is('address', null);
    if (addressFilter === 'resolved') query = query.not('address', 'is', null);
    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      query = query.or(
        `order_number.ilike.${q},customer_name.ilike.${q},customer_address.ilike.${q}`,
      );
    }
    const { data, error, count } = await query;
    if (error) return fail(error.message);
    return ok({ items: (data ?? []) as Order[], total: count ?? 0 });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function getAddressCountsForStatus(
  orgId: string,
  status: OrderStatus | 'all',
): Promise<ServiceResult<{ pendingAddress: number; resolvedAddress: number }>> {
  try {
    const base = () => {
      let q = supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId);
      if (status !== 'all') q = q.eq('status', status);
      return q;
    };
    const [pa, ra] = await Promise.all([
      base().is('address', null),
      base().not('address', 'is', null),
    ]);
    if (pa.error) return fail(pa.error.message);
    if (ra.error) return fail(ra.error.message);
    return ok({
      pendingAddress: pa.count ?? 0,
      resolvedAddress: ra.count ?? 0,
    });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'scheduled',
  'in_transit',
  'delivered',
  'failed',
  'cancelled',
  'returned',
];

export interface OrderStatusCounts {
  byStatus: Record<OrderStatus, number>;
  pendingAddress: number;
}

export async function getStatusCounts(
  orgId: string,
): Promise<ServiceResult<OrderStatusCounts>> {
  try {
    const statusQueries = ORDER_STATUSES.map((status) =>
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', status),
    );
    const pendingAddressQuery = supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('address', null);

    const results = await Promise.all([...statusQueries, pendingAddressQuery]);

    const byStatus = ORDER_STATUSES.reduce(
      (acc, status, idx) => {
        const r = results[idx];
        if (r.error) throw new Error(r.error.message);
        acc[status] = r.count ?? 0;
        return acc;
      },
      {} as Record<OrderStatus, number>,
    );

    const pa = results[results.length - 1];
    if (pa.error) return fail(pa.error.message);

    return ok({ byStatus, pendingAddress: pa.count ?? 0 });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function listAllIds(
  orgId: string,
  status: OrderStatus | 'all',
  addressFilter: AddressFilter = 'all',
): Promise<ServiceResult<string[]>> {
  try {
    let query = supabase.from('orders').select('id').eq('org_id', orgId);
    if (status !== 'all') query = query.eq('status', status);
    if (addressFilter === 'pending') query = query.is('address', null);
    if (addressFilter === 'resolved') query = query.not('address', 'is', null);
    const { data, error } = await query;
    if (error) return fail(error.message);
    return ok((data ?? []).map((r) => (r as { id: string }).id));
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deleteOrders(ids: string[]): Promise<ServiceResult<void>> {
  if (ids.length === 0) return ok(undefined);
  try {
    const { error } = await supabase.from('orders').delete().in('id', ids);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * @deprecated Usar `importFromCsv` (vía ImportWizard) para importaciones de CSV/XLSX.
 * `bulkCreate` inserta directo en Supabase sin pasar por matching, geocoding ni
 * validaciones del backend. Solo apto para herramientas internas/admin con datos
 * pre-validados. No invocar desde flows de usuario.
 */
export async function bulkCreate(
  rows: OrderInsert[],
): Promise<ServiceResult<{ ids: string[] }>> {
  if (rows.length === 0) return ok({ ids: [] });
  try {
    const { data, error } = await supabase
      .from('orders')
      .insert(rows)
      .select('id');
    if (error) return fail(error.message);
    const ids = (data ?? []).map((r) => (r as { id: string }).id);
    return ok({ ids });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function getByIds(ids: string[]): Promise<ServiceResult<Order[]>> {
  if (ids.length === 0) return ok([]);
  try {
    const { data, error } = await supabase.from('orders').select('*').in('id', ids);
    if (error) return fail(error.message);
    return ok((data ?? []) as Order[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * Verifica qué order_numbers ya existen en la org. Usado por el ImportWizard
 * (Step 3) para mostrar dedup-banner antes del submit.
 */
export async function checkExisting(
  orgId: string,
  orderNumbers: string[],
): Promise<ServiceResult<{ existing: string[] }>> {
  const cleaned = orderNumbers
    .map((n) => n?.trim())
    .filter((n): n is string => !!n);
  if (cleaned.length === 0) return ok({ existing: [] });
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('order_number')
      .eq('org_id', orgId)
      .in('order_number', cleaned);
    if (error) return fail(error.message);
    const existing = (data ?? []).map((r) => (r as { order_number: string }).order_number);
    return ok({ existing });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export interface ImportRow {
  customer_name: string;
  /** Código del cliente en el ERP del usuario. El backend lo usa para resolver
   *  dirección desde el catálogo cuando `address` viene vacía. */
  customer_code?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  /** Nullable: si viene vacía pero hay customer_code, el backend resuelve. */
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  total_weight_kg?: number;
  total_volume_m3?: number | null;
  time_window_start?: string | null;
  time_window_end?: string | null;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  requested_date?: string | null;
  order_number?: string;
  internal_notes?: string | null;
  tags?: string[];
}

export async function importFromCsv(
  rows: ImportRow[],
  templateId: string | null,
  onProgress?: (pct: number) => void,
): Promise<ServiceResult<ImportReport>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  if (rows.length === 0) return fail('No hay filas para importar');

  try {
    onProgress?.(0);
    const res = await fetch(`${ROUTING_BASE}/orders/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ templateId, rows }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
      const detail = body.detail ? ` (${JSON.stringify(body.detail).slice(0, 200)})` : '';
      return fail((body.error ?? `HTTP ${res.status}`) + detail);
    }

    const report = (await res.json()) as ImportReport;
    onProgress?.(100);
    return ok(report);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

interface AssignOrdersToPlanRpcRow {
  order_id: string;
  stop_id: string;
  plan_stop_id: string;
  action: AssignAction;
  match_quality: AssignEntry['match_quality'];
}

export async function assignToPlan(
  orderIds: string[],
  planId: string,
  allowOverride = false,
): Promise<ServiceResult<AssignReport>> {
  if (orderIds.length === 0) {
    return ok({
      entries: [],
      mergedCount: 0,
      createdCount: 0,
      skippedCount: 0,
    });
  }
  try {
    const { data, error } = await supabase.rpc('assign_orders_to_plan', {
      p_order_ids: orderIds,
      p_plan_id: planId,
      p_allow_override: allowOverride,
    });
    if (error) return fail(error.message);

    const rows = (data ?? []) as AssignOrdersToPlanRpcRow[];
    const entries: AssignEntry[] = rows.map((r) => ({
      order_id: r.order_id,
      stop_id: r.stop_id,
      plan_stop_id: r.plan_stop_id,
      action: r.action,
      match_quality: r.match_quality,
    }));

    const report: AssignReport = {
      entries,
      mergedCount: entries.filter((e) => e.action === 'merged_existing').length,
      createdCount: entries.filter((e) => e.action === 'created_new').length,
      skippedCount: entries.filter(
        (e) => e.action === 'skipped_already_assigned',
      ).length,
    };
    return ok(report);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function unassignFromPlan(
  orderIds: string[],
  planId: string,
): Promise<ServiceResult<{ updated: number }>> {
  if (orderIds.length === 0) return ok({ updated: 0 });
  try {
    const { data, error } = await supabase.rpc('unassign_orders_from_plan', {
      p_order_ids: orderIds,
      p_plan_id: planId,
    });
    if (error) return fail(error.message);
    const updated = typeof data === 'number' ? data : 0;
    return ok({ updated });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
