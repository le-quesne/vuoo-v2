# Presentation Layer Rules — vuoo-v2

## Estructura de una feature

Cada feature en `src/presentation/features/{feature}/` sigue esta estructura:

```
{feature}/
├── components/                # Componentes específicos de la feature
│   ├── LiveRouteCard.tsx
│   └── RouteMap/
│       ├── RouteMap.tsx
│       ├── RouteMap.types.ts
│       ├── RouteMapLayers.tsx
│       └── index.ts
├── hooks/                     # Hooks específicos de la feature
│   ├── index.ts               # Barrel export OBLIGATORIO
│   ├── useLiveRoutes.ts
│   ├── useAlertFeed.ts
│   └── useDriverAvailability.ts
├── stores/                    # Zustand stores de la feature
│   └── useLiveControlStore.ts
├── types/                     # Tipos de la feature
│   └── index.ts
├── utils/                     # Utilidades locales
│   └── formatEta.ts
└── index.ts                   # Barrel export de la feature
```

### Features objetivo en vuoo-v2

- `planner/` — selector de día, agregar vehículos, lanzar optimización, wizard Vroom.
- `plans/` — detalle del plan, mapa de rutas, POD, edición de rutas/paradas, capacidad.
- `stops/` — CRUD de paradas, import CSV, validación de direcciones.
- `orders/` — gestión de órdenes, asignación a paradas.
- `drivers/` — CRUD, disponibilidad, invitaciones.
- `vehicles/` — CRUD, capacidad, asignación.
- `tracking/` — tracking histórico y en vivo de rutas.
- `control/` — panel operacional en vivo: alerts, incidentes, broadcast, reasignar paradas.
- `analytics/` — KPIs, entregas, flota, operaciones, clientes, summary.
- `settings/` — organización, usuarios, notificaciones.

## Reglas de componentes

### Presentacionales puros (preferidos)

```typescript
interface LiveRouteCardProps {
  route: LiveRoute;
  onSelect: (id: string) => void;
  onContactDriver: (driverId: string) => void;
}

export function LiveRouteCard({ route, onSelect, onContactDriver }: LiveRouteCardProps) {
  return (
    <div className="p-4 rounded-lg border hover:shadow-md transition-shadow">
      <h3 className="font-semibold">{route.name}</h3>
      <p className="text-sm text-gray-600">{route.completedStops}/{route.totalStops} paradas</p>
      <div className="flex gap-2 mt-3">
        <button onClick={() => onSelect(route.id)}>Ver</button>
        <button onClick={() => onContactDriver(route.driverId)}>Contactar</button>
      </div>
    </div>
  );
}
```

### Containers (páginas)

Las páginas en `src/presentation/pages/` componen features y conectan a stores/hooks. **Son finas**; toda la lógica pesada vive en hooks/stores de la feature.

```typescript
// src/presentation/pages/ControlPage.tsx
import { PlannerLayout } from '@/presentation/components/PlannerLayout';
import {
  useLiveRoutes,
  useAlertFeed,
  KpiBar,
  LiveRouteCard,
  AlertFeed,
} from '@/presentation/features/control';

export function ControlPage() {
  const { routes, isLoading } = useLiveRoutes();
  const { alerts, acknowledge } = useAlertFeed();

  if (isLoading) return <LoadingSpinner />;

  return (
    <PlannerLayout>
      <KpiBar routes={routes} />
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="grid gap-3">
          {routes.map((r) => <LiveRouteCard key={r.id} route={r} />)}
        </div>
        <AlertFeed alerts={alerts} onAcknowledge={acknowledge} />
      </div>
    </PlannerLayout>
  );
}
```

> Nota: la meta del refactor es reducir `PlanDetailPage.tsx` (~66k), `OrdersPage.tsx` (~57k) y `TrackingPage.tsx` (~34k) a páginas de 150–300 líneas que solo compongan features.

## Reglas de hooks

### Single Responsibility

```typescript
// ✅ CORRECTO — un hook por propósito
export function useLiveRoutes() { /* fetch + realtime de rutas en vivo */ }
export function useAlertFeed() { /* fetch + realtime + ack de alertas */ }
export function useIncidentCreate() { /* mutación */ }

// ❌ INCORRECTO — hook dios
export function useControl() {
  // routes, alerts, incidents, reassign, broadcast, drivers, stops... 🙃
}
```

### Composición

```typescript
// Hook agregador para el panel de control
export function useControlOperations() {
  const routes = useLiveRoutes();
  const alerts = useAlertFeed();
  const reassign = useStopReassign();
  const broadcast = useBroadcast();

  return {
    ...routes,
    alerts: alerts.alerts,
    acknowledgeAlert: alerts.acknowledge,
    reassignStop: reassign.execute,
    broadcastMessage: broadcast.send,
  };
}
```

### Barrel exports (OBLIGATORIO)

