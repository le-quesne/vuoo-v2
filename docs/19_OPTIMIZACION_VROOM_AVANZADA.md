# PRD 19 — Optimización Vroom Avanzada

**Pri**: P1
**Extiende**: PRD 06 — Optimización Inteligente
**Estado**: Vroom + OSRM en Railway operativos. `VroomWizardModal`
expone parámetros básicos. Features avanzadas de Vroom sub-utilizadas.

---

## Contexto

Vroom ya soporta nativamente:
- **Time windows** (duras y blandas)
- **Capacity** multi-dimensional (peso + volumen + bultos)
- **Skills** matching (refrigerado, certificación)
- **Pickup + delivery** mezclados
- **Multi-depot** con retorno a base
- **Vehicle priority** y costos asimétricos

Pero el `VroomWizardModal` actual solo expone una fracción mínima. Esto es
trabajo que **ya pagamos en infra** y no estamos sacando provecho.

---

## Objetivos

1. UI expone todas las restricciones que Vroom soporta de forma usable.
2. Plantillas de rutas recurrentes para operaciones repetitivas.
3. Preview comparativo (plan actual vs optimizado) antes de aplicar.
4. Calidad de optimización medible (KPI vs solución manual).

---

## Scope IN

### A. Time windows duras
- UI: por stop, slot `[from, to]` editable.
- Backend: pasar a Vroom como `time_windows` array.
- Hard constraint: si infactible, Vroom devuelve `unassigned`; mostrar al
  user con razón.
- Casos: VTEX SLA, hospital-pharmacy windows, B2B receiving hours.

### B. Capacity multi-dimensional
- Configuración por vehículo: peso (kg), volumen (m³), bultos (count).
- Por orden: `weight`, `volume`, `pieces`.
- Validar capacity al asignar manual también (no solo al optimizar).
- UI: barra de llenado por vehículo en planner.

### C. Skills matching
- Catálogo de skills configurable por org:
  `refrigerated`, `frozen`, `hazmat`, `medical`, `bilingual`, etc.
- Drivers + Vehículos tienen `skills[]`; orders tienen `required_skills[]`.
- Vroom rechaza asignación si no match.

### D. Pickup + delivery en misma ruta
- Tipo de stop: `pickup` o `delivery`.
- Pickup debe preceder al delivery del mismo `shipment_id`.
- Vroom maneja como par.
- UI: vincular pickup-delivery al crear orden.

### E. Multi-depot → **extraído a [[PRD 25]]**
Multi-depot pasa a ser un PRD propio porque toca data model, RLS, UI y
analytics — no es solo Vroom. Este PRD 19 se queda con la lógica del
solver multi-depot (cómo construir la request Vroom con N depots,
mid-route reload con `vehicle_steps`) y delega el modelo de datos y UX
a PRD 25.

### F. Balanceo entre vehículos
- Modo: `workload` (igualar n stops), `distance` (igualar km), `cost`
  (igualar costo). Default workload.
- Vroom: ajustar `objective` y `cost_per_km`/`cost_per_hour` por vehículo.

### G. Plantillas de rutas recurrentes
- Tabla `route_templates(id, org_id, name, schedule_pattern, vehicles_config, stops_config)`.
- "Lunes: 3 vehículos refrigerados, cobertura zona norte, 8am–3pm."
- Aplicar template a un día genera plan pre-poblado para optimizar/ajustar.

### H. Preview diff antes de aplicar
- "Optimizar" → muestra plan propuesto vs plan actual.
- Diff: stops movidos entre rutas, cambios de orden, vehículos
  añadidos/quitados.
- KPIs comparativos: distancia total, tiempo total, on-time score.
- Botón "Aplicar" o "Descartar".

### I. Lock de stops manuales
- Stop con flag `pinned=true` no se mueve en re-optimización.
- Útil para asignaciones críticas (cliente VIP siempre con chofer X).

---

## Scope OUT

- Algoritmos custom propios (mantener Vroom como engine).
- Optimización multi-día (semana completa) → fase 2 cuando haya demanda.
- ML para predecir service time por dirección → datos insuficientes hoy.

---

## Esquema técnico

### Tablas
```sql
alter table vehicles add column capacity_weight_kg numeric;
alter table vehicles add column capacity_volume_m3 numeric;
alter table vehicles add column capacity_pieces int;
alter table vehicles add column skills text[];
alter table vehicles add column depot_id uuid references depots(id);

alter table drivers add column skills text[];

alter table orders add column weight_kg numeric;
alter table orders add column volume_m3 numeric;
alter table orders add column pieces int;
alter table orders add column required_skills text[];
alter table orders add column time_window_from time;
alter table orders add column time_window_to time;
alter table orders add column shipment_id uuid; -- pickup-delivery pairing

alter table stops add column pinned boolean default false;
alter table stops add column service_type text check (service_type in ('delivery','pickup'));

create table depots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  lat numeric not null,
  lng numeric not null,
  open_time time,
  close_time time,
  capacity jsonb -- stock disponible
);

create table route_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  name text not null,
  schedule_pattern jsonb, -- {weekdays: [1,3,5], time: '08:00'}
  vehicles_config jsonb,
  default_skills text[],
  created_at timestamptz default now()
);
```

### Backend Vroom
- `backend-railway/src/vroom/request-builder.ts` que mappea entidades Vuoo
  → Vroom request.
- Tests por feature: time-windows, capacity, skills, pickup+delivery,
  multi-depot.

### Frontend
- `src/presentation/features/planner/components/VroomWizardModal/` con
  steps:
  1. Vehículos (capacity + skills + depot)
  2. Constraints (time-windows, pickup+delivery)
  3. Objetivo (balance mode)
  4. Preview diff
  5. Aplicar

---

## Criterios de éxito

- Optimización con time-windows + capacity reduce reasignaciones manuales
  > 30% vs hoy.
- Tiempo de optimización p95 < 30s para 200 stops, 10 vehículos.
- Preview diff usado en > 50% de las optimizaciones (vs aplicar ciego).
- 1+ cliente piloto usando plantillas recurrentes en 60 días.

---

## Dependencias

- OSRM matriz precomputada para zona Chile/Argentina/México (ya activo).
- PRD 13 puede ser pre-requisito si time-windows duras se sincronizan con
  notificaciones al cliente.

---

## Riesgos

- Capacity infactible (cargas que no entran) → mejor UX de warning antes
  de pedir optimización.
- Multi-depot complica la mental model del dispatcher → escalonar release.
