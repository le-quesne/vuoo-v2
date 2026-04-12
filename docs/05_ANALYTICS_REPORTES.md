# 05 - Analytics y Reportes

> **Objetivo:** Transformar los datos operacionales que ya se generan (rutas, entregas, GPS, feedback) en metricas accionables para que la org tome mejores decisiones.
>
> **Depende de:** 01 (conductores), 02 (ejecucion/GPS/POD), 03 (feedback/notificaciones)

---

## Estado Actual

### Lo que existe en AnalyticsPage:
- **6 cards de conteo** (planes, paradas, completadas, canceladas, vehiculos, rutas)
- **1 barra de distribucion** de paradas por status (Tailwind, sin libreria de charts)
- **18 items en sidebar**, de los cuales **16 son "Proximamente"**
- Toda la data se carga client-side (fetch all plan_stops → filter en JS) — no escala

### Datos disponibles en DB que NO se usan:
- `route.total_distance_km` y `total_duration_minutes` (solo visibles en PlanDetail)
- `vehicle.price_per_km`, `price_per_hour`, `avg_consumption` (nunca se calculan costos)
- `vehicle.capacity_weight_kg` vs `stop.weight_kg` (capacidad usada nunca se calcula)
- `plan_stop.report_time` (hora real de entrega vs ventana horaria)
- `plan_stop.cancellation_reason` (nunca se agrega)
- `plan_stop.delivery_attempts` (nunca se muestra)
- `driver_locations.speed`, `recorded_at` (solo se usa en vista "En Vivo")
- `delivery_feedback.rating` (existe tabla pero no se muestra en analytics)

### Problemas actuales:
- Sin libreria de charts (todo es barras CSS con Tailwind)
- Agregaciones client-side: `allStops.filter(s => s.status === 'completed').length`
- Sin RPC functions para analytics (solo existen las admin)
- Sin filtros de fecha, conductor, vehiculo, ruta

---

## Libreria de Charts

### Recharts (recomendada)

```
npm install recharts
```

- Basada en React + D3
- Declarativa (JSX components)
- Buena documentacion, amplia comunidad
- Soporta: BarChart, LineChart, AreaChart, PieChart, RadialBar, Tooltip, Legend
- Responsive por defecto
- Peso: ~200KB (acceptable para dashboard)

**Alternativas consideradas:**
- `visx` — mas bajo nivel, mas control, pero mas codigo
- `chart.js` + `react-chartjs-2` — bueno pero menos "React-native"
- `nivo` — hermoso pero pesado

---

## Nueva Arquitectura de Datos

### Mover agregaciones al servidor con RPC Functions

En vez de fetch all → filter client-side, crear funciones Postgres que retornen datos pre-agregados.

```sql
-- RPC: Resumen general de la org (con filtro de fechas)
create or replace function get_analytics_summary(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns json as $$
declare
  result json;
begin
  select json_build_object(
    'total_plans', (
      select count(*) from plans 
      where org_id = p_org_id 
        and (p_from is null or date >= p_from)
        and (p_to is null or date <= p_to)
    ),
    'total_routes', (
      select count(*) from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_stops', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_completed', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'completed'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_cancelled', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'cancelled'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_incomplete', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'incomplete'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_distance_km', (
      select coalesce(sum(r.total_distance_km), 0) from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_duration_min', (
      select coalesce(sum(r.total_duration_minutes), 0) from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_vehicles', (select count(*) from vehicles where org_id = p_org_id),
    'total_drivers', (select count(*) from drivers where org_id = p_org_id and status = 'active')
  ) into result;
  return result;
end;
$$ language plpgsql security definer;
```

```sql
-- RPC: Tendencia diaria (para line/area chart)
create or replace function get_daily_trend(
  p_org_id uuid,
  p_from date,
  p_to date
)
returns table(
  day date,
  total_stops bigint,
  completed bigint,
  cancelled bigint,
  incomplete bigint,
  distance_km numeric,
  duration_min numeric
) as $$
begin
  return query
  select
    p.date as day,
    count(ps.id) as total_stops,
    count(ps.id) filter (where ps.status = 'completed') as completed,
    count(ps.id) filter (where ps.status = 'cancelled') as cancelled,
    count(ps.id) filter (where ps.status = 'incomplete') as incomplete,
    coalesce(sum(distinct r.total_distance_km), 0) as distance_km,
    coalesce(sum(distinct r.total_duration_minutes), 0) as duration_min
  from plans p
  left join plan_stops ps on ps.plan_id = p.id
  left join routes r on ps.route_id = r.id
  where p.org_id = p_org_id
    and p.date between p_from and p_to
  group by p.date
  order by p.date;
end;
$$ language plpgsql security definer;
```

