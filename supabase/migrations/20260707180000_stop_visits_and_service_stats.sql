-- =============================================
-- PRD 26 — Fase 3: dwell time real vía geofence
-- =============================================
--
-- Instrumenta la operación real: captura cuánto tiempo pasa realmente un
-- camión detenido en cada stop (usando los pings ya existentes de
-- `driver_locations`, ver `mobile/src/lib/location.ts`), agrega esa señal
-- por cliente, y computa afinidad histórica de qué clientes suelen
-- compartir ruta (Fase 4 — insumo de la matriz de costo ponderada).
--
-- Ver docs/26_OPTIMIZACION_PONDERADA_Y_APRENDIZAJE_HISTORICO.md.

-- ---------------------------------------------
-- 1. stop_visits — un registro por (stop, route) con dwell real
-- ---------------------------------------------
create table stop_visits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  stop_id        uuid not null references stops(id) on delete cascade,
  customer_id    uuid references customers(id) on delete set null,
  driver_id      uuid references drivers(id) on delete set null,
  route_id       uuid not null references routes(id) on delete cascade,
  arrived_at     timestamptz not null,
  departed_at    timestamptz not null,
  dwell_seconds  integer not null check (dwell_seconds >= 0),
  radius_m       numeric not null,
  source         text not null default 'geofence_auto'
                   check (source in ('geofence_auto', 'manual')),
  created_at     timestamptz not null default now(),
  constraint stop_visits_route_stop_unique unique (route_id, stop_id),
  constraint stop_visits_departed_after_arrived check (departed_at >= arrived_at)
);

create index idx_stop_visits_org_customer
  on stop_visits(org_id, customer_id) where customer_id is not null;
create index idx_stop_visits_stop
  on stop_visits(stop_id);

alter table stop_visits enable row level security;

create policy "Org members can view stop visits"
  on stop_visits for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Sin policy de insert/update para usuarios: solo lo escribe
-- `compute_stop_visits_for_route` (security definer, ver abajo).

-- ---------------------------------------------
-- 2. customer_service_stats — agregado por cliente
-- ---------------------------------------------
create table customer_service_stats (
  org_id                uuid not null references organizations(id) on delete cascade,
  customer_id           uuid not null references customers(id) on delete cascade,
  n_samples             integer not null default 0,
  mean_dwell_seconds     numeric,
  median_dwell_seconds   numeric,
  stddev_dwell_seconds   numeric,
  updated_at            timestamptz not null default now(),
  primary key (org_id, customer_id)
);

alter table customer_service_stats enable row level security;

create policy "Org members can view customer service stats"
  on customer_service_stats for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- ---------------------------------------------
-- 3. customer_pair_affinity — Fase 4: co-ocurrencia histórica de clientes
--    en una misma ruta completada. Explícitamente NO por conductor — es
--    patrón agregado de la operación (decisión de producto, ver PRD 26).
-- ---------------------------------------------
create table customer_pair_affinity (
  org_id                uuid not null references organizations(id) on delete cascade,
  customer_id_a         uuid not null references customers(id) on delete cascade,
  customer_id_b         uuid not null references customers(id) on delete cascade,
  co_occurrence_count   integer not null default 0,
  updated_at            timestamptz not null default now(),
  primary key (org_id, customer_id_a, customer_id_b),
  constraint customer_pair_affinity_ordered check (customer_id_a < customer_id_b)
);

create index idx_customer_pair_affinity_a on customer_pair_affinity(org_id, customer_id_a);
create index idx_customer_pair_affinity_b on customer_pair_affinity(org_id, customer_id_b);

alter table customer_pair_affinity enable row level security;

create policy "Org members can view customer pair affinity"
  on customer_pair_affinity for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- ---------------------------------------------
-- 4. routes — watermark para no reprocesar la misma ruta dos veces
-- ---------------------------------------------
alter table routes
  add column if not exists visits_computed_at timestamptz;

create index if not exists idx_routes_visits_pending
  on routes(status) where status = 'completed' and visits_computed_at is null;

comment on table stop_visits is
  'Visita real a un stop, derivada de driver_locations por geofence. Fuente de dwell time real para PRD 26.';
comment on table customer_service_stats is
  'Agregado de dwell time real por cliente. Consumido por backend-railway/src/routes/vroom.ts con gate de confianza (n_samples + coeficiente de variación).';
comment on table customer_pair_affinity is
  'Co-ocurrencia histórica de clientes en la misma ruta completada (sin importar conductor). Insumo del sesgo histórico de la matriz de costo (PRD 26 Fase 4).';
comment on column routes.visits_computed_at is
  'Watermark: cuándo se procesó esta ruta completada para extraer stop_visits. NULL = pendiente de procesar por el cron nocturno.';
