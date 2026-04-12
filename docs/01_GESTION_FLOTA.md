# 01 - Gestion de Flota: Conductores + Vehiculos

> **Objetivo:** Separar "Conductor" de "Vehiculo" y crear la base de datos necesaria para todo lo que viene despues (app movil, tracking, POD, notificaciones).
>
> **Por que primero:** Sin conductores como entidad, no se puede asignar rutas a personas reales, no se puede tener app movil, no se puede trackear, no se puede medir performance.

---

## Estado Actual

### Lo que existe:

- **Vehicle** con: name, license_plate, brand, model, capacity_weight_kg, capacity_volume_m3, price_per_km, price_per_hour, fuel_type, avg_consumption, time_window_start/end
- **Route** referencia `vehicle_id` directamente
- **VehiclesPage** con CRUD basico (crear + listar, sin editar ni eliminar)
- La sidebar dice "Drivers" pero en realidad muestra vehiculos

### Lo que falta:

- No existe entidad "Conductor/Driver"
- No hay forma de asignar un conductor a un vehiculo o ruta
- No hay perfiles de conductor (telefono, licencia, disponibilidad)
- No hay concepto de "turno" o "disponibilidad"
- No hay tracking de documentos (vencimiento licencia, seguros)

---

## Schema Propuesto

### Nueva tabla: `drivers`

```sql
create table drivers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,  -- opcional: si el conductor tiene cuenta
  
  -- Datos personales
  first_name    text not null,
  last_name     text not null,
  phone         text,
  email         text,
  avatar_url    text,
  
  -- Documentos
  license_number    text,
  license_expiry    date,
  national_id       text,           -- RUT en Chile
  
  -- Operacional
  status            text not null default 'active',  -- active, inactive, on_leave
  default_vehicle_id uuid references vehicles(id) on delete set null,
  
  -- Disponibilidad
  time_window_start time,           -- hora inicio turno default
  time_window_end   time,           -- hora fin turno default
  working_days      integer[] default '{1,2,3,4,5}',  -- 0=dom, 1=lun, ... 6=sab
  
  -- Metadata
  notes         text,
  created_at    timestamptz not null default now()
);
```

### Modificar tabla: `routes`

```sql
-- Agregar referencia a conductor
alter table routes add column driver_id uuid references drivers(id) on delete set null;
```

### RLS policies para `drivers`

```sql
-- Misma logica que vehicles: visible y editable por miembros de la org
alter table drivers enable row level security;

create policy "Org members can view drivers"
  on drivers for select using (org_id in (select user_org_ids()));

create policy "Org members can manage drivers"
  on drivers for all using (org_id in (select user_org_ids()));
```

---

## TypeScript Types

```typescript
export type DriverStatus = 'active' | 'inactive' | 'on_leave'

export interface Driver {
  id: string
  org_id: string
  user_id: string | null
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  avatar_url: string | null
  license_number: string | null
  license_expiry: string | null
  national_id: string | null
  status: DriverStatus
  default_vehicle_id: string | null
  time_window_start: string | null
  time_window_end: string | null
  working_days: number[]
  notes: string | null
  created_at: string
}
```

---

## Cambios en la UI

### VehiclesPage → se mantiene para vehiculos

- Agregar editar y eliminar vehiculo (hoy no existe)
- Remover label "Drivers" de la sidebar

### Nueva: DriversPage (`/drivers`)

- **Tabla de conductores** con: avatar, nombre completo, telefono, vehiculo asignado, status, licencia vencimiento
- **Crear conductor** (modal):
  - first_name, last_name (required)
  - phone, email
  - license_number, license_expiry, national_id
  - default_vehicle_id (dropdown de vehiculos)
  - time_window_start/end
  - working_days (checkboxes lun-dom)
- **Editar conductor** (modal)
- **Eliminar conductor** (con confirmacion)
- **Indicador visual** de documentos por vencer (licencia < 30 dias = amarillo, vencida = rojo)
- **Busqueda** por nombre

