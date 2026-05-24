# PRD 20 — Analytics Operacionales (OTIF, Costo, Performance)

**Pri**: P1
**Extiende**: PRD 05 — Analytics & Reportes
**Estado**: Dashboards básicos (entregas, flota, summary). Faltan métricas
estándar de industry y exports.

---

## Contexto

PRD 05 entregó analytics básicos. Para que un comprador retail decida pasar
a producción, necesita los KPIs estándar de industria (OTIF, costo por
entrega, scorecards) **además** de exports a CSV/PDF que pueda llevarse a
sus reportes internos.

---

## Objetivos

1. Dashboard OTIF (On-Time In-Full) por ruta, chofer, cliente, período.
2. Costo por entrega calculado (no estimado a ojo).
3. Comparativo Planned vs Actual de cada ruta cerrada.
4. Scorecard por conductor (entregas a tiempo, fallos, tiempo en parada).
5. Análisis address-level: qué direcciones consistentemente fallan.
6. Exports CSV/PDF y charts interactivos.

---

## Scope IN

### A. OTIF (On-Time In-Full)
- **On-time**: stop completado dentro de su time-window (si existe) o
  dentro de ETA ± buffer (default 15min).
- **In-full**: orden entregada sin items faltantes ni rechazos parciales.
- Vista cruzada: OTIF % por
  - chofer (ranking)
  - cliente (lista)
  - período (línea de tiempo semanal/mensual)
  - ruta (drill-down)
- Definición de "on-time" configurable por org.

### B. Costo por entrega
- Inputs:
  - Costo combustible: precio_litro × (distancia / km_litro_vehículo).
  - Costo tiempo: tarifa_hora × duración_ruta.
  - Costo driver pay: tarifa fija por ruta o por stop.
- Catálogo de costos por vehículo (combustible, km/L, mantenimiento).
- Catálogo de costos por chofer (tarifa hora o tarifa por entrega).
- Output: $/stop, $/ruta, $/cliente.
- Útil para pricing del cliente final y rentabilidad real.

### C. Planned vs Actual
- Para cada ruta cerrada:
  - Distancia planificada vs real (GPS aggregate).
  - Tiempo planificado vs real.
  - Stops completados / planificados.
  - Causas de desviación (geocoding off, traffic, service time over).
- Trend mensual para detectar deterioro.

### D. Driver scorecards
- Por chofer:
  - Stops completados (vs planificados).
  - On-time % (OTIF parte 1).
  - Tiempo medio en parada.
  - Tasa de fallos por categoría.
  - Distancia / día.
  - NPS recibido (cruce con PRD 13 surveys).
- Ranking visible al dispatcher (opcional: visible al chofer en mobile).

### E. Address-level analysis
- Direcciones con > 3 fallos en 90 días → flag en planner.
- Causas más frecuentes por dirección.
- Sugerencia: "esta dirección requiere PIN" / "intentar después de 14:00".

### F. Exports
- CSV: cada dashboard exportable.
- PDF: reporte ejecutivo mensual auto-generable (logo org, KPIs, charts).
- Email scheduled: PDF mensual al admin de la org.

### G. Charts interactivos
- Migrar de progress bars a charts (recharts o tremor):
  - Línea: OTIF trend
  - Barras: cost breakdown
  - Heatmap: stops por hora/día semana
  - Mapa de calor: zonas con más fallos
- Tooltip con drill-down.

### H. Cohort analysis (futuro inmediato)
- Cohorts por mes de onboarding del cliente.
- Retención de uso, evolución de KPIs.

---

## Scope OUT

- Forecasting / ML de demanda → PRD 23 (agentes IA).
- Benchmarking inter-org (privacy/contractual hard) → fuera.
- Exports custom builder (drag-drop) → fuera v1.

---

## Esquema técnico

### Tablas / vistas
```sql
-- Vista materializada para acelerar OTIF
create materialized view mv_otif_daily as
select
  s.org_id,
  date_trunc('day', s.completed_at) as day,
  s.driver_id,
  s.customer_id,
  count(*) filter (where s.status = 'completed') as total_completed,
  count(*) filter (
    where s.status = 'completed'
    and s.completed_at <= s.eta + interval '15 minutes'
  ) as on_time,
  count(*) filter (where s.status = 'failed') as failed
from stops s
group by 1,2,3,4;

create index on mv_otif_daily(org_id, day);

-- Catálogo costo
alter table vehicles add column fuel_price_per_liter numeric;
alter table vehicles add column km_per_liter numeric;
alter table drivers add column hourly_rate numeric;
alter table drivers add column rate_per_stop numeric;

create table cost_reports (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references routes(id),
  fuel_cost numeric,
  time_cost numeric,
  driver_cost numeric,
  total_cost numeric,
  cost_per_stop numeric,
  computed_at timestamptz default now()
);
```

### Backend
- `backend-railway/src/jobs/refresh-otif-mv.ts` (cron nightly).
- `backend-railway/src/api/v1/analytics/` con endpoints OTIF, costo, etc.

### Frontend
- `src/presentation/features/analytics/components/`:
  - `OTIFDashboard.tsx`
  - `CostDashboard.tsx`
  - `PlannedVsActualReport.tsx`
  - `DriverScorecard.tsx`
  - `AddressIssuesTable.tsx`

---

## Criterios de éxito

- OTIF dashboard live con < 5s load en datasets de 10K stops.
- Cost report cuadra con valores manuales del cliente piloto ± 5%.
- 1+ cliente piloto exporta PDF mensual y lo manda a su jefe interno.
- 30%+ de los planners usan address-level analysis al menos 1x/semana.

---

## Dependencias

- Datos de GPS aggregate ya disponibles (Torre de Control activa).
- PRD 13 ideal para cruzar NPS en scorecards.
- PRD 19 ideal para definir "on-time" con time-windows duras.
