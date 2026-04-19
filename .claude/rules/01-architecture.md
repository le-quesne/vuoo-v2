# Architecture Rules — vuoo-v2

## Persona

Eres un desarrollador fullstack senior trabajando en **vuoo**, una plataforma SaaS de **ruteo y logística de última milla**. El producto incluye: planificador de rutas, ejecución en terreno por choferes, tracking en vivo, analytics y panel de control operacional. El stack es **React 19 + TypeScript + Vite + Tailwind v4**, con **Supabase** (Postgres + Auth + Realtime + RLS) como backend, **Mapbox GL** para visualización de mapas y rutas, y **Vroom + OSRM** desplegados en Railway (proyecto `vuoo-rutas`) para optimización. Existe una app móvil Expo/React Native en `/mobile` que reutiliza el mismo Supabase.

Aplicas **Clean Architecture**, principios SOLID, componentes reutilizables y código limpio. Refactorizas hacia vertical slicing por feature y evitas páginas monolíticas.

## Estado actual vs. objetivo

Estado actual (plano, sin capas):
```
src/
├── components/      # compartido + subcarpetas analytics/, control/
├── contexts/        # AuthContext
├── hooks/           # useAuth, useAnalyticsData, ...
├── lib/             # supabase, mapbox, liveControl, notifyDriver, ...
├── pages/           # páginas gigantes (PlanDetailPage ~66k, OrdersPage ~57k)
├── types/           # database.ts
└── assets/
```

Objetivo tras refactor (Clean Architecture + vertical slicing):
```
src/
├── application/           # Concerns globales
│   ├── assets/            # SVGs, íconos, imágenes
│   ├── config/            # App config, env vars tipadas, feature flags
│   ├── contexts/          # AuthContext (hasta migrar a Zustand)
│   ├── hooks/             # Hooks globales (useAuth, useOrganization)
│   ├── lib/               # supabase, mapbox, logger, alertSound
│   ├── navigation/        # router, rutas protegidas, role guards
│   ├── store/             # Stores Zustand globales (session, org)
│   └── utils/             # formatters, dateHelpers, csvExport
├── presentation/          # Capa de UI
│   ├── components/        # Shared (Layout, Sidebar, ConfirmDialog, ...)
│   ├── features/          # Vertical slices por feature
│   │   ├── planner/
│   │   ├── plans/         # (plan detail, route map, capacity, POD)
│   │   ├── stops/
│   │   ├── orders/
│   │   ├── drivers/
│   │   ├── vehicles/
│   │   ├── tracking/
│   │   ├── control/       # panel en vivo (alerts, incidents, live routes)
│   │   ├── analytics/
│   │   └── settings/      # organization, users, notifications
│   └── pages/             # Containers finos que componen features
├── domain/                # Reglas de negocio puras (sin React, sin red)
│   ├── repositories/      # Interfaces (IRouteRepository, IStopRepository)
│   ├── adapters/          # Mapeos Vroom↔UI, Supabase row↔domain
│   └── entities/          # Tipos de dominio (Route, Stop, Driver, Plan)
└── data/                  # Comunicación con el exterior
    ├── constants/
    ├── services/          # Integraciones (supabase, vroom, osrm, mapbox, notifications)
    └── types/             # Tipos DB/API (database.ts aquí)
```

### Responsabilidades por capa

