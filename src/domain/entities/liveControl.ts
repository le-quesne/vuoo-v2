import type { DriverAvailability, RouteStatus } from '@/data/types/database';

export interface LiveLocation {
  lat: number;
  lng: number;
  speed: number | null;
  battery: number | null;
  recorded_at: string;
}

export interface LiveDriver {
  id: string;
  name: string;
  phone: string | null;
  availability: DriverAvailability;
  availability_updated_at: string | null;
}

export interface LiveVehicle {
  id: string;
  name: string;
  plate: string | null;
  time_window_start: string | null;
  time_window_end: string | null;
}

export interface LiveRoute {
  route_id: string;
  route_status: RouteStatus;
  total_distance_km: number | null;
  total_duration_minutes: number | null;
  plan_id: string;
  plan_name: string;
  plan_date: string;
  driver: LiveDriver | null;
  vehicle: LiveVehicle | null;
  stops_total: number;
  stops_completed: number;
  stops_failed: number;
  last_location: LiveLocation | null;
}

export interface LiveDashboard {
  drivers_online: number;
  drivers_total: number;
  stops_total: number;
  stops_completed: number;
  stops_failed: number;
  stops_pending: number;
  routes_active: number;
  routes_completed: number;
}

export type LiveRouteState =
  | 'completed'
  | 'in_transit'
  | 'not_started'
  | 'offline'
  | 'on_break';

export type AlertPriority = 'high' | 'medium' | 'info';

export type AlertType =
  | 'driver_offline'
  | 'driver_stationary'
  | 'stop_late'
  | 'stop_failed'
  | 'stop_completed'
  | 'route_not_started'
  | 'route_started'
  | 'route_completed'
  | 'battery_low'
  | 'incident'
  | 'feedback_positive'
  | 'feedback_negative';

export interface LiveAlert {
  id: string;
  priority: AlertPriority;
  type: AlertType;
  ts: number;
  driverId?: string;
  routeId?: string;
  planStopId?: string;
  planStopName?: string;
  message: string;
  acknowledged?: boolean;
}

export interface PendingStopInfo {
  planStopId: string;
  routeId: string;
  name: string;
  timeWindowEnd: string | null;
}

export interface DerivedAlertContext {
  pendingStops?: PendingStopInfo[];
  stationarySince?: Record<string, number>;
}

export interface AlertRow {
  id: string;
  org_id: string;
  type: string;
  priority: AlertPriority;
  title: string;
  body: string | null;
  route_id: string | null;
  plan_stop_id: string | null;
  driver_id: string | null;
  incident_id: string | null;
  feedback_id: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  created_at: string;
}
