# 07 - UX de Planificacion: Rediseño con Vision de Producto

> **Objetivo:** Rediseñar el flujo de planificacion para que sea rapido, visual y accionable. El mapa es el workspace principal — no un sidebar decorativo.
>
> **Insight de la competencia:** Routific, OptimoRoute, Spoke y Onfleet coinciden en un patron: el planificador ES el mapa. Una sola experiencia integrada, no sidebar + mapa separados.
>
> **Estado:** reescrito 2026-04-16 tras avances en Vroom + depot config.

---

## Estado actual (abril 2026)

Desde el PRD original ya se entregaron varias piezas de fondo. Antes de seguir con UX conviene dejar explicito que tenemos.

### Lo que ya esta en produccion

- **Motor de optimizacion multi-vehiculo (Vroom + OSRM)** corriendo en Railway como servicio propio. Edge function `optimize-routes-vroom` resuelve VRP real con capacidad + time windows.
- **Modelo de depot** (`migrations/010_depot_locations.sql`):
  - `organizations.default_depot_{lat,lng,address}` como default de la org.
  - `vehicles.depot_{lat,lng,address}` como override por vehiculo.
  - Funcion SQL `get_vehicle_depot()` resuelve el depot efectivo.
- **`DepotConfigModal`** se abre automaticamente si el usuario intenta optimizar sin depot configurado.
- **Tab "En Vivo"** con realtime via Supabase Realtime sobre `driver_locations` (colores por ruta, edad de ultima ubicacion, badge "En vivo" vs "Offline").
- **Integracion con el resto del producto**: cada `plan_stop` expone tracking token copiable, indicadores de canales de notificacion enviados (WhatsApp/Email/SMS), badge de orden asociada, y apertura de POD al clickear una parada completada.
- **Drag & drop dentro de una ruta** (HTML5 nativo) que persiste `order_index`.
- **Dos botones de optimizacion coexistiendo**:
  - "Optimizar ruta" (Mapbox Directions + Optimization API v1) — single-route.
  - "Optimizar con Vroom" — multi-vehiculo, respeta capacidad y time windows.

### Lo que sigue roto o ausente

- **Capacidad hardcoded**: `0/{capacity_weight_kg}kg` literal. Nunca se calcula el peso real sumando `orders.total_weight_kg` o `stop.weight_kg`.
- **4 tabs** (`General` / `Veh.` / `Par.` / `Vivo`) siguen fragmentando la UI — el dispatcher tiene que saltar de tab para ver info que deberia estar junta.
- **No se puede mover una parada entre rutas** ni asignar una parada sin asignar a una ruta desde el sidebar.
- **No hay eliminar parada, eliminar ruta, ni editar vehiculo/conductor** desde el detalle.
- **Mapa pasivo**: click en marker solo selecciona; no hay popup con acciones.
- **Botones de optimizar al fondo del sidebar** (no visibles sin scroll cuando hay varias rutas).
- **Landing del planner sigue siendo calendario mensual** — no hay foco en "hoy".
- **Dos botones de optimizar compiten** sin explicar al usuario cual usar cuando.

---

## Diagnostico del Producto Actual

### Recorrido de la UI hoy

**Login / PlannerPage (calendario):** sin cambios vs el analisis original. Funciona, pero el calendario como landing sigue siendo un paso intermedio innecesario para la operacion diaria. El dispatcher abre Vuoo a las 7am y lo primero que necesita es "HOY", no el mes.

**PlanDetailPage (el problema principal):**
- Sidebar izquierdo 96 de ancho + mapa a la derecha. Conceptualmente bien, ejecucion fragmentada.
- Los 4 tabs esconden info que deberia verse junta. Ejemplo: para ver cuanto carga un vehiculo hay que ir a la tab "Veh.", para ver las paradas de ese vehiculo hay que volver a "General" y expandir la ruta.
- Tab "Paradas" es una tabla que duplica lo que ya muestra el sidebar expandido.
- Tab "En Vivo" metio el realtime en planificacion cuando deberia ser parte de Torre de Control (doc 08). Hoy quedo aca por ruta de menor resistencia; no hay que romperlo pero tampoco promoverlo.
- Header de ruta muestra `0/500kg` — destruye confianza.
- Rutas colapsadas por default — el contenido principal (paradas) queda oculto.
- Los dos botones de optimizar no tienen contexto: el usuario no sabe si debe usar uno u otro.

### Patron de la competencia (recordatorio)

