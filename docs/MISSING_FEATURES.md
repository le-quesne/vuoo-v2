# Vuoo V2 - Funcionalidades Faltantes vs Competencia

> Analisis comparativo contra: OptimoRoute, Routific, Route4Me, Circuit/Spoke, Onfleet, Beetrack/DispatchTrack, SimpliRoute
>
> Fecha: Abril 2026

---

## Resumen Ejecutivo

Vuoo tiene una base solida (multi-tenant, optimizacion basica con Mapbox, gestion de paradas y vehiculos, panel admin). Sin embargo, le faltan funcionalidades criticas que **todos** los competidores ya ofrecen. Este documento prioriza las features faltantes en 3 niveles:

- **P0 - Critico**: Sin esto no puedes competir. Todos los competidores lo tienen.
- **P1 - Importante**: La mayoria de competidores lo tienen. Diferencia entre un MVP y un producto real.
- **P2 - Diferenciador**: Features avanzadas que separan lideres de seguidores.

---

## P0 - CRITICO (Must-Have)

### 1. App Movil para Conductores
**Estado actual:** No existe
**Que tiene la competencia:**
- OptimoRoute: App nativa iOS/Android con navegacion, POD, barcode scanning, modo offline, 20 idiomas
- Routific: App + Lite version, offline completo, navegacion via Google/Waze/Apple Maps
- SimpliRoute: App nativa con Waze/Google Maps integrado
- Circuit/Spoke: App con input por voz, Package Finder, 19 idiomas
- Onfleet: App con scanner ID, chat in-app, navegacion deep-linked

**Que necesita Vuoo:**
- [ ] App React Native / Expo para iOS y Android
- [ ] Lista de paradas del dia con orden y ETA
- [ ] Navegacion turn-by-turn (deep link a Google Maps/Waze)
- [ ] Marcar parada como completada/fallida/cancelada
- [ ] Captura de fotos como prueba de entrega
- [ ] Firma digital del receptor
- [ ] Notas del conductor por parada
- [ ] Modo offline con sync automatico
- [ ] Push notifications cuando se asigna/modifica ruta

---

### 2. Tracking en Tiempo Real (GPS)
**Estado actual:** No existe
**Que tiene la competencia:**
- OptimoRoute: GPS en vivo, breadcrumbs (ruta real vs planificada), ETAs dinamicos
- Route4Me: GPS cada 1 segundo, replay animado, integracion telematica con 12+ proveedores
- Beetrack: Geofencing, ETAs con ML 98% precision, widget embeddable
- SimpliRoute: Tracking predictivo con alertas, monitoreo de temperatura

**Que necesita Vuoo:**
- [ ] Reporte de ubicacion GPS desde app del conductor (cada 30-60s)
- [ ] Mapa en vivo en dashboard del dispatcher con posicion de todos los conductores
- [ ] ETA dinamico por parada basado en posicion actual + trafico
- [ ] Historial de rutas recorridas (breadcrumbs) vs ruta planificada
- [ ] Geofencing basico: deteccion automatica de llegada/salida a parada

---

### 3. Notificaciones al Cliente
**Estado actual:** No existe
**Que tiene la competencia:**
- TODOS ofrecen SMS + Email como minimo
- Beetrack/SimpliRoute: WhatsApp como canal principal (critico para LATAM)
- Onfleet: Notificaciones predictivas con ML, numeros enmascarados
- OptimoRoute: Pagina de tracking branded, 24 idiomas
- Routific: 4 tipos de notificacion automatica + Delivery Tracker

**Que necesita Vuoo:**
- [ ] Pagina de tracking publica con ETA en vivo y mapa
- [ ] Notificacion "Tu pedido esta en camino" (WhatsApp/SMS/Email)
- [ ] Notificacion "Tu conductor esta a X paradas" (proximity trigger)
- [ ] Notificacion "Entrega completada" con foto POD
- [ ] Integracion WhatsApp Business API (critico para Chile/LATAM)
- [ ] Templates personalizables por organizacion

---

