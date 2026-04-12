# 04 - Plataforma y Ecosistema: API Publica + Webhooks + Integraciones

> **Objetivo:** Abrir Vuoo al mundo exterior. Permitir que otros sistemas (Shopify, ERPs, apps custom) creen paradas, lean rutas, y reaccionen a eventos. Sin esto Vuoo es una isla.
>
> **Depende de:** 01, 02, 03 (las entidades y flujos deben existir antes de exponerlos via API)

---

## Estado Actual

### Lo que existe:
- **5 Edge Functions** en Supabase: `send-push`, `invite-driver`, `get-tracking-status`, `submit-feedback`, `send-notification` (vacia)
- **Supabase client directo** desde frontend (anon key + JWT)
- **RLS** en todas las tablas con `user_org_ids()`
- **Mapbox API** consumida desde frontend (directions, optimization, geocoding)
- **Vercel** solo como hosting SPA (sin API routes)

### Lo que NO existe:
- API REST publica documentada
- Sistema de API keys por organizacion
- Webhooks outbound (notificar a sistemas externos cuando algo cambia)
- Rate limiting
- Integraciones con e-commerce (Shopify, VTEX, WooCommerce)
- Import/export masivo
- Documentacion de API (OpenAPI/Swagger)

---

## Arquitectura de la API

### Donde vive la API

**Supabase Edge Functions** (Deno, ya desplegadas en el proyecto). No agregar otro layer (Vercel serverless, Express, etc.) — todo en un solo lugar.

```
Cliente externo                    Supabase Edge Functions              DB
──────────────                    ──────────────────────              ──────
                                  
POST /api/v1/stops          →     api-gateway (router)          →    stops table
GET  /api/v1/routes/:id     →     api-gateway                  →    routes + plan_stops
POST /api/v1/webhooks       →     webhook-manager               →    org_webhooks table
...                               (auth via API key)
```

### Edge Function: `api-gateway`

Una sola Edge Function que rutea por path + method. Mas simple que una funcion por endpoint.

```typescript
// supabase/functions/api-gateway/index.ts

import { serve } from 'https://deno.land/std/http/server.ts'

serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.replace('/api-gateway', '')
  const method = req.method

  // 1. Autenticar via API key
  const apiKey = req.headers.get('x-api-key')
  const org = await validateApiKey(apiKey)
  if (!org) return new Response('Unauthorized', { status: 401 })

  // 2. Rate limiting
  const allowed = await checkRateLimit(org.id, path)
  if (!allowed) return new Response('Rate limit exceeded', { status: 429 })

  // 3. Router
  if (path === '/v1/stops' && method === 'GET')    return listStops(org)
  if (path === '/v1/stops' && method === 'POST')   return createStop(org, req)
  if (path.match(/^\/v1\/stops\//) && method === 'GET')  return getStop(org, path)
  if (path.match(/^\/v1\/stops\//) && method === 'PUT')  return updateStop(org, path, req)
  if (path.match(/^\/v1\/stops\//) && method === 'DELETE') return deleteStop(org, path)
  // ... plans, routes, vehicles, drivers
  
  return new Response('Not Found', { status: 404 })
})
```

---

## Sistema de API Keys

### Nueva tabla: `api_keys`

```sql
create table api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,                    -- "Shopify Integration", "ERP Sync"
  key_hash    text not null,                    -- SHA-256 del key (nunca guardar plaintext)
  key_prefix  text not null,                    -- "vuoo_pk_a3b2" para identificacion visual
  permissions text[] not null default '{}',     -- ['stops:read', 'stops:write', 'routes:read']
  last_used_at timestamptz,
  expires_at  timestamptz,                      -- null = no expira
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index idx_api_keys_org on api_keys(org_id);
create index idx_api_keys_hash on api_keys(key_hash);
```

### Formato del API key
```
vuoo_pk_a3b2c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7
└─────┘ └──┘ └──────────────────────────────────────────────────┘
 prefix  id          random (48 chars, crypto secure)
```

- El key se muestra UNA SOLA VEZ al crearlo
- Se guarda el SHA-256 en DB
- Validacion: hash del key recibido vs key_hash en DB

