# 08 - Torre de Control: Dashboard Operacional en Tiempo Real

> **Objetivo:** Dar al dispatcher una vista unica donde ve TODOS los conductores, TODAS las rutas del dia, y puede actuar ante problemas sin salir de la pantalla. Hoy solo puede ver un plan a la vez.
>
> **Depende de:** 01 (conductores), 02 (GPS tracking, status updates), 03 (notificaciones)
>
> **Diferencia clave:** Una pagina de tracking es una tele. La torre de control es una cabina con controles.

---

## Estado Actual

### Lo que existe:
- Tab "En Vivo" en PlanDetailPage — muestra conductores de **un solo plan**
- Supabase Realtime subscription en `driver_locations` (unica subscription en toda la app)
- Indicador online/offline (60s threshold)
- Velocidad del conductor en km/h
- Mapa con markers de conductores (pulse animation)

### Problemas:
- **Solo se ve un plan a la vez** — si hay 5 planes hoy, hay que navegar entre cada uno
- **No hay alertas** — si un conductor se desconecta, nadie se entera automaticamente
- **No hay vista "hoy"** — no existe un dashboard de operaciones del dia
- **No hay KPIs en tiempo real** — solo conteos estaticos en analytics
- **No se puede actuar** — no se puede reasignar paradas, contactar conductor, o notificar clientes desde la vista live
- **No hay feed de eventos** — no se ve cuando una parada se completa o falla en tiempo real
- `plan_stops` y `routes` **no tienen Realtime** — solo `driver_locations`

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

## KPI Bar (Header en Tiempo Real)

6 metricas que se actualizan cada 30 segundos:

| KPI | Calculo | Color |
|-----|---------|-------|
| **Conductores online** | drivers con location < 60s / total activos hoy | Verde si >80%, rojo si <50% |
| **Entregas completadas** | plan_stops completed / total hoy | Progreso |
| **Tasa on-time** | completadas dentro de time_window / total completadas | Verde >90%, amarillo >80%, rojo <80% |
| **Pendientes** | plan_stops pending hoy | Amarillo si muchas quedan |
| **Fallidas** | plan_stops incomplete + cancelled hoy | Rojo si >5% |
| **ETA cierre** | hora estimada de ultima entrega del dia | Info |

### RPC Function para KPIs live

```sql
create or replace function get_live_dashboard(p_org_id uuid, p_date date)
returns json as $$
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
      from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id and p.date = p_date and r.driver_id is not null
    ),
    'stops_total', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date
    ),
    'stops_completed', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date and ps.status = 'completed'
    ),
    'stops_failed', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date and ps.status in ('incomplete', 'cancelled')
    ),
    'stops_pending', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and p.date = p_date and ps.status = 'pending'
    )
  ) into result;
  return result;
end;
$$ language plpgsql security definer;
```

---

## Panel Izquierdo: Rutas Activas

### Datos por conductor/ruta

```typescript
interface LiveRoute {
  route_id: string
  plan_name: string
  driver: { id: string; name: string }
  vehicle: { name: string; plate: string }
  status: RouteStatus                       // not_started | in_transit | completed
  stops_total: number
  stops_completed: number
  stops_failed: number
  current_stop_index: number                // en cual parada va
  next_stop: { name: string; address: string; eta: string } | null
  estimated_completion: string              // hora estimada de fin de ruta
  location: { lat: number; lng: number; updated_at: string } | null
  is_online: boolean
  delays: number                            // paradas atrasadas
  alerts: LiveAlert[]
}
```

### Tarjeta de conductor

```
┌──────────────────────────────────────┐
│ 🟢 Juan Perez            en ruta     │
│ Furgon AB-1234 · Plan: Lunes AM     │
│                                      │
│ ████████████░░░░ 8/12 paradas        │
│ Completadas: 7  Fallida: 1           │
│                                      │
│ Siguiente: Av. Providencia 1234      │
│ ETA: ~11:45  (en 15 min)            │
│                                      │
│ ⚠ 1 parada atrasada                 │
│                                      │
│ [Ver ruta]  [Contactar]  [Reasignar] │
└──────────────────────────────────────┘
```

### Ordenamiento
- Primero: conductores con alertas (rojas primero)
- Segundo: en ruta, ordenados por % completado
- Tercero: no iniciadas
- Ultimo: completadas

