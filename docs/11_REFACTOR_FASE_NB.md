# Refactor — Plan Fase Nb (partir lógica)

Documento vivo para la segunda mitad del refactor. Mientras las fases 0–9 **movieron archivos sin tocar lógica**, las fases Nb **parten los archivos monolíticos en componentes + hooks + servicios tipados**, aplicando las reglas de `.claude/rules/`.

## Contexto

Tras el refactor inicial el código quedó en `src/{application,presentation,domain,data}/` con features creadas pero mayormente vacías. Los archivos gigantes siguen en `presentation/pages/`:

| Archivo | Líneas | Sub-componentes internos | Feature destino |
|---------|-------:|-------------------------:|-----------------|
| `PlanDetailPage.tsx` | 1695 | 6 | plans |
| `OrdersPage.tsx` | 1602 | 10 | orders |
| `TrackingPage.tsx` | 900 | 0 (todo en `TrackingPage`) | tracking |
| `ControlPage.tsx` | 815 | 0 | control |
| `StopsPage.tsx` | 738 | — | stops |
| `NotificationSettingsPage.tsx` | 635 | — | settings |
| `DriversPage.tsx` | 621 | — | drivers |
| `VehiclesPage.tsx` | 401 | — | vehicles |
| `UsersPage.tsx` | 335 | — | settings |
| `PlannerPage.tsx` | 283 | — | planner |
| `OrganizationSettingsPage.tsx` | 230 | — | settings |
| `WeekDashboardPage.tsx` | 221 | — | planner |
| `DayDashboardPage.tsx` | 211 | — | planner |

También queda por partir:
- `data/services/liveControl.services.ts` (482 líneas): mezcla entidades, helpers puros y constantes. Pertenece repartido entre `domain/entities/`, `domain/adapters/`, `features/control/constants.ts` y `data/services/control/`.
- `application/contexts/AuthContext.tsx` (164): migrar a Zustand `useSessionStore`.

## Principios transversales

1. **Una fase Nb por PR. Nunca mezclar dos features en el mismo PR.**
2. **Un commit por extracción.** Cuando extraes un componente o hook, lo haces en un commit aparte con su diff limpio. El reviewer puede leer un commit a la vez.
3. **Preservar comportamiento exacto.** No aprovechar el refactor para "arreglar de paso" un bug menor — esos bugs van en PRs aparte. El diff debe ser leíble como "movido, no cambiado".
4. **Typecheck verde al final de cada commit**, no solo al final del PR. Si un commit rompe tipos, el `git bisect` no sirve.
5. **Tests manuales al final de cada PR**: golden path + 1–2 edge cases por feature. Registrar en la descripción del PR.
6. **No introducir deps nuevas sin justificación.** Si agregas `@tanstack/react-virtual` para OrdersPage, justifícalo con una medición (scroll con 2000 filas).
7. **Reglas ya escritas en `.claude/rules/`** son la fuente de verdad para naming, estructura, estilo. Este doc solo baja el plan a pasos.

## Orden recomendado

Por valor ⨯ riesgo ⨯ reutilización del patrón:

