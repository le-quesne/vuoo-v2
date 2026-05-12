# Vuoo V2 — Funcionalidades faltantes vs competencia

> Análisis comparativo contra competidores LATAM y globales del espacio TMS / last-mile.
>
> **Última actualización:** Mayo 2026
> **Versión anterior:** Abril 2026 (varios P0 ya cerrados — ver sección "Lo que se shippeó")

---

## Resumen ejecutivo

Vuoo cerró en las últimas 6 semanas los 4 gaps críticos identificados en Abril 2026: **app móvil con POD + GPS + offline**, **tracking GPS en vivo con Torre de Control**, **tablas de customer experience** (tracking token, notification logs, feedback) y **API tokens por organización**.

Pero el cierre de esos gaps revela uno nuevo: las **tablas existen pero el loop end-to-end de experiencia del cliente todavía no está cerrado** (faltan Edge Functions de WhatsApp, página pública `/track/:token`, surveys en mobile). Además, el mercado se movió en 2026 hacia tres tendencias que el análisis original no capturaba: **agentes IA autónomos**, **orquestación multi-carrier** y **compliance enterprise como wedge de venta**.

Este documento actualiza la matriz P0/P1/P2 reflejando estado real, agrega 4 competidores nuevos (Routal, Drivin, Shipsy, Locus) y reordena el roadmap.

---

## Lo que se shippeó desde Abril 2026

Cerrado total o parcialmente (ya no son P0):

| Feature original | Estado | Evidencia en código |
|---|---|---|
| App móvil para conductores | Cerrado | `mobile/` Expo Router, home + ruta detalle + ejecución parada |
| GPS tracking en vivo + Torre de Control | Cerrado | `useLiveRoutes`, `useControlRealtime`, clusterización de markers (commit 770b8e6) |
| GPS en background iOS | Cerrado | TaskManager + `expo-location`, TestFlight production (commit 83f705f) |
| POD foto + firma + GPS geo-stamped | Cerrado | `SignatureCapture.tsx`, `PODModal.tsx`, buckets `delivery-photos` + `signatures` |
| Modo offline con sync queue | Cerrado | `mobile/src/lib/offline.ts` (SQLite + NetInfo) |
| Push notifications | Cerrado | Edge Function `send-push`, `device_tokens`, deep-link a ruta |
| Gestión de conductores separada de vehículos | Cerrado | Migration 003 + `drivers/` feature + `useDriverAvailability` |
| Customer experience — esquema | Cerrado | Migration 005 (tracking_token, customer_*, notification_logs, delivery_feedback, org_notification_settings) |
| Org API tokens | Cerrado | Migration 024 + `apiTokens.services.ts` + `ApiTokensTab` |
| Import CSV de pedidos + geocoding + dedupe | Cerrado | `ImportWizard/` con PinDropMap, MatchReviewModal, hooks de recovery |
| Cuenta demo aislada para sales/Apple review | Cerrado | `is_demo=true`, `demo-simulator` edge function, reset CLI |
| Datasul ERP (Renner) — primer conector | Cerrado | `DatasulDownloadPage`, enrich script |

Sigue pendiente o parcial:

| Feature | Estado | Qué falta |
|---|---|---|
| WhatsApp customer flow end-to-end | Esquema listo | Edge Function `send-notification` con Meta Cloud API + templates aprobados + UI de configuración wizard |
| Página pública de tracking `/track/:token` | Esquema listo | Componente React + Edge Function `get-tracking-status` + branding por org |
| Surveys post-entrega + NPS dashboard | Esquema listo | Edge Function `send-survey` + UI captura rating en tracking page + dashboard en analytics |
| Optimización con time-windows + capacity como hard constraints | Parcial | Verificar que `VroomWizardModal` exponga estos parámetros al usuario |
| Webhooks salientes | No iniciado | Tabla de suscripciones, retry exponential, eventos plan_created/route_started/stop_completed |
| API REST documentada (no solo tokens) | Parcial | Tokens existen, falta capa REST estable + OpenAPI/Swagger + rate limiting + SDK |