```sql
-- RPC: Performance por conductor
create or replace function get_driver_performance(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns table(
  driver_id uuid,
  driver_name text,
  total_stops bigint,
  completed bigint,
  cancelled bigint,
  incomplete bigint,
  success_rate numeric,
  avg_rating numeric,
  total_distance_km numeric,
  total_feedback bigint
) as $$
begin
  return query
  select
    d.id as driver_id,
    d.first_name || ' ' || d.last_name as driver_name,
    count(ps.id) as total_stops,
    count(ps.id) filter (where ps.status = 'completed') as completed,
    count(ps.id) filter (where ps.status = 'cancelled') as cancelled,
    count(ps.id) filter (where ps.status = 'incomplete') as incomplete,
    case when count(ps.id) > 0 
      then round(100.0 * count(ps.id) filter (where ps.status = 'completed') / count(ps.id), 1) 
      else 0 
    end as success_rate,
    (select round(avg(df.rating), 1) from delivery_feedback df 
     where df.driver_id = d.id
       and (p_from is null or df.submitted_at >= p_from)
       and (p_to is null or df.submitted_at <= p_to + interval '1 day')
    ) as avg_rating,
    coalesce(sum(distinct r.total_distance_km), 0) as total_distance_km,
    (select count(*) from delivery_feedback df where df.driver_id = d.id) as total_feedback
  from drivers d
  left join routes r on r.driver_id = d.id
    and (p_from is null or exists (select 1 from plans p where p.id = r.plan_id and p.date >= p_from))
    and (p_to is null or exists (select 1 from plans p where p.id = r.plan_id and p.date <= p_to))
  left join plan_stops ps on ps.route_id = r.id
  where d.org_id = p_org_id
    and d.status = 'active'
  group by d.id, d.first_name, d.last_name
  order by completed desc;
end;
$$ language plpgsql security definer;
```

```sql
-- RPC: Motivos de cancelacion
create or replace function get_cancellation_reasons(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns table(
  reason text,
  count bigint,
  percentage numeric
) as $$
declare
  total bigint;
begin
  select count(*) into total from plan_stops ps
  join plans p on ps.plan_id = p.id
  where ps.org_id = p_org_id 
    and ps.status in ('cancelled', 'incomplete')
    and (p_from is null or p.date >= p_from)
    and (p_to is null or p.date <= p_to);

  return query
  select
    coalesce(ps.cancellation_reason, 'Sin motivo especificado') as reason,
    count(*) as count,
    case when total > 0 then round(100.0 * count(*) / total, 1) else 0 end as percentage
  from plan_stops ps
  join plans p on ps.plan_id = p.id
  where ps.org_id = p_org_id
    and ps.status in ('cancelled', 'incomplete')
    and (p_from is null or p.date >= p_from)
    and (p_to is null or p.date <= p_to)
  group by ps.cancellation_reason
  order by count desc;
end;
$$ language plpgsql security definer;
```

---

## Secciones del Dashboard

### Rediseño de la sidebar

Simplificar de 18 items a **6 secciones claras**:

```
Analytics
├── Resumen              ← KPIs principales + tendencia
├── Entregas             ← Paradas por status, motivos cancelacion, intentos
├── Conductores          ← Ranking, performance, satisfaccion
├── Flota                ← Uso vehiculos, costos, combustible
├── Clientes             ← NPS, ratings, feedback
└── Operacional          ← Distancia, duracion, on-time, horarios
```

---

### 1. Resumen (Dashboard Principal)

**Filtro global:** Rango de fechas (hoy, esta semana, este mes, custom)

**KPI Cards (fila superior):**

| KPI | Valor | Delta |
|-----|-------|-------|
| Entregas completadas | 847 | +12% vs periodo anterior |
| Tasa de exito | 94.2% | +1.3% |
| Distancia total | 3,420 km | -5% |
| Tiempo promedio/entrega | 8.2 min | -0.4 min |
| NPS | 72 | +3 |
| Costo estimado | $1,245,000 CLP | -8% |

