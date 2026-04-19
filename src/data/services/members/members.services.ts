import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';

export async function listOrgMembers(orgId: string): Promise<ServiceResult<unknown[]>> {
  try {
    const { data, error } = await supabase.rpc('list_org_members', {
      p_org_id: orgId,
    });
    if (error) return fail(error.message);
    return ok((data ?? []) as unknown[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function removeOrgMember(memberId: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.rpc('remove_org_member', {
      p_member_id: memberId,
    });
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
