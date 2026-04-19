# Data & Services Rules — vuoo-v2

## Estructura de servicios

Los servicios viven en `src/data/services/{service}/`:

```
src/data/services/
├── supabase/
│   ├── client.ts                      # cliente Supabase (desde application/lib)
│   └── index.ts
├── plans/
│   ├── plans.services.ts
│   ├── plans.types.ts
│   └── index.ts
├── stops/
│   ├── stops.services.ts
│   ├── stops.types.ts
│   └── index.ts
├── routes/
│   ├── routes.services.ts
│   ├── routes.types.ts
│   └── index.ts
├── drivers/
│   ├── drivers.services.ts
│   └── index.ts
├── vehicles/
│   ├── vehicles.services.ts
│   └── index.ts
├── orders/
│   ├── orders.services.ts
│   └── index.ts
├── control/
│   ├── control.services.ts            # reasignación, broadcast, alerts
│   ├── control.types.ts
│   └── index.ts
├── vroom/
│   ├── vroom.services.ts              # llama a Railway (vuoo-rutas)
│   ├── vroom.types.ts                 # request/response según contrato Vroom
│   └── index.ts
├── osrm/
│   ├── osrm.services.ts                # routing/matrix vía Railway
│   ├── osrm.types.ts
│   └── index.ts
├── mapbox/
│   ├── directions.services.ts
│   └── index.ts
└── notifications/
    ├── notifyDriver.services.ts        # Expo push / email / sms
    └── index.ts
```

> Nota migración: el archivo actual `src/lib/liveControl.ts` se parte en `data/services/control/` + `domain/` + hooks de feature `presentation/features/control/hooks/`.

## Patrón de servicio

### Response type consistente

```typescript
// src/data/services/_shared/response.ts
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

Usar este tipo discriminado en todos los servicios. Hace que el consumer esté forzado a verificar `res.success` antes de usar `res.data`.

### Servicio Supabase típico

```typescript
// src/data/services/stops/stops.services.ts
import { supabase } from '@/application/lib/supabase';
import type { Stop, StopInsert, StopUpdate } from './stops.types';
import type { ServiceResult } from '@/data/services/_shared/response';

export async function listByPlan(planId: string): Promise<ServiceResult<Stop[]>> {
  try {
    const { data, error } = await supabase
      .from('stops')
      .select('*')
      .eq('plan_id', planId)
      .order('sequence', { ascending: true });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data ?? [] };
  } catch (e) {
    return { success: false, error: toErrorMessage(e) };
  }
}

export async function create(input: StopInsert): Promise<ServiceResult<Stop>> {
  try {
    const { data, error } = await supabase.from('stops').insert(input).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: toErrorMessage(e) };
  }
}