**Charts:**
- **Line chart:** Tendencia diaria de entregas (completadas vs total) — `get_daily_trend()`
- **Stacked bar:** Distribucion de status por dia (completed, cancelled, incomplete, pending)
- **Metric comparison:** Periodo actual vs anterior (porcentaje de cambio)

---

### 2. Entregas

**Cards:**
- Total paradas | Completadas | Canceladas | Incompletas | Pendientes

**Charts:**
- **Pie chart:** Distribucion de status (con porcentajes)
- **Bar chart horizontal:** Top 10 motivos de cancelacion — `get_cancellation_reasons()`
- **Line chart:** Intentos de entrega promedio por dia
- **Heatmap (futuro):** Entregas por hora del dia × dia de la semana

**Tabla:**
- Paradas con mas intentos fallidos (nombre, direccion, intentos, ultimo motivo)

---

### 3. Conductores

**Tabla ranking:**

| # | Conductor | Entregas | Exito | Rating | Distancia | Feedback |
|---|-----------|----------|-------|--------|-----------|----------|
| 1 | Juan P. | 234 | 97.4% | 4.8 | 1,204 km | 45 |
| 2 | Maria S. | 198 | 95.2% | 4.6 | 987 km | 38 |

Datos de `get_driver_performance()`

**Charts:**
- **Bar chart:** Entregas por conductor (completadas vs fallidas)
- **Radar chart (futuro):** Performance multi-dimension (velocidad, exito, rating, puntualidad)

**Detalle por conductor (click en fila):**
- Tendencia diaria de entregas
- Rating promedio a lo largo del tiempo
- Ultimos comentarios de clientes
- Horas activas (de GPS data)

---

### 4. Flota

**Cards:**
- Vehiculos activos | Distancia total | Costo estimado combustible | Capacidad promedio usada

**Calculo de costos:**
```
Costo por ruta = (distance_km × vehicle.price_per_km) 
               + (duration_hours × vehicle.price_per_hour)

Costo combustible = (distance_km / 100) × vehicle.avg_consumption × precio_litro
```

`precio_litro` configurable por org (o hardcoded inicialmente).

**Charts:**
- **Bar chart:** Distancia por vehiculo
- **Bar chart:** Costo estimado por vehiculo
- **Stacked bar:** Capacidad peso usada vs disponible por vehiculo

**Tabla:**
| Vehiculo | Matricula | Rutas | Distancia | Costo/km | Costo total | Capacidad usada |
|----------|-----------|-------|-----------|----------|-------------|-----------------|

---

### 5. Clientes (Satisfaccion)

**Cards:**
- NPS Score | Rating promedio | Total encuestas | Tasa de respuesta

**Calculo NPS:**
```
Promotores = ratings 5 (en escala 1-5, equivale a 9-10 en NPS clasico)
Detractores = ratings 1-3
NPS = % promotores - % detractores
```

**Charts:**
- **Bar chart:** Distribucion de ratings (1-5 estrellas)
- **Line chart:** NPS trend por semana/mes
- **Bar chart:** Rating promedio por conductor

**Lista:**
- Ultimos feedbacks con rating, comentario, conductor, fecha
- Filtrar por rating (solo negativos, solo positivos)

---

### 6. Operacional

**Cards:**
- Distancia total | Duracion total | Paradas/ruta promedio | Tiempo/parada promedio

**OTIF (On-Time In-Full):**
```
On-Time = report_time <= time_window_end
In-Full = status = 'completed'
OTIF = % de paradas que son on-time AND completed
```

**Charts:**
- **Line chart:** Distancia total por dia
- **Line chart:** Duracion total por dia
- **Bar chart:** Distribucion de entregas por hora del dia
- **Line chart:** OTIF trend (si hay time_window data)

---

## Export de Reportes

### CSV Export
Cada seccion tiene boton "Exportar CSV" que descarga los datos de la tabla/chart visible.

### PDF Export (P2)
Reporte completo con charts renderizados como imagenes. Usar `html2canvas` + `jspdf` o similar.
Dejarlo para despues — CSV es suficiente para V1.

---

## Filtros Globales

Componente `DateRangeFilter` en el header del analytics:

```
[Hoy] [Esta semana] [Este mes] [Ultimo mes] [Custom: desde ___ hasta ___]
```

- Persiste seleccion en URL params (`?from=2026-04-01&to=2026-04-11`)
- Todos los charts y cards reaccionan al cambio
- Comparacion vs periodo anterior se calcula automaticamente (ej: si filtro es "este mes", compara vs mes anterior)

