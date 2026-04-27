# TODOS — vuoo-v2

Generado por /plan-eng-review tras /plan-ceo-review del 2026-04-26 sobre el ImportWizard.
Mantener ordenado por prioridad. Cada ítem con: What / Why / Effort (CC) / Depends-on / Pri.

---

## P1 — bloqueantes pre-cliente #2

### Backend transaccional /orders/import
- **What**: Envolver el loop fila-por-fila de `backend-railway/src/routes/ordersImport.ts:79-209` en una transacción Postgres (pg-promise) o RPC bulk en migration.
- **Why**: Hoy si truena a la mitad de 5K filas, las primeras 3K quedan creadas y las últimas no. Stops huérfanos cuando UNIQUE order_number conflicta. Sin idempotency-key respetada.
- **Effort (CC)**: M (~half day).
- **Depends on**: decisión pg-promise vs RPC bulk Postgres.
- **Source**: /plan-ceo-review 2026-04-26, Sec 1A; /plan-eng-review 2026-04-27, Sec 4.7.

### Reemplazar order existente en dedup vs DB (no solo ignorar)
- **What**: Cuando D4 detecta order_number ya en DB, ofrecer "ignorar" (default) y "reemplazar" (UPDATE en lugar de INSERT). Hoy solo ignora.
- **Why**: Dispatcher Renner que corrige un teléfono y re-sube el CSV no quiere ignorar; quiere actualizar.
- **Effort (CC)**: M (~3 horas) — backend nuevo PUT endpoint + UI dropdown.
- **Depends on**: feedback Renner durante piloto (D+5).
- **Source**: /plan-ceo-review 2026-04-26, decisión D4.

---

## P2 — observabilidad y operacional

### Telemetría PostHog del wizard
- **What**: 6 eventos: `import_started`, `step_reached` (con step number), `file_parsed` (con rowCount), `geocoding_failed`, `import_completed` (con createdCount, failedCount), `import_abandoned` (con stepLast).
- **Why**: Sin sensores, debugging del piloto Renner pasa por WhatsApp. Con telemetría, dashboard al instante muestra dónde se traba la gente.
- **Effort (CC)**: S (~1 hora). PostHog ya conectado al proyecto (org Tracking Table proj 201671).
- **Depends on**: confirmar que NO mandamos PII (customer_name, address) en eventos.
- **Source**: /plan-ceo-review 2026-04-26, decisión D2.

### Filtrar PII en logs Railway (ordersImport.ts)
- **What**: Hashear `address` con SHA-256 y omitir `customer_name` en `console.error` y `warnings.push` del backend.
- **Why**: Railway retiene logs ≥30 días; acumular PII de Renner sin política regulatoria innecesario.
- **Effort (CC)**: S (~30 min).
- **Source**: /plan-ceo-review 2026-04-26, decisión 3A.

### Logger central src/application/lib/logger.ts
- **What**: Crear módulo logger centralizado que delegue en `console` en dev y futuro Sentry/PostHog en prod.
- **Why**: Hoy hay `console.log` sueltos en 5+ files (regla 02-code-style.md prohíbe en prod).
- **Effort (CC)**: S (~30 min).
- **Source**: regla 02-code-style.md sección Logger.

---

## P3 — refactors y optimizaciones

### Caché cliente de geocoding
- **What**: Antes de llamar Railway `/geocode/batch`, leer `geocoding_cache` table por hash(address). Solo geocodificar misses.
- **Why**: Aprovecha tabla existente (mig 021); reduce 60-80% llamadas si dispatcher itera.
- **Effort (CC)**: M (~1-2 días). Decidir TTL, hashing, coherencia con cache server-side.
- **Depends on**: verificar primero que cache server-side ya no resuelve esto.
- **Source**: /plan-ceo-review 2026-04-26, decisión D5.

### useTabularImport hook compartido
- **What**: Extraer de OrdersImportWizard y CustomerImportModal el hook común con parsing + mapping + autodetect.
- **Why**: Hoy duplicación parcial (~150 LOC). Cuando aterrice un 3er importer (Shopify/VTEX), la abstracción se justifica.
- **Effort (CC)**: M (~half day).
- **Depends on**: 3er importer real (post-piloto, cliente #2-3).
- **Source**: /plan-ceo-review 2026-04-26, decisión D9.

### Multi-sheet selector completo en Step 1
- **What**: Si XLSX trae múltiples pestañas, dropdown para elegir. Hoy solo warning del baseline.
- **Why**: Cuando Renner exporte libro Excel del ERP con la pestaña buena en posición 2.
- **Effort (CC)**: S (~2 horas).
- **Depends on**: feedback Renner durante piloto.
- **Source**: /plan-ceo-review 2026-04-26, decisión D10.

### Extraer useStopImport desde StopsPage.tsx
- **What**: TODO existente (presentation/features/stops/hooks/index.ts:1).
- **Why**: Refactor pendiente de fase-5b. No relacionado con wizard de orders pero está en el mismo dominio.
- **Effort (CC)**: M.
- **Source**: TODO inline existente.

---

## P4 — nice-to-have post-piloto

### Virtualización tabla preview Step 3
- **What**: `@tanstack/react-virtual` cuando `previewRows.length > 500`.
- **Why**: Backend cap es 2K hoy, así que P4. Si crece, P2.
- **Effort (CC)**: S (~2 horas).

### Lazy-load del ImportWizard
- **What**: `React.lazy(() => import('./ImportWizard'))` en OrdersPage.
- **Why**: Wizard pesa ~330KB gzipped (read-excel-file + Mapbox); lazy reduce bundle inicial.
- **Effort (CC)**: S (~30 min).

### Feature flag import_wizard_v2
- **What**: Variable de env `VITE_IMPORT_WIZARD_VERSION` con `if v2 ...`.
- **Why**: Solo si hay clientes activos no-Renner usando el wizard hoy.
- **Effort (CC)**: S (~30 min).

### Cobertura de tests al 100%
- **What**: Llegar a 100% coverage post-piloto. Hoy P0 son 7 unit + 1 E2E (~85% confianza).
- **Why**: Regla del proyecto "well-tested code es non-negotiable".
- **Effort (CC)**: M (~half day).
