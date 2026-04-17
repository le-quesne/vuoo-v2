-- =============================================
-- Operational Incidents (Incidentes Operacionales)
-- =============================================
--
-- Fase 3 del PRD 08 (Torre de Control): persiste los incidentes
-- operacionales que el dispatcher registra durante la ejecucion
-- de rutas (vehiculo averiado, accidente, clima adverso, driver
-- desconectado, problema con cliente, etc.).
--
-- Se asocia opcionalmente a una ruta y/o driver para poder:
--   - Mostrar historial por ruta/driver desde la torre de control.
--   - Generar reportes y KPIs de incidencias a nivel organizacion.
--   - Trazar que accion se tomo (action_taken) y si ya se resolvio.
--
-- RLS: solo miembros de la organizacion (via user_org_ids())
-- pueden ver y gestionar sus propios incidentes (patron heredado
-- de migration 001_multi_tenant).

create table operational_incidents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  route_id     uuid references routes(id) on delete set null,
  driver_id    uuid references drivers(id) on delete set null,
  type         text not null check (type in ('vehicle_breakdown', 'accident', 'weather', 'driver_offline', 'customer_issue', 'other')),
  description  text,
  action_taken text,
  resolved     boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index idx_incidents_org_created on operational_incidents(org_id, created_at desc);
create index idx_incidents_route on operational_incidents(route_id);
create index idx_incidents_driver on operational_incidents(driver_id);

alter table operational_incidents enable row level security;

create policy "Org members manage incidents"
  on operational_incidents for all
  using (org_id in (select user_org_ids()))
  with check (org_id in (select user_org_ids()));

comment on table operational_incidents is
  'Incidentes operacionales registrados durante la ejecucion de rutas (Torre de Control).';
