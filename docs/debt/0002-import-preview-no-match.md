---
id: 0002
title: Preview del Import Wizard nunca muestra matches contra customers / stops
area: orders / import-wizard
severity: medium
status: open
created: 2026-05-24
created_by: le-quesne
related_commit: 334e831 (scaffold inicial de backend-railway)
---

## Qué pasa

En el ImportWizard, los contadores de Step 3 (Vista previa) y Step 4 (Confirmar) — `Clientes conocidos`, `Match medio`, `Ubicaciones nuevas` — siempre muestran `0 / 0 / N` aunque las filas que se están por importar SÍ existan en la tabla `customers` (por `customer_code`) o en `stops` (por dirección).

El match real ocurre recién al submitear, dentro de `backend-railway/src/routes/ordersImport.ts` (caso A por `match_stop_for_order`, caso B por lookup de `customer_code`). El usuario ve el resultado solo en los warnings post-import (`[2176] cliente sin dirección registrada`, etc.), no antes.

## Por qué se dejó pasar

- El bug original que disparó la investigación (`customer_email` column missing) ya está resuelto en producción tras el deploy de Node 22 (PR #26). El import funciona.
- Cerrar el gap del preview requiere trabajo no trivial:
  - Backend: endpoint nuevo `/orders/match-preview` (o enriquecer `/geocode/batch`) que para cada fila resuelva por `customer_code` (lookup `customers`) y por `address` (RPC `match_stop_for_order`).
  - Frontend: `runGeocoding` solo manda `{ id, address }` — falta pasar `customer_name` y `customer_code`. Y `Step3Preview` necesita procesar y mostrar la info enriquecida.
  - Tests para los dos caminos.
- Decisión consciente: con cero clientes en producción y warnings ya cubriendo el feedback post-submit, el costo de oportunidad no justifica el fix ahora.

## Impacto

- **UX confuso**: el dispatcher ve "104 ubicaciones nuevas" pero post-import descubre que muchas ya existían y fueron linkeadas a customers/stops del catálogo. Da sensación de que el sistema "no reconoce" a sus clientes habituales.
- **No bloquea funcionalidad**: los pedidos se crean correctamente con `customer_id` / `stop_id` resueltos.
- **Más doloroso a escala**: en imports grandes (1000+ filas) la falta de visibilidad previa amplifica la ansiedad del usuario.

## Cómo reproducirlo

1. Tener al menos un `customer` registrado con `customer_code = "X"` en el org.
2. Importar un CSV cuya columna `customer_code` mapee a códigos que ya existan en `customers`.
3. En Step 3/4 del wizard, observar que `Clientes conocidos` queda en `0` aunque los códigos coincidan.
4. Submitear y verificar que el ImportReport muestra warnings tipo `[code] cliente sin dirección registrada; pedido importado como pendiente` y/o pedidos creados con `customer_id` no nulo — prueba de que el match SÍ existe en backend al submit.

## Workaround actual

Ninguno en UI. El usuario tiene que submitear y leer los warnings/contadores post-import para enterarse de los matches. Como mitigación operacional, dejar claro al dispatcher que "ubicaciones nuevas" en el preview es un upper-bound, no el valor real.

## Cómo se arregla bien

**Backend** (`backend-railway/src/routes/`):
1. Nuevo endpoint `POST /orders/match-preview` que recibe `[{ id, address?, lat?, lng?, customer_name, customer_code? }]` y para cada fila:
   - Si hay `customer_code`: lookup en `customers` → si existe, devolver `customerId` + `matchQuality: 'high'`.
   - Si hay address: llamar `match_stop_for_order` RPC (ya existe) y devolver `stopCandidateId` + `matchQuality` + datos del candidato (address, customer_name, use_count).
   - Devolver shape compatible con `GeocodeOutput` (campos `stopCandidateId`, `matchQuality`, `candidateAddress`, `candidateCustomerName`, `candidateUseCount`) que el frontend ya espera leer.
2. Alternativa simpler: enriquecer `/geocode/batch` para que el payload acepte `customer_name`/`customer_code` opcional por fila y haga el match inline después del geocoding. Menos quirúrgico pero acopla geocoding con matching.

**Frontend** (`src/presentation/features/orders/components/ImportWizard/`):
1. `steps/Step3Preview/runGeocoding.ts` → extender `GeocodeInput` con `customer_name` / `customer_code` opcionales, y pasarlos en el POST a `/geocode/batch` (o llamar al endpoint nuevo).
2. `steps/Step3Preview/index.tsx` (~línea 157) → al armar `inputs`, incluir `customer_name`/`customer_code` desde `r.values`.
3. Los counters en `Step4Confirm.tsx` ya leen `matchQuality` — deberían empezar a reflejar valores no-cero solos.

**Tests**:
- Unit del nuevo endpoint para los 4 casos: `match by code`, `match by address`, `match by ambos`, `no match`.
- Test de `runGeocoding` con payload extendido.

## Notas

- El cliente de Postgres (`match_stop_for_order` RPC, `customers.customer_code` unique index) ya soporta todo lo necesario. La gap es 100% en la capa de transporte.
- Si en algún momento se decide migrar el ImportWizard a un flujo "Vista previa server-side" más rico (ej. mostrar suggestions de address dedup tipo Mapbox), conviene cerrar esta deuda primero o como parte del mismo PR.
