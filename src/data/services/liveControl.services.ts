// Compatibilidad: este módulo fue partido en fase-3b.
// - Entidades/tipos → @/domain/entities/liveControl
// - Funciones puras → @/domain/adapters/liveControl.adapter
// - Constantes → @/presentation/features/control/constants
// - CRUD Supabase → @/data/services/control
//
// Re-exporta desde este archivo solo para no romper imports mientras
// termina la migración. Borrar cuando ningún consumer lo use.

export type {
  LiveLocation,
  LiveDriver,
  LiveVehicle,
  LiveRoute,
  LiveDashboard,
  LiveRouteState,
  AlertPriority,
  AlertType,
  LiveAlert,
  PendingStopInfo,
  DerivedAlertContext,
  AlertRow,
} from '@/domain/entities/liveControl';

export {
  formatAge,
  isDriverOnline,
  getLiveRouteState,
  getStateColor,
  sortLiveRoutes,
  derivedAlertsFromRoutes,
  makeStopStatusAlert,
  makeRouteStatusAlert,
  makeIncidentAlert,
  makeFeedbackAlert,
  alertRowToLive,
  mergeAlerts,
} from '@/domain/adapters/liveControl.adapter';

export {
  ONLINE_THRESHOLD_MS,
  OFFLINE_ALERT_MS,
  ROUTE_LATE_START_MS,
  STATIONARY_ALERT_MS,
  LOW_BATTERY_THRESHOLD,
} from '@/presentation/features/control/constants';