- **Routific:** mapa central grande, sidebar con lista de paradas + vehiculos, timeline abajo, drag&drop entre rutas.
- **OptimoRoute:** three-panel (ordenes / mapa / conductores).
- **Spoke/Circuit:** mapa con lista de paradas superpuesta, minimalista.
- **Onfleet:** mapa oscuro full-width con cards de conductores superpuestas, enfocado en real-time.

Todos resuelven lo mismo: **una pantalla, cero navegacion entre vistas para operar**.

---

## Principios de rediseño

1. **El mapa es el workspace**, no el adorno.
2. **Una sola pantalla, cero tabs** en la planificacion. La realtime/live pertenece a Torre de Control.
3. **Todo se puede hacer desde el lugar donde se esta pensando**: mover paradas desde la lista o desde el mapa, con un solo click o drag.
4. **El dato visible tiene que ser real**. Si la capacidad no se puede calcular, se oculta; no se muestra un 0 hardcoded.
5. **Optimizar es la accion principal**. Siempre visible, con contexto de que va a hacer.

---

## 1. Dashboard del Dia (reemplaza landing del planner)

Cuando el dispatcher entra a `/planner`, primero ve un **resumen de hoy** con acceso rapido a los planes del dia. El calendario mensual sigue disponible pero detras de un boton.

```
┌─────────────────────────────────────────────────────────────────┐
│  Hoy: Viernes 11 Abril 2026                    [◀ ▶] [📅 Mes] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Plan AM       │  │ Plan PM       │  │  + Crear     │          │
│  │ 3 rutas       │  │ 2 rutas       │  │    plan      │          │
│  │ 24 paradas    │  │ 15 paradas    │  │              │          │
│  │ ████████░░ 75%│  │ ░░░░░░░░ 0%  │  │              │          │
│  │ [Abrir →]     │  │ [Abrir →]     │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  Sin asignar hoy: 8 paradas                    [Asignar →]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Si solo hay 1 plan hoy → navegar directo al Plan Detail.
- Click en "Mes" → abre vista calendario (la actual).
- Flechas para saltar a dia anterior/siguiente.

---

## 2. Plan Detail: Layout Sin Tabs

Eliminar los 4 tabs. La Tab "En Vivo" se mueve a Torre de Control (doc 08) — el planificador no es el lugar para seguir conductores en terreno.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Plan: Lunes AM  ·  11 Abril  ·  3 rutas · 24 par.              │
│  [Optimizar ⚡] [+ Parada] [+ Vehiculo]    [Depot ⚙] [↩] [↪] [⋯] │
├────────────────────────┬─────────────────────────────────────────────┤
│  PANEL DE RUTAS        │              MAPA (interactivo)             │
│  (scrollable)          │                                             │
│                        │   Click marker → popup con acciones         │
│  🔍 Buscar parada      │   Click ruta → resalta + scroll sidebar     │
│                        │                                             │
│  ── Furgon AB-1234 ──  │                                             │
│  Juan P. · 8 paradas   │                                             │
│  ████████░░ 425/500kg  │   ── Vista alternativa ──                   │
│  08:00 → 12:45 est.    │   [Mapa]  [Timeline]                        │
│                        │                                             │
│  1 🔵 Av. Providencia  │   (Timeline: Gantt de rutas del plan)      │
│  2 🔵 Las Condes 456   │                                             │
│  ...                   │                                             │
│                        │                                             │
│  ── Sin asignar (5) ── │                                             │
│  ☐ ⬜ Santiago Centro 1 │                                             │
│  ☐ ⬜ Providencia 789   │                                             │
│  [Asignar a ruta ▼]    │                                             │
│                        │                                             │
└────────────────────────┴─────────────────────────────────────────────┘
```

### Cambios clave vs UI actual

| Actual | Propuesto | Por que |
|--------|-----------|---------|
| 4 tabs (General/Veh/Par/Vivo) | Sin tabs — todo visible | Los tabs esconden info que se usa junta |
| Rutas colapsadas por default | Rutas expandidas, scrollable | El contenido principal son las paradas |
| "0/500kg" hardcoded | Barra visual con peso real calculado desde `orders` o `stops.weight_kg` | El dato falso destruye confianza |
| Drag solo dentro de ruta | Drag entre rutas + desde sin asignar (@dnd-kit) | Sin esto no se puede planificar |
| Mapa pasivo | Mapa con popup click → reasignar/eliminar | El mapa es donde se piensa la ruta |
| 2 botones optimizar al fondo | 1 boton en header, flujo con opciones | Es la accion principal |
| Tab "En Vivo" | Se mueve a Torre de Control (doc 08) | Planificacion y operacion en vivo son contextos distintos |
| Tab "Paradas" (tabla) | Eliminada — la lista del sidebar YA muestra las paradas | Tabla duplica info |
| Tab "Vehiculos" | Eliminada — el header de cada ruta muestra vehiculo + conductor | Info ya esta en el sidebar |
| Depot oculto | Boton `[Depot ⚙]` en header + onboarding si falta | Sin depot no hay Vroom |

