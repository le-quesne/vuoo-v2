# PRD 25 — Multi-Depot (depósitos múltiples por organización)

**Pri**: P1
**Cruza con**: PRD 01 (Flota), PRD 09 (Pedidos), PRD 19 (Vroom Avanzada),
PRD 20 (Analytics), PRD 22 §A (Territorios)
**Estado**: Hoy el sistema asume **un único depot implícito** por
organización. Sin migración explícita no escala a clientes con > 1 hub
físico (que son la mayoría del mid-market).

---

## Contexto

Actualmente vuoo trata cada organización como si operara desde un solo
punto de origen. La realidad de los clientes objetivo (retail mid-market,
3PL, last-mile multi-ciudad):

- **Renner Chile**: bodega central Santiago + sub-hubs regionales (Concepción, Antofagasta).
- **Retail nacional**: 1 CD por región + dark stores urbanos.
- **3PL**: warehouses propios + warehouses de clientes (cross-dock).
- **Quick commerce**: dark stores hiperlocales (1 por barrio).

Sin multi-depot:
- No podemos modelar "esta orden sale del CD norte" vs "de la dark store de Palermo".
- Vroom asume un único `start`/`end` por vehículo (lo hardcodeamos).
- Dispatcher no puede ver/operar "su" depot sin ver los demás.
- Analytics no permite comparar performance entre depots.
- Inter-depot transfers (mover stock de A a B con un vehículo propio) no existen.

Esto bloquea ventas mid-market y enterprise. Está marcado como
*"feature de optimización"* en PRD 19 pero en realidad es **una
primitiva de plataforma**.

---

## Objetivos

1. Modelar `depot` como entidad de primera clase: ubicación física,
   horarios, capacidad, ownership.
2. Asignar drivers, vehicles, orders, stops a un depot.
3. Permisos por depot (dispatcher regional ve solo su depot;
   admin ve todos).
4. Optimización multi-depot: Vroom decide qué depot sirve qué stop
   con qué vehículo.
5. Inter-depot transfers como tipo especial de ruta.
6. Analytics segmentables por depot.

---

## Scope IN

### §A — Data model

**Tabla nueva `depots`:**

```sql
create table public.depots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,                       -- "CD Norte", "Dark Store Palermo"
  code text,                                -- código corto interno: "CDN", "PAL"
  type text not null default 'warehouse' check (
    type in ('warehouse','dark_store','cross_dock','customer_site','virtual')
  ),
  address text not null,
  lat numeric not null,
  lng numeric not null,
  timezone text default 'America/Santiago',
  open_time time,                           -- horario de operación
  close_time time,
  capacity_orders_day int,                  -- throughput orientativo
  capacity_storage jsonb,                   -- {pallets: 200, m3: 500, kg: 50000}
  is_default boolean default false,         -- el default histórico de la org
  is_active boolean default true,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (org_id, name)
);
create index on public.depots (org_id, is_active);

-- Solo un depot por org puede ser default
create unique index one_default_per_org
  on public.depots (org_id) where is_default = true;
```

**Relaciones agregadas a entidades existentes:**

```sql
-- Vehicles: parquean en un depot por defecto (pueden cambiar día a día)
alter table public.vehicles add column home_depot_id uuid references public.depots(id);

-- Drivers: asignación primaria (sin restricción dura — pueden trabajar desde otro)
alter table public.drivers add column home_depot_id uuid references public.depots(id);

-- Orders: depot de origen donde está el stock / arranca la ruta
alter table public.orders add column origin_depot_id uuid references public.depots(id);

-- Routes: depot de salida + depot de retorno (pueden ser distintos para transfers)
alter table public.routes add column start_depot_id uuid references public.depots(id);
alter table public.routes add column end_depot_id uuid references public.depots(id);

-- Plans: si scope='depot', el plan opera un solo depot; si 'org', planifica multi
alter table public.plans add column scope text default 'depot'
  check (scope in ('depot','org'));
alter table public.plans add column primary_depot_id uuid references public.depots(id);

-- Stops: derivado de origin_depot_id de la order, pero overridable
alter table public.stops add column origin_depot_id uuid references public.depots(id);
```

**Migración de datos existentes:**