---

## P0 — Crítico (must-have, mercado lo exige)

### 1. Loop completo de experiencia del cliente

Las tablas ya existen (migración 005). Falta cerrar el ciclo:

- [ ] Edge Function `get-tracking-status` (lee `plan_stops` + `driver_locations` + POD por token)
- [ ] Página pública `/track/:token` con mapa Realtime + timeline + ETA dinámico + branding por org
- [ ] Edge Function `send-notification` con Meta Cloud API (WhatsApp) + Resend (email)
- [ ] Templates WhatsApp pre-aprobados: `delivery_scheduled`, `delivery_in_transit`, `delivery_arriving`, `delivery_completed`, `delivery_failed`
- [ ] Wizard de configuración de notificaciones en Settings (UI ya empezada en `NotificationSettingsPage`)
- [ ] Edge Function `send-survey` (cron 30 min post-delivery)
- [ ] Captura de feedback en `/track/:token#feedback` (rating 1-5 + comentario)
- [ ] Dashboard NPS por conductor / org en AnalyticsPage

**Por qué P0**: SimpliRoute, Beetrack, Routal, Shipsy y Onfleet lo tienen completo. En LATAM, WhatsApp + página de tracking branded es el primer filtro que aplica un comprador retail. Sin esto el deal se cae en demo.

### 2. Webhooks salientes + API REST documentada

- [ ] Tabla `org_webhook_subscriptions` (url, secret, eventos suscritos)
- [ ] Edge Function `dispatch-webhook` con retry exponential (3 intentos, backoff 1m/5m/30m)
- [ ] Eventos mínimos: `plan.created`, `plan.published`, `route.started`, `route.completed`, `stop.completed`, `stop.failed`, `stop.reassigned`
- [ ] Capa REST estable sobre los servicios (no exponer Supabase client directo a terceros)
- [ ] Documentación OpenAPI/Swagger autogenerada
- [ ] Rate limiting por org token (p.ej. 100 req/min)
- [ ] SDK Node.js mínimo

**Por qué P0**: Routific, Onfleet, SimpliRoute (9 eventos), Route4Me todos tienen webhooks. Sin esto Vuoo no se puede integrar a Shopify/VTEX/Zapier — y sin integraciones no entra a clientes de e-commerce.

### 3. Conectores e-commerce nativos (al menos uno)

- [ ] **VTEX** (dominante en Chile/LATAM retail — Beetrack y SimpliRoute lo tienen)
- [ ] **Shopify** (referencia global — Track-POD, OptimoRoute, Routal, Circuit lo tienen)
- [ ] **Tiendanube** (mercado argentino/mexicano)
- [ ] Mapeo automático orden → parada con geocoding
- [ ] Sync de status: stop completed → orden marcada como entregada en e-commerce

**Por qué P0**: Es la palanca de adquisición SMB más fuerte del segmento. VTEX en LATAM no es opcional para retail.

### 4. POD multi-formato (más allá de foto + firma)

- [ ] **Barcode/QR scanner** en mobile (verificar paquete por SKU/tracking)
- [ ] **PIN de entrega** (cliente recibe PIN vía WhatsApp, conductor lo ingresa)
- [ ] **Formularios POD custom** (builder de campos: texto, número, select, checkbox, foto adicional)
- [ ] **Razón de fallo estructurada** (cliente ausente, dirección errónea, rechazo, etc.) — verificar si ya está en `IncidentReportModal`
- [ ] Templates de POD por tipo de cliente / tipo de entrega

**Por qué P0**: Track-POD, Onfleet (Scale tier), Beetrack y OptimoRoute tienen barcode + custom forms estándar. Para B2B (distribución mayorista, farma, food service) sin esto el cliente queda fuera.

---

## P1 — Importante (diferencia entre MVP y producto real)