### Filtros adicionales por seccion:
- **Conductores:** filtrar por conductor especifico
- **Flota:** filtrar por vehiculo especifico
- **Entregas:** filtrar por status

---

## Migracion SQL

```sql
-- 007_analytics_functions.sql

-- 1. Resumen general
create or replace function get_analytics_summary(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns json as $$
declare result json;
begin
  select json_build_object(
    'total_plans', (select count(*) from plans where org_id = p_org_id and (p_from is null or date >= p_from) and (p_to is null or date <= p_to)),
    'total_routes', (select count(*) from routes r join plans p on r.plan_id = p.id where r.org_id = p_org_id and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'total_stops', (select count(*) from plan_stops ps join plans p on ps.plan_id = p.id where ps.org_id = p_org_id and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'stops_completed', (select count(*) from plan_stops ps join plans p on ps.plan_id = p.id where ps.org_id = p_org_id and ps.status = 'completed' and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'stops_cancelled', (select count(*) from plan_stops ps join plans p on ps.plan_id = p.id where ps.org_id = p_org_id and ps.status = 'cancelled' and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'stops_incomplete', (select count(*) from plan_stops ps join plans p on ps.plan_id = p.id where ps.org_id = p_org_id and ps.status = 'incomplete' and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'total_distance_km', (select coalesce(sum(r.total_distance_km), 0) from routes r join plans p on r.plan_id = p.id where r.org_id = p_org_id and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'total_duration_min', (select coalesce(sum(r.total_duration_minutes), 0) from routes r join plans p on r.plan_id = p.id where r.org_id = p_org_id and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)),
    'total_vehicles', (select count(*) from vehicles where org_id = p_org_id),
    'total_drivers', (select count(*) from drivers where org_id = p_org_id and status = 'active'),
    'avg_rating', (select round(avg(rating), 1) from delivery_feedback where org_id = p_org_id and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'total_feedback', (select count(*) from delivery_feedback where org_id = p_org_id and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day'))
  ) into result;
  return result;
end;
$$ language plpgsql security definer;

-- 2. Tendencia diaria
create or replace function get_daily_trend(
  p_org_id uuid, p_from date, p_to date
)
returns table(day date, total_stops bigint, completed bigint, cancelled bigint, incomplete bigint, distance_km numeric, duration_min numeric)
as $$
begin
  return query
  select p.date, count(ps.id),
    count(ps.id) filter (where ps.status = 'completed'),
    count(ps.id) filter (where ps.status = 'cancelled'),
    count(ps.id) filter (where ps.status = 'incomplete'),
    coalesce(sum(distinct r.total_distance_km), 0),
    coalesce(sum(distinct r.total_duration_minutes), 0)
  from plans p
  left join plan_stops ps on ps.plan_id = p.id
  left join routes r on ps.route_id = r.id
  where p.org_id = p_org_id and p.date between p_from and p_to
  group by p.date order by p.date;
end;
$$ language plpgsql security definer;

-- 3. Performance por conductor
create or replace function get_driver_performance(
  p_org_id uuid, p_from date default null, p_to date default null
)
returns table(driver_id uuid, driver_name text, total_stops bigint, completed bigint, cancelled bigint, incomplete bigint, success_rate numeric, avg_rating numeric, total_distance_km numeric, total_feedback bigint)
as $$
begin
  return query
  select d.id, d.first_name || ' ' || d.last_name,
    count(ps.id),
    count(ps.id) filter (where ps.status = 'completed'),
    count(ps.id) filter (where ps.status = 'cancelled'),
    count(ps.id) filter (where ps.status = 'incomplete'),
    case when count(ps.id) > 0 then round(100.0 * count(ps.id) filter (where ps.status = 'completed') / count(ps.id), 1) else 0 end,
    (select round(avg(df.rating), 1) from delivery_feedback df where df.driver_id = d.id and (p_from is null or df.submitted_at >= p_from) and (p_to is null or df.submitted_at <= p_to + interval '1 day')),
    coalesce(sum(distinct r.total_distance_km), 0),
    (select count(*) from delivery_feedback df where df.driver_id = d.id)
  from drivers d
  left join routes r on r.driver_id = d.id and r.org_id = p_org_id
  left join plan_stops ps on ps.route_id = r.id
  where d.org_id = p_org_id and d.status = 'active'
  group by d.id, d.first_name, d.last_name
  order by count(ps.id) filter (where ps.status = 'completed') desc;
end;
$$ language plpgsql security definer;

-- 4. Motivos de cancelacion
create or replace function get_cancellation_reasons(
  p_org_id uuid, p_from date default null, p_to date default null
)
returns table(reason text, count bigint, percentage numeric)
as $$
declare total bigint;
begin
  select count(*) into total from plan_stops ps join plans p on ps.plan_id = p.id
  where ps.org_id = p_org_id and ps.status in ('cancelled', 'incomplete')
    and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to);
  return query
  select coalesce(ps.cancellation_reason, 'Sin motivo') as reason, count(*),
    case when total > 0 then round(100.0 * count(*) / total, 1) else 0 end
  from plan_stops ps join plans p on ps.plan_id = p.id
  where ps.org_id = p_org_id and ps.status in ('cancelled', 'incomplete')
    and (p_from is null or p.date >= p_from) and (p_to is null or p.date <= p_to)
  group by ps.cancellation_reason order by count desc;
end;
$$ language plpgsql security definer;

-- 5. Satisfaccion / feedback
create or replace function get_feedback_summary(
  p_org_id uuid, p_from date default null, p_to date default null
)
returns json as $$
declare result json;
begin
  select json_build_object(
    'avg_rating', (select round(avg(rating), 1) from delivery_feedback where org_id = p_org_id and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'total_responses', (select count(*) from delivery_feedback where org_id = p_org_id and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'rating_1', (select count(*) from delivery_feedback where org_id = p_org_id and rating = 1 and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'rating_2', (select count(*) from delivery_feedback where org_id = p_org_id and rating = 2 and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'rating_3', (select count(*) from delivery_feedback where org_id = p_org_id and rating = 3 and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'rating_4', (select count(*) from delivery_feedback where org_id = p_org_id and rating = 4 and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'rating_5', (select count(*) from delivery_feedback where org_id = p_org_id and rating = 5 and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')),
    'nps', (select 
      round(100.0 * count(*) filter (where rating = 5) / nullif(count(*), 0), 0) -
      round(100.0 * count(*) filter (where rating <= 3) / nullif(count(*), 0), 0)
      from delivery_feedback where org_id = p_org_id
      and (p_from is null or submitted_at >= p_from) and (p_to is null or submitted_at <= p_to + interval '1 day')
    )
  ) into result;
  return result;
end;
$$ language plpgsql security definer;
```