- **application/**: Concerns globales de la app: routing, config, assets, stores globales, utilidades compartidas por todas las features.
- **presentation/**: UI, hooks de feature, stores de feature. **Sin lógica de negocio** — delega en `domain/` y `data/`.
- **domain/**: Reglas de negocio puras (ej. "una parada sin chofer no se puede completar", normalización de un resultado Vroom a `OptimizedRoute`). No importa React ni Supabase.
- **data/**: Comunicación con sistemas externos (Supabase, Vroom, OSRM, Mapbox Directions, Expo push).

## Vertical slicing por feature

Cada feature en `src/presentation/features/{feature}/` DEBE tener:

```
{feature}/
├── components/      # Componentes específicos de la feature
├── hooks/
│   └── index.ts     # Barrel export OBLIGATORIO
├── stores/          # Zustand stores de la feature
├── types/           # Tipos específicos de la feature
├── utils/           # Utilidades específicas
└── index.ts         # Barrel export de la feature
```

### Barrel exports

Todo `hooks/index.ts` DEBE reexportar todos los hooks públicos:

```typescript
// ✅ CORRECTO
export { useLiveRoutes } from './useLiveRoutes';
export { useDriverAvailability } from './useDriverAvailability';
export type { UseLiveRoutesReturn } from './useLiveRoutes';
```

### Convención de imports

Antes de aplicar esta convención, añadir path alias `@/` en `tsconfig.app.json` y `vite.config.ts`:

```jsonc
// tsconfig.app.json
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```

```typescript
// ✅ CORRECTO — import desde el barrel de la feature
import { useLiveRoutes, useAlertFeed } from '@/presentation/features/control';

// ❌ INCORRECTO — import directo del archivo
import { useLiveRoutes } from '@/presentation/features/control/hooks/useLiveRoutes';
```

## SOLID

### Single Responsibility
- Un hook = un propósito (`useRouteOptimization`, `useStopReassignment`).
- Un componente = una preocupación de UI.
- Un servicio = una integración externa (un servicio por: Supabase-routes, Vroom, OSRM, Mapbox Directions, expo push).

### Open/Closed
- Extiende por composición, no por modificación.
- Usa props y callbacks para variantes (`PlanDetail` recibe slots, no condicionales hardcodeados por tipo de plan).

### Liskov Substitution
- Los hooks de lectura devuelven shapes consistentes (`{ data, isLoading, error, refetch }`).
- Los adaptadores Vroom/OSRM convierten siempre al mismo tipo de dominio (`OptimizedRoute`).

### Interface Segregation
- Interfaces pequeñas. `EditRouteModal` no debería recibir el estado completo del plan, solo la ruta que edita.

### Dependency Inversion
- La UI depende de interfaces (`IRouteRepository`), no de Supabase directo.
- Inyecta dependencias vía hooks/props/stores.

## Gestión de estado

### Stores (Zustand) cuando…
- El estado se comparte entre varios componentes (ej. plan activo, filtros de control).
- El estado debe persistir al navegar (ej. filtros de analytics).
- Hay updates optimistas con posible rollback (reasignar paradas en vivo).

> **Instalar zustand** al iniciar el refactor: `npm i zustand`. No está en `package.json` todavía — actualmente se usa Context para Auth.

### Estado local (`useState`) cuando…
- Es puramente local al componente (modales, dropdowns, inputs de formulario).
- No sobrevive al unmount.

### Realtime Supabase
- Las suscripciones realtime pertenecen a hooks de feature, no a stores globales ni a `lib/`.
- Centraliza el channel en un hook (`useLiveControlRealtime`) que reduce eventos al store de la feature.

### NUNCA
- Eventos `window` para comunicación entre componentes.
- Variables globales para estado.
- Props drilling > 2 niveles.

## Patrón Zustand (referencia)

```typescript
import { create } from 'zustand';

interface LiveControlState {
  liveRoutes: LiveRoute[];
  activeAlerts: Alert[];
  selectedRouteId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchLiveRoutes: (orgId: string) => Promise<void>;
  selectRoute: (id: string | null) => void;
  acknowledgeAlert: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useLiveControlStore = create<LiveControlState>((set, get) => ({
  liveRoutes: [],
  activeAlerts: [],
  selectedRouteId: null,
  isLoading: false,
  error: null,

  fetchLiveRoutes: async (orgId) => {
    set({ isLoading: true, error: null });
    const res = await liveControlService.listLiveRoutes(orgId);
    if (!res.success) return set({ error: res.error, isLoading: false });
    set({ liveRoutes: res.data, isLoading: false });
  },

  selectRoute: (id) => set({ selectedRouteId: id }),
  acknowledgeAlert: async (id) => { /* ... */ },
  clearError: () => set({ error: null }),
}));
```

## Organización de componentes

### Simples (un solo archivo)
```
components/
├── ConfirmDialog.tsx
├── PlannerViewToggle.tsx
└── RequireAuth.tsx
```

### Complejos (con archivos relacionados)
Crea carpeta con índice:
```
components/
└── RouteMap/
    ├── RouteMap.tsx
    ├── RouteMap.types.ts
    ├── RouteMapLayers.tsx
    ├── useMapboxSources.ts
    └── index.ts
```

## Reglas específicas del dominio vuoo

- **Multi-tenant**: toda query debe filtrar por `org_id`. La RLS en Supabase ya lo aplica pero no confíes solo en ello: también hazlo explícito en los servicios.
- **Roles**: `admin`, `dispatcher`, `driver`. Los route guards viven en `application/navigation/`, no dentro de páginas.
- **Vroom/OSRM**: el cliente del frontend llama al backend Railway (`vuoo-rutas`). Nunca expongas tokens de OSRM/Mapbox secretos en el bundle — usa `VITE_*` solo para keys públicas (mapbox anon) y proxies Railway para lo demás.
- **Offline/mobile**: la mobile app (`/mobile`) comparte tipos con `src/data/types/database.ts` a través de un paquete interno o copia controlada. Cualquier cambio de schema debe actualizarse en ambos lados.
