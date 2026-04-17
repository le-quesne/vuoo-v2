# 08 - Torre de Control: Dashboard Operacional en Tiempo Real

> **Objetivo:** Dar al dispatcher una vista unica donde ve TODOS los conductores, TODAS las rutas del dia, y puede actuar ante problemas sin salir de la pantalla.
>
> **Depende de:** 01 (conductores), 02 (GPS tracking, status updates), 03 (notificaciones)
>
> **Diferencia clave:** Una pagina de tracking es una tele. La torre de control es una cabina con controles.
>
> **Estado:** reescrito 2026-04-16 tras refactor del PRD 07.

---

## Estado Actual (abril 2026)

### Lo que YA existe (reutilizable)

- **Mobile app (Expo) reporta ubicaciones**: `mobile/src/lib/location.ts` inserta en `driver_locations` periodicamente y en offline-first con cola local.
- **Realtime habilitado** en las tablas criticas:
  - `driver_locations` (migration 004).
  - `plan_stops` (migration 005).
  - `orders` (migration 008).
- **`RouteMap.tsx`** ya soporta la prop `driverLocations`: markers con color por ruta, pulse animation, nombre del conductor en tooltip.
- **Patron de badge con realtime en Sidebar** (`Sidebar.tsx` con `pending_orders`): copiar este patron para el badge de alertas.
- **Edge function `send-notification`** (doc 03) para notificaciones a clientes/conductores desde el dispatcher.
- **TrackingPage publica** driver_locations realtime → plantilla para consumir la subscription en web.

### Lo que cambio con el PRD 07 (abril 2026)

Cuando refactoreamos `PlanDetailPage.tsx` **eliminamos la tab "En Vivo"**: ese codigo que hoy existe solo en git history era la unica forma de ver conductores en tiempo real desde la web. Hoy **no hay ningun consumidor en la web** de `driver_locations`. Esto convierte a la Torre de Control en pieza **indispensable**, no nice-to-have.

El codigo eliminado que sirve de punto de partida:
- `git show 880766e:src/pages/PlanDetailPage.tsx` — contiene la logica de `driverLocations` state, subscription a postgres_changes con filtro `route_id=in.(...)`, y el panel de "En Vivo" con online/offline/sin datos.

### Lo que NO existe

- Pagina `/control`.
- RPC `get_live_dashboard()` y `get_live_routes()`.
- Realtime en `routes` (falta `alter publication supabase_realtime add table routes`).
- Tabla `operational_incidents`.
- Sistema de alertas (deteccion offline, paradas atrasadas, broadcast, etc.).
- Acciones del dispatcher (reasignar en vivo, contactar con un click).
- Badge de alertas en Sidebar.

---

## Nueva Pagina: `/control`

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ▌ Torre de Control           Hoy: Viernes 11 Abril       [⟳ live] │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────┤
│ 🟢 8/10  │ 142/168  │  94.2%   │  12 ⚠    │ 3 ❌     │  ~45 min    │
│ Online   │ Completad│ On-time  │ Pendiente│ Fallidas │  ETA cierre │
├──────────┴──────────┴──────────┴──────────┴──────────┴─────────────┤
│                          │                                         │
│   PANEL IZQUIERDO        │              MAPA CENTRAL               │
│   (rutas activas)        │                                         │
│                          │   [Todos los conductores en vivo]       │
│  🔍 Buscar conductor     │   [Rutas dibujadas con colores]         │
│                          │   [Paradas pending/done/failed]         │
│  ▼ Juan P. 🟢 en ruta   │   [Click para interactuar]              │
│    5/8 paradas ████░░    │                                         │
│    ETA: 12:45            │                                         │
│    ⚠ 1 atrasada          │                                         │
│                          │                                         │
│  ▼ Maria S. 🟢 en ruta  │                                         │
│    3/6 paradas ███░░░    │                                         │
│    ETA: 13:10            │                                         │
│                          │              ALERTAS                    │
│  ▶ Carlos R. 🔴 offline │         (panel inferior o lateral)      │
│    7/12 — sin señal 5min │                                         │
│                          │  🔴 Carlos R. offline hace 5 min       │
│  ▶ Ana M. ⬜ no iniciada │  🟡 Parada "Ñuñoa 234" atrasada 15min │
│    0/5 paradas           │  ✅ Juan P. completó "Av Italia 567"   │
│                          │  ❌ Maria S. falló "Las Condes 890"    │
│                          │     Razon: No hay nadie                │
└──────────────────────────┴─────────────────────────────────────────┘
```

---

## Fase 1 — MVP: Ver antes de actuar (1-2 sem)

El objetivo es devolver al dispatcher visibilidad en tiempo real de todo el dia **sin agregar acciones todavia**. Primero que vea, despues que actue.

### 1.1 — Migracion SQL base

`012_control_tower.sql`:

```sql
-- Habilitar realtime en routes (faltaba)
alter publication supabase_realtime add table routes;

