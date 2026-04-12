# 07 - UX de Planificacion: Rediseño con Vision de Producto

> **Objetivo:** Rediseñar el flujo de planificacion para que sea rapido, visual y accionable. No solo arreglar bugs — repensar la experiencia completa desde la perspectiva del dispatcher.
>
> **Insight de la competencia:** Routific, OptimoRoute, Spoke y Onfleet coinciden en un patron: el planificador ES el mapa. No es sidebar + mapa separados — es una sola experiencia integrada donde el mapa es el workspace principal.

---

## Diagnostico del Producto Actual

### Lo que vi en vuoo-v2.vercel.app:

**Login:** Limpio, minimalista, bien. Nada que cambiar.

**PlannerPage (Calendario):**
- Calendario mensual funcional
- Cards de planes en sidebar derecha con progreso
- Bueno como overview, pero es un paso intermedio innecesario para la operacion diaria
- Un dispatcher no quiere ver el mes — quiere ver "HOY"

**PlanDetailPage (el problema real):**
- Layout: sidebar izquierda (rutas colapsables) + mapa derecho
- El sidebar tiene 4 tabs (General, Veh., Par., Vivo) — demasiada fragmentacion
- Rutas colapsables son items chicos, dificil de escanear
- "0/500kg" hardcoded — genera desconfianza en el producto
- Paradas sin asignar no se pueden arrastrar a rutas
- Boton "Optimizar ruta" al fondo, poco visible
- No hay forma de mover paradas entre rutas
- No hay forma de eliminar paradas o rutas
- El mapa es bonito pero pasivo — no se puede interactuar

**Patron de la competencia:**
- **Routific:** Mapa central grande, sidebar con lista de paradas + vehiculos. Timeline abajo. Drag & drop entre rutas desde la lista.
- **OptimoRoute:** Panel de ordenes a la izquierda, mapa al centro, panel de conductores a la derecha. Three-panel layout.
- **Spoke/Circuit:** Mapa con lista de paradas superpuesta a la izquierda. Super simple.
- **Onfleet:** Mapa oscuro full-width con cards de conductores superpuestas. Enfocado en real-time.

---

## Propuesta de Rediseño

### Principio: El planificador diario como primera pantalla

El dispatcher abre Vuoo y ve **las operaciones de hoy**, no un calendario mensual. El calendario existe pero es secundario.

### Nuevo flujo principal

```
Login → Dashboard del Dia (nuevo) → Plan Detail (rediseñado)
                                   ↑
                         Sidebar: Planner sigue existiendo como calendario
```

---

## 1. Dashboard del Dia (reemplaza la landing actual)

Cuando el dispatcher entra a `/planner`, en vez de ver el calendario completo, ve primero un **resumen del dia actual** con acceso rapido a los planes de hoy.

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
│  │               │  │               │  │              │          │
│  │ [Abrir →]     │  │ [Abrir →]     │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  Sin asignar hoy: 8 paradas                    [Asignar →]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- Click en dia distinto → ver planes de ese dia
- Click en "Mes" → vista calendario mensual (la actual)
- Click en plan → abre el Plan Detail rediseñado
- Si solo hay 1 plan hoy → ir directo al Plan Detail

---

## 2. Plan Detail: Rediseño Completo

### Layout: Two-Panel con Mapa como Workspace