### 4. Proof of Delivery (POD) Completo
**Estado actual:** Campos en DB pero sin implementacion funcional (no hay app movil)
**Que tiene la competencia:**
- OptimoRoute: Fotos, firma, notas, barcode/QR, formularios custom
- Route4Me: Fotos, firma, video, barcode, geotagged, workflows obligatorios
- Beetrack: Fotos, firma, PIN delivery via WhatsApp, barcode, formularios custom
- Onfleet: Fotos, firma, barcode, scanner de ID/edad

**Que necesita Vuoo:**
- [ ] Captura de foto geotagged y timestamped (desde app movil)
- [ ] Firma digital del receptor
- [ ] Scanner de barcode/QR para verificacion de paquetes
- [ ] Registro automatico de hora y coordenadas GPS al completar
- [ ] Visualizacion de POD en dashboard del dispatcher
- [ ] Razon de fallo cuando entrega no se completa

---

### 5. Webhook / Event System
**Estado actual:** No existe
**Que tiene la competencia:**
- Routific: Webhooks para eventos de ruta
- SimpliRoute: 9 eventos webhook (plan_created, visit_checkout, etc.)
- Onfleet: Webhooks con scoped API keys
- Route4Me: Sistema completo de eventos + marketplace

**Que necesita Vuoo:**
- [ ] Supabase Realtime subscriptions para cambios en tiempo real
- [ ] Webhook endpoints configurables por organizacion
- [ ] Eventos: plan_created, route_started, stop_completed, stop_failed, route_completed
- [ ] Retry logic (3 intentos con backoff exponencial)

---

### 6. API REST Publica
**Estado actual:** No existe (solo Supabase client directo)
**Que tiene la competencia:**
- TODOS ofrecen REST API documentada
- SimpliRoute: SDKs en Node.js y Python
- Route4Me: SDKs en 8+ lenguajes
- Routific: Engine API standalone para optimizacion

**Que necesita Vuoo:**
- [ ] API REST con autenticacion por API key
- [ ] Endpoints CRUD para: stops, plans, routes, vehicles
- [ ] Endpoint de optimizacion de rutas
- [ ] Documentacion OpenAPI/Swagger
- [ ] Rate limiting por organizacion

---

## P1 - IMPORTANTE (Producto Real)

### 7. Reportes y Analytics Avanzados
**Estado actual:** Solo conteo basico de planes/paradas/vehiculos
**Que tiene la competencia:**
- OptimoRoute: Planned vs Actual, NPS, arrival accuracy, distance analysis
- Route4Me: 50+ KPIs, Business Insights dashboard, fraud analytics
- Beetrack: 50+ KPIs, OTIF, Fill Rate
- SimpliRoute: AI Data Analysis Agent

**Que necesita Vuoo:**
- [ ] On-Time Delivery Rate (OTIF)
- [ ] Costo por entrega (combustible + tiempo + distancia)
- [ ] Distancia planificada vs real
- [ ] Tiempo planificado vs real por ruta/conductor
- [ ] Tasa de entregas exitosas vs fallidas
- [ ] Performance por conductor (ranking)
- [ ] Tendencias por semana/mes
- [ ] Export a CSV/PDF
- [ ] Graficos interactivos (charts reales, no solo barras de progreso)

---

### 8. Integraciones E-Commerce
**Estado actual:** No existe
**Que tiene la competencia:**
- OptimoRoute: Shopify, SAP, Salesforce, Zapier
- Routific: Shopify, WooCommerce, Magento, BigCommerce, Zoho
- Beetrack: VTEX, Shopify, Prestashop, Rappi
- SimpliRoute: VTEX, WooCommerce, Magento, Tiendanube
- Circuit: Shopify, Zapier

**Que necesita Vuoo:**
- [ ] Integracion Shopify (import de ordenes como paradas)
- [ ] Integracion WooCommerce
- [ ] Integracion VTEX (dominante en Chile/LATAM)
- [ ] Zapier connector (para conectar con cualquier cosa)
- [ ] Import masivo CSV/Excel mejorado

---

### 9. Gestion de Conductores (no solo vehiculos)
**Estado actual:** Solo vehiculos, sin concepto de "conductor" separado
**Que tiene la competencia:**
- OptimoRoute: Perfiles con skills, certificaciones, disponibilidad, horarios, costos
- Route4Me: Skills matching, RBAC, jerarquia multi-facility
- Onfleet: Pay calculation, performance analytics, driver ratings
- SimpliRoute: Co-driver, documentos con vencimiento