-- RPC: KPIs live del dia
create or replace function get_live_dashboard(p_org_id uuid, p_date date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare result json;
begin
  select json_build_object(
    'drivers_online', (
      select count(distinct dl.driver_id)
      from driver_locations dl
      join drivers d on d.id = dl.driver_id
      where d.org_id = p_org_id
        and dl.recorded_at > now() - interval '60 seconds'
    ),
    'drivers_total', (
      select count(distinct r.driver_id)
      from routes r join plans p on r.plan_id = p.id
      where r.org_id = p_org_id and p.date = p_date and r.driver_id is not null
    ),
    'stops_total', (
      select count(*) from plan_stops ps join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date
    ),
    'stops_completed', (
      select count(*) from plan_stops ps join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date and ps.status = 'completed'
    ),
    'stops_failed', (
      select count(*) from plan_stops ps join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date and ps.status in ('incomplete', 'cancelled')
    ),
    'stops_pending', (
      select count(*) from plan_stops ps join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date and ps.status = 'pending'
    ),
    'routes_active', (
      select count(*) from routes r join plans p on r.plan_id = p.id
      where r.org_id = p_org_id and p.date = p_date and r.status = 'in_transit'
    ),
    'routes_completed', (
      select count(*) from routes r join plans p on r.plan_id = p.id
      where r.org_id = p_org_id and p.date = p_date and r.status = 'completed'
    )
  ) into result;
  return result;
end;
$$;

grant execute on function get_live_dashboard(uuid, date) to authenticated;

-- RPC: rutas del dia con datos live
create or replace function get_live_routes(p_org_id uuid, p_date date)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
      select
        r.id as route_id,
        r.status as route_status,
        r.total_distance_km,
        r.total_duration_minutes,
        p.id as plan_id,
        p.name as plan_name,
        p.date as plan_date,
        case when d.id is null then null else
          json_build_object('id', d.id, 'name', d.first_name || ' ' || d.last_name, 'phone', d.phone)
        end as driver,
        case when v.id is null then null else
          json_build_object('id', v.id, 'name', v.name, 'plate', v.license_plate)
        end as vehicle,
        (select count(*) from plan_stops ps where ps.route_id = r.id) as stops_total,
        (select count(*) from plan_stops ps where ps.route_id = r.id and ps.status = 'completed') as stops_completed,
        (select count(*) from plan_stops ps where ps.route_id = r.id and ps.status in ('incomplete', 'cancelled')) as stops_failed,
        (
          select json_build_object(
            'lat', dl.lat, 'lng', dl.lng, 'speed', dl.speed,
            'battery', dl.battery, 'recorded_at', dl.recorded_at
          )
          from driver_locations dl
          where dl.driver_id = d.id
          order by dl.recorded_at desc
          limit 1
        ) as last_location
      from routes r
      join plans p on r.plan_id = p.id
      left join drivers d on r.driver_id = d.id
      left join vehicles v on r.vehicle_id = v.id
      where r.org_id = p_org_id and p.date = p_date
      order by
        (r.status = 'in_transit') desc,
        (r.status = 'not_started') desc,
        r.created_at
    ) t
  );
end;
$$;

grant execute on function get_live_routes(uuid, date) to authenticated;
```

### 1.2 — Pagina `/control`

Nuevo archivo `src/pages/ControlPage.tsx`:

- Encabezado: "Torre de Control · Hoy: {fecha}" + switch de dia (hoy / mañana / ayer para revisar).
- **KPI bar** (6 metricas del RPC `get_live_dashboard`), polling cada 30s.
- **Panel izquierdo** (lista de rutas activas del RPC `get_live_routes`), con:
  - Tarjeta por ruta con conductor, vehiculo, progreso (x/y paradas), estado (en ruta / no iniciada / completada / offline).
  - Buscador por nombre de conductor.
  - Filtro: todos / en ruta / con problemas / offline / completados.
  - Ordenamiento: alertas rojas → en ruta → no iniciadas → completadas.
- **Mapa central** reutilizando `RouteMap.tsx`:
  - Mostrar TODAS las rutas del dia con sus paradas y lineas.
  - Markers de conductores en vivo (ya soportado por el componente).
  - Click en conductor → popup con info (Fase 1 solo lectura, sin acciones).
  - Click en parada → popup con info (mismo criterio).

### 1.3 — Routing + Sidebar

- `App.tsx`: nueva ruta `/control` → `ControlPage`.
- `Sidebar.tsx`: nueva entrada despues de "Conductores" con icono `Radio` o `Activity` de lucide-react.

### 1.4 — Realtime (solo datos, sin alertas)

El `/control` abre **una sola** subscription multiplexada sobre los tres eventos:

```typescript
// Todos los driver_locations de la org (filtrar por org via driver_id)
supabase
  .channel(`control-${orgId}`)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'driver_locations'
  }, updateDriverLocation)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'plan_stops',
    filter: `org_id=eq.${orgId}`
  }, updatePlanStopStatus)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'routes',
    filter: `org_id=eq.${orgId}`
  }, updateRouteStatus)
  .subscribe()
