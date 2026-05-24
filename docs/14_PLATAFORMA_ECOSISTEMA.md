# PRD 14 — Plataforma Ecosistema (REST API + Webhooks + SDK)

**Pri**: P0
**Reemplaza**: `[PENDING] 04_PLATAFORMA_ECOSISTEMA.md`
**Estado**: Tokens por organización implementados (mig 024). Falta capa REST
estable, webhooks salientes, docs OpenAPI y SDK.

---

## Contexto

Hoy existen `org_api_tokens` y un proxy mínimo a Supabase, pero:

- Exponer Supabase client directo a terceros acopla la API al schema y
  fuerza versión Supabase JS en cada cliente.
- No hay eventos salientes: integraciones tipo Zapier / Shopify / VTEX
  requieren webhooks.
- Sin OpenAPI/Swagger, cada integración tiene que leer el código.
- Sin rate limiting, un token comprometido puede saturar el backend.

Sin esto, **PRD 15 (conectores)** no es viable porque cada conector
quedaría acoplado al schema Supabase del momento.

---

## Objetivos

1. Capa REST estable versionada (`/v1/...`) sobre Railway con auth por token.
2. Webhooks salientes confiables con retry + firma HMAC.
3. OpenAPI 3.0 autogenerada y publicada en `docs.vuoo.app/api`.
4. Rate limiting por token (configurable por plan).
5. SDK Node mínimo publicado en npm.

---

## Scope IN

### A. Capa REST `/v1` en Railway (proyecto `vuoo-rutas`)
- Stack: Fastify + Zod schemas → OpenAPI autogen.
- Recursos mínimos v1:
  - `GET/POST/PATCH/DELETE /v1/orders`
  - `GET/POST/PATCH /v1/plans`
  - `GET /v1/routes`, `GET /v1/routes/:id/stops`
  - `GET /v1/stops/:id`, `PATCH /v1/stops/:id` (status updates)
  - `GET /v1/drivers`, `GET /v1/vehicles`
  - `POST /v1/imports/orders` (delega a flujo ya existente)
- Auth: `Authorization: Bearer <token>` (org_api_tokens).
- Scopes por token: `orders:read`, `orders:write`, `plans:read`, etc.
- Versionado: `/v1` estable 12 meses mínimo. Cambios breaking → `/v2`.

### B. Webhooks salientes
- Tabla nueva `org_webhook_subscriptions(id, org_id, url, secret, events[], created_at, last_delivery_at, last_delivery_status, enabled)`.
- Eventos v1: `order.created`, `plan.created`, `plan.published`,
  `route.started`, `route.completed`, `stop.completed`, `stop.failed`,
  `stop.reassigned`, `driver.location` (opt-in, high volume).
- Firma HMAC SHA-256 del body con `secret` en header `X-Vuoo-Signature`.
- Header `X-Vuoo-Event` con tipo, `X-Vuoo-Delivery` con UUID idempotente.
- Worker en Railway (BullMQ + Redis) que procesa cola:
  - Retry exponential: 3 intentos, backoff 1m/5m/30m.
  - Marca `webhook_delivery_logs` con cada intento.
  - Después de 3 fallos consecutivos → disabled + email al owner.

### C. OpenAPI + docs
- Spec autogenerada desde schemas Zod.
- Hosted en `docs.vuoo.app/api` (Scalar o Redocly).
- Try-it-out con token del usuario logueado.
- Changelog visible (`/v1/changelog`).

### D. Rate limiting
- Implementado en Fastify con `@fastify/rate-limit` + Redis.
- Plan free: 60 req/min, 1k req/día.
- Plan pro: 600 req/min, 100k req/día.
- Plan enterprise: configurable.
- Headers estándar: `X-RateLimit-*`, `Retry-After`.

### E. SDK Node (`@vuoo/sdk`)
- Mínimo: cliente tipado para todos los endpoints v1.
- Generado desde OpenAPI con `openapi-typescript-codegen` o equivalente.
- Publicado en npm.
- README con ejemplos para los 3 casos de uso top: crear orden, consultar
  estado de parada, suscribirse a webhooks.

### F. Webhook tester en Settings
- UI en `/settings/webhooks` para:
  - Crear/editar/borrar subscriptions.
  - Ver histórico de deliveries con cuerpo + respuesta.
  - "Send test event" — dispara payload sintético.

---

## Scope OUT

- SDKs en otros lenguajes (Python, PHP, Go) → fase 2 cuando haya demanda.
- GraphQL → no antes de validar REST con 3+ integraciones reales.
- OAuth 2.0 / OIDC → cuando aparezca el primer marketplace partner.
- Marketplace público de integraciones → PRD futuro.

---

## Esquema técnico

### Tablas nuevas
```sql
create table org_webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id),
  url text not null,
  secret text not null,
  events text[] not null,
  enabled boolean default true,
  last_delivery_at timestamptz,
  last_delivery_status text,
  consecutive_failures int default 0,
  created_at timestamptz default now()
);

create table webhook_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references org_webhook_subscriptions(id),
  event_type text not null,
  payload jsonb not null,
  attempt int not null,
  status_code int,
  response_body text,
  delivered_at timestamptz default now()
);
```

### Trigger Postgres → cola
Trigger en `plans`, `stops`, `routes`, `orders` que inserta evento en
`webhook_queue` para que el worker lo procese y entregue.

### Backend
- `backend-railway/src/api/v1/` (nueva ruta-base con Fastify).
- `backend-railway/src/workers/webhook-dispatcher.ts`.
- `backend-railway/src/middleware/auth-token.ts`.
- `backend-railway/src/middleware/rate-limit.ts`.

---

## Criterios de éxito

- 100% de los endpoints v1 documentados en OpenAPI.
- Webhook delivery rate > 99.5% (tras retry).
- Latencia p95 de REST `/v1/orders` GET < 200ms.
- SDK publicado con > 0 instalaciones de cliente externo en 30 días.
- 2+ integraciones de terceros conectadas en 60 días (Zapier, Make, o Shopify).

---

## Dependencias

- Redis (Upstash o Railway) para BullMQ y rate-limit.
- Dominio `docs.vuoo.app` (DNS + cert).
- Decisión de pricing por plan antes de definir cuotas finales.

---

## Riesgos

- Versioning: una vez expuesta v1 a un partner real, cambios breaking son
  costosos. Antes de cerrar a partner público, hacer ronda de feedback con
  3+ integradores internos.
- Costo Redis si volumen de webhooks crece (mitigar con TTL agresivo en
  `webhook_delivery_logs`).
