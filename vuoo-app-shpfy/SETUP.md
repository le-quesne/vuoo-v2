# Conector Shopify → Vuoo

Recibe órdenes de Shopify (`orders/create`) y las ingiere en Vuoo, geocodificadas
y listas para rutear. La app Shopify (esta carpeta) solo declara scopes + webhooks;
**el handler vive en el backend `vuoo-api`** (Railway), no acá.

## Arquitectura

```
Shopify (orders/create)
   │  POST firmado (HMAC-SHA256 base64, secret de la app)
   ▼
vuoo-api  /webhooks/shopify/orders-create   (backend-railway/src/routes/shopifyWebhooks.ts)
   │  1. verifica HMAC          2. mapea tienda→org (SHOPIFY_DEFAULT_ORG_ID / SHOPIFY_ORG_MAP)
   │  3. transforma payload     4. createOrderForOrg() → dedupe idempotente → match_stop_for_order → INSERT
   ▼
Supabase (orders + stops, source='shopify')
```

Lógica de creación compartida con el endpoint público `/api/v1/orders`
(`backend-railway/src/lib/createOrder.ts`).

## Endpoints (backend-railway)

| Ruta | Método | Auth | Propósito |
|---|---|---|---|
| `/webhooks/shopify/orders-create` | POST | HMAC | Ingesta de órdenes |
| `/webhooks/shopify/compliance` | POST | HMAC | GDPR obligatorio (`customers/data_request`, `customers/redact`, `shop/redact`) |
| `/webhooks/shopify/callback` | GET | — | Landing del install (evita 404 en el OAuth) |

## Variables de entorno (Railway · servicio `vuoo-api`)

| Var | Valor |
|---|---|
| `SHOPIFY_API_SECRET` | Client secret de la app (Dev Dashboard → Settings) — firma los webhooks |
| `SHOPIFY_DEFAULT_ORG_ID` | Org de Vuoo destino para el piloto de una sola tienda |
| `SHOPIFY_ORG_MAP` | *(opcional)* JSON `{"tienda.myshopify.com":"<org-uuid>"}` multi-tienda |
| `SUPABASE_SERVICE_ROLE_KEY` | Requerido — bypassa RLS para insertar órdenes |

## Mapeo de campos (Shopify → Vuoo)

| Shopify | Vuoo |
|---|---|
| `name` (#1001) / `id` | `order_number` |
| `shipping_address.name` / `customer.*` | `customer_name` |
| `shipping_address.{address1,address2,city,province,zip,country}` | `address` (concatenado) |
| `shipping_address.{latitude,longitude}` | `lat` / `lng` |
| `shipping_address.phone` → `customer.phone` → `phone` | `customer_phone` |
| `email` → `customer.email` | `customer_email` |
| `line_items[]` → `{name, quantity, sku}` | `items` |
| `total_weight` (g) / 1000 | `total_weight_kg` |
| `tags` (CSV) | `tags[]` |
| `note` | `delivery_instructions` |

Órdenes sin `shipping_address` se descartan (no son ruteables). Idempotencia por
`id` de la orden de Shopify (dedupe 24 h vía `external_id`).

## Estado

- ✅ Backend desplegado en producción (`vuoo-api-production.up.railway.app`).
- ✅ Verificado E2E: webhook firmado → orden creada en Vuoo con todos los campos;
  firma inválida → 401; reenvío → idempotente.
- ✅ Compliance GDPR + callback de install desplegados.

- ✅ Verificado con tooling oficial: `shopify app webhook trigger --topic orders/create`
  (Shopify firma y entrega el payload) → orden creada en Vuoo.

### Causa raíz del bloqueo de `read_orders` (investigado, definitivo)

`read_orders` es **Protected Customer Data (PCD) Level 2**. Una app creada con
`shopify app init` **no tiene método de distribución asignado**, así que Shopify
**no la trata como app custom** → no recibe el PCD automático → descarta
`read_orders` del token (deja `write_orders`/`write_fulfillments`, que no son PCD)
y rechaza la suscripción a `orders/create`. **No existe API/CLI/TOML** para
otorgar PCD ni para asignar distribución (CLI issue #3543 cerrado sin implementar).

### ✅ RESUELTO — secuencia que funcionó (probado E2E: orden real Shopify → Vuoo)

1. **Custom distribution** (dashboard, irreversible): dev.shopify.com → app →
   **Distribution** → *Custom distribution* → `vuoo-test.myshopify.com`. Esto
   levanta el gate PCD a nivel app (después de esto, `shopify app deploy` con el
   webhook `orders/create` **deja de fallar**).
2. **Callback OAuth en la raíz** (`src/routes/shopifyOAuth.ts`, montado en `GET /`):
   el install redirige al `application_url` (la raíz) con `?shop&code&hmac`. Sin
   handler ahí daba **404 y el install no se completaba**. El handler verifica el
   HMAC (hex, query params) e intercambia el `code` → completa la instalación.
   Requiere env `SHOPIFY_CLIENT_ID` + `SHOPIFY_API_SECRET`.
3. **Reinstalar**: Dev Dashboard → app → **Instalar app** → `vuoo-test` → Aprobar
   (la pantalla ya incluye *read orders*). Ahora el callback devuelve
   "✅ Vuoo conectado" y la app queda instalada con PCD.
4. **Registrar la suscripción** vía Admin API (el webhook declarado en el TOML no
   se auto-activó): `POST /admin/api/2025-07/webhooks.json` topic `orders/create`
   → callback de Vuoo. (Ahora pasa; antes de custom distribution daba el error PCD.)

**Nota:** el token `client_credentials` sigue mostrando solo
`write_orders,write_fulfillments` (descarta scopes protegidos), pero **no importa**:
la suscripción se registra y la entrega del webhook usa el grant del install. Un
pedido real (`#1002`, María González, Av. Vitacura) se creó en Shopify y **apareció
en Vuoo geocodificado** — flujo confirmado.

Suscripción activa: `orders/create → .../webhooks/shopify/orders-create`.