### Filtros
- Buscar por nombre de conductor
- Filtrar: todos / en ruta / con problemas / offline / completados
- Filtrar por plan especifico

---

## Mapa Central

### Todos los conductores del dia en un mapa

Reutilizar y extender `RouteMap.tsx`:

- **Markers de conductores:** Avatar con color segun estado
  - Verde: en ruta, on-time
  - Amarillo: en ruta, atrasado
  - Rojo: offline o con alerta
  - Gris: no iniciado
  - Azul: completado
- **Rutas dibujadas:** Lineas de color por vehiculo (reusar ROUTE_COLORS)
- **Paradas:**
  - Circulo verde: completada
  - Circulo gris: pendiente
  - Circulo rojo: fallida
  - Circulo amarillo: atrasada (pasada de time_window)
- **Clustering:** Cuando hay muchos markers, agrupar automaticamente

### Interacciones del mapa

**Click en conductor:**
- Popup con: nombre, vehiculo, parada actual, ETA siguiente, velocidad
- Botones: "Ver ruta", "Contactar", "Centrar mapa"

**Click en parada:**
- Popup con: nombre, direccion, time window, status, conductor asignado
- Si completada: ver POD (foto, firma)
- Si fallida: ver razon
- Boton: "Reasignar a otro conductor"

**Click en ruta (linea):**
- Resaltar ruta completa
- Mostrar todas las paradas de esa ruta
- Dim el resto

---

## Sistema de Alertas

### Eventos que generan alertas

| Prioridad | Evento | Trigger | Auto-accion |
|-----------|--------|---------|-------------|
| 🔴 Alta | Conductor offline | Sin location > 5 min durante ruta activa | Toast + sonido |
| 🔴 Alta | Entrega fallida | plan_stop.status → incomplete/cancelled | Toast + log |
| 🔴 Alta | Vehiculo detenido | Velocidad 0 por > 15 min en ruta activa | Toast |
| 🟡 Media | Parada atrasada | ETA > time_window_end | Badge en tarjeta |
| 🟡 Media | Ruta no iniciada | Hora > vehicle.time_window_start + 30min y status = not_started | Toast |
| 🟡 Media | Bateria baja conductor | battery < 0.15 | Badge |
| 🟢 Info | Parada completada | plan_stop.status → completed | Feed silencioso |
| 🟢 Info | Ruta completada | Todas las paradas completadas | Feed + confetti? |
| 🟢 Info | Conductor inicio ruta | route.status → in_transit | Feed silencioso |

### Feed de alertas (panel derecho o inferior)

Lista cronologica de eventos del dia, filtrable por prioridad:

```
🔴 11:23 — Carlos R. offline hace 5 min (ultima pos: -33.42, -70.63)
           [Llamar] [Ver ultima posicion]

🟡 11:20 — Parada "Ñuñoa 234" atrasada 15 min (asignada a Maria S.)
           Ventana: 10:00-11:00 | ETA actual: 11:15
           [Notificar cliente] [Reasignar]

❌ 11:15 — Maria S. falló "Las Condes 890" — No hay nadie
           Intento #1 | [Reprogramar] [Reasignar]

✅ 11:10 — Juan P. completó "Av Italia 567"
           POD: foto ✓ firma ✓ | 2 min antes de ventana
```

### Implementacion: Supabase Realtime

Agregar subscriptions que hoy no existen:

```typescript
// Subscription a cambios de status de plan_stops (hoy)
supabase
  .channel('live-stops')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'plan_stops',
    filter: `org_id=eq.${orgId}`
  }, (payload) => {
    const { old: prev, new: curr } = payload
    if (prev.status !== curr.status) {
      addAlert({
        type: curr.status === 'completed' ? 'info' : 'error',
        message: `Parada ${curr.stop_id} cambio a ${curr.status}`,
        data: curr,
      })
    }
  })
  .subscribe()

// Subscription a cambios de status de routes
supabase
  .channel('live-routes')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'routes',
    filter: `org_id=eq.${orgId}`
  }, (payload) => {
    // Detectar inicio/fin de ruta
  })
  .subscribe()

// Driver locations (ya existe, extender para ALL drivers de hoy)
supabase
  .channel('live-drivers')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'driver_locations'
  }, (payload) => {
    updateDriverPosition(payload.new)
    checkOfflineDrivers()
    checkStationaryDrivers()
  })
  .subscribe()
```