---

## Preguntas Abiertas

1. **Recharts u otra libreria?**
   - Recharts es la mas pragmatica para React
   - Si se necesita algo mas visual en el futuro, migrar a Nivo no es traumatico
   - **Recomendacion:** Recharts

2. **Costo de combustible: hardcoded o configurable?**
   - Podria ser un campo en org_notification_settings o una tabla nueva
   - **Recomendacion:** Campo en organizations (fuel_price_per_liter), hardcoded a $1,200 CLP inicialmente

3. **Periodo de comparacion: automatico o seleccionable?**
   - **Recomendacion:** Automatico (periodo anterior del mismo largo), con opcion de desactivar

4. **OTIF requiere time_window en las paradas — muchas no lo tienen**
   - Solo calcular OTIF para paradas que tengan time_window definido
   - Mostrar "N/A" si no hay suficiente data

---

## Definicion de Done

### Infraestructura
- Recharts instalado y funcionando
- RPC functions desplegadas (summary, daily_trend, driver_performance, cancellation_reasons, feedback_summary)
- Filtro de fechas global funcional

### Seccion Resumen
- 6 KPI cards con delta vs periodo anterior
- Line chart de tendencia diaria
- Stacked bar de distribucion de status

### Seccion Entregas
- Cards de conteo por status
- Pie chart distribucion
- Bar chart motivos de cancelacion
- Tabla de paradas con mas intentos fallidos

### Seccion Conductores
- Tabla ranking con entregas, exito, rating, distancia
- Bar chart entregas por conductor
- Detalle al hacer click en conductor

### Seccion Flota
- Cards de vehiculos activos, distancia, costo
- Bar chart distancia por vehiculo
- Calculo de costos estimados

### Seccion Clientes
- NPS score, rating promedio, total encuestas
- Bar chart distribucion de ratings
- Lista de ultimos feedbacks

### Seccion Operacional
- Distancia y duracion total
- Promedios por ruta y por parada
- OTIF (si hay data de time_windows)

### Export
- CSV export funcional en cada seccion