---

## 3. Panel de Rutas (Sidebar Izquierdo)

### Header de cada ruta

```
┌──────────────────────────────────────────┐
│ 🔵 Furgon AB-1234              [⋯]      │
│ 👤 Juan Perez                            │
│ 8 paradas · 45.2 km · 2h 15min          │
│ ████████████░░░ 425/500 kg (85%)         │
│ 🕐 08:00 → 12:45 est.                   │
└──────────────────────────────────────────┘
```

- Circulo de color consistente con el mapa.
- Menu `[⋯]`: Editar vehiculo/conductor, Definir depot, Eliminar ruta.
- Barra de capacidad: verde < 80%, amarillo 80-100%, rojo > 100%.
- Calculo de capacidad: suma de `orders.total_weight_kg` asociadas a los `plan_stops` de la ruta. Si ninguna parada tiene peso conocido, ocultar la barra (no mostrar 0).
- Horario: `vehicle.time_window_start` → hora estimada de fin basada en `total_duration_minutes`.

### Items de parada

```
┌──────────────────────────────────────────┐
│ ⠿ 1  Av. Providencia 1234     ✅ 08:35  │
│       15 min · 5.2 kg · 09:00-12:00     │
└──────────────────────────────────────────┘
```

- `⠿` = drag handle (solo el handle inicia drag, no toda la fila).
- Numero de orden + nombre.
- Badge de status.
- Segunda linea: service time + peso + ventana horaria.
- Hover: aparecen botones (eliminar del plan, copiar tracking link, reenviar notificacion — ya existe hoy).
- Click: selecciona en el mapa + centra.

### Seccion "Sin asignar"

```
┌──────────────────────────────────────────┐
│ Sin asignar (5)        [Seleccionar ▼]   │
│──────────────────────────────────────────│
│ ☐ ⬜ Santiago Centro 1    5.0 kg         │
│ ☐ ⬜ Santiago Centro 2    3.2 kg         │
│ ☐ ⬜ Providencia 789      8.1 kg         │
│                                          │
│ Peso total: 16.3 kg                      │
│ [Asignar seleccion a ruta ▼]            │
└──────────────────────────────────────────┘
```

- Checkboxes para seleccion multiple + bulk assign a ruta.
- Drag individual a cualquier ruta.
- Peso total visible para saber si caben.

---

## 4. Mapa Interactivo

### Click en parada (marker)

```
┌──────────────────────────┐
│ Av. Providencia 1234     │
│ 5.2 kg · 15 min          │
│ Ventana: 09:00 - 12:00   │
│ Estado: Pendiente         │
│ Asignada a: Juan P. (#3) │
│                          │
│ [Reasignar ▼] [Eliminar] │
└──────────────────────────┘
```

- Popup con info + acciones.
- Dropdown "Reasignar" lista rutas con colores.
- Parada sin asignar → dropdown "Asignar a ruta".

### Click en ruta (polyline)

- Dim las demas rutas.
- Sidebar scrollea y expande la ruta.
- Click fuera → deselecciona.

### Toggle Mapa ↔ Timeline

- Switch en la esquina del area principal.
- Timeline = Gantt de todas las rutas en paralelo.
- Bloques: viaje + servicio + idle.
- Click en bloque → seleccionar parada.

---

## 5. Flujo de Optimizar: Unificar Mapbox + Vroom

### Problema actual

Hoy coexisten dos botones: "Optimizar ruta" (Mapbox) y "Optimizar con Vroom". El usuario no sabe cual usar. Cada uno hace cosas distintas:

- **Mapbox Optimization API v1:** single-route, solo reordena paradas de una ruta, no respeta capacidad.
- **Vroom:** multi-vehiculo, respeta capacidad, respeta time windows, puede dejar paradas sin asignar.

### Decision: un solo boton, dos modos internos

```
Click [Optimizar ⚡]
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Optimizar Plan: Lunes AM                       │
│                                                 │
│  3 vehiculos · 24 paradas (5 sin asignar)       │
│                                                 │
│  Que quieres optimizar?                         │
│                                                 │
│  ○ Solo reordenar paradas actuales              │
│    (mantiene asignaciones, usa Mapbox)          │
│                                                 │
│  ● Distribuir y optimizar                       │
│    (asigna sin asignar + reordena, usa Vroom)   │
│                                                 │
│  Constraints (Vroom):                           │
│  ☑ Respetar capacidad de vehiculos              │
│  ☑ Respetar ventanas horarias                   │
│  ☐ Balancear carga entre vehiculos              │
│                                                 │
│             [Cancelar]  [Optimizar →]            │
└─────────────────────────────────────────────────┘
```

