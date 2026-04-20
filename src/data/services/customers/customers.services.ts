import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { fail, ok, toErrorMessage } from '@/data/services/_shared/response';
import type {
  CustomerInsert,
  CustomerRow,
  CustomerUpdate,
} from './customers.types';
import type { ImportReport } from '@/data/services/orders/orders.types';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function list(
  orgId: string,
  q?: string,
): Promise<ServiceResult<CustomerRow[]>> {
  try {
    let query = supabase
      .from('customers')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (q && q.trim().length > 0) {
      const term = `%${q.trim()}%`;
      query = query.or(`name.ilike.${term},customer_code.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) return fail(error.message);
    return ok((data ?? []) as CustomerRow[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function getById(id: string): Promise<ServiceResult<CustomerRow>> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return fail(error.message);
    return ok(data as CustomerRow);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function create(
  input: CustomerInsert,
): Promise<ServiceResult<CustomerRow>> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert(input)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data as CustomerRow);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function update(
  id: string,
  patch: CustomerUpdate,
): Promise<ServiceResult<CustomerRow>> {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data as CustomerRow);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deactivate(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function importFromCsv(
  file: File,
): Promise<ServiceResult<ImportReport>> {
  if (!ROUTING_BASE) return fail('VITE_ROUTING_BASE_URL no configurada');
  try {
    const form = new FormData();
    form.append('file', file);

    const res = await fetch(`${ROUTING_BASE}/customers/import`, {
      method: 'POST',
      headers: { ...(await authHeaders()) },
      body: form,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return fail(body.error ?? `HTTP ${res.status}`);
    }
    return ok((await res.json()) as ImportReport);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
