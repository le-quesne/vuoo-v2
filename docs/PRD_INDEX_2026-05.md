# Índice de PRDs — vuoo-v2 (Mayo 2026)

> Este índice reorganiza el backlog actual en **12 PRDs nuevos (13–24)** que
> cierran todos los puntos abiertos en `TODOS.md` y `docs/MISSING_FEATURES.md`,
> más la decisión estratégica de arquitectura AI-native.
>
> Los PRDs 01–12 siguen siendo la fuente para producto **core operativo**
> (flota, ejecución, planificación, torre de control). Los nuevos PRDs son
> **incrementales**: cierran loops abiertos, expanden ecosistema y abren
> verticales/enterprise.
>
> **PRD 24** introduce un cambio de paradigma: la transición de
> *AI-enabled* a *AI-native*. Acompañado del memo de investigación
> [`research/AI_NATIVE_AND_LOOPS_2026.md`](./research/AI_NATIVE_AND_LOOPS_2026.md).

---

## PRDs existentes (01–12)

| # | PRD | Estado |
|---|-----|--------|
| 01 | Gestión de Flota | activo |
| 02 | Ejecución Terreno | activo |
| 03 | Experiencia Cliente | activo (cierra loop en **PRD 13**) |
| 04 | Plataforma Ecosistema | **DEPRECADO** → reemplazado por **PRD 14** |
| 05 | Analytics & Reportes | activo (extiende en **PRD 20**) |
| 06 | Optimización Inteligente | activo (extiende en **PRD 19**) |
| 07 | UX Planificación | activo (extiende en **PRD 21**) |
| 08 | Torre de Control | activo |
| 09 | Pedidos | activo |
| 10 | Refactor Arquitectura | activo |
| 11 | Refactor Fase NB | activo |
| 12 | Flujo Pedido → Ruta | activo |

---

## PRDs nuevos (13–26)

| # | PRD | Pri | Cubre |
|---|-----|-----|-------|
| **13** | Loop Experiencia Cliente E2E | P0 | WhatsApp + `/track/:token` + surveys + NPS |
| **13b** | Loop Experiencia Cliente (Email-only, Fase 1) | P0 | Webhook + retry + survey email + NPS dashboard (sin WhatsApp) |
| **14** | Plataforma Ecosistema (API + Webhooks + SDK) | P0 | REST estable + OpenAPI + webhooks + SDK Node + rate limiting |
| **15** | Conectores (E-commerce + ERP) | P0/P1 | VTEX, Shopify, Tiendanube, SAP B1, NetSuite, Dynamics |
| **16** | POD Avanzado | P0 | Barcode, PIN, forms custom, razón fallo estructurada, templates |
| **17** | Hardening Operacional & Tech Debt | P1/P2 | Todos los tactical TODOs (import, observability, polish, refactor) |
| **18** | Seguridad & Compliance | P1/P2 | RLS hardening, push auth, SOC 2, ISO 27001, audit logs |
| **19** | Optimización Vroom Avanzada | P1 | Time-windows duras, capacity, skills, pickup+delivery, balanceo, plantillas, preview diff (multi-depot extraído a PRD 25) |
| **20** | Analytics Operacionales | P1 | OTIF, costo/entrega, planned vs actual, scorecards, exports |
| **21** | Planificación Colaborativa | P1 | Drag&drop cross-route, timeline/Gantt, chat dispatcher↔driver |
| **22** | Expansión Enterprise & Verticales | P2 | Territorios, multi-fleet 3PL, self-scheduling, sustainability, verticales (cold/bulky/hazmat) |
| **23** | Inteligencia Autónoma — capacidades en producto | P3 | Roadmap de capacidades de agentes en el producto. Diferido hasta validar PRD 24 + 2 dominios más |
| **24** | **Vuoo Backoffice (Company OS)** | **P0** | **Web app `backoffice.vuoo.cl` construida desde cero. Stack: Vite + React + shadcn + Supabase (schema `backoffice.*`) + Edge Functions + Claude + Resend + Gmail OAuth + Firecrawl. Módulo 1 sales en 4 semanas. Crece módulo a módulo (soporte, ops, eng, finance)** |
| **25** | Multi-Depot | P1 | Modelo de depots por org (warehouse/dark_store/cross_dock) + RLS por depot + DepotSwitcher UI + Vroom multi-depot + inter-depot transfers + analytics por depot. Extrae §E de PRD 19 |
| **26** | Optimización Ponderada y Aprendizaje Histórico | P1 | Quick wins Vroom (priority, skills, volumen, per_km, max_stops) + matriz de costo propia (OSRM `/table` + `matrices.costs`) + dwell time real vía geofence sobre `driver_locations` + sesgo histórico de agrupación de stops. Extiende PRD 19 |

---

## Matriz de trazabilidad — TODOs.md → PRD