### Deteccion de offline y estacionario

```typescript
// Correr cada 30 segundos
function checkDriverAlerts(drivers: LiveRoute[]) {
  const now = Date.now()
  
  for (const driver of drivers) {
    if (!driver.location || driver.status !== 'in_transit') continue
    
    const lastSeen = new Date(driver.location.updated_at).getTime()
    const minutesAgo = (now - lastSeen) / 60000

    // Offline: sin señal > 5 min
    if (minutesAgo > 5 && !driver.alerts.find(a => a.type === 'offline')) {
      addAlert({
        priority: 'high',
        type: 'offline',
        driverId: driver.driver.id,
        message: `${driver.driver.name} offline hace ${Math.round(minutesAgo)} min`,
      })
    }
  }
}
```

---

## Acciones del Dispatcher

### 1. Reasignar parada

Desde cualquier punto (tarjeta, mapa, alerta):

```
Click "Reasignar" en parada
     │
     ▼
Modal:
  ┌─────────────────────────────────┐
  │  Reasignar: Av. Providencia 123 │
  │                                 │
  │  Asignada a: Maria S. (Ruta 2) │
  │                                 │
  │  Reasignar a:                   │
  │  ○ Juan P. (3 paradas quedan)  │ ← mas cercano
  │  ○ Carlos R. (5 paradas quedan)│
  │  ○ Sin asignar                 │
  │                                 │
  │  ☑ Notificar al conductor      │
  │  ☑ Notificar al cliente        │
  │                                 │
  │  [Cancelar]  [Reasignar]       │
  └─────────────────────────────────┘
```

Accion:
- Mover plan_stop.route_id al nuevo route
- Push notification al conductor anterior ("Parada removida")
- Push notification al conductor nuevo ("Nueva parada agregada")
- Si checkbox: notificar al cliente con nuevo ETA
- Recalcular order_index en ambas rutas

### 2. Contactar conductor

```
Click "Contactar" en tarjeta de conductor
     │
     ▼
Opciones:
  [WhatsApp]  → Abre wa.me/{phone} en nueva pestaña
  [Llamar]    → tel:{phone}
  [Push]      → Enviar push notification custom
```

### 3. Broadcast a todos

Boton en header: "Enviar mensaje a todos los conductores activos"

```
┌─────────────────────────────────┐
│  Mensaje a conductores          │
│                                 │
│  Destinatarios: 8 en ruta       │
│                                 │
│  [________________________]     │
│  [________________________]     │
│                                 │
│  Via: ☑ Push  ☐ WhatsApp       │
│                                 │
│  [Cancelar]  [Enviar]          │
└─────────────────────────────────┘
```

### 4. Marcar incidente

Registrar un problema para tracking/reportes:

- Tipo: vehiculo averiado, accidente, clima, otro
- Conductor afectado
- Timestamp
- Notas
- Accion tomada (reasignacion, pausa, cancelacion)

---

## Sidebar en la App

### Nueva entrada en Sidebar

```
Sidebar:
  📅 Planner
  📍 Paradas
  🗺️ Rutas
  🚛 Vehiculos
  👤 Conductores
  📡 Control      ← NUEVO (icono: Radio/Tower/Monitor)
  📊 Analytics
```

Destacar con badge rojo si hay alertas activas.

---

## Realtime: Tablas a Subscribir

| Tabla | Evento | Que detecta |
|-------|--------|-------------|
| `driver_locations` | INSERT | Posicion de conductores |
| `plan_stops` | UPDATE | Cambio de status (completada, fallida, etc.) |
| `routes` | UPDATE | Inicio/fin de ruta |

```sql
-- Habilitar Realtime en tablas faltantes
alter publication supabase_realtime add table routes;
-- plan_stops ya esta habilitada (doc 03)
-- driver_locations ya esta habilitada (doc 02)
```

---

## Migracion SQL

