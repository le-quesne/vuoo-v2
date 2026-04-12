# 06 - Optimizacion Inteligente de Rutas

> **Objetivo:** Pasar de un TSP basico (reordenar paradas) a un optimizador real que respete constraints (capacidad, ventanas horarias, multiples vehiculos) y distribuya paradas de forma inteligente.
>
> **Depende de:** 01 (conductores con disponibilidad), datos existentes de vehiculos (capacidad, time windows) y paradas (weight, time windows)

---

## Estado Actual

### Lo que existe:
- **Mapbox Optimization API** para TSP (reordenar paradas en una ruta)
- **Mapbox Directions API** para calcular distancia/duracion real entre puntos
- Boton "Optimizar ruta" en PlanDetailPage
- Resultado muestra: distancia/tiempo ahorrado (% y absoluto)
- Se persiste: `order_index`, `total_distance_km`, `total_duration_minutes`

### Lo que hace la optimizacion actual:
1. Toma TODAS las paradas (asignadas + sin asignar)
2. Llama a Mapbox Optimization API (TSP puro)
3. Recibe orden optimo
4. Asigna TODAS las paradas sin asignar al **primer vehiculo**
5. Actualiza `order_index` de cada parada
6. Actualiza distancia/duracion de la ruta

### Lo que NO hace:
- No respeta time windows (ni del vehiculo, ni de la parada)
- No respeta capacidad del vehiculo (peso, volumen)
- No distribuye paradas entre multiples vehiculos
- No considera duracion de servicio por parada
- No tiene limite de paradas (Mapbox falla silenciosamente con >25 coords)
- No balancea carga entre vehiculos
- No considera punto de inicio/fin por vehiculo
- No valida nada — podria generar rutas imposibles

---

## Niveles de Mejora

### Nivel 1: Constraints Basicos (sobre Mapbox actual)
Validar constraints ANTES y DESPUES de la optimizacion, sin cambiar el solver.

### Nivel 2: Distribucion Multi-Vehiculo
Asignar paradas a vehiculos de forma inteligente antes del TSP.

### Nivel 3: Solver Avanzado (reemplazar Mapbox Optimization)
Usar un solver VRP real que maneje constraints nativamente.

---

## Nivel 1: Constraints Basicos

### 1.1 Validacion de capacidad

Antes de optimizar, verificar que la ruta no excede la capacidad del vehiculo.

```typescript
interface CapacityCheck {
  vehicle: Vehicle
  stops: PlanStopWithStop[]
  totalWeight: number
  maxWeight: number
  overweight: boolean
  totalVolume: number
  maxVolume: number
  overvolume: boolean
}

function checkRouteCapacity(vehicle: Vehicle, stops: PlanStopWithStop[]): CapacityCheck {
  const totalWeight = stops.reduce((sum, ps) => sum + (ps.stop.weight_kg ?? 0), 0)
  const totalVolume = stops.reduce((sum, ps) => sum + (ps.stop.volume_m3 ?? 0), 0)
  return {
    vehicle,
    stops,
    totalWeight,
    maxWeight: vehicle.capacity_weight_kg,
    overweight: totalWeight > vehicle.capacity_weight_kg,
    totalVolume,
    maxVolume: vehicle.capacity_volume_m3 ?? Infinity,
    overvolume: vehicle.capacity_volume_m3 ? totalVolume > vehicle.capacity_volume_m3 : false,
  }
}
```

**UI:** Mostrar barra de capacidad en cada ruta (verde < 80%, amarillo 80-100%, rojo > 100%). Warning si esta sobre capacidad antes de optimizar.

### 1.2 Validacion de time windows

Despues de optimizar, verificar que el orden resultante respeta las ventanas horarias.