### 5. Optimización avanzada del wizard Vroom

Vroom soporta time-windows, capacity, skills, pickup+delivery — hay que exponerlos en UI:

- [ ] Time-windows duras (no solo soft) en la optimización
- [ ] Restricciones de capacidad (peso + volumen) configurables por vehículo
- [ ] Balanceo de carga entre vehículos (modos: workload / distancia / costo)
- [ ] Multi-depot con depot dinámico mid-route (vehicle vuelve a recargar)
- [ ] Skills matching (refrigerado, certificación, hazmat, idioma)
- [ ] Pickup + delivery mezclados en una misma ruta
- [ ] Plantillas de rutas recurrentes (lunes carga X, martes carga Y)
- [ ] Preview de ruta optimizada antes de aplicar (diff con plan anterior)

### 6. Analytics avanzados (OTIF, costo, performance)

Estado actual: dashboards básicos. Lo que falta es estándar:

- [ ] **OTIF** (On-Time In-Full) por ruta / conductor / cliente
- [ ] Costo por entrega (combustible + tiempo + distancia + driver pay)
- [ ] Planned vs Actual (distancia, tiempo, paradas completadas)
- [ ] Ranking de conductores con scorecard (entregas a tiempo, fallos, tiempo en parada)
- [ ] Análisis address-level: qué direcciones consistentemente tienen problemas
- [ ] Exports a CSV/PDF
- [ ] Charts interactivos (no solo barras de progreso)

### 7. Drag & drop entre rutas + timeline view

- [ ] Mover paradas **entre rutas** (no solo reordenar dentro). Ya hay `RouteDropZone` y `SortablePlanStop` — verificar si soportan cross-route
- [ ] Timeline / Gantt view de todas las rutas del día
- [ ] Selección múltiple de paradas (shift-click) para reasignación bulk
- [ ] Asignar paradas desde el mapa (click en pin → menú "Asignar a ruta…")
- [ ] Undo/redo para cambios de planificación

### 8. Two-way driver ↔ dispatcher communication

- [ ] Chat in-app simple (mobile ↔ web) — usar Supabase Realtime
- [ ] Notas por parada visibles al chofer (probablemente ya existe vía `notes`, verificar UX)
- [ ] Push para mensajes urgentes
- [ ] Llamada con número anonimizado (referencia Onfleet) — fase 2

---

## P2 — Diferenciador (ventaja competitiva, no urgente)

### 9. Gestión de territorios y zonas

- Dibujar zonas en el mapa (geofencing)
- Asignar conductores a zonas
- Auto-clustering de paradas por zona en planificación
- Zonas de exclusión (Beetrack: AI Territory Planner; SimpliRoute: zone blocking)

### 10. Multi-fleet / proveedores externos

Concepto clave para enterprise:

- Modelo de "proveedor de transporte" externo además de flota propia
- Asignar rutas a 3PL externos
- Visibilidad unificada propia + tercerizada (Onfleet, Beetrack FleetMaster, Bringg ROAD)
- Liquidación / settlement automatizado de carriers (referencia Drivin, SimpliRoute, Shipsy Nexa)

### 11. Self-scheduling / customer booking

- Widget embeddable para que cliente final elija ventana de entrega al momento de comprar
- Slots disponibles calculados según capacidad
- Reschedule por el cliente cuando falla entrega (referencia DispatchTrack)

### 12. Sustainability / CO2 tracking

- Cálculo de emisiones por ruta (distancia × tipo combustible × consumo)
- Dashboard de huella de carbono por periodo
- Soporte vehículos eléctricos (rango, estaciones de carga)
- Útil para reporting ESG corporativo (empieza a ser bloqueador en RFPs grandes)

### 13. Compliance enterprise

Esto es certificación + control, no solo código:

