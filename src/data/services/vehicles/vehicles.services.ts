import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Vehicle } from '@/data/types/database';

export async function listVehicles(orgId: string): Promise<ServiceResult<Vehicle[]>> {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    if (error) return fail(error.message);
    return ok((data ?? []) as Vehicle[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deleteVehicle(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
