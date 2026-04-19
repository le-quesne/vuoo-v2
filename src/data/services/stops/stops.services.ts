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

export async function deleteStop(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('stops').delete().eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