Eliminar las 4 tabs. Reemplazar con un layout de 2 paneles donde todo es visible al mismo tiempo.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Plan: Lunes AM  ·  11 Abril  ·  3 rutas  ·  24 paradas         │
│  [Optimizar Plan ⚡] [+ Parada] [+ Vehiculo]          [↩ Undo]     │
├────────────────────────┬─────────────────────────────────────────────┤
│                        │                                             │
│  PANEL DE RUTAS        │              MAPA                           │
│  (scrollable)          │              (interactivo)                  │
│                        │                                             │
│  🔍 Buscar parada      │   ┌─────────────────────────────────┐      │
│                        │   │                                 │      │
│  ── Furgon AB-1234 ──  │   │    Paradas con colores por ruta │      │
│  Juan P. · 8 paradas   │   │    Lineas de ruta dibujadas     │      │
│  ████████░░ 425/500kg  │   │    Click parada → popup         │      │
│  08:00 — 12:45 est.    │   │    Drag parada en lista →       │      │
│                        │   │      resalta ruta destino       │      │
│  1 🔵 Av. Providencia  │   │                                 │      │
│  2 🔵 Las Condes 456   │   │                                 │      │
│  3 🔵 Vitacura 789     │   │                                 │      │
│  ...                   │   │                                 │      │
│                        │   │                                 │      │
│  ── Camioneta CD-5678──│   │                                 │      │
│  Maria S. · 6 paradas  │   │                                 │      │
│  ██████░░░░ 280/500kg  │   │                                 │      │
│  08:30 — 11:30 est.    │   │                                 │      │
│                        │   └─────────────────────────────────┘      │
│  1 🟢 Ñuñoa 123        │                                             │
│  2 🟢 Macul 456        │   ── Vista alternativa ──                   │
│  ...                   │   [Mapa]  [Timeline]                        │
│                        │                                             │
│  ── Sin asignar (5) ── │   Timeline:                                 │
│  ⬜ Santiago Centro 1   │   08:00    10:00    12:00    14:00          │
│  ⬜ Santiago Centro 2   │   ├────────┼────────┼────────┤              │
│  ...                   │   R1 ██▓░██▓░██▓░░░░░                      │
│  [Seleccionar todos]   │   R2    ██▓░██▓░██▓░██▓                     │
│                        │   R3        ██▓░██▓░░░░░                    │
│                        │                                             │
└────────────────────────┴─────────────────────────────────────────────┘
```

### Cambios clave vs la UI actual

| Actual | Propuesto | Por que |
|--------|-----------|---------|
| 4 tabs (General, Veh, Par, Vivo) | Sin tabs — todo visible | Los tabs esconden informacion, el dispatcher necesita ver todo |
| Rutas colapsadas por default | Rutas expandidas, scrollable | El contenido principal son las paradas, no los headers |
| "0/500kg" hardcoded | Barra visual real con peso calculado | El dato falso destruye confianza |
| Drag solo dentro de ruta | Drag entre rutas + desde sin asignar | Sin esto no se puede planificar |
| Mapa pasivo | Mapa con click para asignar | El mapa es donde se piensa la ruta |
| Boton "Optimizar" al fondo | Boton prominente en el header | Es la accion principal |
| Tab "En Vivo" separada | Se mueve a Torre de Control (doc 08) | La planificacion y la operacion en vivo son contextos distintos |
| Tab "Paradas" (tabla) | Eliminada — la lista del sidebar YA muestra las paradas | La tabla duplicaba informacion |
| Tab "Vehiculos" | Eliminada — cada header de ruta muestra vehiculo + conductor | La info ya esta en la lista |

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

- Color de ruta (circulo) consistente con el mapa
- Menu `[⋯]`: Editar vehiculo/conductor, Eliminar ruta
- Barra de capacidad: verde < 80%, amarillo 80-100%, rojo > 100%
- Horario: time_window del vehiculo → hora estimada de fin

### Items de parada (dentro de ruta)

```
┌──────────────────────────────────────────┐
│ ⠿ 1  Av. Providencia 1234     ✅ 08:35  │
│       15 min · 5.2 kg · 09:00-12:00     │
└──────────────────────────────────────────┘
```

- `⠿` = drag handle (6 puntos, indica que es draggable)
- Numero de orden + nombre
- Badge de status (color)
- Segunda linea: duracion + peso + ventana horaria (si tiene)
- Hover: aparecen botones (eliminar, copiar tracking link)
- Click: selecciona en el mapa + centra

### Seccion "Sin asignar"

```
┌──────────────────────────────────────────┐
│ Sin asignar (5)        [Seleccionar ▼]   │
│──────────────────────────────────────────│
│ ☐ ⬜ Santiago Centro 1    5.0 kg         │
│ ☐ ⬜ Santiago Centro 2    3.2 kg         │
│ ☐ ⬜ Providencia 789      8.1 kg         │
│ ☐ ⬜ Las Condes 012       2.5 kg         │
│ ☐ ⬜ Vitacura 345         4.0 kg         │
│                                          │
│ Peso total: 22.8 kg                      │
│                                          │
│ [Asignar seleccion a ruta ▼]            │
└──────────────────────────────────────────┘
```

- Checkboxes para seleccion multiple
- "Seleccionar todos" / "Deseleccionar"
- Dropdown "Asignar a ruta" → asignar en bulk
- Drag individual a cualquier ruta
- Peso total mostrado para saber si caben

---

## 4. Mapa Interactivo

### Interacciones nuevas

**Click en parada (marker) del mapa:**
```
┌──────────────────────────┐
│ Av. Providencia 1234     │
│ 5.2 kg · 15 min          │
│ Ventana: 09:00 - 12:00   │
│ Estado: Pendiente         │
│                          │
│ Asignada a: Juan P.      │
│ Orden: #3                │
│                          │
│ [Reasignar ▼] [Eliminar] │
└──────────────────────────┘
```

- Popup con info completa
- Dropdown "Reasignar" → lista de rutas con colores
- Boton eliminar del plan
- Si es parada sin asignar: dropdown "Asignar a ruta"

**Click en ruta (linea) del mapa:**
- Resalta esa ruta (dim las demas)
- Sidebar scrollea a esa ruta
- Muestra todas las paradas numeradas

**Toggle Mapa ↔ Timeline:**
- Botones en la esquina del area principal
- Timeline muestra todas las rutas en paralelo (Gantt)
- Bloques de color: viaje + servicio + idle
- Linea vertical "ahora" si hay rutas activas
- Click en bloque → seleccionar parada

---

## 5. Flujo de "Optimizar Plan"

### Cambio conceptual: de "Optimizar ruta" a "Optimizar plan"

El boton actual dice "Optimizar ruta" y mete todo en un vehiculo. Debe ser "Optimizar plan" y distribuir inteligentemente.

### Flujo nuevo

```
Click [Optimizar Plan ⚡]
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Optimizar Plan: Lunes AM                       │
│                                                 │
│  3 vehiculos · 24 paradas (5 sin asignar)       │
│                                                 │
│  Que quieres optimizar?                         │
│                                                 │
│  ○ Solo reordenar paradas                       │
│    (mantener asignaciones actuales)             │
│                                                 │
│  ● Distribuir y optimizar                       │
│    (asignar paradas sin asignar + reordenar)    │
│                                                 │
│  Constraints:                                   │
│  ☑ Respetar capacidad de vehiculos              │
│  ☑ Respetar ventanas horarias                   │
│  ☐ Balancear carga entre vehiculos              │
│                                                 │
│             [Cancelar]  [Optimizar →]            │
└─────────────────────────────────────────────────┘
         │
         ▼ (procesando...)
         │
         ▼
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
│  Van EF-9012 (Carlos R.)                        │
│    6 paradas · 28.3 km · 1h 20min              │
│    Capacidad: ████████████████ 91%              │
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