- Si falta depot → abrir `DepotConfigModal` antes de procesar (ya existe este early-return).
- Resultado muestra ahorro en km/min, paradas sin asignar, warnings por ventanas horarias violadas.
- Boton "Descartar" restaura estado anterior (parte del stack de undo).

### Resultado post-optimizacion

```
┌─────────────────────────────────────────────────┐
│  ✅ Optimizacion completada                     │
│                                                 │
│  Furgon AB-1234 (Juan P.)                       │
│    8 paradas · 45.2 km · 2h 15min              │
│    Capacidad: ████████████░░ 85%                │
│                                                 │
│  Camioneta CD-5678 (Maria S.)                   │
│    10 paradas · 38.7 km · 1h 50min             │
│    Capacidad: ██████████░░░░ 72%                │
│                                                 │
│  Ahorro total: -15.4 km (-11%) · -25 min (-9%) │
│                                                 │
│  ⚠ 1 parada fuera de ventana horaria           │
│    Ñuñoa 234: llega 11:45, cierra 11:30        │
│                                                 │
│             [Descartar]  [Aplicar ✓]            │
└─────────────────────────────────────────────────┘
```

---

## 6. Configuracion de Depot (onboarding y overrides)

El depot es ahora un concepto first-class (ver `010_depot_locations.sql`). La UX debe tratarlo como tal.

### Entradas al config

- **Boton `[Depot ⚙]` en header del Plan Detail** → abre `DepotConfigModal`.
- **Modal se abre automaticamente** cuando el usuario intenta optimizar sin depot configurado (ya implementado).
- **Override por vehiculo** en `/vehicles/:id/edit` → tres campos opcionales (`depot_lat`, `depot_lng`, `depot_address`). Si se dejan vacios, usa el default de la org.
- **Indicador visual** en el header de cada ruta cuando el vehiculo tiene depot override (pin distinto o tag "Depot propio").

### Enforcement

- Onboarding de org nueva: despues de crear la org, paso explicito "Configura tu bodega / punto de partida". Sin esto el optimizador nunca funciona.

---

## 7. Agregar Paradas: Drawer Lateral

Reemplazar el modal actual (que tapa el mapa) por un drawer lateral.

```
┌───────────────────────────────────┐
│ Agregar paradas al plan       [X] │
│                                   │
│ 🔍 Buscar por nombre o direccion  │
│                                   │
│ ☐ Supermercado Lider        5 kg  │
│ ☐ Farmacia Ahumada          2 kg  │
│ ☐ Restaurant Don Pepe       8 kg  │
│ ☐ Oficina Google Chile      3 kg  │
│                                   │
│ 3 seleccionadas · 16 kg total     │
│ Asignar a: [Sin asignar ▼]       │
│                                   │
│ [+ Crear nueva parada]            │
│ [Agregar seleccionadas →]         │
└───────────────────────────────────┘
```

- Drawer lateral (no modal centrado) — no tapa el mapa.
- Multi-select + peso total + asignar directo a ruta.
- "Crear nueva parada" inline abajo (no abrir otro modal).

---

## 8. Header del Plan

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Plan: Lunes AM  ·  11 Abril  ·  3 rutas · 24 par. · 112.2 km   │
│                                                                      │
│  [Optimizar ⚡]  [+ Parada]  [+ Vehiculo]   [Depot ⚙] [↩][↪] [⋯]  │
└──────────────────────────────────────────────────────────────────────┘
```

- Stats inline: rutas, paradas, distancia total.
- Nombre editable (click → inline edit).
- `[Depot ⚙]` visible para llegar rapido al config.
- `[↩][↪]` undo/redo.
- `[⋯]` menu: Duplicar plan, Eliminar plan, Exportar CSV.

---

## 9. Drag & Drop con @dnd-kit

El drag & drop nativo HTML5 actual solo soporta reorden dentro de una misma ruta. Para mover entre rutas + desde sin asignar necesitamos @dnd-kit.

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Comportamiento

- Cada ruta = un `SortableContext`.
- "Sin asignar" = otro `SortableContext`.
- Drag handle `⠿` (solo el handle inicia drag).
- Al arrastrar: overlay flotante con info de la parada.
- Ruta destino resaltada con borde azul.
- Al soltar: update `route_id` + `vehicle_id` + `order_index`.
- Warning (no bloqueo) si excede capacidad.

---

## 10. Undo / Redo

```typescript
type PlanAction =
  | { type: 'move_stop'; stopId: string; from: { routeId: string | null; index: number }; to: { routeId: string | null; index: number } }
  | { type: 'reorder'; routeId: string; fromIndex: number; toIndex: number }
  | { type: 'delete_stop'; planStopId: string; snapshot: PlanStopWithStop }
  | { type: 'delete_route'; routeId: string; snapshot: { route: Route; stops: PlanStopWithStop[] } }
  | { type: 'add_stops'; planStopIds: string[] }
  | { type: 'bulk_assign'; moves: { stopId: string; from: string | null; to: string | null }[] }
  | { type: 'optimize'; before: { routeId: string; stopIds: string[]; order: number[] }[] }