```typescript
// src/presentation/features/control/hooks/index.ts
export { useLiveRoutes } from './useLiveRoutes';
export type { UseLiveRoutesReturn } from './useLiveRoutes';

export { useAlertFeed } from './useAlertFeed';
export { useDriverAvailability } from './useDriverAvailability';
export { useStopReassign } from './useStopReassign';
export { useBroadcast } from './useBroadcast';
export { useIncidentCreate } from './useIncidentCreate';
export { useControlOperations } from './useControlOperations';
```

## Styling con Tailwind v4

Tailwind v4 con `@tailwindcss/vite` — sin archivo `tailwind.config.js`, config vía CSS.

### Utility-first

```tsx
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
  <span className="text-lg font-semibold text-gray-900">Ruta 04 — Santiago Centro</span>
</div>
```

### Clases condicionales

```tsx
// Template literal (casos simples)
<div className={`p-4 rounded ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>

// Array join (múltiples condiciones)
<div className={[
  'p-4 rounded transition-colors',
  isSelected && 'bg-blue-500 text-white',
  isDelayed && 'border-red-500 border',
  isCompleted && 'opacity-70',
].filter(Boolean).join(' ')}>
```

Para casos complejos, considerar instalar `clsx` + `tailwind-merge` en el refactor (`cn(...)` helper en `@/application/utils/cn.ts`).

### Variantes reutilizables

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2 py-1 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
};

export function Button({ variant = 'primary', size = 'md', children, onClick }: ButtonProps) {
  return (
    <button
      className={`rounded-md font-medium transition-colors ${variantStyles[variant]} ${sizeStyles[size]}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

## Loading, error y empty states

### Patrón estándar de hook

```typescript
interface UsePlanDetailReturn {
  plan: Plan | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePlanDetail(planId: string): UsePlanDetailReturn {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const res = await plansService.getById(planId);
    if (!res.success) setError(res.error);
    else setPlan(res.data);
    setIsLoading(false);
  }, [planId]);

  useEffect(() => { void fetch(); }, [fetch]);

  return { plan, isLoading, error, refetch: fetch };
}
```

### En componentes

```tsx
function PlanDetailView({ planId }: { planId: string }) {
  const { plan, isLoading, error } = usePlanDetail(planId);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!plan) return <EmptyState title="Plan no encontrado" />;

  return <PlanDetailContent plan={plan} />;
}
```

## Mapas con Mapbox GL

- Un componente `RouteMap` por feature donde aplique (control, tracking, plans).
- La instancia `mapboxgl.Map` vive en un `useRef`, se crea una sola vez en `useEffect([])`, y se limpia en el cleanup.
- Los sources/layers se actualizan vía hooks auxiliares (`useRouteSource`, `useStopMarkers`) que reciben el `mapRef` por prop.
- No crear tokens Mapbox fuera de `@/application/lib/mapbox.ts`. El token público va en `VITE_MAPBOX_TOKEN`.

## Realtime Supabase en hooks

```typescript
// src/presentation/features/control/hooks/useLiveControlRealtime.ts
export function useLiveControlRealtime(orgId: string | undefined, onChange: (p: RealtimePayload) => void) {
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`control-${orgId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'stops',
        filter: `org_id=eq.${orgId}`,
      }, onChange)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'route_events',
        filter: `org_id=eq.${orgId}`,
      }, onChange)
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [orgId, onChange]);
}
```

## Performance

### Memoización donde cuenta

```typescript
// Listas grandes de paradas / rutas
const sortedStops = useMemo(
  () => stops.slice().sort((a, b) => a.sequence - b.sequence),
  [stops]
);

// Callbacks a hijos memoizados
const handleReassign = useCallback((stopId: string, newRouteId: string) => {
  void reassignStop(stopId, newRouteId);
}, [reassignStop]);

// Tablas largas (OrdersPage)
const MemoizedOrderRow = memo(function OrderRow({ order }: { order: Order }) { /* ... */ });
```

### Selectores Zustand

```typescript
// ✅ CORRECTO — selecciona solo lo necesario
const routes = useLiveControlStore((s) => s.liveRoutes);
const isLoading = useLiveControlStore((s) => s.isLoading);

// ❌ INCORRECTO — el store entero re-renderiza todo
const store = useLiveControlStore();
```

Para selectores derivados, considerar `zustand/shallow` o memoización externa.

### Listas largas
Para `OrdersPage`, `StopsPage` y vistas de analytics con miles de filas: evaluar `@tanstack/react-virtual` en el refactor.

## Accesibilidad (mínimos)

- Botones con texto o `aria-label`.
- Modales con foco atrapado y `Esc` cierra (`ConfirmDialog` ya debería hacerlo; verificar).
- Colores con contraste AA en Tailwind (evitar `text-gray-400` sobre `bg-white`).
- No depender solo del color para indicar estado (un badge "Retrasada" debe decir el texto, no solo ser rojo).
