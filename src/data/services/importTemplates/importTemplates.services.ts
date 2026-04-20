import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { fail, ok, toErrorMessage } from '@/data/services/_shared/response';
import type {
  ImportTemplate,
  ImportTemplateInsert,
  ImportTemplateUpdate,
} from './importTemplates.types';

export async function list(
  orgId: string,
): Promise<ServiceResult<ImportTemplate[]>> {
  try {
    const { data, error } = await supabase
      .from('import_templates')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) return fail(error.message);
    return ok((data ?? []) as ImportTemplate[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function getById(
  id: string,
): Promise<ServiceResult<ImportTemplate>> {
  try {
    const { data, error } = await supabase
      .from('import_templates')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return fail(error.message);
    return ok(data as ImportTemplate);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function create(
  input: ImportTemplateInsert,
): Promise<ServiceResult<ImportTemplate>> {
  try {
    const { data, error } = await supabase
      .from('import_templates')
      .insert(input)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data as ImportTemplate);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function update(
  id: string,
  patch: ImportTemplateUpdate,
): Promise<ServiceResult<ImportTemplate>> {
  try {
    const { data, error } = await supabase
      .from('import_templates')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) return fail(error.message);
    return ok(data as ImportTemplate);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function remove(id: string): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('import_templates')
      .delete()
      .eq('id', id);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