```

- Ctrl+Z / Ctrl+Shift+Z + botones en header.
- Stack in-memory (no persiste entre sesiones).
- Toast tras undo: "Deshacer: parada movida de vuelta a Ruta 1".

---

## 11. PlannerPage: Calendario como Vista Secundaria

No se elimina — solo deja de ser landing.

- Click derecho en plan → menu contextual (Abrir, Duplicar, Eliminar).
- Badge amarillo en dias con paradas sin asignar.
- Badge verde en dias con todos los planes completados.
- Toggle vista semanal (P2).

---

## Dependencias nuevas

```
@dnd-kit/core
@dnd-kit/sortable
@dnd-kit/utilities
```

No se necesitan otras dependencias.

---

## Migracion SQL

No se requieren schema changes adicionales para la UI. Ya estan en el repo:

- `010_depot_locations.sql` (aplicado).

Opcional (P3):

```sql
-- Templates de plan (para duplicar estructura tipica)
create table plan_templates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  template_data jsonb not null,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index idx_plan_templates_org on plan_templates(org_id);
alter table plan_templates enable row level security;
create policy "Org members manage templates"
  on plan_templates for all using (org_id in (select user_org_ids()));
```

---

## Orden de Implementacion (recalibrado)

### Fase 1 — Desbloquear la planificacion diaria (1-2 sem)

1. Instalar @dnd-kit y migrar drag & drop.
2. Habilitar drag entre rutas + desde "Sin asignar".
3. Calcular peso real en barra de capacidad (sumar `orders.total_weight_kg`).
4. Eliminar parada, eliminar ruta, editar vehiculo/conductor (botones + confirmaciones).
5. Quitar los 4 tabs — vista unica sidebar + mapa.
6. Mover la tab "En Vivo" a Torre de Control (doc 08) o archivarla temporalmente con feature flag.

### Fase 2 — Unificar optimizar y hacer el mapa activo (1-2 sem)

7. Unificar botones `Optimizar ruta` + `Optimizar con Vroom` en un solo flujo con dialog de opciones.
8. Boton `[Depot ⚙]` en header + indicador de vehiculos con override.
9. Popup interactivo en markers del mapa (reasignar/eliminar).
10. Click en polyline de ruta resalta + scroll sidebar.
11. Seleccion multiple con checkboxes + bulk assign en "Sin asignar".
12. Undo/redo.
13. Header con stats inline + nombre editable.

### Fase 3 — Landing del dia + power features (2 sem)

14. Dashboard del dia (reemplazar landing del planner).
15. Drawer lateral para agregar paradas (reemplazar modal).
16. Timeline/Gantt toggle en area del mapa.
17. Duplicar plan con nueva fecha.
18. Keyboard shortcuts (Ctrl+Z, Escape, Delete, 1-9 para asignar a ruta).

---

## Definicion de Done

### Fase 1

- Drag & drop entre rutas funcional con @dnd-kit.
- Paradas sin asignar se pueden arrastrar a cualquier ruta.
- Barra de capacidad muestra peso real calculado (no 0 hardcoded).
- Eliminar parada, eliminar ruta, editar vehiculo/conductor disponibles.
- Sin tabs — vista unica con sidebar + mapa.
- Tab "En Vivo" migrada o archivada.

### Fase 2

- Un solo boton de optimizar con dialog de opciones (Mapbox / Vroom segun eleccion).
- Depot configurable desde el header y al momento de optimizar si falta.
- Click en marker del mapa abre popup con acciones.
- Seleccion multiple + bulk assign.
- Undo/redo funcional.

### Fase 3

- Dashboard del dia como landing.
- Drawer lateral para agregar paradas.
- Timeline/Gantt como vista alternativa.
- Duplicar plan con nueva fecha.
- Keyboard shortcuts operativos.