### Permisos granulares

```
stops:read       stops:write
plans:read       plans:write
routes:read      routes:write
vehicles:read    vehicles:write
drivers:read     drivers:write
webhooks:manage
```

### UI: Pagina de API Keys (Settings)
- Listar API keys (nombre, prefix, permisos, ultimo uso, estado)
- Crear nuevo key (nombre + seleccionar permisos)
- Mostrar key completo una sola vez (modal con copy button)
- Revocar key (desactivar, no eliminar)
- Regenerar key

---

## Endpoints de la API

### Stops

| Method | Endpoint | Permisos | Descripcion |
|--------|----------|----------|-------------|
| GET | `/v1/stops` | stops:read | Listar paradas (paginado, filtros) |
| GET | `/v1/stops/:id` | stops:read | Detalle de una parada |
| POST | `/v1/stops` | stops:write | Crear parada |
| PUT | `/v1/stops/:id` | stops:write | Actualizar parada |
| DELETE | `/v1/stops/:id` | stops:write | Eliminar parada |
| POST | `/v1/stops/bulk` | stops:write | Crear multiples paradas (CSV/JSON) |

### Plans

| Method | Endpoint | Permisos | Descripcion |
|--------|----------|----------|-------------|
| GET | `/v1/plans` | plans:read | Listar planes (filtro por fecha) |
| GET | `/v1/plans/:id` | plans:read | Detalle con rutas y paradas |
| POST | `/v1/plans` | plans:write | Crear plan |
| POST | `/v1/plans/:id/stops` | plans:write | Agregar parada a plan |
| POST | `/v1/plans/:id/optimize` | plans:write | Optimizar rutas del plan |

### Routes

| Method | Endpoint | Permisos | Descripcion |
|--------|----------|----------|-------------|
| GET | `/v1/routes` | routes:read | Listar rutas (filtro por plan, status) |
| GET | `/v1/routes/:id` | routes:read | Detalle con paradas y conductor |
| GET | `/v1/routes/:id/tracking` | routes:read | Posicion actual del conductor |

### Vehicles

| Method | Endpoint | Permisos | Descripcion |
|--------|----------|----------|-------------|
| GET | `/v1/vehicles` | vehicles:read | Listar vehiculos |
| POST | `/v1/vehicles` | vehicles:write | Crear vehiculo |
| PUT | `/v1/vehicles/:id` | vehicles:write | Actualizar vehiculo |
| DELETE | `/v1/vehicles/:id` | vehicles:write | Eliminar vehiculo |

### Drivers

| Method | Endpoint | Permisos | Descripcion |
|--------|----------|----------|-------------|
| GET | `/v1/drivers` | drivers:read | Listar conductores |
| POST | `/v1/drivers` | drivers:write | Crear conductor |
| PUT | `/v1/drivers/:id` | drivers:write | Actualizar conductor |

### Webhooks

| Method | Endpoint | Permisos | Descripcion |
|--------|----------|----------|-------------|
| GET | `/v1/webhooks` | webhooks:manage | Listar webhooks registrados |
| POST | `/v1/webhooks` | webhooks:manage | Crear webhook |
| DELETE | `/v1/webhooks/:id` | webhooks:manage | Eliminar webhook |

### Paginacion y filtros (todos los GET de listado)

```
GET /v1/stops?page=1&per_page=50&search=providencia&sort=created_at&order=desc
```

### Respuesta estandar

```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "per_page": 50,
    "total": 234,
    "total_pages": 5
  }
}
```

### Errores estandar

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "El campo 'name' es requerido",
    "details": [
      { "field": "name", "message": "required" }
    ]
  }
}
```

Codigos HTTP: 200, 201, 400, 401, 403, 404, 429, 500.

---

## Webhooks Outbound

### Concepto

Cuando algo cambia en Vuoo, notificar a URLs externas registradas por la org.

```
Evento en Vuoo (ej: stop completado)
        │
        ▼
DB trigger / Supabase Realtime
        │
        ▼