```typescript
interface TimeWindowViolation {
  stopName: string
  windowStart: string
  windowEnd: string
  estimatedArrival: string
  minutesEarly: number   // negativo si llega antes de la ventana
  minutesLate: number    // positivo si llega despues de la ventana
}

function checkTimeWindows(
  routeStartTime: string,           // ej: "08:00"
  stops: PlanStopWithStop[],
  legDurations: number[]            // duracion en segundos entre cada par de paradas
): TimeWindowViolation[] {
  const violations: TimeWindowViolation[] = []
  let currentTime = parseTime(routeStartTime)

  for (let i = 0; i < stops.length; i++) {
    if (i > 0) currentTime += legDurations[i - 1]  // tiempo de viaje
    
    const stop = stops[i].stop
    if (stop.time_window_start || stop.time_window_end) {
      const windowStart = stop.time_window_start ? parseTime(stop.time_window_start) : 0
      const windowEnd = stop.time_window_end ? parseTime(stop.time_window_end) : Infinity

      if (currentTime < windowStart) {
        // Llega antes — debe esperar (no es violacion grave, pero suma idle time)
        currentTime = windowStart
      }
      if (currentTime > windowEnd) {
        violations.push({
          stopName: stop.name,
          windowStart: stop.time_window_start!,
          windowEnd: stop.time_window_end!,
          estimatedArrival: formatTime(currentTime),
          minutesEarly: 0,
          minutesLate: Math.round((currentTime - windowEnd) / 60),
        })
      }
    }
    currentTime += (stop.duration_minutes ?? 0) * 60  // tiempo de servicio
  }
  return violations
}
```

**UI:** Despues de optimizar, si hay violaciones:
- Warning amarillo: "3 paradas llegan fuera de ventana horaria"
- Lista de violaciones con detalle
- Opcion de aplicar igual o cancelar

### 1.3 Limite de paradas por request

Mapbox Optimization API soporta max 25 coordenadas. Si hay mas:

```typescript
if (coords.length > 25) {
  // Dividir en clusters geograficos de max 24 stops + depot
  // Optimizar cada cluster por separado
  // O mostrar warning al usuario
}
```

**V1:** Mostrar warning si >25 paradas. El usuario debe dividir manualmente en rutas.
**V2:** Auto-clustering (ver Nivel 2).

---

## Nivel 2: Distribucion Multi-Vehiculo

### Problema
Hoy, las paradas sin asignar van TODAS al primer vehiculo. No hay logica para distribuirlas entre multiples vehiculos.

### Algoritmo de Asignacion (Clustering + Constraints)

```
Input:
  - N paradas sin asignar (con coords, weight, time_window)
  - M vehiculos disponibles (con capacity, time_window)

Paso 1: Filtrar vehiculos disponibles
  - Solo vehiculos con ruta en este plan
  - Verificar que el vehiculo tiene capacidad remanente

Paso 2: Clustering geografico
  - K-means o DBSCAN con K = numero de vehiculos
  - Semilla de cada cluster = posicion inicial del vehiculo (depot)
  - Resultado: cada parada asignada a un cluster/vehiculo

Paso 3: Verificar constraints por cluster
  - Peso total del cluster <= capacidad del vehiculo
  - Si excede: mover paradas al cluster mas cercano con capacidad
  - Verificar time windows (si todas las paradas del cluster caen dentro de la ventana del vehiculo)

Paso 4: Optimizar cada cluster (TSP)
  - Llamar Mapbox Optimization por cada vehiculo/cluster
  - Max 25 paradas por cluster (ya dividido)

Paso 5: Persistir
  - Asignar route_id + vehicle_id a cada plan_stop
  - Actualizar order_index
  - Actualizar total_distance_km y total_duration_minutes por ruta
```

### Implementacion del clustering

Sin libreria externa, un k-means simple en JS:

