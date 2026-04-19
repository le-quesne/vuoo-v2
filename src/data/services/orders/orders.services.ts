import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Order, OrderStatus } from '@/data/types/database';

export interface ListOrdersArgs {
  orgId: string;
  status?: OrderStatus | 'all';
  search?: string;
  from: number;
  to: number;
}

export async function listOrders({
  orgId,
  status,
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
