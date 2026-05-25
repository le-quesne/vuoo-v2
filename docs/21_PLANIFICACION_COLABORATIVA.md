# PRD 21 — Planificación Colaborativa

**Pri**: P1
**Extiende**: PRD 07 — UX Planificación / PRD 08 — Torre de Control
**Estado**: Drag&drop intra-route existe (`SortablePlanStop`,
`RouteDropZone`). Falta cross-route, timeline view, undo y chat.

---

## Contexto

El dispatcher hoy puede reordenar dentro de una ruta pero **no mover
paradas entre rutas** ni ver un **timeline** del día completo. Tampoco
tiene canal directo con el chofer en terreno: si necesita avisarle algo
urgente, lo hace por WhatsApp personal (off-platform).

---

## Objetivos

1. Mover paradas entre rutas con drag&drop fluido + validación de
   capacity/skills.
2. Timeline / Gantt view del día completo.
3. Selección múltiple para acciones bulk.
4. Asignar desde mapa (click pin → menú).
5. Undo/redo.
6. Chat in-app dispatcher ↔ chofer.

---

## Scope IN

### A. Drag&drop cross-route
- Extender `SortablePlanStop` para aceptar drop entre rutas.
- Validación en drop:
  - Capacity del vehículo destino.
  - Skills required match.
  - Time-window factible (rerun Vroom local mini-solver o estimación).
- Si infactible → drop bloqueado + tooltip "no cabe por capacity".
- Si factible-pero-subóptimo → permitir con warning.

### B. Timeline / Gantt
- Vista alternativa a "mapa + lista" en PlanDetail.
- Eje X: tiempo (8am–6pm).
- Eje Y: cada ruta una fila.
- Bloques: cada stop como barra con su service window.
- Tooltip con detalles del stop.
- Drag entre filas = mover entre rutas.
- Útil para ver overlap de horarios y huecos.

### C. Selección múltiple + bulk
- Shift-click para rango, Cmd/Ctrl-click para individual.
- Acciones bulk:
  - Reasignar a ruta X.
  - Cambiar service time.
  - Pinear (no se mueve en re-optimización).
  - Marcar prioridad alta.

### D. Asignar desde mapa
- Click derecho en pin de stop sin asignar → menú:
  - "Asignar a Ruta 03"
  - "Asignar al chofer más cercano"
  - "Crear ruta nueva con este stop"
  - "Marcar como prioridad"

### E. Undo / redo
- Stack de últimas 20 acciones del planner.
- Atajos: Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z.
- Indicador visual "Última acción: mover stop X a ruta Y".

### F. Chat dispatcher ↔ chofer
- Canal por ruta (chofer ve solo su ruta del día).
- Supabase Realtime channel `chat-route-:id`.
- Tabla `route_messages(id, route_id, sender_id, body, created_at, read_at)`.
- UI:
  - Web: panel lateral colapsable en `/control` y `PlanDetailPage`.
  - Mobile: pestaña "Mensajes" en route detail.
- Push notification al chofer si dispatcher escribe.
- Quick replies pre-configurados ("Cliente reagenda", "En camino", "Necesito apoyo").
- Notas por stop ya existen → no las reemplaza, las complementa.

### G. Llamada con número anonimizado (fase 2)
- Click "Llamar al cliente" desde mobile usa Twilio masked number.
- Útil para no exponer celular del chofer.
- Costo per-minute → P3.

---

## Scope OUT

- Chat grupal (admin + multiple drivers) → fase 2.
- Video call → no aplica al caso de uso.
- Llamada masked v1 → fase 2.
- Drag&drop multi-día → fase 2.

---

## Esquema técnico

### Tablas
```sql
create table route_messages (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  sender_id uuid not null references auth.users(id),
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table planner_actions_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  plan_id uuid not null references plans(id),
  action_type text not null,
  payload jsonb,
  reversed boolean default false,
  created_at timestamptz default now()
);
```

### Frontend
- `src/presentation/features/planner/hooks/usePlannerHistory.ts` (undo/redo).
- `src/presentation/features/planner/components/TimelineView.tsx`.
- `src/presentation/features/chat/` (nuevo feature folder).
- Mobile: `mobile/src/screens/chat/`.

### Backend
- Push notification trigger en `route_messages` INSERT.

---

## Criterios de éxito

- 1+ cliente piloto usa cross-route drag&drop > 5x/día.
- 50%+ de dispatchers prueban timeline view en su primer mes.
- Chat con > 2 mensajes por ruta promedio en operaciones activas.
- 0 mensajes off-platform (WhatsApp personal) reportados en piloto.

---

## Dependencias

- PRD 19 ideal pero no obligatorio (validación cross-route puede ser
  estimación local sin re-correr Vroom).
- Push notifications operativas (ya activo).