```typescript
function assignStopsToVehicles(
  stops: PlanStopWithStop[],
  routes: RouteWithVehicle[]
): Map<string, PlanStopWithStop[]> {
  const assignments = new Map<string, PlanStopWithStop[]>()
  
  // Inicializar con paradas ya asignadas
  for (const route of routes) {
    assignments.set(route.id, route.planStops ?? [])
  }

  // Para cada parada sin asignar, encontrar el vehiculo mas cercano con capacidad
  for (const ps of stops) {
    if (!ps.stop.lat || !ps.stop.lng) continue
    
    let bestRoute: string | null = null
    let bestDistance = Infinity

    for (const route of routes) {
      // Verificar capacidad
      const currentStops = assignments.get(route.id) ?? []
      const currentWeight = currentStops.reduce((s, p) => s + (p.stop.weight_kg ?? 0), 0)
      const stopWeight = ps.stop.weight_kg ?? 0
      
      if (route.vehicle && currentWeight + stopWeight > route.vehicle.capacity_weight_kg) {
        continue // no cabe
      }

      // Verificar max 24 stops (Mapbox limit)
      if (currentStops.length >= 24) continue

      // Calcular distancia al centroide del cluster
      const centroid = getCentroid(currentStops)
      const dist = haversine(ps.stop.lat, ps.stop.lng, centroid.lat, centroid.lng)
      
      if (dist < bestDistance) {
        bestDistance = dist
        bestRoute = route.id
      }
    }

    if (bestRoute) {
      assignments.get(bestRoute)!.push(ps)
    }
  }

  return assignments
}
```

### UI del flujo multi-vehiculo

```
Boton "Optimizar Plan" (no "Optimizar Ruta")
  │
  ▼
Modal de pre-optimizacion:
  ┌─────────────────────────────────────────┐
  │  Optimizar Plan: Lunes 14 Abril         │
  │                                         │
  │  Vehiculos: 3                           │
  │  Paradas totales: 42                    │
  │  Paradas sin asignar: 15               │
  │                                         │
  │  ☑ Distribuir paradas sin asignar       │
  │  ☑ Respetar capacidad de vehiculos      │
  │  ☑ Verificar ventanas horarias          │
  │  ☐ Balancear carga entre vehiculos      │
  │                                         │
  │  [Cancelar]  [Optimizar]               │
  └─────────────────────────────────────────┘
  │
  ▼
Resultado:
  ┌─────────────────────────────────────────┐
  │  Optimizacion completada                │
  │                                         │
  │  Vehiculo 1 (Furgon AB-1234):          │
  │    14 paradas | 45.2 km | 2h 15min     │
  │    Capacidad: 85% (425/500 kg)         │
  │                                         │
  │  Vehiculo 2 (Camioneta CD-5678):       │
  │    16 paradas | 38.7 km | 1h 50min     │
  │    Capacidad: 72% (360/500 kg)         │
  │                                         │
  │  Vehiculo 3 (Van EF-9012):             │
  │    12 paradas | 52.1 km | 2h 30min     │
  │    Capacidad: 91% (273/300 kg)         │
  │                                         │
  │  ⚠ 2 paradas llegan fuera de ventana   │
  │    → Av. Italia (llega 11:45, cierra   │
  │      11:30)                             │
  │    → Ñuñoa 234 (llega 14:10, cierra    │
  │      14:00)                             │
  │                                         │
  │  Ahorro total: -12.3 km (-8%)          │
  │                                         │
  │  [Cancelar]  [Aplicar]                 │
  └─────────────────────────────────────────┘
```

---

## Nivel 3: Solver VRP Avanzado

### Cuando pasar a un solver real

El Nivel 2 (clustering + TSP por vehiculo) funciona bien para flotas chicas (3-8 vehiculos, <100 paradas). Pero tiene limitaciones:

- El clustering es heuristico — no garantiza la solucion optima
- No puede hacer trade-offs complejos (ej: vale la pena que un vehiculo haga mas km si la alternativa viola una time window?)
- No soporta constraints avanzados (skills matching, multi-depot, recarga, pickups+deliveries)

### Opciones de solver

