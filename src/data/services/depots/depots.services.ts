import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Depot, DepotInsert, DepotUpdate } from './depots.types';

export async function listDepots(orgId: string): Promise<ServiceResult<Depot[]>> {
  try {
    const { data, error } = await supabase
      .from('depots')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) return fail(error.message);
    return ok((data ?? []) as Depot[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function createDepot(input: DepotInsert): Promise<ServiceResult<Depot>> {
  try {
    // Si es el primer depot de la org, lo hacemos default automáticamente
    // (así el wizard/vehículos siempre tienen un fallback razonable).
    const { count } = await supabase
      .from('depots')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', input.org_id);

    const isFirstDepot = !count || count === 0;
    const { data, error } = await supabase
      .from('depots')
      .insert({ ...input, is_default: input.is_default ?? isFirstDepot })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data as Depot);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function updateDepot(id: string, patch: DepotUpdate): Promise<ServiceResult<Depot>> {
  try {
    const { data, error } = await supabase
      .from('depots')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data as Depot);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deleteDepot(id: string): Promise<ServiceResult<void>> {
  try {
    // Soft-delete: is_active=false en vez de DELETE, para no romper
    // vehicles.depot_id de vehículos que ya lo tengan asignado.
    const { error } = await supabase.from('depots').update({ is_active: false }).eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

// El índice único `one_default_depot_per_org` exige que solo un depot a la
// vez tenga is_default=true. Se limpia el default anterior de la org ANTES
// de setear el nuevo (dos updates secuenciales, no una transacción — para
// este volumen de escritura administrativa alcanza).
export async function setDefaultDepot(orgId: string, depotId: string): Promise<ServiceResult<void>> {
  try {
    const { error: clearErr } = await supabase
      .from('depots')
      .update({ is_default: false })
      .eq('org_id', orgId)
      .eq('is_default', true);
    if (clearErr) return fail(clearErr.message);

    const { error: setErr } = await supabase
      .from('depots')
      .update({ is_default: true })
      .eq('id', depotId);
    if (setErr) return fail(setErr.message);

    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
