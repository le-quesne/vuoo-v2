export const ONLINE_THRESHOLD_MS = 60_000;
export const OFFLINE_ALERT_MS = 5 * 60_000;
export const ROUTE_LATE_START_MS = 30 * 60_000;
export const STATIONARY_ALERT_MS = 15 * 60_000;
export const LOW_BATTERY_THRESHOLD = 0.15;

export const DASHBOARD_POLL_MS = 30_000;
export const NOW_TICK_MS = 5_000;
export const DERIVED_ALERT_MS = 30_000;

export const INCIDENT_TYPE_LABELS: Record<string, string> = {
  vehicle_breakdown: 'Avería de vehículo',
  accident: 'Accidente',
  weather: 'Clima',
  driver_offline: 'Conductor offline',
  customer_issue: 'Problema con cliente',
  other: 'Incidente',
};