| Solver | Tipo | Costo | Constraints | Latencia |
|--------|------|-------|-------------|----------|
| **Google OR-Tools** | Open source (C++/Python) | Gratis | Completo (VRP, CVRP, VRPTW, PDP) | Depende del server |
| **Vroom** (OSRM) | Open source | Gratis | VRP con TW, capacity, skills | Rapido |
| **Routific Engine API** | SaaS | ~$0.01/stop | VRP con TW, capacity, PDP | <5s para 500 stops |
| **NextBillion.ai** | SaaS | Pago | VRP completo | <3s |
| **Mapbox (actual)** | SaaS | Incluido en plan | Solo TSP, max 25 | <2s |

### Recomendacion por fase

```
Hoy (Nivel 1):   Mapbox TSP + validacion de constraints client-side
                  → Suficiente para MVP, ya esta implementado

Corto plazo (N2): Clustering JS + Mapbox TSP por vehiculo
                  → Cubre 80% de los casos, sin costo extra

Mediano plazo:    Vroom self-hosted o Routific Engine API
                  → Cuando clientes pidan >100 paradas o constraints complejos

Largo plazo:      Google OR-Tools self-hosted
                  → Maximo control, sin costo por uso, pero requiere infra
```

### Vroom como siguiente paso (self-hosted)