**Que necesita Vuoo:**
- [ ] Entidad "Conductor" separada de "Vehiculo"
- [ ] Asignacion conductor-vehiculo por dia/ruta
- [ ] Perfil: nombre, telefono, licencia, disponibilidad
- [ ] Tracking de documentos (licencia, seguro) con fechas de vencimiento
- [ ] Horarios de trabajo y disponibilidad semanal
- [ ] Link de invitacion para que conductor descargue app

---

### 10. Optimizacion de Rutas Avanzada
**Estado actual:** Optimizacion basica con Mapbox Optimization API (TSP simple)
**Que tiene la competencia:**
- OptimoRoute: Multi-day (5 semanas), workload balancing (3 modos), skills matching, depot recarga
- Routific: Traffic-aware con 179 modelos ML, driver familiarity, anti-spaghetti
- SimpliRoute: 3 algoritmos propietarios (BigRVP, JDH, Simplify), trafico en tiempo real
- Route4Me: SmartZones, multi-depot, avoidance zones, truck routing

**Que necesita Vuoo:**
- [ ] Respetar time windows de las paradas en la optimizacion
- [ ] Respetar capacidad del vehiculo (peso/volumen) como constraint
- [ ] Balanceo de carga entre multiples vehiculos
- [ ] Multi-depot: distintos puntos de inicio/fin por vehiculo
- [ ] Considerar trafico historico por hora del dia
- [ ] Preview de ruta optimizada antes de aplicar

---

### 11. Drag & Drop Avanzado + UX de Planificacion
**Estado actual:** Drag & drop basico para reordenar paradas dentro de una ruta
**Que tiene la competencia:**
- Routific: Timeline view, drag entre rutas, mapa interactivo
- Circuit: Bulk copy/move stops entre rutas
- OptimoRoute: Re-planning en tiempo real, drag-and-drop entre conductores

**Que necesita Vuoo:**
- [ ] Mover paradas entre rutas (no solo reordenar dentro de una)
- [ ] Timeline/Gantt view de todas las rutas del dia
- [ ] Seleccion multiple de paradas para asignar en bulk
- [ ] Asignar paradas desde el mapa (click en pin -> asignar a ruta)
- [ ] Undo/redo para cambios de planificacion

---

### 12. Import/Export Robusto
**Estado actual:** Sin import/export
**Que tiene la competencia:**
- TODOS: CSV/Excel import/export minimo
- OptimoRoute: Drag-and-drop CSV, geocoding con color-coding, export Garmin
- Route4Me: SFTP sync automatizado
- Routific: Drag-and-drop spreadsheet upload

**Que necesita Vuoo:**
- [ ] Import CSV/Excel de paradas (nombre, direccion, peso, ventana horaria)
- [ ] Geocoding automatico de direcciones importadas
- [ ] Validacion y preview antes de importar
- [ ] Export de rutas/paradas a CSV
- [ ] Export de reportes a PDF

---

## P2 - DIFERENCIADOR (Ventaja Competitiva)

### 13. Auto-Dispatch con IA
**Que tiene la competencia:**
- Onfleet: AI Auto-Dispatch que inserta ordenes en rutas activas en tiempo real
- Beetrack: PlannerPro con adaptacion dinamica

**Que necesitaria Vuoo:**
- [ ] Asignacion automatica de nuevas paradas al conductor mas cercano/optimo
- [ ] Re-optimizacion dinamica cuando cambian condiciones (cancelacion, nuevo pedido)
- [ ] Sugerencias de asignacion basadas en proximidad + capacidad + tiempo

---

### 14. Encuestas de Satisfaccion Post-Entrega
**Que tiene la competencia:**
- OptimoRoute: Survey automatico via SMS/email, NPS, ratings por conductor
- Beetrack: Surveys configurables, NPS, alertas por rating bajo
- SimpliRoute: Surveys post-entrega

**Que necesitaria Vuoo:**
- [ ] Survey automatico al cliente despues de entrega completada
- [ ] Rating 1-5 estrellas + comentario
- [ ] NPS score agregado por conductor/organizacion
- [ ] Dashboard de satisfaccion del cliente

---

