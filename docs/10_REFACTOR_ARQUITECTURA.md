# Refactor de arquitectura — vuoo-v2

Plan de migración desde la estructura plana actual hacia **Clean Architecture + vertical slicing** siguiendo las reglas en `.claude/rules/`.

## Objetivo

Pasar de:
```
src/{components,contexts,hooks,lib,pages,types,assets}/...
```

A:
```
src/{application,presentation,domain,data}/...
```

con páginas finas (150–300 líneas) que solo compongan features, y features autocontenidas con `components/ hooks/ stores/ types/ utils/`.

## Métrica de éxito

- `PlanDetailPage.tsx` (hoy 66k) ≤ 10k como container.
- `OrdersPage.tsx` (hoy 57k) ≤ 10k.
- `ControlPage.tsx` (hoy 30k) ≤ 10k.
- `TrackingPage.tsx` (hoy 34k) ≤ 10k.
- Ningún archivo en `src/lib/`, `src/components/` plano, `src/pages/`, `src/hooks/`, `src/contexts/`, `src/types/`.
- Build + typecheck verdes al terminar cada fase.

## Principios de ejecución

1. **Una fase por PR**. No mezclar movimientos de archivos con cambios de lógica.
2. **Git mv** para preservar historial cuando sea posible.
3. **Build + navegación manual** al final de cada fase antes de mergear.
4. **Rollback fácil**: cada fase debe ser reversible con un revert.
5. **No refactorizar lógica mientras se mueve código**. Primero se mueve, luego se limpia.

## Fases

### Fase 0 — Fundaciones
- `tsconfig.app.json` + `vite.config.ts`: `@/*` → `./src/*`.
- `npm i zustand clsx tailwind-merge`.
- Crear `src/application/lib/logger.ts`, `src/application/utils/cn.ts`, `src/data/services/_shared/response.ts`.
- Tipar Supabase: `createClient<Database>`.
- Regenerar `database.ts` con CLI de Supabase.

### Fase 1 — Esqueleto de capas
- Crear directorios de las 4 capas.
- `src/lib/*` → `src/application/lib/*`.
- `src/contexts/AuthContext.tsx` → `src/application/contexts/`.
- `src/types/database.ts` → `src/data/types/database.ts`.
- `src/hooks/useAuth.ts` → `src/application/hooks/`.
- Actualizar imports con find/replace.

### Fase 2 — Pages y shared components
- `src/pages/*` → `src/presentation/pages/*`.
- Shared components (Layout, Sidebar, ConfirmDialog, RequireAuth, PlannerLayout, PlannerViewToggle, RouteMap) → `src/presentation/components/*`.
- Extraer router de `App.tsx` a `src/application/navigation/router.tsx`.

### Fase 3 — Feature piloto `control/`
- Primer vertical slice completo. Valida el patrón antes de replicarlo.
- `components/control/*` → `presentation/features/control/components/*`.
- Partir `lib/liveControl.ts`:
  - CRUD → `data/services/control/control.services.ts`.
  - Realtime → `features/control/hooks/useLiveControlRealtime.ts`.
  - Estado compartido → `features/control/stores/useLiveControlStore.ts`.
- Adelgazar `ControlPage.tsx` a container.

### Fase 4 — Feature `plans/` (mayor ganancia)
- Partir `PlanDetailPage.tsx` (66k) en ~8 componentes.
- Services `data/services/{plans,routes}/`.
- Adaptadores `domain/adapters/plan.adapter.ts`, `vroomResult.adapter.ts`.
- Mover `lib/capacity.ts` a la feature.

### Fase 5 — `orders/` y `stops/`
- `OrdersPage.tsx` (57k) → feature con tabla virtualizada.
- `StopsPage.tsx` (30k) → CRUD + import CSV + geocoding.

### Fase 6 — `tracking/`, `drivers/`, `vehicles/`, `planner/`
- Páginas medianas, patrón ya probado.
- `data/services/vroom/` consumiendo Railway (`vuoo-rutas`).

### Fase 7 — `analytics/` y `settings/`
- Mover `pages/analytics/*` + `components/analytics/*` como feature.
- `settings/` con subrutas Organization, Users, Notifications.
- Admin queda como feature aparte.

### Fase 8 — Zustand + route guards
- `AuthContext` → `application/store/useSessionStore.ts`.
- `useAuth()` wrapper para no romper consumers.
- `RequireAuth` + `RequireRole` en `application/navigation/guards/`.

### Fase 9 — Cleanup
- Reglas eslint para imports desde barrel.
- Eliminar carpetas vacías.
- Diagrama de arquitectura en `docs/`.
- Build + typecheck finales.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Romper imports masivamente | Path alias primero (Fase 0); find/replace + typecheck al final de cada fase |
| Conflictos con la mobile app | Solo se mueven tipos si están duplicados; `database.ts` se regenera en ambos lados con el mismo project-id |
| Perder historial git | `git mv` + commits pequeños por fase |
| Bloqueos durante producto en vivo | Ramas cortas, una fase por PR, fácil revert |
| Cambiar lógica por accidente | Separar "mover" de "refactorizar"; los cambios de lógica van en PRs siguientes |

## Tracking

Cada fase es una tarea en el task list del asistente (ver Fase 0–9). Ir completándolas en orden.