[Vroom](https://github.com/VROOM-Project/vroom) es un solver VRP open source en C++ que:
- Soporta CVRP (capacidad), VRPTW (time windows), skills, multi-depot
- Usa OSRM o Valhalla para matrices de distancia (gratis, no Mapbox)
- Se despliega como Docker container
- API REST simple: POST con vehiculos + jobs → respuesta con rutas optimizadas
- Resuelve 1,000 paradas + 50 vehiculos en <10 segundos

**Deployment:** Un container Docker en Fly.io, Railway, o Cloud Run (~$5-15/mes).

**Input format:**
```json
{
  "vehicles": [
    {
      "id": 1,
      "start": [-70.65, -33.44],
      "end": [-70.65, -33.44],
      "capacity": [500],
      "time_window": [28800, 64800],
      "skills": [1]
    }
  ],
  "jobs": [
    {
      "id": 1,
      "location": [-70.63, -33.42],
      "service": 600,
      "delivery": [25],
      "time_windows": [[32400, 43200]],
      "skills": [1]
    }
  ]
}
```

**Output:** Rutas asignadas con orden optimo, respetando todos los constraints, con metricas de distancia/duracion por ruta.

---

## Balanceo de Carga

### Modos de balanceo

Similar a OptimoRoute, ofrecer 3 modos:

1. **Optimizar eficiencia** (default): Minimizar distancia/tiempo total. Algunos vehiculos pueden quedar vacios.
2. **Balancear paradas**: Distribuir numero similar de paradas por vehiculo.
3. **Balancear tiempo**: Distribuir duracion similar por vehiculo.

### Implementacion (Nivel 2)

Despues del clustering inicial, aplicar un paso de rebalanceo:

```typescript
function rebalanceByStops(
  assignments: Map<string, PlanStopWithStop[]>,
  mode: 'efficiency' | 'balance_stops' | 'balance_time'
): Map<string, PlanStopWithStop[]> {
  if (mode === 'efficiency') return assignments  // sin cambios

  const avgStops = totalStops / numVehicles

  // Mover paradas del vehiculo mas cargado al menos cargado
  // Solo si la parada esta geograficamente cerca del vehiculo receptor
  // Respetar capacidad al mover
  
  // Iterar hasta que la diferencia max-min sea <= 2 paradas (o converja)
}
```

---

## Multi-Depot

### Estado actual
Todos los vehiculos salen del mismo punto (depot unico, no configurable).

### Mejora
- Agregar campo `start_location` (lat/lng) en `drivers` o `vehicles`
- Si no tiene, usar un depot default de la org
- La optimizacion usa el start_location de cada vehiculo como origen

```sql
-- Agregar a vehicles (o usar el del conductor)
alter table vehicles add column depot_lat double precision;
alter table vehicles add column depot_lng double precision;

-- O a nivel de organizacion
alter table organizations add column default_depot_lat double precision;
alter table organizations add column default_depot_lng double precision;
```

### Nueva tabla (si multiples depots por org):

```sql
create table depots (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references organizations(id) on delete cascade,
  name    text not null,
  address text,
  lat     double precision not null,
  lng     double precision not null,
  created_at timestamptz not null default now()
);
```

---

## Cambios en la UI

### PlanDetailPage

- Renombrar "Optimizar ruta" → **"Optimizar plan"** (aplica a todo el plan, no solo una ruta)
- Modal pre-optimizacion con opciones (constraints, balanceo)
- Resultado detallado por vehiculo (paradas, km, capacidad usada, warnings)
- Barra de capacidad en cada ruta (peso usado / max)
- Indicador de time window violations (icono reloj rojo en parada)

### StopsPage / CreateStopModal

- Enfatizar peso y ventana horaria al crear paradas (hoy se ignoran, pero son criticos para optimizacion)
- Tooltip: "Completar peso y ventana horaria mejora la optimizacion"

### VehiclesPage

- Enfatizar capacidad y horarios de operacion
- Nuevo campo: depot location (donde sale/termina el vehiculo)

---

## Migracion SQL

```sql
-- 008_optimization.sql

-- 1. Depot default por organizacion
alter table organizations add column default_depot_lat double precision;
alter table organizations add column default_depot_lng double precision;

-- 2. Depot por vehiculo (override del default org)
alter table vehicles add column depot_lat double precision;
alter table vehicles add column depot_lng double precision;

-- 3. Tabla de depots (si org tiene multiples puntos de inicio)
create table depots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz not null default now()
);

create index idx_depots_org on depots(org_id);

alter table depots enable row level security;

create policy "Org members manage depots"
  on depots for all using (org_id in (select user_org_ids()));
```

---

## Preguntas Abiertas

1. **Nivel 2 ahora o saltar directo a Vroom?**
   - Nivel 2 (clustering + Mapbox) no tiene costo adicional y cubre flotas chicas
   - Vroom requiere infra pero es mucho mas potente
   - **Recomendacion:** Nivel 1 (validaciones) ya, Nivel 2 en V1, Vroom cuando haya demanda

2. **Depot: a nivel vehiculo, conductor, u organizacion?**
   - **Recomendacion:** Organizacion primero (un default_depot), override a nivel vehiculo si es necesario

3. **Balanceo: exponer al usuario o decidir automaticamente?**
   - **Recomendacion:** Exponer como opcion en el modal de optimizacion (3 modos)

4. **Que pasa con paradas que no caben en ningun vehiculo?**
   - Deben quedar como "sin asignar" con warning visual
   - "5 paradas no pudieron asignarse: capacidad insuficiente"

---

## Definicion de Done

### Nivel 1 — Constraints Basicos
- Validacion de capacidad antes de optimizar (warning si excede)
- Barra de capacidad visual en cada ruta (peso y volumen)
- Validacion de time windows post-optimizacion (lista de violaciones)
- Limite de 25 paradas por request con warning
- Mejorar manejo de errores de Mapbox API

### Nivel 2 — Multi-Vehiculo
- Asignacion automatica de paradas sin asignar a vehiculos
- Clustering geografico considerando capacidad
- TSP por vehiculo (Mapbox)
- Modal "Optimizar Plan" con opciones
- Resultado detallado por vehiculo
- 3 modos de balanceo
- Depot configurable por organizacion

### Nivel 3 — Solver Avanzado (futuro)
- Vroom self-hosted desplegado
- Edge Function que llama a Vroom en vez de Mapbox
- Soporte nativo de time windows, capacidad, skills
- >100 paradas + >10 vehiculos optimizados en <10s
