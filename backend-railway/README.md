# vuoo-routing-extensions (scaffold)

Scaffold Hono + TypeScript con los endpoints nuevos de Fase B/D del
PRD `docs/12_FLUJO_PEDIDO_A_RUTA.md`. Pensado para fusionarse con el repo
ya desplegado `vuoo-routing` (proyecto Railway `vuoo-rutas`).

El objetivo de este directorio es **ser copiado/mergeado** al repo destino,
no desplegarse desde `vuoo-v2` directamente.

## Endpoints incluidos

| Ruta | Método | Auth | Propósito |
|---|---|---|---|
| `/health` | GET | — | Healthcheck |
| `/geocode/batch` | POST | JWT | Geocoding con cache `geocoding_cache` |
| `/orders/import` | POST | JWT | Import CSV server-side + match + INSERT |
| `/api/v1/orders` | POST | `org_api_token` + scope `orders:write` | Endpoint público (Shopify/VTEX/API) |
| `/settings/api-tokens` | POST | JWT | Crear API token (devuelve el plaintext UNA vez) |
| `/vroom/optimize` | POST | JWT | **Stub 501** — la ruta real vive en `vuoo-routing` |

## Ejemplos de request/response

### POST /geocode/batch
```json
// Request
{ "addresses": [{ "id": "r1", "address": "Av. Apoquindo 4501, Las Condes", "country": "CL" }] }

// Response
{
  "results": [
    { "id": "r1", "lat": -33.4065, "lng": -70.5784,
      "confidence": 0.93, "provider": "mapbox", "fromCache": false }
  ]
}
```

### POST /orders/import
```json
// Request
{
  "templateId": null,
  "rows": [
    { "customer_name": "Ana Soto", "address": "Apoquindo 4501",
      "lat": -33.40, "lng": -70.57, "requested_date": "2026-04-21" }
  ]
}

// Response
{
  "created": 1,
  "failed": 0,
  "warnings": [],
  "orderIds": ["..."],
  "matchStats": { "high": 0, "medium": 0, "low": 0, "none": 1, "created": 1 }
}
```

### POST /api/v1/orders
```bash
curl -X POST https://routing.vuoo.cl/api/v1/orders \
  -H "Authorization: Bearer vuoo_xxxxxxxxxxxxxxxxxxxx" \
  -H "Idempotency-Key: 9f3d2...-uuid" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Ana Soto",
    "address": "Apoquindo 4501, Las Condes",
    "items": [{ "name": "Caja chica", "quantity": 2 }],
    "requested_date": "2026-04-21"
  }'
```
```json
// 201 Response (o 200 + idempotent: true si el Idempotency-Key ya se usó)
{ "id": "uuid", "match_quality": "medium", "stop_id": "uuid" }
```

### POST /settings/api-tokens
```json
// Request (JWT del dispatcher/owner)
{ "org_id": "uuid", "name": "Shopify Prod", "scopes": ["orders:write","shopify_webhook"] }

// Response — plaintext solo en este 201
{
  "token": {
    "id": "uuid", "org_id": "uuid", "name": "Shopify Prod",
    "token_prefix": "vuoo_AbCd", "scopes": ["orders:write","shopify_webhook"],
    "created_at": "2026-04-19T...", "last_used_at": null, "revoked_at": null
  },
  "plaintext": "vuoo_AbCd1234...long..."
}
```

## Variables de entorno (ver `.env.example`)

| Variable | Obligatoria | Dónde |
|---|---|---|
| `SUPABASE_URL` | sí | Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | Supabase project (settings → API) |
| `MAPBOX_TOKEN` | si `GEOCODING_PROVIDER=mapbox` | Mapbox account (privada, NO exponer) |
| `GEOCODING_PROVIDER` | no (default `mapbox`) | `mapbox` \| `google` |
| `GOOGLE_MAPS_API_KEY` | si `GEOCODING_PROVIDER=google` | Google Cloud |
| `CORS_ORIGIN` | no | CSV: `https://app.vuoo.cl,https://staging.vuoo.cl,http://localhost:5173` |
| `PORT` | no (default 8080) | Railway inyecta `PORT` automáticamente |

## Migraciones Supabase requeridas

Ver `docs/12_FLUJO_PEDIDO_A_RUTA.md` §3 Fase A y Fase B. En particular:
- `org_api_tokens` (id, org_id, name, token_prefix, hashed_token, scopes[], created_at, last_used_at, revoked_at, created_by).
- `geocoding_cache` (org_id, address_hash, address_raw, lat, lng, confidence, provider, hit_count).
- Columnas nuevas en `orders` (`match_quality`, `match_review_needed`, `external_id` idempotency).
- RPC `match_stop_for_order(p_org_id, p_address, p_customer_name, p_customer_id, p_lat, p_lng)`.
- RPC opcional `increment_geocoding_cache_hits(p_org_id, p_hashes)` para actualizar contadores en batch.

## Deploy (instrucciones para el usuario)

1. Copiar este directorio al repo `vuoo-routing` (o mergear por cherry-pick).
   - Si `vuoo-routing` ya tiene `src/server.ts`, fusionar las rutas extra
     (`/geocode`, `/orders/import`, `/api/v1/orders`, `/settings/api-tokens`)
     y descartar `src/routes/vroom.ts` (ya existe en el repo destino).
2. `npm install` para traer Hono + zod + supabase-js.
3. Setear variables de entorno en Railway (dashboard o `mcp__Railway__set-variables`).
4. Build & start: Railway detecta `start` script; asegurate que sea `node dist/server.js`.
5. Verificar:
   - `GET /health` → `{ ok: true }`.
   - `POST /settings/api-tokens` con JWT válido → devuelve `plaintext` en 201.
   - `POST /api/v1/orders` con ese token + Idempotency-Key → 201.

## Notas

- Este scaffold usa cliente con `service_role` — bypassa RLS. Siempre filtrar
  por `org_id` resuelto desde el auth middleware (nunca desde el body).
- `POST /api/v1/orders` usa `external_id = sha256(org_id::idempotency_key)` para
  dedupe 24h (plazo aplicado por retención lógica, no TTL de fila).
- El proveedor de geocoding vive detrás de `GeocodingProvider`; para migrar
  a Google basta con crear `google.provider.ts` y switch en `provider.ts`.
- Rate-limit por token **no implementado** (ver PRD §3 Fase B.4, 100 req/min).
  Agregar un middleware antes de productizar (ej. `hono-rate-limiter` + Redis).
