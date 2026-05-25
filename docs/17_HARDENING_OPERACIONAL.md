# PRD 17 — Hardening Operacional & Tech Debt

**Pri**: P1 (§A pre-cliente #2) / P2 (§B–C) / P3 (§D–E)
**Estado**: 24 ítems sueltos en `TODOS.md` agrupados aquí.
**Owner**: Plataforma (no producto).

---

## Contexto

Tras el wizard de import de pedidos y los PRDs operativos (07, 08, 12),
quedaron acumulados ~24 ítems en `TODOS.md` distribuidos en:
- Robustez del import (transacciones, dedup, multi-sheet).
- Observabilidad (PostHog, logger central, audit RPCs).
- Refactor (hooks compartidos, lazy-load, virtualización).
- Polish (ortografía, aria-labels, redirects, `userMessage()`).

Sin cerrarlos, cada feature nueva agrega deuda. Sin telemetría, no hay
forma de validar adopción ni debugear pilotos sin pedir screenshots por
WhatsApp.

---

## Objetivos

1. Import de pedidos a prueba de falla parcial (transaccional).
2. Telemetría completa del funnel de import + control + planificación.
3. Mensajes de error consistentes (`userMessage()` en todo el codebase).
4. Refactor de hooks compartidos para evitar duplicación con próximos
   importers (Shopify, VTEX).
5. Polish de UX (ortografía, accesibilidad, redirects).

---

## Scope IN

### §A — Robustez del import (P1)

**A.1 — Backend transaccional `/orders/import`**
- Envolver `backend-railway/src/routes/ordersImport.ts:79-209` en `BEGIN/COMMIT/ROLLBACK` (pg-promise) o RPC bulk Postgres.
- Si truena a la mitad, rollback total. Idempotency-key respetada.
- Tests: simular falla a mitad de 5K filas → 0 órdenes creadas.
- **Source**: TODOS P1, /plan-ceo-review 2026-04-26 §1A.

**A.2 — Reemplazar order existente en dedup vs DB**
- D4 hoy solo "ignorar". Agregar opción "reemplazar" (UPDATE en lugar de
  INSERT).
- UI: dropdown en Step 4 ("Si el order_number ya existe…").
- Backend: nuevo endpoint `PUT /v1/orders/by-order-number/:orderNumber`.
- **Source**: TODOS P1, /plan-ceo-review 2026-04-26 D4.

**A.3 — Migración SQL `list_stop_duplicates`**
- Función Postgres con `pg_trgm` similarity sobre `stops.address`.
- Threshold configurable (default 0.75).
- Hoy `/settings/duplicates` muestra "funcionalidad no disponible".
- **Source**: TODOS QA P2, ISSUE-002.

### §B — Observabilidad (P2)

**B.1 — Telemetría PostHog del wizard**
- Eventos: `import_started`, `step_reached` (step number),
  `file_parsed` (rowCount), `geocoding_failed`, `import_completed`
  (createdCount, failedCount), `import_abandoned` (stepLast).
- **NO** mandar PII: sin customer_name, sin address.
- **Source**: TODOS P2, /plan-ceo-review D2.

**B.2 — Logger central**
- Crear `src/application/lib/logger.ts` con métodos
  `debug/info/warn/error`.
- En dev: delega a `console`.
- En prod: PostHog + Sentry (cuando se integre Sentry).
- Reemplazar `console.*` sueltos en 5+ archivos identificados por regla
  02-code-style.
- **Source**: regla 02-code-style §Logger.

**B.3 — Push notifications retry + `notifications_sent_at`**
- Hoy `publishPlan` / `unpublishPlan` notifica fire-and-forget.
- Agregar: retry 3x con backoff, campo `notifications_sent_at` en `plans`.
- Badge de advertencia en plan si el push falló.
- **Source**: TODOS plan.status P2.

### §C — Refactor (P3)

**C.1 — Caché cliente de geocoding**
- Antes de llamar Railway `/geocode/batch`, leer `geocoding_cache` table
  por hash(address). Solo geocodificar misses.
- Decidir TTL (sugerido 90 días), normalización de address pre-hash.
- Validar que cache server-side no resuelve esto ya.
- **Source**: TODOS P3, /plan-ceo-review D5.

**C.2 — `useTabularImport` hook compartido**
- Extraer de `OrdersImportWizard` y `CustomerImportModal` el flujo común
  (parsing + mapping + autodetect).
- Justificar la abstracción cuando aterrice el 3er importer (Shopify).
- **Source**: TODOS P3, /plan-ceo-review D9.

**C.3 — Multi-sheet selector XLSX**
- Si el XLSX trae > 1 pestaña, dropdown en Step 1 para elegir.
- Hoy solo warning del baseline.
- **Source**: TODOS P3, /plan-ceo-review D10.

**C.4 — Extraer `useStopImport` de StopsPage**
- TODO inline en `presentation/features/stops/hooks/index.ts:1`.
- Refactor pendiente de fase-5b.
- **Source**: TODOS P3.

### §D — Performance & Lazy (P4)

**D.1 — Virtualización tabla preview Step 3**
- `@tanstack/react-virtual` cuando `previewRows.length > 500`.
- Backend cap es 2K hoy → no urgente pero deja la puerta abierta a 10K.

**D.2 — Lazy-load `ImportWizard`**
- `React.lazy(() => import('./ImportWizard'))` en `OrdersPage`.
- Wizard pesa ~330KB gzipped.

**D.3 — Feature flag `import_wizard_v2`**
- `VITE_IMPORT_WIZARD_VERSION` para rollout gradual si llega un v2.

**D.4 — Cobertura tests 100% wizard**
- Hoy ~85% (7 unit + 1 E2E).
- Llegar a 100% post-piloto Renner.

### §E — Polish UX (P2/P3)

**E.1 — Pasada bulk de ortografía**
- > 25 strings sin acento en Onboarding, Welcome, Analytics views,
  DayDashboard, ControlHeader, PlanDetailPage botones, WeekDashboard
  "De Mayo", ImportWizard, voseo argentino "Creá" en api-tokens.
- Un solo PR find+replace asistido.
- **Source**: TODOS QA P2, ISSUE-007.

**E.2 — `aria-label "Acknowledge alert"` en español**
- En `/control` popover Alertas.
- Cambiar a "Marcar alerta como leída".
- **Source**: TODOS QA P3, ISSUE-008.

**E.3 — `/admin` redirect con toast**
- Hoy redirige silencioso a `/planner`. Agregar toast "No tienes
  permisos para esta sección".
- Modificar `RequireAuth requireSuperAdmin`.
- **Source**: TODOS QA P3, ISSUE-009.

**E.4 — Auditoría RPCs frontend vs migrations**
- Script: `grep -rn "supabase.rpc(" src/` + cruce con
  `supabase/migrations/`. Reporta funciones llamadas sin migración.
- Pipeline CI para que no vuelva a pasar.
- **Source**: TODOS QA P3.

**E.5 — Aplicar `userMessage()` en codebase**
- `grep -rn "setError(res.error)"` y envolver con `userMessage()` de
  `application/utils/errorMessages.ts`.
- **Source**: TODOS QA P4.

---

## Scope OUT

- Migrar a RLS nativo (Approach B) → [[PRD 18]] §B.2.
- Filtrar PII en logs Railway → [[PRD 18]] §A.4 (es seguridad, no observability).
- Auth en send-push Edge Function → [[PRD 18]] §A.1.

---

## Criterios de éxito

- 0 órdenes huérfanas en imports fallidos (validado con chaos test).
- Dashboard PostHog del funnel de import con 6 eventos vivos.
- 0 `console.log` en `src/` (ESLint rule).
- 0 strings sin acento detectados por script de lint custom.
- `userMessage()` aplicado en > 90% de los `setError`.

---

## Dependencias

- PostHog ya conectado (org Tracking Table proj 201671).
- pg-promise o decisión RPC bulk para §A.1.

---

## Notas de implementación

Este PRD es deliberadamente granular para que se pueda atacar en sprints
chicos (1–2 ítems por PR). No ejecutar como bloque único.