| TODO original | Sección | PRD destino |
|---|---|---|
| Backend transaccional `/orders/import` | P1 | **PRD 17** §A.1 |
| Reemplazar order existente dedup vs DB | P1 | **PRD 17** §A.2 |
| Telemetría PostHog wizard | P2 | **PRD 17** §B.1 |
| Filtrar PII logs Railway | P2 | **PRD 18** §A.4 |
| Logger central `src/application/lib/logger.ts` | P2 | **PRD 17** §B.2 |
| Caché cliente geocoding | P3 | **PRD 17** §C.1 |
| `useTabularImport` hook compartido | P3 | **PRD 17** §C.2 |
| Multi-sheet selector XLSX Step 1 | P3 | **PRD 17** §C.3 |
| Extraer `useStopImport` de StopsPage | P3 | **PRD 17** §C.4 |
| Virtualización tabla preview Step 3 | P4 | **PRD 17** §D.1 |
| Lazy-load `ImportWizard` | P4 | **PRD 17** §D.2 |
| Feature flag `import_wizard_v2` | P4 | **PRD 17** §D.3 |
| Cobertura tests 100% wizard | P4 | **PRD 17** §D.4 |
| Push notifications retry + `notifications_sent_at` | P2 (gaps) | **PRD 17** §B.3 |
| Migrar a RLS nativo (Approach B) | P3 (gaps) | **PRD 18** §B.2 |
| Autorización `send-push` Edge Function | P2 (gaps) | **PRD 18** §A.1 |
| RLS publish solo admin/owner | P2 (gaps) | **PRD 18** §A.2 |
| Mobile route detail filtrar `plan.status` | P3 (gaps) | **PRD 18** §B.3 |
| Pasada bulk ortografía | P2 (QA) | **PRD 17** §E.1 |
| Migración SQL `list_stop_duplicates` | P2 (QA) | **PRD 17** §A.3 |
| aria-label "Acknowledge alert" español | P3 (QA) | **PRD 17** §E.2 |
| `/admin` redirect notificar | P3 (QA) | **PRD 17** §E.3 |
| Auditoría RPCs frontend vs migrations | P3 (QA) | **PRD 17** §E.4 |
| Aplicar `userMessage()` en codebase | P4 (QA) | **PRD 17** §E.5 |

## Matriz de trazabilidad — MISSING_FEATURES.md → PRD

| Feature original | Pri | PRD destino |
|---|---|---|
| Loop customer experience (WhatsApp + tracking + surveys) | P0 | **PRD 13** completo |
| Webhooks + REST API + SDK | P0 | **PRD 14** completo |
| Conectores e-commerce (VTEX/Shopify/Tiendanube) | P0 | **PRD 15** §A |
| POD multi-formato | P0 | **PRD 16** completo |
| Optimización Vroom avanzada | P1 | **PRD 19** completo |
| Analytics avanzados (OTIF, costo, ranking) | P1 | **PRD 20** completo |
| Drag&drop cross-route + timeline | P1 | **PRD 21** §A–B |
| Chat driver↔dispatcher | P1 | **PRD 21** §C |
| Conector SAP B1 / NetSuite | P1 | **PRD 15** §B |
| Territorios / zonas | P2 | **PRD 22** §A |
| Multi-fleet / 3PL externos | P2 | **PRD 22** §B |
| Self-scheduling cliente | P2 | **PRD 22** §C |
| Sustainability / CO2 | P2 | **PRD 22** §D |
| SOC 2 + ISO 27001 | P2 | **PRD 18** §C |
| Cold chain / Big & bulky / Hazmat | P2 | **PRD 22** §E |
| Agentes IA autónomos | P3 | **PRD 23** completo |

---

## Orden de ataque sugerido (60–90 días)

**Pista interna (paralelo, separada del producto):**
- **PRD 24** — Vuoo Backoffice (Company OS). Repo nuevo `vuoo-backoffice`,
  web en `backoffice.vuoo.cl`. NO toca `vuoo/app`. Plan mes 1 = módulo Sales
  con 5 loops AI. Mes 2+: soporte, ops, engineering, finance. ~USD 120/mes infra.
- Iteraciones descartadas en este PRD (archivadas):
  - `_DEPRECATED_24_ARQUITECTURA_AI_NATIVE_PRODUCT.md` (reescribir producto AI-native — prematuro)
  - `_DEPRECATED_24_OPS_SALES_N8N.md` (n8n + Slack sin UI — se quería todo en un solo lugar)

**Pista táctica:**

Bloque A — desbloqueo demo y adquisición (semanas 1–6):
1. **PRD 17** §A (hardening import) + §A.3 (list_stop_duplicates) — pre-cliente #2
2. **PRD 13** — loop CX completo
3. **PRD 14** — REST + Webhooks (pre-requisito de PRD 15)

Bloque B — apertura de mercado (semanas 7–12):
4. **PRD 15** §A — conector VTEX
5. **PRD 16** — POD avanzado
6. **PRD 19** — optimización Vroom expuesta

Bloque C — observabilidad y robustez (en paralelo, ongoing):
7. **PRD 17** §B + §E — observability + polish
8. **PRD 18** §A–B — security hardening

Diferido (post 90 días):
- PRDs 20, 21, 22 según pull comercial real.
- **PRD 23** (capacidades de agentes) se reactiva tras PRD 24 mes 3, con
  agentes específicos definidos por outcomes reales del piloto.

---

## Convenciones

- Cada PRD nuevo sigue el formato de los existentes (01–12): contexto,
  objetivos, scope IN/OUT, requisitos funcionales, esquema técnico,
  criterios de éxito, dependencias.
- Las refs cruzadas usan `[[PRD-NN]]` para enlace.
- Cuando un PRD nuevo extiende uno existente (ej. PRD 20 → PRD 05), el
  PRD nuevo manda y el viejo se marca como contexto histórico.