- [ ] SOC 2 Type II (referencia Shipsy)
- [ ] ISO 27001:2022 (referencia Drivin — lo usan como wedge enterprise)
- [ ] PII masking en logs y audit trails
- [ ] Audit logs inmutables (Shipsy)
- [ ] Certificación en SAP Store (referencia Drivin)

Sin esto el techo de venta enterprise está en USD 30-50k/año.

### 14. Verticales especializadas

Elegir 1 o 2 verticales y profundizar:

- **Cold chain / temperatura** (DispatchTrack, SimpliRoute, Beetrack) → farma + foodservice
- **Big & bulky** (DispatchTrack es dominante US) → muebles, electrodomésticos
- **Hazmat / mercancía peligrosa** (Beetrack es único en esto en LATAM) → gas, cemento, químicos
- **Quick commerce** (DispatchTrack, Shipsy, LogiNext) → entregas en minutos con geofencing

---

## Tendencias 2026 — no urgentes pero importantes de observar

### Agentes IA autónomos

No recomendación, sino ejecución autónoma:

- **SimpliRoute ADA**: agentes que reintentan entregas fallidas y resuelven incidentes sin escalar a humano
- **Shipsy AgentFleet**: 4 agentes nombrados (Clara para CX/WhatsApp, Astra para driver-ops, Nexa para finanzas, Vera para disputas)
- **Locus**: "agentic TMS" enterprise

**Para Vuoo**: requiere histórico que aún no tienes. Ir poblando `event_log` con esto en mente (etiquetar causas, intervenciones, resultados) para tener data de entrenamiento en 12-18 meses.

### Multi-carrier orchestration

Donde está moviéndose el dinero enterprise:

- **Bringg**: 250+ carriers integrados, 70 países
- **Locus ShipFlex**: allocation dinámica según performance live por shipment/lane
- **Shipsy**: 240+ carrier integrations