```sql
-- 1. Crear depot 'Default' por org existente con coords de la primera ruta
do $$
declare r record;
begin
  for r in select id from organizations loop
    insert into depots (org_id, name, code, type, address, lat, lng, is_default)
    select r.id, 'Default', 'DEFAULT', 'warehouse',
           coalesce((select address from stops where org_id = r.id limit 1), 'Sin dirección'),
           coalesce((select lat from stops where org_id = r.id limit 1), -33.45),
           coalesce((select lng from stops where org_id = r.id limit 1), -70.66),
           true;
  end loop;
end $$;

-- 2. Backfill home_depot_id en vehicles/drivers/orders con el default de la org
update vehicles v set home_depot_id = (
  select id from depots d where d.org_id = v.org_id and d.is_default
) where home_depot_id is null;
-- (idem drivers, orders.origin_depot_id, routes.start_depot_id, etc.)
```

### §B — RLS por depot

```sql
-- Tabla de asignación usuario↔depot (un user puede operar varios depots)
create table public.user_depot_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  depot_id uuid not null references public.depots(id) on delete cascade,
  role text not null check (role in ('dispatcher','viewer','manager')),
  primary key (user_id, depot_id)
);

-- Helper
create or replace function public.user_can_access_depot(d_id uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from user_depot_access
    where user_id = auth.uid() and depot_id = d_id
  ) or public.is_org_admin();   -- admins ven todos
$$;

-- Aplicar a tablas operativas (ejemplo stops)
create policy "stops by depot access" on public.stops
  for select using (
    public.user_can_access_depot(origin_depot_id) or public.is_org_admin()
  );
```

**Reglas:**
- `admin` / `owner` siempre ven todos los depots de su org.
- `dispatcher` por defecto ve solo los depots con acceso explícito en
  `user_depot_access`.
- `driver` ve su `home_depot_id` + cualquier ruta asignada.

### §C — UI — selector de depot global

Topbar global con **DepotSwitcher**:
- Default = `is_default` o último depot usado.
- Multi-select para roles que ven varios.
- Persistido en URL query (`?depot=xxx`) y localStorage.
- Filtro global: TODAS las páginas (Planner, Stops, Orders, Drivers, Vehicles, Control, Analytics) respetan el depot seleccionado.

Modo "All depots" (solo admin/manager) muestra agregado.

### §D — Vroom multi-depot

Extiende PRD 19 §E con detalle:

**Caso 1 — Plan por depot (default):**
- `plan.scope = 'depot'`, todos los vehículos arrancan/terminan en `primary_depot_id`.
- Vroom request: `vehicle.start = vehicle.end = depot.coords` por todos los vehículos.

**Caso 2 — Plan multi-depot (org-wide):**
- `plan.scope = 'org'`, vehículos pueden tener distintos start/end depots.
- Vroom decide qué depot sirve qué stop si la order no tiene `origin_depot_id` forzado.
- Si `order.origin_depot_id` está seteado, es hard constraint.

**Caso 3 — Mid-route reload:**
- Vehículo vuelve a recargar a un depot intermedio cuando se queda sin capacity.
- Vroom `vehicle_steps` con waypoints de tipo "break" o custom depot stop.
- Útil para flotas de quick commerce con vehículos chicos.

### §E — Inter-depot transfers

Tipo especial de ruta: mover stock de depot A → depot B sin clientes
finales en el medio (o con clientes finales mezclados).

- `route.type = 'transfer'`
- `route.start_depot_id ≠ route.end_depot_id`
- Stops del transfer son los SKUs/lotes a mover (no clientes finales).
- Trigger: dispatcher genera "transfer order" → genera ruta de transferencia.
- Use cases: rebalanceo de stock entre dark stores, abastecimiento de hub regional desde CD central.

### §F — Analytics por depot

Extender PRD 20:
- Filtro depot en TODOS los dashboards (OTIF, costo, scorecards).
- Vista comparativa cross-depot ("OTIF de CD Norte vs CD Sur últimos 30 días").
- Heatmap: stops por depot por hora del día.
- Throughput vs capacity declarada (alerta si > 90% sostenido).

### §G — Onboarding flow

Cuando una org crea su primer depot adicional (más allá del Default):
1. Modal "¿Querés migrar a multi-depot?".
2. Wizard:
   - Renombrar el "Default" a algo significativo (ej. "Santiago Central").
   - Crear el nuevo (form con address geocoding + horarios).
   - Asignar vehículos y drivers existentes (default: quedan en el primero).
   - Asignar dispatchers a sus depots correspondientes.
