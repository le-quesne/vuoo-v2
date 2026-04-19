import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Driver } from '@/data/types/database';

export async function listDrivers(orgId: string): Promise<ServiceResult<Driver[]>> {
  try {
    const { data, error } = await supabase
      .from('drivers')
      .select('*, default_vehicle:vehicles(*)')
      .eq('org_id', orgId)
      .order('first_name');
    if (error) return fail(error.message);
    return ok((data ?? []) as Driver[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deleteDriver(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