**Para Vuoo**: empezar por el modelo de "proveedor externo" + liquidación (P2 #10) antes de pensar en orchestration global.

### Compliance como wedge de venta

Drivin está agresivamente usando ISO 27001 + SOC 1 + cert SAP Store para abrir puertas enterprise que Vuoo no puede tocar todavía. Inversión proporcionalmente baja (USD 30-60k de consultoría + auditoría) y desbloquea pricing 3x.

### Conectores ERP certificados

SAP B1, S/4HANA, Oracle NetSuite, Microsoft Dynamics, Manhattan. **Drivin** lo está usando como vector de entrada al mid-market industrial. **SimpliRoute** lo tiene. **Vuoo** tiene Datasul custom (Renner) pero no producto repetible.

---

## Matriz prioridad vs esfuerzo (actualizada)

| Feature | Prioridad | Esfuerzo | Impacto |
|---|---|---|---|
| Loop customer experience (WhatsApp + tracking page + surveys) | P0 | Medio | Crítico — bloqueador en demo |
| Webhooks + REST API + SDK | P0 | Medio | Crítico — desbloquea ecosistema |
| Conector VTEX o Shopify | P0 | Medio | Crítico — adquisición SMB retail |
| POD multi-formato (barcode + PIN + custom forms) | P0 | Medio | Crítico — bloqueador B2B |
| Optimización Vroom avanzada (time-windows, capacity, multi-depot) | P1 | Bajo-Medio | Alto — calidad de producto |
| Analytics avanzados (OTIF, costo, ranking) | P1 | Medio | Alto — decisión de compra |
| Drag & drop entre rutas + timeline | P1 | Medio | Medio — UX de planificación |
| Two-way driver-dispatcher chat | P1 | Bajo | Medio — operaciones |
| Conector SAP B1 certificado | P1 | Alto | Alto enterprise — wedge Drivin |
| Liquidación de carriers 3PL | P2 | Alto | Medio — abre vertical 3PL |
| Territorios / zonas | P2 | Medio | Medio — operaciones grandes |
| Multi-fleet / proveedores externos | P2 | Alto | Medio — enterprise |
| Self-scheduling cliente | P2 | Alto | Medio — CX avanzado |
| Sustainability / CO2 | P2 | Bajo | Bajo-Medio — ESG futuro |
| SOC 2 + ISO 27001 | P2 | Alto (no-código) | Alto enterprise — techo de venta |
| Cold chain | P2 | Medio | Alto si entras a farma/food |
| Agentes IA autónomos | P3 | Muy alto | Diferenciador 2027+ |

---

## Top 5 picks recomendados para los próximos 60 días

1. **Cerrar el loop customer experience** — Edge Functions de WhatsApp + tracking page pública + surveys. Las tablas ya están, el costo marginal es ~1 sprint y desbloquea la conversación con cualquier prospecto retail en LATAM.
2. **Webhooks + REST API estable + OpenAPI** — pre-requisito para todo lo demás. Sin esto los conectores e-commerce son frágiles.
3. **Conector VTEX nativo** — entry point retail LATAM. Beetrack y SimpliRoute lo tienen; sin esto pierdes a Falabella, Ripley, Walmart, Cencosud.
4. **POD multi-formato (barcode + PIN + razón fallo estructurada)** — bloqueador B2B y abre verticales (farma, food, big & bulky).
5. **Optimización Vroom avanzada en wizard** — exponer time-windows duras, capacity y multi-depot que Vroom ya soporta. Esfuerzo bajo, calidad de producto alta.

**No hacer todavía**: agentes IA autónomos, multi-carrier orchestration enterprise tipo Bringg/Locus, reverse logistics. Son apuestas grandes que requieren datos o equipo que aún no se tiene.

---

## Mapa competitivo actualizado

### Competidores LATAM directos

| Capacidad | SimpliRoute | Beetrack/DispatchTrack | Drivin | Routal | **Vuoo (Mayo 2026)** |
|---|---|---|---|---|---|
| Precio público | USD 32-40/veh/mes | Enterprise custom | Enterprise custom | USD 20-95/veh/mes | Pendiente |
| App móvil | Sí | Sí | Sí | Sí | **Sí** |
| GPS tracking en vivo | Sí | Sí (geofencing) | Sí | Sí | **Sí** |
| WhatsApp customer flow | Sí (nativo) | Sí | Sí | Sí (nativo) | Esquema listo, falta E2E |
| Tracking page branded | Sí | Sí | Sí | Sí (white-label) | Esquema listo, falta UI |
| POD multi-formato | Foto+firma+PIN+barcode | Foto+firma+PIN | Foto+firma+barcode | Foto+firma+PIN+barcode+forms | Solo foto+firma |
| API + Webhooks | Sí + SDKs | Sí | Sí | Sí | API tokens, falta REST + webhooks |
| Optimización | 3 algoritmos propios | AI/ML + cold chain | IA + capacity | Estándar | Vroom (potente, sub-expuesto) |
| Conector VTEX | Sí | Sí | — | — | No |
| Conector SAP B1 certificado | Sí | — | **Sí (SAP Store)** | — | No (Datasul custom) |
| ISO 27001 / SOC | — | — | **ISO 27001:2022 + SOC 1** | — | No |
| Cold chain | Sí | Sí | Indirecto | Sí | No |
| Agentes IA autónomos | **Sí (ADA)** | — | — | — | No |
| Multi-tenant SaaS self-serve | Sí | No (enterprise) | No (enterprise) | Sí (trial 10 días) | **Sí** |
| Admin panel super-admin | No público | No público | No público | No público | **Sí** |
| Mapas interactivos (Mapbox GL) | Básico | Básico | Básico | Estándar | **Mapbox GL avanzado** |

### Competidores globales relevantes

| Plataforma | Diferenciador clave | Pricing | Vertical fuerte |
|---|---|---|---|
| **Onfleet** | Mejor mobile UX + API mid-market más madura | USD 619-3,099/mes | Grocery, pharmacy, courier |
| **Circuit / Spoke** | Simplicidad extrema para SMB | USD 100-750/mes | Owner-operators, courier locales |
| **OptimoRoute** | Optimización multi-day + skills + capacity | USD 35-44/driver/mes | Field service, HVAC, B2B |
| **Routific** | Pricing por orden, no por driver | USD 0-150 flat + volumen | SMB grocery, 3PL |
| **Track-POD** | El más fuerte en POD/paperwork | USD 59-99/driver/mes | B2B distribution, food wholesale |
| **Bringg** | Multi-carrier orchestration (250+) | Enterprise USD 50k+/año | Enterprise retail, grocery |
| **Locus.sh** | Geocoding + optimización para mercados emergentes | Enterprise | Retail, FMCG, manufacturing |
| **Wise Systems** | "Autonomous routing" con ML sobre histórico | Enterprise | F&B distribution, fuel |
| **DispatchTrack** | Líder big & bulky / furniture | USD 50k+/año | Furniture, appliances, white-glove |
| **Project44** | Visibility platform multi-modal | Enterprise | Enterprise shippers, 3PL globales |

---

## Ventajas competitivas actuales de Vuoo (Mayo 2026)

1. **Multi-tenant SaaS con self-serve signup** — Beetrack/Drivin/Locus son todos enterprise puro, no compiten en SMB.
2. **UI moderna con Mapbox GL** — gana visualmente vs SimpliRoute / Beetrack (mapas más ricos).
3. **Panel super-admin** — capacidad de operar la plataforma como ops team, no la tienen los competidores LATAM públicamente.
4. **Stack moderno (React 19, Vite, Supabase, Expo)** — iteración rápida vs stacks legacy de Beetrack/Drivin.
5. **Vroom + OSRM en Railway** — engine de optimización serio (potencialmente superior a SimpliRoute/Beetrack si se expone bien al usuario).
6. **Mobile app shipped en TestFlight** — paridad con SimpliRoute/Beetrack en lo crítico.
7. **Demo aislada para sales** — capacidad de demoear en paralelo sin pisarse, no la tiene nadie más en el espacio.
8. **Cuenta Apple review pública** — facilita certificación iOS recurrente.

## Donde Vuoo todavía pierde

1. **Customer flow end-to-end no cerrado** — esquema sin Edge Functions ni UI pública.
2. **Sin conectores e-commerce** — VTEX/Shopify es no-negociable en LATAM retail.
3. **Sin webhooks ni REST API estable** — bloqueador de integraciones serias.
4. **POD solo foto + firma** — sin barcode/PIN/forms custom queda fuera de B2B.
5. **Optimización avanzada del wizard subexpuesta** — Vroom soporta más de lo que la UI permite.
6. **Sin conector ERP certificado** (SAP B1, NetSuite) — bloqueador mid-market industrial.
7. **Sin compliance enterprise** (SOC 2, ISO 27001) — techo de pricing.
8. **Sin verticales especializadas** (cold chain, hazmat, big & bulky) — comoditización en horizontal.

---

## Conclusión

Vuoo cerró Mayo 2026 con paridad funcional **core operativa** vs los competidores LATAM de referencia: planificación, ejecución móvil con POD + GPS + offline, tracking en vivo y panel de control. El siguiente cuello de botella ya **no es el producto operativo**, sino:

1. **Cerrar el loop con el cliente final** (WhatsApp + tracking + surveys) — costo bajo, valor alto en LATAM.
2. **Abrir el ecosistema** (REST + webhooks + Shopify/VTEX) — palanca de adquisición SMB.
3. **Profundizar el wizard de optimización** — sacar ventaja del engine Vroom que ya pagaste en infraestructura.
4. **Decidir el camino enterprise** (compliance + ERP + verticales) o **doblar SMB self-serve** (pricing público + onboarding + integraciones).

La buena noticia: con el stack actual (Supabase + Vroom Railway + React Native), los 4 picks del top recomendado son implementables en 60-90 días sin reescribir nada.