```

Al recibir un evento, refrescar la ruta/conductor afectado en el estado local (sin volver a llamar al RPC).

### Definicion de Done Fase 1

- Nueva pagina `/control` con acceso desde sidebar.
- KPI bar con 6 metricas cargadas via `get_live_dashboard`, refresh 30s.
- Panel izquierdo con lista de rutas activas del dia, ordenado por prioridad.
- Mapa con todos los conductores + rutas + paradas, actualizando en vivo.
- Subscription realtime consolidada a `driver_locations`, `plan_stops`, `routes`.
- Busqueda + filtros del panel izquierdo.
- Sin acciones ni alertas todavia — solo visibilidad.

---

## Fase 2 — Alertas y feed de eventos (1-2 sem)

### 2.1 — Tipos y deteccion

```typescript
type AlertPriority = 'high' | 'medium' | 'info'
type AlertType =
  | 'driver_offline'        // sin location > 5 min en ruta activa
  | 'driver_stationary'     // velocidad 0 > 15 min en ruta activa
  | 'stop_late'             // ETA > time_window_end
  | 'stop_failed'           // plan_stop.status → incomplete/cancelled
  | 'route_not_started'     // hora > vehicle.time_window_start + 30min y status = not_started
  | 'battery_low'           // battery < 0.15
  | 'stop_completed'        // info
  | 'route_completed'       // info
  | 'route_started'         // info

interface LiveAlert {
  id: string
  priority: AlertPriority
  type: AlertType
  ts: number                // Date.now() cuando se genero
  driverId?: string
  routeId?: string
  planStopId?: string
  message: string
  payload?: Record<string, unknown>
}
```

### 2.2 — Generacion de alertas

- **Alertas reactivas** (Realtime):
  - `plan_stops.status` UPDATE → `stop_completed` / `stop_failed`.
  - `routes.status` UPDATE → `route_started` / `route_completed`.
- **Alertas derivadas** (timer in-memory cada 30s):
  - `driver_offline`: `now - last_location.recorded_at > 5min` y ruta activa.
  - `driver_stationary`: `last_location.speed === 0 por > 15min`.
  - `route_not_started`: hora actual > `vehicle.time_window_start + 30min` y `status = not_started`.
  - `stop_late`: ETA calculada > `time_window_end`.

### 2.3 — UI

- **Feed lateral** o inferior con scroll infinito (hoy primero).
- Filtros por prioridad (rojo / amarillo / info).
- Toast para alertas `high` con sonido opcional (Web Audio API) + switch de "silenciar".
- **Badge rojo en Sidebar** cuando hay alertas `high` sin acknowledgear (patron identico al `pending_orders`).

### 2.4 — Persistencia

Las alertas derivadas se generan en memoria, no se persisten. Las reactivas son solo proyecciones de cambios en tablas, que ya existen.

### Definicion de Done Fase 2

- Deteccion de conductor offline (>5 min) con toast + entrada en feed.
- Deteccion de parada atrasada con badge amarillo en la tarjeta del conductor.
- Deteccion de ruta no iniciada a tiempo.
- Feed cronologico de eventos del dia con filtros por prioridad.
- Toast + sonido opcional para alertas rojas.
- Badge en sidebar si hay alertas `high` pendientes.

---

## Fase 3 — Acciones del dispatcher (2 sem)

### 3.1 — Reasignar parada en vivo

Desde el popup del mapa o desde la tarjeta del conductor en el panel izquierdo:

```
Reasignar: Av. Providencia 123
Asignada a: Maria S. (Ruta 2)

Reasignar a:
  ○ Juan P. (3 paradas quedan) ← mas cercano
  ○ Carlos R. (5 paradas quedan)
  ○ Sin asignar

☑ Notificar al conductor anterior (push)
☑ Notificar al conductor nuevo (push)
☑ Notificar al cliente con nuevo ETA