Edge Function: webhook-dispatcher
        │
        ├─ Buscar webhooks registrados para este evento + org
        ├─ Para cada webhook:
        │   POST {webhook_url} con payload JSON
        │   Header: X-Vuoo-Signature (HMAC-SHA256)
        │   Timeout: 10s
        │   Retry: 3 intentos con backoff (1s, 30s, 5min)
        │
        └─ INSERT webhook_deliveries (log)
```

### Eventos disponibles

| Evento | Trigger |
|--------|---------|
| `stop.created` | Nueva parada creada |
| `stop.updated` | Parada modificada |
| `stop.deleted` | Parada eliminada |
| `plan.created` | Nuevo plan creado |
| `plan_stop.status_changed` | Cambio de status (pending → completed, etc.) |
| `route.started` | Conductor inicia ruta |
| `route.completed` | Ruta completada |
| `driver.location_updated` | Nueva ubicacion GPS (batched, cada 60s max) |
| `feedback.submitted` | Cliente envio feedback |

### Nueva tabla: `org_webhooks`

```sql
create table org_webhooks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  url         text not null,                    -- https://miapp.com/webhooks/vuoo
  secret      text not null,                    -- para HMAC signature
  events      text[] not null,                  -- ['stop.created', 'plan_stop.status_changed']
  active      boolean not null default true,
  description text,
  created_at  timestamptz not null default now()
);
```

### Nueva tabla: `webhook_deliveries`

```sql
create table webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references org_webhooks(id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null,
  response_status integer,
  response_body   text,
  attempts        integer not null default 0,
  next_retry_at   timestamptz,
  status          text not null default 'pending',  -- 'pending' | 'sent' | 'failed'
  created_at      timestamptz not null default now()
);

create index idx_webhook_deliveries_status on webhook_deliveries(status, next_retry_at)
  where status = 'pending';
```

### Payload de webhook

```json
{
  "id": "evt_abc123",
  "event": "plan_stop.status_changed",
  "created_at": "2026-04-11T14:30:00Z",
  "data": {
    "plan_stop_id": "uuid",
    "stop_name": "Av. Providencia 1234",
    "previous_status": "pending",
    "new_status": "completed",
    "driver": { "first_name": "Juan", "last_name": "Perez" },
    "completed_at": "2026-04-11T14:29:45Z",
    "pod": {
      "photos": ["https://...signed-url..."],
      "signature": "https://...signed-url...",
      "location": { "lat": -33.42, "lng": -70.61 }
    }
  }
}
```

### Verificacion de firma

```
X-Vuoo-Signature: sha256=abc123def456...
```

El receptor verifica:
```javascript
const expected = crypto.createHmac('sha256', webhookSecret)
  .update(requestBody)
  .digest('hex')
if (expected !== receivedSignature) reject()
```

---

## Rate Limiting

### Estrategia

Usando una tabla simple en Supabase (no Redis — mantener la stack simple).

```sql
create table api_rate_limits (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  window_key  text not null,     -- "2026-04-11T14:00" (ventana de 1 hora)
  request_count integer not null default 1,
  unique(org_id, window_key)
);
```

### Limites por plan (futuro)

| Plan | Requests/hora | Webhooks | API keys |
|------|---------------|----------|----------|
| Free | 100 | 2 | 1 |
| Pro | 5,000 | 10 | 5 |
| Enterprise | 50,000 | Ilimitados | Ilimitados |

Por ahora: 1,000 requests/hora para todos, hardcoded.

### Headers de respuesta

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1713456000
```

---

## Integraciones E-Commerce

### Shopify (prioridad #1)

**Flujo:**
```
Shopify Store
  │ (nueva orden con fulfillment pendiente)
  ▼
Shopify Webhook → Edge Function: shopify-ingest
  │
  ├─ Extraer: shipping address, customer name, phone, email, items, weight
  ├─ Geocodificar direccion via Mapbox
  ├─ Crear Stop en Vuoo con datos del cliente
  └─ Opcionalmente: agregar a plan del dia
  
Vuoo (entrega completada)
  │
  ▼
Webhook outbound → Shopify Fulfillment API
  │
  └─ Marcar orden como "fulfilled" con tracking URL
```