1. **3b — control/** — feature piloto para hooks realtime + Zustand. Menor tamaño, máximo aprendizaje. Desbloquea patrones para el resto.
2. **4b — plans/** — mayor ganancia de legibilidad (1695 líneas). Alta complejidad pero patrones ya probados en 3b.
3. **5b — orders/ + stops/** — OrdersPage es el siguiente archivo más grande. StopsPage más chico pero similar al patrón.
4. **6b — tracking/** (público por token) + **drivers/ + vehicles/ + planner/** (internos, ya con patrones consolidados).
5. **7b — analytics/ + settings/ + admin/** — más mecánico, menos lógica asíncrona.
6. **8b — AuthContext → Zustand** — el último, porque cualquier regresión afecta TODO. Con el resto ya refactorizado es más fácil ver el impacto de cambios de auth.

## Fase 3b — `control/`

### Alcance
- Partir `data/services/liveControl.services.ts` (482 líneas) por capa.
- Partir `ControlPage.tsx` (815 líneas) en componentes + hooks + store.

### Servicios y dominio

```
data/services/control/
├── control.services.ts         # listRoutes, listAlerts, acknowledgeAlert,
│                               # createIncident, broadcast, reassignStop
├── control.types.ts            # ControlFilters, BroadcastInput, IncidentInput
└── index.ts

domain/entities/
├── liveRoute.ts                # LiveRoute, LiveDriver, LiveVehicle, LiveLocation
├── liveAlert.ts                # LiveAlert, AlertType, AlertPriority, PendingStopInfo
└── liveDashboard.ts            # LiveDashboard

domain/adapters/
└── liveControl.adapter.ts      # formatAge, isDriverOnline, getLiveRouteState,
                                # getStateColor, sortLiveRoutes,
                                # derivedAlertsFromRoutes, makeStopStatusAlert,
                                # makeRouteStatusAlert, makeIncidentAlert,
                                # makeFeedbackAlert, alertRowToLive, mergeAlerts
```

Constantes (`ONLINE_THRESHOLD_MS`, `OFFLINE_ALERT_MS`, `ROUTE_LATE_START_MS`, `STATIONARY_ALERT_MS`, `LOW_BATTERY_THRESHOLD`) van a `features/control/constants.ts`.

### Componentes

```
features/control/components/
├── AlertFeed.tsx               # ya existe
├── AlertToast.tsx              # ya existe
├── BroadcastModal.tsx          # ya existe
├── ContactDriverMenu.tsx       # ya existe
├── IncidentModal.tsx           # ya existe
├── KpiBar.tsx                  # ya existe
├── LiveRouteCard.tsx           # ya existe
├── ReassignStopModal.tsx       # ya existe
├── ControlMap.tsx              # NUEVO: RouteMap wrapper con handlers del control
├── ControlHeader.tsx           # NUEVO: KpiBar + filtros de ruta/vehículo/chofer
├── ControlSidebar.tsx          # NUEVO: lista de LiveRouteCard
├── ControlAlertPanel.tsx       # NUEVO: AlertFeed + AlertToastStack
└── ControlModals.tsx           # NUEVO: compose de BroadcastModal+IncidentModal+Reassign
```

### Hooks

```
features/control/hooks/
├── useLiveDashboard.ts         # poll cada DASHBOARD_POLL_MS
├── useLiveRoutes.ts            # fetch inicial
├── useLiveRoutesRealtime.ts    # canal Supabase: routes, route_events, plan_stops,
│                               # driver_locations, live_alerts, feedback
├── useAlertFeed.ts             # merge derivadas + persistidas, ack
├── usePlanStopsByRoute.ts      # cached stops por ruta
├── useDerivedAlerts.ts         # tick cada DERIVED_ALERT_MS
├── useControlModals.ts         # estado de modales + props
└── index.ts                    # barrel
```

### Store

```
features/control/stores/useControlStore.ts  # routes, alerts, filters,
                                            # selectedRouteId, modals
```

### Ruta de commits sugerida

1. `refactor(3b-1): extraer entidades y adaptadores de liveControl`
2. `refactor(3b-2): dividir servicios de control (CRUD en data/services/control)`
3. `refactor(3b-3): useLiveRoutes + useLiveRoutesRealtime`
4. `refactor(3b-4): useAlertFeed + useDerivedAlerts`
5. `refactor(3b-5): useLiveDashboard + usePlanStopsByRoute`
6. `refactor(3b-6): useControlStore + useControlModals`
7. `refactor(3b-7): componentes ControlMap/Header/Sidebar/AlertPanel/Modals`
8. `refactor(3b-8): reescribir ControlPage como container (<250 líneas)`

### Meta
- `ControlPage.tsx` < 250 líneas.
- Cada hook < 100 líneas.
- `liveControl.services.ts` eliminado (o reducido a re-export por compat temporal).

### Riesgos
- Realtime: si el canal falla, la UI queda desactualizada. Migrar el canal manteniendo el mismo patrón de filtros `org_id=eq.{orgId}`.
- Sort de rutas (`sortLiveRoutes`) tiene orden implícito que usa la UI — probar con 5+ rutas en estados mixtos.

---

## Fase 4b — `plans/`

### Alcance
Partir `PlanDetailPage.tsx` (1695 líneas) con 6 sub-componentes internos (`SortablePlanStop`, `RouteDropZone`, `AddStopToPlanModal`, `AddVehicleToPlanModal`, `StatusBadge`, `PlanDetailSkeleton`).

### Servicios y dominio

```
data/services/
├── plans/
│   ├── plans.services.ts       # get, list, create, update, delete, archive
│   ├── plans.types.ts
│   └── index.ts
├── routes/
│   ├── routes.services.ts      # CRUD + optimize + markComplete
│   └── routes.types.ts
└── plan-stops/
    ├── plan-stops.services.ts  # CRUD + reorder + bulkAssign
    └── plan-stops.types.ts

domain/entities/
├── plan.ts
├── route.ts
└── planStop.ts

domain/adapters/
├── plan.adapter.ts             # PlanRow → Plan
├── route.adapter.ts
└── vroomResult.adapter.ts      # Vroom → OptimizedRoute (reutilizado en 6b/planner)
```

### Componentes

```
features/plans/components/
├── PODModal.tsx                # ya existe
├── EditRouteModal.tsx          # ya existe
├── DepotConfigModal.tsx        # ya existe
├── ActivityTimeline.tsx        # ya existe
├── PlanHeader.tsx              # NUEVO: nombre, fecha, status, acciones
├── PlanSummaryBar.tsx          # NUEVO: km, duración, capacidad
├── PlanRouteList.tsx           # NUEVO: lista colapsable
├── PlanRoutePanel.tsx          # NUEVO: ruta individual con paradas
├── PlanMapPanel.tsx            # NUEVO: RouteMap con todas las rutas
├── SortablePlanStop.tsx        # extraer de PlanDetailPage L1003
├── RouteDropZone.tsx           # extraer de L1130
├── AddStopToPlanModal.tsx      # extraer de L1142
├── AddVehicleToPlanModal.tsx   # extraer de L1439
├── StatusBadge.tsx             # extraer de L1615
├── PlanDetailSkeleton.tsx      # extraer de L1639
└── index.ts
```

### Hooks

```
features/plans/hooks/
├── usePlanDetail.ts            # fetch plan + routes + stops (join)
├── usePlanRealtime.ts          # canal de cambios
├── useRouteEditing.ts          # rename, delete, set vehicle
├── useStopReordering.ts        # @dnd-kit handlers
├── useStopAdd.ts
├── useStopRemove.ts
├── useVehicleAdd.ts
├── usePODSubmit.ts
└── index.ts
```

### Utilidades

```
features/plans/utils/
├── capacity.ts                 # ya existe
├── routeMetrics.ts             # routePlannedKm, routeTraveledKm (extraer de PlanDetailPage L57, L65)
└── index.ts
```

### Ruta de commits sugerida

1. Servicios + entidades + adapters (4b-1 a 4b-3)
2. Hooks de lectura (`usePlanDetail`, `usePlanRealtime`) — 4b-4
3. Hooks de mutación (editing, reorder, add/remove stop/vehicle, POD) — 4b-5 a 4b-8
4. Extracción de sub-componentes internos ya existentes — 4b-9 a 4b-11
5. Nuevos componentes de composición (Header, SummaryBar, RouteList, RoutePanel, MapPanel) — 4b-12 a 4b-15
6. Reescribir `PlanDetailPage.tsx` como container — 4b-16

### Meta
- `PlanDetailPage.tsx` < 300 líneas.
- Cada componente < 200 líneas.
- Cero `useState` en la página — todo via hooks/stores.

### Riesgos
- DnD con `@dnd-kit`: el estado entre `DndContext` y la lista es frágil. Extraer el `DndContext` a `PlanRouteList` y testear reorder entre rutas + dentro de una ruta.
- Cálculo de `routePlannedKm` usa Mapbox Directions; cachear por rutaId para no re-pedir en cada render.

---

## Fase 5b — `orders/` + `stops/`

### OrdersPage (1602 líneas, 10 internos)

Componentes internos a extraer:
- `StatusTab` (L410)
- `AddressAutocomplete` (L446) → evaluar si mover a `presentation/components/` (shared) porque también lo usa StopsPage.
- `OrderModal` (L586)
- `ScheduleOrdersModal` (L1015)
- `ImportCsvModal` (L1346)
- Helpers: `formatDate`, `statusCounts`, `emptyForm`, `fromOrder`, `totalWeight`, `parseCsv`, `splitCsvLine` → `features/orders/utils/`

Componentes nuevos:
- `OrdersTable` (con `@tanstack/react-virtual` si hay > 1000 filas)
- `OrdersFilters`
- `OrdersBulkBar`
- `OrderRow`

Hooks:
- `useOrders` — fetch paginado + filtros
- `useOrdersFilters` — sync con URL search params
- `useBulkOrderActions` — assign to route, change status, export
- `useOrderImport`
- `useOrderForm` — form state del OrderModal

Servicios: `data/services/orders/`.

Dep nueva (justificada): `@tanstack/react-virtual` solo si hay > 500 filas en la tabla en uso real. Si no, no la instales.

Meta: `OrdersPage.tsx` < 300 líneas.

### StopsPage (738 líneas)

Componentes:
- `StopsTable`
- `StopFormModal`
- `StopImportModal`
- `StopsFilters`

Hooks: `useStops`, `useStopForm`, `useStopImport`.

Servicios: `data/services/stops/`.

Meta: `StopsPage.tsx` < 250 líneas.

### Ruta de commits
Igual que 4b: servicios → hooks → componentes → container.

---

## Fase 6b — `tracking/` + `drivers/` + `vehicles/` + `planner/`

### TrackingPage (900) — público por token

**Particularidad**: esta ruta es pública (`/track/:token`). El servicio no usa `supabase.auth.getSession()` sino token en URL. RLS debe permitir SELECT con la condición `tracking_token = :token`.

Componentes:
- `TrackingHeader`
- `TrackingMap`
- `TrackingStopsList`
- `TrackingETA`
- `TrackingFeedbackForm`
- `TrackingNotificationBanner`

Hooks:
- `useTracking(token)` — fetch por token
- `useTrackingRealtime(token)` — canal público

Servicios: `data/services/tracking/tracking.services.ts` (sin auth).

Meta: `TrackingPage.tsx` < 250 líneas.

### DriversPage (621)

Componentes: `DriversTable`, `DriverFormModal`, `DriverInviteModal`, `DriverAvailabilityBadge`.
Hooks: `useDrivers`, `useDriverForm`, `useDriverInvite`, `useDriverAvailability`.
Servicios: `data/services/drivers/`.

Meta: < 250 líneas.

### VehiclesPage (401)

Componentes: `VehiclesTable`, `VehicleFormModal` (+ `DepotConfigModal` ya movido).
Hooks: `useVehicles`, `useVehicleForm`.
Servicios: `data/services/vehicles/`.

Meta: < 200 líneas.

### Planner (PlannerPage 283, DayDashboardPage 211, WeekDashboardPage 221)

Hooks:
- `usePlanner` — estado del calendario
- `useVroomOptimize` — llama al backend Railway (`vuoo-rutas`)
- `useDayDashboard`, `useWeekDashboard` — métricas agregadas
- `useVroomWizard` — estado del wizard

Servicios:
- `data/services/vroom/vroom.services.ts` — POST al Railway
- `data/services/osrm/osrm.services.ts` — routing/matrix vía Railway
- `data/services/planner/planner.services.ts` — CRUD de planes a nivel de calendario

Env vars: `VITE_ROUTING_BASE_URL` apuntando al dominio Railway del proyecto `vuoo-rutas`.

Adapter: `domain/adapters/vroomResult.adapter.ts` (ya identificado en 4b).

Meta: cada página < 200 líneas.

---

## Fase 7b — `analytics/` + `settings/` + `admin/`

### Analytics views (6 views, ~200 líneas c/u)

Los hooks ya están extraídos (`useAnalyticsSummary`, `useDailyTrend`, `useDriverPerformance`, `useCancellationReasons`, `useFeedbackSummary`). Solo falta partir las views en componentes.

Ejemplo `DeliveriesView`:
- `DeliveriesKpis` (grid de KPIs)
- `DeliveriesTrendChart`
- `DeliveriesBreakdown`
- `DeliveriesCancellationReasons`

Servicios: `data/services/analytics/analytics.services.ts` (agregar si hoy están embebidos en los hooks).

### Settings

- **NotificationSettingsPage (635)**: partir en `NotificationChannelsForm`, `NotificationEventToggles`, `NotificationRecipientsForm`. Hook `useNotificationSettings`.
- **OrganizationSettingsPage (230)**: `OrgInfoForm`, `DepotConfigForm` (ya existe modal). Hook `useOrganizationSettings`.
- **UsersPage (335)**: `UsersTable`, `UserInviteModal`, `UserRoleSelector`. Hook `useUsers`, `useUserInvite`.

### Admin

- `AdminDashboard`: extraer `AdminMetricsGrid`, `AdminRecentOrgs`.
- `AdminOrgDetail`: `OrgHeader`, `OrgUsersTable`, `OrgMetrics`.
- `AdminUsers`: `AdminUsersTable`, `AdminUserImpersonateButton`.

Servicios: `data/services/admin/` con RPCs (`get_org_metrics`, `delete_member`, etc.).

---

## Fase 8b — `AuthContext` → Zustand `useSessionStore`

**La más sensible. PR dedicado con revisión extra.**

### Preservar (no cambiar comportamiento)

- Listener `onAuthStateChange` con dedupe por `user.id`.
- `setTimeout(0)` para salir del lock de auth-js (bug #762) antes de cargar memberships.
- Persistencia de `currentOrg` en `localStorage` bajo clave `vuoo_current_org_id`.
- Derivados: `orgRole` (por membership del currentOrg), `isSuperAdmin` (app_metadata), `isDriver` (app_metadata).

### Estructura

```
application/store/
└── useSessionStore.ts
    ├── state: user, currentOrg, orgMemberships, orgRole, isSuperAdmin, isDriver, loading
    └── actions (solo síncronas): setSession, setMemberships, setCurrentOrg,
                                  setLoading, reset

application/lib/auth/
├── authSync.ts       # initAuthSync(), loadMemberships(), selectOrg(), signOut()
└── index.ts

application/hooks/
└── useAuth.ts        # wrapper de selectores sobre useSessionStore (mismo shape que hoy)
```

### Secuencia de arranque

```typescript
// main.tsx
import { initAuthSync } from '@/application/lib/auth';

initAuthSync();  // arma listener y carga inicial

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### Commits sugeridos

1. `refactor(8b-1): crear useSessionStore (espejo del contexto, sin cablearlo)`
2. `refactor(8b-2): authSync con initAuthSync + loadMemberships`
3. `refactor(8b-3): useAuth como selector del store` (aún con AuthProvider montado en paralelo)
4. `refactor(8b-4): cablear initAuthSync en main.tsx y quitar AuthProvider`
5. `refactor(8b-5): borrar AuthContext.tsx`

### Checklist de test manual (obligatorio antes de merge)

- [ ] Login → planner carga sin flash de loading extra.
- [ ] Logout → redirect a /login.
- [ ] Refresh con sesión activa → no se re-pide login.
- [ ] Usuario con > 1 org → puedo cambiar entre orgs, persiste al refresh.
- [ ] Usuario sin orgs → redirect a /onboarding.
- [ ] Usuario driver → redirect a /driver-welcome.
- [ ] Super admin → /admin accesible; no-super-admin → bloqueado.
- [ ] Cambio de sesión en otra pestaña → esta pestaña se actualiza.
- [ ] Token expirado (esperar o simular 401) → redirect a /login.

### Riesgos

- El listener de Supabase se dispara múltiples veces para un mismo signIn. El dedupe por `userRef.current?.id` debe replicarse en el store.
- `setTimeout(0)` no es cosmético: sin él, `fetchMemberships` puede deadlock con el lock de auth-js. **Mantenerlo.**
- `localStorage` no disponible en SSR (aplica si se migra a Next en el futuro); dejar un `try/catch` o `typeof window !== 'undefined'`.

---

## Tracking cross-fase

Para cada fase Nb, abrir una issue/ticket con:
- Rama `refactor/fase-{N}b-{feature}`.
- Checklist de commits sugeridos arriba.
- Checklist de smoke test.
- Captura de pantalla del `wc -l` del archivo antes y después.
- Link al PR anterior de la cadena (si depende).

Meta global: tras 8b, **ningún archivo en `src/presentation/pages/` supera 300 líneas**, y todas las features tienen al menos un hook + servicio propio.
