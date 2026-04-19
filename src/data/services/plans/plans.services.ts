import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { Plan } from '@/data/types/database';

export async function getPlan(planId: string): Promise<ServiceResult<Plan | null>> {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .maybeSingle();
    if (error) return fail(error.message);
    return ok((data as Plan | null) ?? null);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function updatePlanName(
  planId: string,
  name: string,
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('plans').update({ name }).eq('id', planId);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function deletePlan(planId: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase.from('plans').delete().eq('id', planId);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