**Edge Function: `shopify-ingest`**

```typescript
// Recibe webhook de Shopify (order created / fulfillment requested)
// Verifica HMAC signature de Shopify
// Crea stop con: 
//   name = order.shipping_address.name
//   address = order.shipping_address.address1 + city
//   customer_name = order.customer.first_name + last_name
//   customer_phone = order.customer.phone
//   customer_email = order.customer.email
//   weight_kg = sum(line_items.grams) / 1000
```

### VTEX (prioridad para Chile/LATAM)

Mismo patron que Shopify pero con VTEX Webhook API. Los campos difieren pero el flujo es identico: order → stop, delivery → fulfillment update.

### Zapier (conector generico)

En vez de construir integraciones custom para cada plataforma, un Zapier integration cubre cientos:

- **Triggers (Vuoo → Zapier):** stop.created, plan_stop.status_changed, route.completed, feedback.submitted
- **Actions (Zapier → Vuoo):** Create Stop, Create Plan, Update Stop Status
- Se implementa sobre la API REST + Webhooks ya definidos
- Zapier usa API key auth + webhook subscriptions

---

## Import/Export Masivo

### Import CSV de Paradas

**Flujo en UI:**
1. Usuario arrastra CSV o selecciona archivo
2. Preview de datos con mapeo de columnas (nombre, direccion, telefono, peso, ventana horaria)
3. Validacion: campos requeridos, formato telefono, geocoding de direcciones
4. Mostrar errores/warnings antes de confirmar
5. Confirmar → bulk insert via API

**Formato CSV esperado:**
```csv
nombre,direccion,cliente_nombre,cliente_telefono,cliente_email,peso_kg,duracion_min,ventana_inicio,ventana_fin
"Depto 1204","Av. Providencia 1234, Santiago","Juan Perez","+56912345678","juan@mail.com",5.2,10,"09:00","12:00"
```

**Edge Function: `bulk-import-stops`**
- Acepta JSON array (max 500 paradas por request)
- Geocoding batch via Mapbox
- Retorna: { created: N, errors: [{row, message}] }

### Export CSV

**Desde UI:**
- Boton "Exportar" en StopsPage, RoutesPage, AnalyticsPage
- Genera CSV con todos los datos visibles + campos ocultos

**Desde API:**
```
GET /v1/stops?format=csv
GET /v1/plans/:id/report?format=csv
```

---

## Documentacion de API

### OpenAPI / Swagger

Generar spec OpenAPI 3.0 desde los endpoints definidos. Servir en:

```
https://app.vuoo.cl/docs/api
```

**Opciones de UI:**
- **Scalar** (moderno, buen DX) — recomendado
- Swagger UI (clasico)
- Redoc (bueno para lectura)

### Contenido de la documentacion:
- Autenticacion (API keys, como obtener)
- Rate limits
- Paginacion y filtros
- Todos los endpoints con request/response examples
- Webhooks: eventos, payloads, verificacion de firma
- Errores comunes
- SDKs y ejemplos (curl, JavaScript, Python)

---

## Migracion SQL