```sql
-- 009_control_tower.sql

-- 1. RPC para dashboard live
create or replace function get_live_dashboard(p_org_id uuid, p_date date)
returns json as $$
declare result json;
begin
  select json_build_object(
    'drivers_online', (
      select count(distinct dl.driver_id)
      from driver_locations dl
      join drivers d on d.id = dl.driver_id
      where d.org_id = p_org_id and dl.recorded_at > now() - interval '60 seconds'
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
$$ language plpgsql security definer;

-- 2. RPC para cargar todas las rutas del dia con datos live
create or replace function get_live_routes(p_org_id uuid, p_date date)
returns json as $$
begin
  return (
    select json_agg(row_to_json(t))
    from (
      select
        r.id as route_id,
        r.status as route_status,
        r.total_distance_km,
        r.total_duration_minutes,
        p.name as plan_name,
        p.date as plan_date,
        json_build_object('id', d.id, 'name', d.first_name || ' ' || d.last_name, 'phone', d.phone) as driver,
        json_build_object('id', v.id, 'name', v.name, 'plate', v.license_plate) as vehicle,
        (select count(*) from plan_stops ps where ps.route_id = r.id) as stops_total,
        (select count(*) from plan_stops ps where ps.route_id = r.id and ps.status = 'completed') as stops_completed,
        (select count(*) from plan_stops ps where ps.route_id = r.id and ps.status in ('incomplete', 'cancelled')) as stops_failed,
        (select json_build_object('lat', dl.lat, 'lng', dl.lng, 'speed', dl.speed, 'battery', dl.battery, 'recorded_at', dl.recorded_at)
         from driver_locations dl where dl.driver_id = d.id order by dl.recorded_at desc limit 1
        ) as last_location
      from routes r
      join plans p on r.plan_id = p.id
      left join drivers d on r.driver_id = d.id
      left join vehicles v on r.vehicle_id = v.id
      where r.org_id = p_org_id and p.date = p_date
      order by r.status = 'in_transit' desc, r.status = 'not_started' desc
    ) t
  );
end;
$$ language plpgsql security definer;

-- 3. Tabla de incidentes operacionales
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

-- 4. Habilitar Realtime en routes (faltaba)
alter publication supabase_realtime add table routes;
```

---

## Preguntas Abiertas

1. **Pagina dedicada `/control` o reemplazar PlannerPage?**
   - **Recomendacion:** Pagina dedicada. El planner es para planificar (futuro), el control es para operar (hoy). Funciones distintas.

2. **Sonido en alertas criticas?**
   - Un beep sutil cuando hay alerta roja mejora la reaccion
   - **Recomendacion:** Si, con toggle para silenciar. Usar Web Audio API.

3. **Auto-refresh de KPIs: polling o Realtime?**
   - Polling cada 30s con `get_live_dashboard()` es mas simple y predecible
   - Realtime para eventos individuales (parada completada, conductor offline)
   - **Recomendacion:** Hibrido. KPIs por polling, eventos por Realtime.

4. **Tabla de incidentes o solo alertas en memoria?**
   - Si se quiere reportar despues ("cuantas veces se averiaron vehiculos este mes"), necesita tabla
   - **Recomendacion:** Tabla `operational_incidents` para historial, alertas in-memory para UX

---

## Definicion de Done

### Dashboard Base
- Nueva pagina `/control` con acceso desde sidebar
- Mapa con TODOS los conductores del dia en vivo
- KPI bar con 6 metricas actualizandose cada 30s
- Panel izquierdo con lista de rutas/conductores activos
- Ordenamiento por prioridad (alertas primero)

### Realtime
- Subscription a `driver_locations` (todos los conductores del dia)
- Subscription a `plan_stops` (cambios de status)
- Subscription a `routes` (inicio/fin de ruta)
- Posiciones de conductores actualizandose en mapa en vivo

### Alertas
- Deteccion de conductor offline (>5 min sin señal)
- Deteccion de parada fallida
- Deteccion de ruta no iniciada a tiempo
- Feed cronologico de eventos
- Badge en sidebar cuando hay alertas activas

### Acciones
- Reasignar parada a otro conductor (con notificacion)
- Contactar conductor (WhatsApp / llamada / push)
- Broadcast a todos los conductores
- Registrar incidente operacional

### Interaccion Mapa
- Click en conductor → popup con info + acciones
- Click en parada → popup con status + POD si completada
- Click en ruta → resaltar ruta completa
- Color coding por estado (verde/amarillo/rojo/gris)