### Cambios en PlanDetailPage

- Al agregar vehiculo a un plan, mostrar tambien el conductor asignado
- Dropdown de conductor al crear/editar ruta
- Mostrar nombre del conductor en la tarjeta de cada ruta

### Cambios en Sidebar

- Icono de Truck → "Vehiculos"
- Nuevo icono Users → "Conductores"

---

## Flujo de Asignacion

```
1. Admin crea Vehiculo (capacidad, matricula, tipo combustible)
2. Admin crea Conductor (nombre, telefono, licencia, vehiculo default)
3. Al crear Plan del dia:
   a. Agrega vehiculos al plan → se crean Routes
   b. Cada Route puede tener vehicle_id + driver_id
   c. Si vehiculo tiene default driver, se auto-sugiere
4. Conductor ve su ruta asignada en app movil (futuro)
```

---

## Migracion SQL

```sql
-- 003_add_drivers.sql

-- 1. Crear tabla drivers
create table drivers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete set null,
  first_name        text not null,
  last_name         text not null,
  phone             text,
  email             text,
  avatar_url        text,
  license_number    text,
  license_expiry    date,
  national_id       text,
  status            text not null default 'active',
  default_vehicle_id uuid references vehicles(id) on delete set null,
  time_window_start time,
  time_window_end   time,
  working_days      integer[] default '{1,2,3,4,5}',
  notes             text,
  created_at        timestamptz not null default now()
);

-- 2. Agregar driver_id a routes
alter table routes add column driver_id uuid references drivers(id) on delete set null;

-- 3. Indices
create index idx_drivers_org_id on drivers(org_id);
create index idx_routes_driver_id on routes(driver_id);

-- 4. RLS
alter table drivers enable row level security;

create policy "Org members can view drivers"
  on drivers for select using (org_id in (select user_org_ids()));

create policy "Org admins can insert drivers"
  on drivers for insert with check (org_id in (select user_org_ids()));

create policy "Org admins can update drivers"
  on drivers for update using (org_id in (select user_org_ids()));

create policy "Org admins can delete drivers"
  on drivers for delete using (org_id in (select user_org_ids()));
```

---

## Preguntas Abiertas

1. **Conductor como usuario de la plataforma?**
  - Opcion A: Conductor tiene cuenta Supabase Auth (puede loguearse en app movil)
  - Opcion B: Conductor es solo un registro, la app movil usa un token/link de invitacion
  - **Recomendacion:** Opcion A para el futuro (app movil con login), pero el campo `user_id` es nullable por ahora
2. **Multiples conductores por vehiculo?**
  - El schema soporta `default_vehicle_id` en driver (muchos conductores pueden tener el mismo vehiculo default)
  - La asignacion real es por ruta (`routes.driver_id`), asi que cada dia puede ser distinto
  - **No se necesita tabla intermedia** por ahora
3. **Disponibilidad avanzada (vacaciones, licencias medicas)?**
  - Por ahora `status: on_leave` es suficiente
  - Una tabla `driver_availability` con rangos de fecha seria P2
  - **Recomendacion:** Dejarlo simple, iterar despues
4. **Documentos adicionales (seguros, certificaciones)?**
  - Por ahora solo `license_number` + `license_expiry`
  - Una tabla `driver_documents` con tipo/archivo/vencimiento seria P2
  - **Recomendacion:** Dejarlo simple, los campos en la tabla bastan por ahora

---

## Definicion de Done

- Migracion SQL aplicada en Supabase
- Types actualizados en `database.ts`
- DriversPage con CRUD completo (crear, listar, editar, eliminar)
- VehiclesPage con editar/eliminar (hoy falta)
- PlanDetailPage muestra conductor asignado a cada ruta
- Sidebar actualizada con iconos separados para Vehiculos y Conductores
- Indicador visual de documentos por vencer