### 15. Sustainability / Huella de Carbono
**Que tiene la competencia:**
- Routific: Carbon footprint tracking
- Route4Me: CO2 per route tracking
- Tendencia del mercado: ESG reporting cada vez mas requerido

**Que necesitaria Vuoo:**
- [ ] Calculo de CO2 por ruta basado en distancia + tipo combustible + consumo
- [ ] Dashboard de emisiones por periodo
- [ ] Comparacion: emisiones con optimizacion vs sin optimizacion
- [ ] Soporte para vehiculos electricos (rango, estaciones de carga)

---

### 16. Territorios y Zonas
**Que tiene la competencia:**
- Route4Me: Dibujar territorios, SmartZones automaticos, address clustering
- Beetrack: AI Territory Planner
- SimpliRoute: Zonas custom, bloqueo de zonas no operacionales

**Que necesitaria Vuoo:**
- [ ] Dibujar zonas/territorios en el mapa
- [ ] Asignar conductores a zonas
- [ ] Auto-clustering de paradas por zona
- [ ] Zonas de exclusion (areas no operacionales)

---

### 17. Self-Scheduling / Booking del Cliente
**Que tiene la competencia:**
- Beetrack: Self-scheduling donde el cliente elige su slot de entrega
- Tendencia de mercado: Customer self-service es clave para CX

**Que necesitaria Vuoo:**
- [ ] Widget embeddable para que clientes elijan ventana de entrega
- [ ] Slots disponibles calculados automaticamente segun capacidad
- [ ] Confirmacion automatica + notificacion

---

### 18. Multi-Fleet / Proveedores Externos
**Que tiene la competencia:**
- Onfleet: Gestionar flota propia + couriers externos en una vista
- Beetrack: Dashboard unificado flota propia + terceros

**Que necesitaria Vuoo:**
- [ ] Concepto de "proveedor de transporte" ademas de flota propia
- [ ] Asignar rutas a proveedores externos
- [ ] Visibilidad unificada de entregas propias y tercerizadas

---

### 19. Comunicacion Bidireccional Conductor-Dispatcher
**Que tiene la competencia:**
- Onfleet: Chat in-app + llamadas con numero enmascarado
- OptimoRoute: Comunicacion bidireccional
- Circuit: Customer notes al conductor via tracking link

**Que necesitaria Vuoo:**
- [ ] Chat simple entre dispatcher y conductor
- [ ] Notificaciones push para mensajes urgentes
- [ ] Notas por parada visibles para el conductor

---

### 20. Formularios Custom de Entrega
**Que tiene la competencia:**
- OptimoRoute: Formularios POD custom con campos configurables
- Beetrack: Custom forms por tipo de operacion
- Route4Me: Workflows obligatorios configurables

**Que necesitaria Vuoo:**
- [ ] Builder de formularios: campos texto, numerico, select, checkbox, foto
- [ ] Asignar formularios por tipo de entrega o cliente
- [ ] Datos de formularios visibles en dashboard y exportables

---

## Matriz de Prioridad vs Esfuerzo

| Feature | Prioridad | Esfuerzo | Impacto |
|---------|-----------|----------|---------|
| App Movil Conductor | P0 | Alto | Critico - sin esto no hay producto |
| GPS Tracking en Vivo | P0 | Alto | Critico - feature #1 que buscan |
| Notificaciones Cliente | P0 | Medio | Critico - WhatsApp es obligatorio en LATAM |
| POD Completo | P0 | Medio | Critico - dependiente de app movil |
| Webhooks/Events | P0 | Medio | Critico - base para integraciones |
| API REST Publica | P0 | Medio | Critico - base para ecosistema |
| Analytics Avanzados | P1 | Medio | Alto - decision de compra |
| Integraciones E-Commerce | P1 | Medio | Alto - Shopify/VTEX = mas clientes |
| Gestion Conductores | P1 | Bajo | Alto - estructura de datos faltante |
| Optimizacion Avanzada | P1 | Alto | Alto - calidad de producto |
| DnD Avanzado + Timeline | P1 | Medio | Medio - UX de planificacion |
| Import/Export | P1 | Bajo | Alto - onboarding de clientes |
| Auto-Dispatch IA | P2 | Alto | Medio - diferenciador |
| Encuestas Satisfaccion | P2 | Bajo | Medio - valor agregado |
| Huella de Carbono | P2 | Bajo | Bajo - tendencia futura |
| Territorios/Zonas | P2 | Medio | Medio - operaciones grandes |
| Self-Scheduling | P2 | Alto | Medio - CX avanzado |
| Multi-Fleet | P2 | Alto | Medio - enterprise |
| Chat Conductor | P2 | Medio | Medio - operaciones |
| Formularios Custom | P2 | Medio | Bajo - nicho |