[Cancelar]  [Reasignar]
```

- Mover `plan_stops.route_id` + `vehicle_id`.
- Recalcular `order_index` en ambas rutas.
- Gatillar edge function `send-notification` para los 3 destinatarios segun checkboxes.

### 3.2 — Contactar conductor

Desde la tarjeta del conductor:
- `[WhatsApp]` → `wa.me/${phone}`.
- `[Llamar]` → `tel:${phone}`.
- `[Push]` → modal con textarea + `send-notification`.

### 3.3 — Broadcast

Boton en header "Mensaje a conductores activos":
- Lista de destinatarios (todos en ruta).
- Textarea.
- Toggle: Push / WhatsApp.
- Envia via `send-notification` en paralelo.

### 3.4 — Incidentes operacionales

Nueva tabla `operational_incidents` en `013_operational_incidents.sql`:

```sql
create table operational_incidents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  route_id    uuid references routes(id) on delete set null,
  driver_id   uuid references drivers(id) on delete set null,
  type        text not null,          -- 'vehicle_breakdown' | 'accident' | 'weather' | 'driver_offline' | 'other'
  description text,
  action_taken text,
  resolved    boolean default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index idx_incidents_org_date on operational_incidents(org_id, created_at desc);

alter table operational_incidents enable row level security;

create policy "Org members manage incidents"
  on operational_incidents for all using (org_id in (select user_org_ids()));
```

Modal "Registrar incidente" con tipo (select), conductor/ruta afectada, descripcion, accion tomada.

### Definicion de Done Fase 3

- Reasignar parada desde popup/tarjeta con notificaciones opcionales.
- Contactar conductor (WhatsApp / llamada / push).
- Broadcast a todos los conductores activos.
- Registrar incidente con persistencia en `operational_incidents`.
- Historico de incidentes accesible (vista simple en la misma pagina o en analytics).

---

## Interaccion Mapa (progresivo por fase)

| Interaccion | Fase 1 | Fase 2 | Fase 3 |
|-------------|--------|--------|--------|
| Click conductor → popup info | ✓ | ✓ | ✓ |
| Click parada → popup info + POD si completada | ✓ | ✓ | ✓ |
| Click ruta (linea) → resaltar + dim otras | ✓ | ✓ | ✓ |
| Color coding por estado (verde/amarillo/rojo/gris) | ✓ | ✓ | ✓ |
| Badge amarillo en parada atrasada | — | ✓ | ✓ |
| Popup de conductor: botones Contactar/Reasignar | — | — | ✓ |
| Popup de parada: boton Reasignar | — | — | ✓ |

---

## Preguntas Abiertas

1. **Polling vs Realtime puro para KPIs**
   - Polling cada 30s con `get_live_dashboard` es simple y predecible.
   - Hibrido: polling para KPIs, realtime para eventos individuales → **decidido**.

2. **Sonido en alertas**
   - Si, con toggle de silencio. Web Audio API. Default: silenciado; el usuario lo activa.

3. **Zoom de mapa**
   - Cuando llegan muchas rutas, usar clustering de markers (Fase 3 o separada, no bloqueante para MVP).

4. **Pagina dedicada vs fusionarlo con `/planner/:id` vs `/planner`**
   - **Decidido**: pagina dedicada `/control`. Planificar y operar son contextos distintos. El planner es para el futuro, el control es para el ahora.

5. **Que pasa el fin de dia?**
   - Default: mostrar solo hoy. Botones para ver ayer (debrief) o mañana (preview).
   - Alertas se limpian al cambiar de dia.

---

## Codigo reutilizable del PRD 07

Lo que se elimino en el refactor del planner se reusa como base:

```bash
# Logica de subscription a driver_locations (copiar y adaptar a todos los drivers de hoy)
git show 880766e:src/pages/PlanDetailPage.tsx | sed -n '115,190p'

# Panel "En Vivo" (tarjeta de conductor con online/offline/sin datos)
git show 880766e:src/pages/PlanDetailPage.tsx | sed -n '699,807p'

# Helper formatAge ("hace X min")
git show 880766e:src/pages/PlanDetailPage.tsx | sed -n '961,973p'
```

Extraer `formatAge` y el patron de "tarjeta de conductor live" a componentes reusables en la Fase 1.

---

## Dependencias

- Realtime ya habilitado: `driver_locations`, `plan_stops`, `orders`.
- Nueva habilitacion: `routes` (en la migracion 012).
- Sin nuevas librerias externas para Fase 1. Fase 2 usa Web Audio API nativa.
- Fase 3 reutiliza edge function `send-notification` existente.

---

## Metricas de exito

- **Dispatcher open rate en la pagina**: ¿abren `/control` al llegar a la oficina? (telemetria)
- **Tiempo a primera accion ante alerta**: desde que suena la alerta hasta click en "Reasignar" o "Contactar".
- **% de reasignaciones exitosas** (parada completada despues de reasignar) vs % que siguen fallando.
- **Reduccion de llamadas manuales** al conductor (antes tenian que pedir el telefono a otro canal).
