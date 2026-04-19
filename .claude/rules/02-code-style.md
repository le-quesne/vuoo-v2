# Code Style Rules — vuoo-v2

## TypeScript

### Strict mode (ya habilitado en `tsconfig.app.json`)
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `verbatimModuleSyntax: true` → usa `import type` explícito cuando corresponda.

### Definición de tipos

```typescript
// ✅ CORRECTO — tipos explícitos
interface Stop {
  id: string;
  orgId: string;
  address: string;
  lat: number;
  lng: number;
  status: StopStatus;
}

// ❌ INCORRECTO — `any`
const payload: any = await fetchPlan();

// ✅ CORRECTO — `unknown` y type guard
const payload: unknown = await fetchPlan();
if (isPlan(payload)) { /* payload está tipado */ }
```

Tipos autogenerados de Supabase:
```bash
# script sugerido en package.json
"types:db": "supabase gen types typescript --project-id <id> > src/data/types/database.ts"
```
No edites `database.ts` a mano; regenera y actualiza los adaptadores en `domain/adapters/`.

### Interface vs. Type
- `interface` para shapes extendibles (props de componente, entidades de dominio).
- `type` para uniones, intersecciones y primitivos derivados.

```typescript
interface RouteMapProps {
  className?: string;
  children?: React.ReactNode;
}

type StopStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type PlanStatus = 'draft' | 'optimizing' | 'planned' | 'live' | 'archived';
type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };
```

## Convenciones React

### Declaración de componentes

```typescript
// ✅ CORRECTO — función nombrada con props tipadas, export nombrado
interface PrimaryButtonProps {
  variant: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
  children: React.ReactNode;
}

export function PrimaryButton({ variant, onClick, children }: PrimaryButtonProps) {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}

// ❌ INCORRECTO — default export (dificulta refactors y autoimports)
export default function PrimaryButton() { /* ... */ }
```

Excepción: páginas en `presentation/pages/` pueden usar default export si lo exige `react-router`.

### Declaración de hooks

```typescript
interface UseLiveRoutesReturn {
  routes: LiveRoute[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLiveRoutes(orgId: string | undefined): UseLiveRoutesReturn {
  const [routes, setRoutes] = useState<LiveRoute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => { /* ... */ }, [orgId]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { routes, isLoading, error, refetch };
}
```

## Convenciones de nombres

### Archivos
| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Componentes | PascalCase.tsx | `PlanDetailHeader.tsx` |
| Hooks | camelCase.ts (prefijo `use`) | `useLiveRoutes.ts` |
| Types | camelCase.types.ts | `plan.types.ts` |
| Utils | camelCase.ts | `capacity.ts`, `dateHelpers.ts` |
| Stores | use{Feature}Store.ts | `useLiveControlStore.ts` |
| Services | {service}.services.ts | `vroom.services.ts`, `stops.services.ts` |
| Adapters | {source}.adapter.ts | `vroomResult.adapter.ts` |

### Código
| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Componentes | PascalCase | `LiveRouteCard` |
| Hooks | `use` + PascalCase | `useDriverAvailability` |
| Variables/funciones | camelCase | `liveRoutes`, `fetchPlanDetail` |
| Constantes | UPPER_SNAKE_CASE | `MAX_STOPS_PER_ROUTE`, `DEFAULT_DEPOT` |
| Tipos/interfaces | PascalCase | `OptimizedRoute`, `StopStatus` |
| Enums | PascalCase | `RouteStatus` (preferir union types a enums en TS) |

## Organización de imports

Orden:
1. React y librería estándar
2. Librerías de terceros
3. Imports absolutos internos (`@/`)
4. Imports relativos
5. `import type` puede mezclarse en cada bloque o separarse al final

```typescript
// 1. React
import { useState, useEffect, useCallback } from 'react';

// 2. Terceros
import { format, parseISO } from 'date-fns';
import mapboxgl from 'mapbox-gl';
import { create } from 'zustand';

// 3. Absolutos internos
import { supabase } from '@/application/lib/supabase';
import { useLiveRoutes } from '@/presentation/features/control';
import type { LiveRoute } from '@/domain/entities/route';

// 4. Relativos
import { formatEta } from './utils';
import type { CardProps } from './LiveRouteCard.types';
```

## Semicolons

**Siempre usar `;`.** Consistencia con el eslint configurado y con la mayoría de la base actual.

```typescript
// ✅ CORRECTO
const url = import.meta.env.VITE_SUPABASE_URL;
const noop = () => { return; };
```

## Código limpio

### Sin código muerto
- Elimina imports no usados inmediatamente.
- Borra código comentado (no lo dejes "por si acaso"; está en el historial git).
- Elimina funciones/variables no referenciadas.

### Sin `console.*` en producción

```typescript
// ✅ CORRECTO — logger centralizado
import { logger } from '@/application/lib/logger';
logger.debug('plan loaded', { planId });

// ✅ CORRECTO — solo en dev
if (import.meta.env.DEV) {
  console.log('debug:', data);
}

// ❌ INCORRECTO — console.log suelto en producción
console.log('algo pasó');
```

Crear `src/application/lib/logger.ts` que delegue en `console` en dev y en Sentry/PostHog (cuando se integre) en prod.

## Manejo de errores

### Siempre manejar errores de red/Supabase

```typescript
// ✅ CORRECTO
try {
  const res = await stopsService.listByPlan(planId);
  if (!res.success) {
    logger.error('stops.listByPlan failed', res.error);
    return { success: false, error: res.error };
  }
  return { success: true, data: res.data };
} catch (error) {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  return { success: false, error: message };
}

// ❌ INCORRECTO — promesa sin catch
stopsService.listByPlan(planId).then(res => setStops(res.data));
```

### Type guards

```typescript
function isSupabaseError(e: unknown): e is { message: string; code: string } {
  return typeof e === 'object' && e !== null && 'message' in e && 'code' in e;
}
```

## Comentarios

### Cuándo comentar
- Regla de negocio no evidente (ej. "en Chile el IVA no aplica a flete internacional").
- Workaround con link al issue/tracker.
- Invariantes sutiles (ej. "Vroom entrega tiempos en segundos desde medianoche local").

### Cuándo NO comentar
- Código autoexplicativo (`// incrementa contador`).
- Código comentado → bórralo.
- Referencias a la tarea o PR actual → van en el mensaje del commit, no en el código.

```typescript
// ✅ CORRECTO — explica el PORQUÉ
// OSRM devuelve geometrías en polyline6 (precisión 1e-6). Mapbox espera GeoJSON.
const geojson = polylineToGeoJSON(route.geometry, 6);

// ❌ INCORRECTO — explica el QUÉ (obvio)
// Convierte polyline a geojson
const geojson = polylineToGeoJSON(route.geometry, 6);
```

## i18n y copy

- La UI va en **español** (usuario target: operaciones en LATAM).
- Mantén los identificadores de código en inglés (`plan`, `stop`, `driver`), el texto al usuario en español.
- No hardcodees strings de UI repetidos: si un texto aparece > 2 veces, centralízalo en un `constants.ts` o en un archivo de copy por feature.