---

## Orden Sugerido de Implementacion

### Fase 1 - Foundation (hacer funcionar el core)
1. **Gestion de Conductores** (P1, bajo esfuerzo - desbloquea todo lo demas)
2. **App Movil Conductor** (P0 - sin esto no hay producto)
3. **POD basico** (P0 - foto + firma + GPS, viene con la app)
4. **GPS Tracking** (P0 - viene con la app)

### Fase 2 - Customer-Facing
5. **Pagina de Tracking publica** (P0)
6. **Notificaciones WhatsApp/SMS/Email** (P0)
7. **Import/Export CSV** (P1)

### Fase 3 - Platform
8. **API REST Publica** (P0)
9. **Webhooks/Events** (P0)
10. **Integracion Shopify** (P1)

### Fase 4 - Intelligence
11. **Analytics Avanzados** (P1)
12. **Optimizacion Avanzada** (P1 - time windows, capacidad, balanceo)
13. **Timeline/Gantt view** (P1)

### Fase 5 - Diferenciacion
14. **Encuestas de Satisfaccion** (P2)
15. **Territorios/Zonas** (P2)
16. **Huella de Carbono** (P2)
17. **Auto-Dispatch** (P2)

---

## Competidores Directos en Chile/LATAM

| | SimpliRoute | Beetrack | **Vuoo** |
|---|---|---|---|
| **Precio** | $32-40/vehiculo/mes | Enterprise custom | ? |
| **App Movil** | Si | Si | **No** |
| **GPS Tracking** | Si | Si | **No** |
| **WhatsApp** | Si | Si | **No** |
| **POD** | Si | Si | **No** |
| **API** | Si + SDKs | Si | **No** |
| **Optimizacion** | 3 algoritmos propios | AI/ML | Mapbox TSP basico |
| **Multi-tenant SaaS** | Si | Si | **Si** |
| **Admin Panel** | No publico | No publico | **Si** |
| **Mapas interactivos** | Basico | Basico | **Si (Mapbox GL)** |
| **Self-service signup** | Si | No (enterprise) | **Si** |
| **Open pricing** | Si | No | **Pendiente** |

### Ventajas actuales de Vuoo:
1. Multi-tenant con self-service signup y onboarding
2. UI moderna con Mapbox GL (mapas mas ricos que SimpliRoute/Beetrack)
3. Panel super-admin para gestionar toda la plataforma
4. Stack moderno (React 19, Vite 8, Supabase) = iteracion rapida
5. Precio potencialmente mas bajo que Beetrack (enterprise) y SimpliRoute

### Donde Vuoo pierde:
1. Sin app movil = sin producto real para conductores
2. Sin tracking = sin visibilidad operacional
3. Sin notificaciones = sin experiencia de cliente
4. Sin API = sin integraciones posibles
5. Optimizacion muy basica vs algoritmos avanzados de la competencia

---

## Conclusion

Vuoo tiene un **buen foundation** tecnico y una **UI superior** a SimpliRoute/Beetrack en el dashboard web. Pero le faltan las **4 patas criticas** de cualquier plataforma de gestion de entregas:

1. **App movil** (el conductor no puede usar un sitio web mientras maneja)
2. **Tracking GPS** (el dispatcher necesita ver donde estan los conductores)
3. **Notificaciones** (el cliente necesita saber cuando llega su entrega)
4. **POD** (la empresa necesita prueba de que se entrego)

Sin estas 4 features, Vuoo es una herramienta de **planificacion** pero no de **ejecucion**. La competencia ofrece ambas.

La buena noticia: con el stack actual (React Native + Supabase Realtime + WhatsApp API), estas features son implementables de forma incremental sin reescribir nada.