export async function update(id: string, patch: StopUpdate): Promise<ServiceResult<Stop>> {
  try {
    const { data, error } = await supabase.from('stops').update(patch).eq('id', id).select().single();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (e) {
    return { success: false, error: toErrorMessage(e) };
  }
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error desconocido';
}
```

### Barrel export

```typescript
// src/data/services/stops/index.ts
export * as stopsService from './stops.services';
export * from './stops.types';
```

El namespace (`stopsService.listByPlan(...)`) es preferible a exports planos porque evita colisiones entre features (`drivers.list` vs `vehicles.list`).

## Cliente Supabase

Mover `src/lib/supabase.ts` → `src/application/lib/supabase.ts`:

```typescript
// src/application/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/data/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient<Database>(url, anonKey);
```

**Importante**: tipar el cliente con `Database` autogenerado. Hoy `src/lib/supabase.ts` no tipa.

## Servicios Vroom + OSRM (Railway)

Llamada a backend `vuoo-rutas` en Railway (nivel 3 del PRD 06 ya desplegado):

```typescript
// src/data/services/vroom/vroom.services.ts
import { supabase } from '@/application/lib/supabase';
import type { VroomRequest, VroomResponse } from './vroom.types';
import type { ServiceResult } from '@/data/services/_shared/response';

const ROUTING_BASE = import.meta.env.VITE_ROUTING_BASE_URL;

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function optimize(req: VroomRequest): Promise<ServiceResult<VroomResponse>> {
  try {
    const res = await fetch(`${ROUTING_BASE}/vroom/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error ?? `HTTP ${res.status}` };
    }

    return { success: true, data: await res.json() };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}
```

- `VITE_ROUTING_BASE_URL` apunta al dominio Railway del proyecto `vuoo-rutas`.
- Nunca llamar a OSRM desde el frontend con coordenadas del cliente en masa — el optimizador corre en el backend.
- Los tipos de Vroom viven en `vroom.types.ts` y se mapean a dominio (`OptimizedRoute`, `OptimizedStop`) en `src/domain/adapters/vroomResult.adapter.ts`.

## Realtime → hooks, no servicios

Los servicios son **stateless y request/response**. Realtime pertenece a hooks de feature:

```typescript
// src/presentation/features/control/hooks/useLiveRoutesRealtime.ts
import { useEffect } from 'react';
import { supabase } from '@/application/lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useLiveRoutesRealtime(
  orgId: string | undefined,
  onRouteChange: (p: RealtimePostgresChangesPayload<any>) => void,
) {
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel(`routes-${orgId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'routes',
        filter: `org_id=eq.${orgId}`,
      }, onRouteChange)
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [orgId, onRouteChange]);
}
```

Reglas:
- Un canal por agrupación lógica (no un canal por componente).
- `filter` siempre por `org_id` o `plan_id` según aplique.
- Cleanup obligatorio en el `return` del `useEffect`.

## Tipos de petición/respuesta

Separar tipos de DB (autogenerados) de tipos de dominio (UI-friendly):

```typescript
// src/data/types/database.ts         (autogenerado — NO editar)
// src/data/services/plans/plans.types.ts
import type { Database } from '@/data/types/database';

export type PlanRow = Database['public']['Tables']['plans']['Row'];
export type PlanInsert = Database['public']['Tables']['plans']['Insert'];
export type PlanUpdate = Database['public']['Tables']['plans']['Update'];

// src/domain/entities/plan.ts
export interface Plan {
  id: string;
  orgId: string;
  name: string;
  date: string;              // YYYY-MM-DD
  status: PlanStatus;
  totalStops: number;
  totalDistanceKm: number;
}

// src/domain/adapters/plan.adapter.ts
export function planFromRow(row: PlanRow): Plan {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    date: row.date,
    status: row.status,
    totalStops: row.total_stops ?? 0,
    totalDistanceKm: (row.total_distance_m ?? 0) / 1000,
  };
}
```

Las UI features consumen `Plan` (dominio), no `PlanRow` (DB). Así un cambio de schema solo impacta el adapter.

## Manejo de errores

### Mensajes legibles

```typescript
// src/application/utils/errorMessages.ts
export function userMessage(raw: string): string {
  if (/network|failed to fetch/i.test(raw)) return 'Sin conexión. Revisa tu internet.';
  if (/401|403|jwt/i.test(raw)) return 'Tu sesión expiró. Inicia sesión nuevamente.';
  if (/duplicate key|unique constraint/i.test(raw)) return 'Ya existe un registro con esos datos.';
  if (/row-level security|rls/i.test(raw)) return 'No tienes permisos para esta acción.';
  return raw;
}
```

### Retry solo cuando tiene sentido

```typescript
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await new Promise(r => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs * 2);
  }
}
```

Aplicar a:
- ✅ Llamadas a Vroom/OSRM (pueden estar en cold start en Railway).
- ✅ Lecturas idempotentes a Supabase en red inestable.
- ❌ **Nunca** a mutaciones no idempotentes (crear parada, enviar notificación) — genera duplicados.

## Multi-tenant & RLS

- Toda query debe incluir `org_id` explícito (`.eq('org_id', orgId)`) aunque la RLS también lo aplique. Es una segunda barrera contra bugs.
- Las políticas RLS viven en `supabase/migrations/*.sql`. No acoplar la lógica del cliente a la RLS.
- Al crear filas, **siempre** setear `org_id` en el `Insert` (no dejarlo al trigger implícito).

## Seguridad del bundle

- `VITE_*` se incluye en el bundle público. Solo tokens de uso cliente (Mapbox anon, Supabase anon).
- Tokens privados (OSRM, API keys de terceros, webhook secrets) → backend Railway.
- Nunca leer `SUPABASE_SERVICE_ROLE_KEY` desde el frontend.

## Notificaciones (Expo push, SMS, email)

Cliente web llama a endpoints del backend; nunca directamente al SDK de Expo desde el browser:

```typescript
// src/data/services/notifications/notifyDriver.services.ts
export async function notifyDriver(
  driverId: string,
  message: string,
): Promise<ServiceResult<{ id: string }>> {
  try {
    const res = await fetch(`${ROUTING_BASE}/notifications/driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ driverId, message }),
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return { success: true, data: await res.json() };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Error de red' };
  }
}
```

El actual `src/lib/notifyDriver.ts` debe moverse aquí durante el refactor.

## Sincronización con mobile

- La app móvil (`/mobile`) comparte schema con el web via Supabase.
- Los tipos de DB **deben** mantenerse iguales — regenerar `database.ts` con el mismo project-id en ambos.
- No duplicar lógica de dominio entre web y mobile. Si una regla aplica a ambos (ej. "una parada completa requiere POD"), extraer a un paquete compartido `packages/domain` cuando haya más de 2 duplicaciones.