3. Documentación inline + tooltip "qué cambia en mi operación".

---

## Scope OUT

- **Multi-org** (operar 2 orgs distintas con un usuario): no es multi-depot, es multi-tenant cross-org. Fuera.
- **Inventory management completo** por depot (stock levels, replenishment automático): es WMS, no TMS. Fuera v1 — solo modelamos *qué orders están en qué depot*, no SKU-level stock.
- **Routing inter-modal** (transfer A→B por barco/camión externo + entrega last-mile B→cliente con vuoo): fuera. Solo manejamos transfers con flota propia.

---

## Plan de implementación

### Fase 1 — Data model + backfill (1 semana)
- Migración SQL (§A) en branch + dry run en staging Supabase.
- Backfill de Default depot por org existente.
- Tests RLS sobre el helper `user_can_access_depot`.

### Fase 2 — UI básica (1 semana)
- `/settings/depots` — CRUD de depots.
- `DepotSwitcher` en topbar.
- Filtro depot en Planner, Stops, Orders, Drivers, Vehicles, Control.
- Backfill vehículos/drivers/orders con default depot.

### Fase 3 — Vroom multi-depot (1 semana)
- Adapter Vroom: leer `plan.scope`, `primary_depot_id`, generar request multi-depot.
- Toggle en `VroomWizardModal`: "Plan single-depot / multi-depot".
- Caso de mid-route reload (P2, no bloquea fase 3).

### Fase 4 — Inter-depot transfers (1 semana)
- Tipo `transfer` en routes.
- UI para generar transfer manualmente.
- Vista de transfers en `/control` (separada de rutas a clientes).

### Fase 5 — Analytics por depot (1 semana, paralelizable con fase 4)
- Filtro depot en dashboards de PRD 20.
- Vista comparativa cross-depot.

---

## Criterios de éxito

- 0 regresiones para orgs single-depot (Default funciona idéntico a hoy).
- 1+ cliente piloto operando 2+ depots dentro de 30 días post-deploy.
- Dispatchers de un depot ven exclusivamente su scope (validado con RLS tests).
- Vroom multi-depot reduce km/parada vs single-depot equivalente en >10% en data de test.
- Inter-depot transfers operables sin código custom.

---

## Dependencias

- PRD 19 §E (multi-depot en Vroom) → este PRD lo absorbe y lo expande;
  PRD 19 queda con la lógica pura del solver.
- PRD 18 §B (RLS hardening) → este PRD agrega RLS por depot al modelo.
- PRD 22 §A (Territorios) → territorios pueden combinarse con depots
  (territorio = zona geográfica, depot = origen físico de la ruta).
  No bloquea, pero pensarlos juntos a futuro.

---

## Riesgos

1. **Migración de datos** — orgs en producción pueden romper si el
   backfill falla parcialmente. Mitigación: feature flag `multi_depot_enabled`
   por org, migrar en lote controlado.
2. **Complejidad UX explota** — DepotSwitcher mal diseñado confunde a
   dispatchers que antes veían "todo". Mitigación: default a "All depots"
   para roles que no tienen restricción, opt-in al filtro.
3. **RLS performance** — JOIN con `user_depot_access` en cada query.
   Mitigación: índice + caché del set de depots accesibles en JWT claim
   custom si llega a ser problema.
4. **Vroom multi-depot puede dar soluciones inesperadas** — humano espera
   "todos salen de CD Norte" pero solver propone usar CD Sur para una
   parada al sur. Mitigación: explicación visible de la decisión + pin
   manual de origen por orden si se quiere forzar.

---

## Relación con PRD 19

PRD 19 queda con:
- Time-windows duras
- Capacity multi-dimensional
- Skills matching
- Pickup + delivery
- Balanceo entre vehículos
- Plantillas recurrentes
- Preview diff
- Lock de stops manuales

PRD 25 (este) absorbe:
- Modelo de datos de depot
- Multi-depot Vroom (con detalle full acá)
- Mid-route reload
- Inter-depot transfers
- RLS y UI por depot

Cross-ref: §D de este PRD usa los wizards y options de PRD 19.