## 6. Agregar Paradas al Plan

### Rediseño del modal "Agregar parada"

El modal actual tiene dos tabs (existentes / crear nueva). Propuesta: un panel lateral (drawer) mas rapido.

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
│ ☐ Depto 504 Av Italia       1 kg  │
│ ☐ ...                            │
│                                   │
│ 3 seleccionadas · 16 kg total     │
│                                   │
│ Asignar a: [Sin asignar ▼]       │
│                                   │
│ [Crear nueva parada]              │
│ [Agregar seleccionadas →]         │
└───────────────────────────────────┘
```

- Drawer lateral (no modal centrado) — no tapa el mapa
- Multi-select con checkboxes
- Peso total de la seleccion
- Asignar directo a una ruta o dejar sin asignar
- "Crear nueva parada" abre inline form abajo (no otro modal)

---

## 7. Header del Plan

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Plan: Lunes AM  ·  11 Abril  ·  3 rutas · 24 par. · 112.2 km   │
│                                                                      │
│  [Optimizar Plan ⚡]  [+ Parada]  [+ Vehiculo]       [↩] [↪] [⋯]  │
└──────────────────────────────────────────────────────────────────────┘
```

- **←** vuelve al dashboard del dia
- Nombre del plan editable (click → inline edit)
- Stats inline: rutas, paradas, distancia total
- Botones de accion prominentes
- **↩ ↪** = undo/redo
- **⋯** = menu: Duplicar plan, Eliminar plan, Exportar CSV

