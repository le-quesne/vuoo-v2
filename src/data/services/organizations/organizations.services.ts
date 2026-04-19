import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Organization } from '@/data/types/database';

export async function getOrganization(
  orgId: string,
): Promise<ServiceResult<Organization | null>> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();
    if (error) return fail(error.message);
    return ok((data as Organization | null) ?? null);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function updateOrganization(
  orgId: string,
  patch: Partial<Organization>,
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('organizations').update(patch).eq('id', orgId);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