```sql
-- 006_platform_api.sql

-- 1. API Keys
create table api_keys (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  key_hash    text not null,
  key_prefix  text not null,
  permissions text[] not null default '{}',
  last_used_at timestamptz,
  expires_at  timestamptz,
  active      boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create index idx_api_keys_org on api_keys(org_id);
create index idx_api_keys_hash on api_keys(key_hash);

-- 2. Webhooks
create table org_webhooks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  url         text not null,
  secret      text not null,
  events      text[] not null,
  active      boolean not null default true,
  description text,
  created_at  timestamptz not null default now()
);

create index idx_org_webhooks_org on org_webhooks(org_id);

-- 3. Webhook delivery log
create table webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references org_webhooks(id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null,
  response_status integer,
  response_body   text,
  attempts        integer not null default 0,
  next_retry_at   timestamptz,
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

create index idx_webhook_deliveries_pending 
  on webhook_deliveries(status, next_retry_at) where status = 'pending';

-- 4. Rate limiting
create table api_rate_limits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  window_key      text not null,
  request_count   integer not null default 1,
  unique(org_id, window_key)
);

-- 5. RLS
alter table api_keys enable row level security;
alter table org_webhooks enable row level security;
alter table webhook_deliveries enable row level security;
alter table api_rate_limits enable row level security;

create policy "Org admins manage api keys"
  on api_keys for all using (org_id in (select user_org_ids()));

create policy "Org admins manage webhooks"
  on org_webhooks for all using (org_id in (select user_org_ids()));

create policy "Org members view webhook deliveries"
  on webhook_deliveries for select
  using (webhook_id in (select id from org_webhooks where org_id in (select user_org_ids())));

-- 6. Cleanup de rate limits y webhook deliveries viejos
create or replace function cleanup_api_data()
returns void as $$
begin
  delete from api_rate_limits where window_key < to_char(now() - interval '24 hours', 'YYYY-MM-DD"T"HH24:00');
  delete from webhook_deliveries where created_at < now() - interval '30 days';
end;
$$ language plpgsql security definer;
```

---

## Edge Functions Necesarias

| Funcion | Tipo | Descripcion |
|---------|------|-------------|
| `api-gateway` | Request handler | Router principal: auth, rate limit, CRUD de todas las entidades |
| `webhook-dispatcher` | DB trigger | Escucha cambios y despacha a webhooks registrados |
| `shopify-ingest` | Incoming webhook | Recibe ordenes de Shopify, crea stops |
| `bulk-import-stops` | Request handler | Import masivo con geocoding batch |

---

## Preguntas Abiertas

1. **API gateway: una Edge Function grande o muchas chicas?**
   - Opcion A: Una `api-gateway` que rutea todo (mas simple de desplegar, un solo cold start)
   - Opcion B: Una funcion por recurso (`api-stops`, `api-plans`, etc.)
   - **Recomendacion:** Opcion A. Menos overhead, mas facil de mantener con un router interno

2. **Webhook dispatcher: trigger en DB o polling?**
   - Opcion A: Supabase Database Webhooks (trigger nativo, llama a Edge Function on INSERT/UPDATE)
   - Opcion B: Supabase Realtime listener en un proceso
   - **Recomendacion:** Opcion A. Database Webhooks son nativos y confiables

3. **Shopify primero o Zapier primero?**
   - Shopify es mas valioso (flujo completo order→stop→fulfillment)
   - Zapier es mas generico (cubre muchos sistemas con poco codigo)
   - **Recomendacion:** API + Webhooks primero (habilita Zapier automaticamente), luego Shopify custom

4. **Documentacion: auto-generada o manual?**
   - Auto-generada desde OpenAPI spec es mas mantenible
   - **Recomendacion:** Escribir OpenAPI spec manualmente, UI auto-generada con Scalar

---

## Definicion de Done

### API Keys
- Tabla `api_keys` en Supabase
- UI de gestion de API keys en Settings (crear, listar, revocar)
- Mostrar key completo una sola vez al crear
- Validacion de key en api-gateway

### API REST
- Edge Function `api-gateway` con router
- CRUD completo: stops, plans, routes, vehicles, drivers
- Paginacion, filtros, busqueda
- Respuestas estandarizadas (data + meta + error)
- Rate limiting funcional (1,000 req/hora)

### Webhooks
- Tabla `org_webhooks` + UI de gestion
- Edge Function `webhook-dispatcher`
- HMAC signature en cada delivery
- Retry con backoff (3 intentos)
- Log de deliveries visible en UI

### Import/Export
- Import CSV de paradas con preview + validacion + geocoding
- Export CSV desde StopsPage y RoutesPage
- Endpoint API: `POST /v1/stops/bulk`

### Documentacion
- OpenAPI 3.0 spec
- UI interactiva en /docs/api (Scalar)
- Ejemplos en curl, JavaScript, Python

### Integracion Shopify
- Edge Function `shopify-ingest`
- Webhook Shopify → crear stop automaticamente
- Fulfillment update cuando entrega se completa
- UI de configuracion en Settings (API key de Shopify + webhook URL)