---

## 8. Drag & Drop con @dnd-kit

### Migracion tecnica

```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Comportamiento

- Cada ruta es un `SortableContext` (contenedor de drops)
- "Sin asignar" es otro contenedor
- Drag handle visible (`⠿`) — solo el handle inicia drag (no toda la fila)
- Al empezar a arrastrar: overlay flotante con info de la parada
- Al pasar sobre otra ruta: la ruta destino se resalta (borde azul)
- Al soltar: update inmediato de `route_id` + `order_index`
- Si soltar sobre ruta que excede capacidad: warning pero permite (no bloquea)

### Feedback visual

```
Dragging:
  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  │ 3  Av. Providencia 1234   │  ← overlay semi-transparente siguiendo cursor
  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

Origen: hueco con borde dashed donde estaba la parada
Destino: linea azul entre paradas indicando donde se insertara
```

---

## 9. Undo / Redo

### Stack de operaciones

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

- Ctrl+Z / Ctrl+Shift+Z (keyboard shortcuts)
- Botones ↩ ↪ en header
- Stack in-memory (no persiste entre sesiones)
- Toast despues de undo: "Deshacer: parada movida de vuelta a Ruta 1"

---

## 10. PlannerPage: Mantener como Vista Calendario

No eliminar el calendario — solo dejar de usarlo como landing. Se accede via boton "Mes" en el dashboard del dia.

### Mejoras al calendario

- **Click derecho en plan** → menu contextual: Abrir, Duplicar, Eliminar
- **Badge amarillo** en dias con paradas sin asignar
- **Badge verde** en dias con todos los planes completados
- **Vista semanal** toggle (opcional, P2)

---

## Dependencias

```
@dnd-kit/core        → Drag & drop framework
@dnd-kit/sortable    → Sortable containers
@dnd-kit/utilities   → CSS transform helpers
```

No se necesitan otras dependencias nuevas.

---

## Migracion SQL

No se requieren cambios de schema. Todo es frontend.

Unica excepcion (P2):

```sql
-- Templates de plan (para duplicar)
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

## Orden de Implementacion

### Fase 1 — Arreglar lo roto (1-2 semanas)
1. Instalar @dnd-kit y migrar drag & drop
2. Habilitar drag entre rutas + desde sin asignar
3. Calcular peso real en barra de capacidad
4. Agregar botones eliminar parada + eliminar ruta + editar ruta
5. Quitar tabs — dejar todo en una sola vista

### Fase 2 — Mejorar la experiencia (1-2 semanas)
6. Popup interactivo en mapa (asignar/reasignar/eliminar)
7. Seleccion multiple + bulk assign
8. Undo/redo
9. Rediseñar modal "agregar parada" como drawer lateral
10. Header con stats inline + nombre editable

### Fase 3 — Power features (2 semanas)
11. Dashboard del dia (reemplazar landing del planner)
12. Timeline/Gantt toggle en area del mapa
13. Modal de optimizacion multi-vehiculo
14. Duplicar plan
15. Keyboard shortcuts

---

## Definicion de Done

### Fase 1
- Drag & drop entre rutas funcional con @dnd-kit
- Paradas sin asignar se pueden arrastrar a cualquier ruta
- Barra de capacidad muestra peso real calculado
- Eliminar parada del plan (con confirmacion)
- Eliminar ruta (paradas pasan a sin asignar)
- Editar vehiculo/conductor de una ruta
- Sin tabs — vista unica con sidebar de rutas + mapa

### Fase 2
- Click en marker del mapa abre popup con acciones (asignar, eliminar)
- Seleccion multiple con checkboxes + toolbar de acciones bulk
- Undo/redo funcional (Ctrl+Z, Ctrl+Shift+Z, botones en header)
- Drawer lateral para agregar paradas (no modal)
- Nombre del plan editable inline

### Fase 3
- Dashboard del dia como primera pantalla del planner
- Timeline/Gantt como vista alternativa al mapa
- Modal de optimizacion con opciones (distribuir, constraints, balanceo)
- Duplicar plan con nueva fecha
- Keyboard shortcuts (Ctrl+Z, Escape, Delete, 1-9 para asignar)
