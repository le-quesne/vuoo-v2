import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Stop } from '@/data/types/database';

export async function listStops(orgId: string): Promise<ServiceResult<Stop[]>> {
  try {
    const { data, error } = await supabase
      .from('stops')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) return fail(error.message);
    return ok((data ?? []) as Stop[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * Lista stops filtrando por `customer_id` (PRD 12 §A.2.1).
 * La columna existe solo después de la migración de Fase A; si todavía no
 * está aplicada, Supabase devolverá error por columna inexistente.
 */
export async function listByCustomer(
  orgId: string,
  customerId: string,
): Promise<ServiceResult<Stop[]>> {
  try {
    const { data, error } = await supabase
      .from('stops')
      .select('*')
      .eq('org_id', orgId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (error) return fail(error.message);
    return ok((data ?? []) as Stop[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deleteStop(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('stops').delete().eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export interface DuplicateStopPair {
  a_id: string;
  b_id: string;
  a_address: string | null;
  b_address: string | null;
  score: number;
}

/**
 * Devuelve pares de stops candidatos a fusionar (PRD 12 §A.2.3).
 * Requiere extensión pg_trgm y la función `similarity`. Si el schema aún no
 * tiene el índice `address_hash`, la query cae en self-join sobre la misma org.
 */
export async function listDuplicates(
  orgId: string,
): Promise<ServiceResult<DuplicateStopPair[]>> {
  try {
    const { data, error } = await supabase.rpc('list_stop_duplicates', {
      p_org_id: orgId,
    });
    if (error) return fail(error.message);
    return ok((data ?? []) as DuplicateStopPair[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * Fusiona dos stops: el loser desaparece, sus orders/plan_stops apuntan al winner.
 * El servidor ejecuta la transacción (PRD 12 §A.2.3).
 */
export async function mergeStops(
  loserId: string,
  winnerId: string,
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.rpc('merge_stops', {
      p_loser_id: loserId,
      p_winner_id: winnerId,
    });
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

/**
 * Marca un stop como curado y opcionalmente lo vincula a un customer.
 * PRD 12 §A.2.2: eleva el matching del stop al nivel alto en imports siguientes.
 */
export async function promoteToCurated(
  stopId: string,
  customerId?: string,
): Promise<ServiceResult<void>> {
  try {
    const patch: Record<string, unknown> = { is_curated: true };
    if (customerId) patch.customer_id = customerId;

    const { error } = await supabase
      .from('stops')
      .update(patch)
      .eq('id', stopId);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
