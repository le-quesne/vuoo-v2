import { supabase } from '@/application/lib/supabase';
import type { ServiceResult } from '@/data/services/_shared/response';
import { ok, fail, toErrorMessage } from '@/data/services/_shared/response';
import type { AlertRow, LiveDashboard, LiveRoute } from '@/domain/entities/liveControl';
import type { Stop } from '@/data/types/database';

export interface PlanStopRow {
  id: string;
  route_id: string;
  status: string;
  stop: Stop;
}

export interface OrgDepot {
  lat: number;
  lng: number;
  address: string | null;
}

export async function fetchLiveDashboard(
  orgId: string,
  date: string,
): Promise<ServiceResult<LiveDashboard>> {
  try {
    const { data, error } = await supabase.rpc('get_live_dashboard', {
      p_org_id: orgId,
      p_date: date,
    });
    if (error) return fail(error.message);
    return ok(data as LiveDashboard);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function fetchLiveRoutes(
  orgId: string,
  date: string,
): Promise<ServiceResult<LiveRoute[]>> {
  try {
    const { data, error } = await supabase.rpc('get_live_routes', {
      p_org_id: orgId,
      p_date: date,
    });
    if (error) return fail(error.message);
    return ok((data ?? []) as LiveRoute[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function fetchPlanStopsByRoute(
  routeIds: string[],
): Promise<ServiceResult<PlanStopRow[]>> {
  if (routeIds.length === 0) return ok([]);
  try {
    const { data, error } = await supabase
      .from('plan_stops')
      .select('id, route_id, status, stop:stops(*)')
      .in('route_id', routeIds)
      .order('order_index');
    if (error) return fail(error.message);
    const rows = (data ?? []) as unknown as PlanStopRow[];
    return ok(rows.filter((r) => r.stop));
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function fetchPersistedAlerts(
  orgId: string,
  limit = 50,
): Promise<ServiceResult<AlertRow[]>> {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return fail(error.message);
    return ok((data ?? []) as AlertRow[]);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function acknowledgeAlert(
  alertId: string,
  userId: string,
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('alerts')
      .update({ acknowledged_by: userId, acknowledged_at: new Date().toISOString() })
      .eq('id', alertId);
    if (error) return fail(error.message);
    return ok(undefined);
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}

export async function fetchOrgDepot(orgId: string): Promise<ServiceResult<OrgDepot | null>> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('default_depot_lat, default_depot_lng, default_depot_address')
      .eq('id', orgId)
      .single();
    if (error) return fail(error.message);
    if (!data || data.default_depot_lat == null || data.default_depot_lng == null) {
      return ok(null);
    }
    return ok({
      lat: data.default_depot_lat,
      lng: data.default_depot_lng,
      address: data.default_depot_address ?? null,
    });
  } catch (e) {
    return fail(toErrorMessage(e));
  }
}
