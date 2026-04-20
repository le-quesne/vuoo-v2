# 12 — Flujo Pedido → Ruta (modernización end-to-end)

> **Objetivo:** Convertir el flujo "pedido entra → ruta sale" en el corazón operativo de Vuoo. Hoy el operador hace 6 clicks y mucho re-tipeo para llegar a una ruta optimizada; la meta es **drop CSV → rutas en menos de 30 segundos**, con auto-merge de pedidos por destino, skills/constraints reales en la optimización y un endpoint público para integraciones (Shopify/VTEX/API/WhatsApp).
>
> **Por qué importa:** El modelo de datos ya tiene `orders` (PRD 09) pero el flujo operativo sigue tratando al `stop` como ciudadano de primera. Eso provoca: ingesta secuencial frágil en el browser, geocoding sin cache con token Mapbox expuesto, sin skills/constraints reales en vehículos ni paradas (la "optimización óptima" es ficción), inconsistencia entre Vroom Edge Function y el backend Railway que dicta la arquitectura.
>
> **Decisión de producto base (validada):** **mayoría de clientes son recurrentes (B2B-leaning)**, pero el backend debe soportar ambos modelos. Por eso: UI default optimizada para recurrencia (autocompletado de cliente, catálogo prominente), backend tratando a `stops` como cache inteligente (no master rígido) y `customers` como master opcional. Detalle en §1.3.
>
> **Depende de:** PRD 06 (optimización Vroom/OSRM en Railway), PRD 09 (tabla `orders`), PRD 10 (refactor Clean Architecture).
>
> **Bloquea:** PRD 04 (Plataforma & Ecosistema — sin endpoint público no hay Shopify/VTEX), valor real del PRD 06 (sin skills no hay optimización honesta), PRD 07 UX (el wizard actual son 6 clicks).

---

## 1. Contexto

### 1.1 Lo que hay hoy (con archivos)

**Modelo de datos:**
- `supabase/migrations/008_orders.sql` — tabla `orders` con `customer_*`, `address`, `lat/lng`, `items jsonb`, `weight_kg`, `volume_m3`, `time_window_*`, `priority`, `requires_signature/photo`, `source` (`manual|csv|shopify|vtex|api|whatsapp`), `tags`, FK a `stop_id` y `plan_stop_id`.
- `data/types/database.ts` — tipos generados.
- **Hueco:** `stops` y `vehicles` no tienen `skills` / `required_skills` / `service_type`. No hay forma de declarar "refrigerado", "lift-gate", "frágil", "hazmat".

**Ingesta:**
- `presentation/features/orders/components/ImportCsvModal.tsx` con parser propio (`features/orders/utils/csv.ts`).
- Aliases de columnas hardcoded (`r.nombre_cliente || r.cliente || r.customer_name…`).
- Geocoding Mapbox **secuencial** desde el browser, token en bundle vía `VITE_MAPBOX_TOKEN`.
- Sin retries, sin cache, sin pin-drop manual para ambigüedad.
- INSERT fila-por-fila desde el cliente (`OrdersPage.tsx:1356-1380`), sin transacción → si falla a mitad, queda inconsistente.
- `data/services/orders/orders.services.ts` solo expone `listOrders` y `deleteOrders`. No hay `bulkCreate`, no hay `importFromCsv` server-side.

**Mapeo pedido → parada (`OrdersPage.tsx:1053-1135`):**
- Match por bounding-box ±0.0005° (~55 m) o address exacto.
- Si no encuentra, crea un `stop` nuevo, después un `plan_stop`, después actualiza la `order`.
- Todo secuencial, sin RPC, sin atomicidad.

**Optimización:**
- `VroomWizardModal.tsx:116` llama `supabase.functions.invoke('optimize-routes-vroom')` — **inconsistente con la regla** del PRD 06 y `04-data-services.md` que dicen que la optimización vive en Railway (`vuoo-rutas`).
- Wizard con 4 modos (`efficiency / balance_stops / balance_time / consolidate`).
- Para llegar al wizard: crear plan → programar pedidos → configurar depot → elegir vehículos → abrir wizard → optimizar.

**Integraciones:** `source` enum incluye `shopify | vtex | api | whatsapp`, **pero no hay código** detrás. Placeholders.

### 1.2 Comparativa con competidores (síntesis)

| Capacidad | Onfleet | Routific | OptimoRoute | Circuit | Bringg | Locus | Vuoo hoy |
|---|---|---|---|---|---|---|---|
| Drop CSV → rutas <30 s | △ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Templates de import persistidos | △ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Auto-merge por dirección+ventana | ✅ | △ | ✅ | △ | ✅ | ✅ | ❌ (manual ±55 m) |
| Skills/tags en vehículo y pedido | ✅ | ✅ | ✅ | △ | ✅ | ✅ | ❌ |
| Pin-drop manual en preview | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Endpoint público REST | ✅ | ✅ | ✅ | △ | ✅ | ✅ | ❌ |
| Integración Shopify nativa | ✅ | △ | △ | ✅ | △ | △ | ❌ |
| Re-optimización dinámica al llegar pedido | △ | △ | ✅ | △ | ✅ | ✅ | ❌ |

**Lecciones replicables:**
1. Templates de mapping (Routific, OptimoRoute) — el operador mapea columnas **una vez** y reusa.
2. Auto-merge por `address_hash + ventana solapada` (OptimoRoute, Bringg) — varios pedidos al mismo destinatario = 1 stop, items agregados.
3. Skills en vehículo + required_skills en pedido (Onfleet) — refrigerado, hazmat, lift-gate.
4. Endpoint público autenticado por `org-token` (Onfleet, Circuit) — desbloquea Shopify/VTEX/Zapier.
5. Wizard con preview corriendo (Routific) — el operador ajusta, no configura desde cero.

### 1.3 Modelo dual: `stops` como cache + `customers` como master opcional

**Decisión validada con el founder:** mayoría de clientes recurrentes (B2B/híbrido), backend obligado a soportar también pedidos efímeros (B2C / Shopify).

**Trampa que evitamos** (ver discusión PM en chat): tratar a `stops` como "customer master rígido" donde cada pedido sin match bloquea el import. Eso colapsa en ecommerce (caso "cliente nuevo" es la norma) y obliga al operador a curar un catálogo que no curará.

**Modelo escogido:**

```
customers (opcional, B2B explícito)
  ↓ 0..N
stops (siempre existe — cache normalizada con confidence)
  ↓ 1..N
orders (siempre crea su FK a stop, nunca bloquea)
  ↓ 1..1
plan_stops (asignación a un día)
```

| Tabla | Rol | Quién la mantiene |
|---|---|---|
| `customers` | Entidad de negocio con `customer_code` único, contrato, recurrencia esperada. **Opcional**. | Operador (CRUD explícito o import) |
| `stops` | Ubicación física normalizada. Siempre existe detrás de un order. Tiene `confidence`, `is_curated`, `customer_id?`. | Sistema (auto) + operador (promueve a curado o fusiona duplicados) |
| `orders` | Unidad transaccional. Siempre tiene `stop_id` después de geocoding. | Sistema (CSV/API) o operador (manual) |

**Match en 3 niveles de confianza** (Fase B detalla la implementación):

| Nivel | Criterio | Comportamiento | UX |
|---|---|---|---|
| **Alto** | `address_hash` exacto **+** (`customer_id` exacto **o** `customer_name` similar Levenshtein > 0.85) | Reusa stop silenciosamente. `is_curated=true` hace este caso aún más prioritario. | Ningún badge. Aparece como "asignado a [Cliente X]" en preview. |
| **Medio** | Solo `address_hash` exacto, customer no coincide **o** address fuzzy > 0.9 | Reusa stop pero marca `order.match_review_needed=true`. | Badge ámbar "revisar match" en la fila del preview. Clic → modal compara order vs stop existente. |
| **Bajo / sin match** | Sin coincidencia útil | **Crea stop nuevo. No bloquea.** `confidence` viene del geocoding. | Sin badge especial. El operador puede después promoverlo a `is_curated` o fusionarlo. |

**Reglas de oro del modelo dual:**
- Un `order` **nunca bloquea** por falta de match. Crear stop es siempre la salida default.
- `customers` es **opcional**. Una org puede operar sin abrir esa pantalla nunca y todo funciona (modo B2C puro).
- `is_curated` se vuelve verdadero solo por acción explícita del operador (botón "guardar como cliente recurrente" en el detalle del stop o al promoverlo desde una vista de duplicados).
- La dedupe es **asistida, nunca automática**: vista "Posibles duplicados" agrupa stops con `address_hash` similar, el operador confirma fusiones.
- El autocompletado en "crear orden manual" prioriza `is_curated=true` y `customer_id` no nulo.

---

## 2. Métrica norte y KPIs

**Meta principal:** Tiempo desde "tengo un CSV con 50 pedidos" hasta "rutas asignadas y enviadas a choferes" **< 60 segundos** mediana, < 90 s p95.

**KPIs secundarios:**
- % de pedidos importados sin intervención manual (sin pin-drop, sin corrección): **> 85 %**.
- % de paradas donde ≥ 2 pedidos se mergearon automáticamente: **medible** (objetivo > 30 % en clientes con repeat).
- Cold-start de Vroom en Railway tras un import: **< 3 s p95** (warm-up obligatorio).
- 0 imports parciales (atomicidad: todo o nada).
- 0 tokens privados en el bundle del cliente.

---

## 3. Plan en 4 fases

> Cada fase es independientemente desplegable y aporta valor. El orden recomendado es A → B → C → D, pero hay un atajo (B + D primero) si se prioriza UX sobre fidelidad de optimización. Ver §7 (decisiones).

---

### Fase A — Cimientos del modelo

**Problema:** Sin `skills` en vehículos/paradas, Vroom recibe constraints incompletas y produce rutas que el operador tiene que arreglar a mano. Sin `customers` separado de `stops`, mezclamos entidad de negocio con ubicación física y obligamos al operador a curar lo que no quiere curar. Sin `geocoding_cache`, cada import re-pega a Mapbox por direcciones que ya conocemos. Sin `import_templates`, el operador re-mapea columnas cada vez. Sin `address_hash` y campos de match en `stops`, el matching de Fase B no es viable.

**Cambios de schema (`supabase/migrations/0XX_orders_flow.sql`):**

```sql
-- ─────────────────────────────────────────────
-- customers: master OPCIONAL de entidades de negocio (B2B)
-- ─────────────────────────────────────────────
create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_code text,                 -- código del cliente en sistema externo (opcional)
  name text not null,
  email text,
  phone text,
  default_time_window_start time,
  default_time_window_end time,
  default_service_minutes smallint default 5,
  default_required_skills text[] default '{}',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (org_id, customer_code)       -- nullable + unique = solo aplica si hay code
);

create index on customers (org_id) where is_active;
create index on customers (org_id, lower(name));

-- ─────────────────────────────────────────────
-- stops: cache normalizada de ubicaciones (siempre existe detrás de un order)
-- ─────────────────────────────────────────────
alter table stops
  add column customer_id uuid references customers(id) on delete set null,
  add column address_hash text,        -- lower + sin acentos + sin puntuación
  add column geocoding_confidence numeric(3,2),  -- 0..1, viene del proveedor
  add column geocoding_provider text,            -- 'mapbox' | 'google' | 'manual'
  add column is_curated boolean not null default false, -- promovido por operador
  add column priority smallint default 0 check (priority between 0 and 10),
  add column required_skills text[] default '{}',
  add column service_type text not null default 'delivery'
    check (service_type in ('delivery','pickup','both')),
  add column last_used_at timestamptz,           -- update on order assignment
  add column use_count integer default 0;

create index on stops (org_id, address_hash);
create index on stops (org_id, customer_id) where customer_id is not null;
create index on stops (org_id) where is_curated;
create index on stops (org_id) where required_skills <> '{}';

-- ─────────────────────────────────────────────
-- orders: añadir flag de match para revisión
-- ─────────────────────────────────────────────
alter table orders
  add column match_quality text check (match_quality in ('high','medium','low','none')),
  add column match_review_needed boolean not null default false,
  add column customer_id uuid references customers(id) on delete set null;

create index on orders (org_id) where match_review_needed;

-- ─────────────────────────────────────────────
-- vehicles
-- ─────────────────────────────────────────────
alter table vehicles
  add column skills text[] default '{}',
  add column volume_m3 numeric(10,3),
  add column max_stops integer;

create index on vehicles (org_id) where skills <> '{}';

-- ─────────────────────────────────────────────
-- import_templates (reutilizables por org)
-- ─────────────────────────────────────────────
create table import_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  source text not null default 'csv', -- 'csv' | 'xlsx' | 'shopify' | …
  column_map jsonb not null,          -- { "customer_name": ["nombre","cliente",…], … }
  defaults jsonb default '{}'::jsonb, -- { "service_minutes": 5, "priority": 0 }
  created_by uuid references users(id),
  created_at timestamptz default now(),
  unique (org_id, name)
);

-- ─────────────────────────────────────────────
-- geocoding_cache compartido por org (privacidad: no global)
-- ─────────────────────────────────────────────
create table geocoding_cache (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  address_hash text not null,
  address_raw text not null,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  confidence numeric(3,2),
  provider text not null,             -- 'mapbox' | 'google' | 'manual'
  created_at timestamptz default now(),
  hit_count integer default 0,
  unique (org_id, address_hash)
);

create index on geocoding_cache (org_id, address_hash);

-- ─────────────────────────────────────────────
-- Backfill: poblar address_hash en stops existentes
-- ─────────────────────────────────────────────
update stops
set address_hash = vuoo_normalize_address(address)
where address_hash is null;
-- vuoo_normalize_address se define como función inmutable: lower + unaccent + regex no alfanum
```

**Función de normalización (idempotente, usada también desde Fase B y C):**

```sql
create or replace function vuoo_normalize_address(addr text)
returns text language sql immutable as $$
  select regexp_replace(
    lower(unaccent(coalesce(addr, ''))),
    '[^a-z0-9 ]', '', 'g'
  );
$$;
```

**RLS:** mismas políticas que `orders` (acceso por `org_id` del JWT).

**Sincronización con `/mobile`:**
- Regenerar `database.ts` para web **y** mobile con `supabase gen types`.
- Verificar que ningún `select('*')` del mobile rompe (lo común es tipar columna a columna). Auditar `mobile/src/data/services/`.

**Adapters de dominio (`src/domain/adapters/`):**
- `customer.adapter.ts` — mapea `customerCode`, `defaultTimeWindow`, `defaultRequiredSkills` desde `CustomerRow`.
- `stop.adapter.ts` — mapea `customerId`, `addressHash`, `geocodingConfidence`, `isCurated`, `requiredSkills`, `serviceType`, `priority`, `lastUsedAt`, `useCount` desde `StopRow`.
- `vehicle.adapter.ts` — mapea `skills`, `volumeM3`, `maxStops`.
- `order.adapter.ts` (update) — mapea `matchQuality`, `matchReviewNeeded`, `customerId`.

**Aceptación:**
- Migración aplicada en dev/staging.
- `vuoo_normalize_address` es idempotente y deterministic (test).
- Backfill: 100% de stops existentes con `address_hash` poblado.
- Tipos regenerados, web y mobile compilan.
- Adapters con tests de mapping (mínimo 1 happy + 1 fila legacy con defaults).
- Default `[]` para arrays y `false` para flags — datos viejos siguen funcionando.

**Riesgos:**
- Romper queries que asumen forma vieja del row → mitigación: defaults seguros (`'{}'`, `'delivery'`, `false`).
- Drift web/mobile → check en CI: `npm run types:db && git diff --exit-code data/types/database.ts`.
- `unaccent` / `pg_trgm` extensions no instaladas en algún env → la migración debe `create extension if not exists unaccent; create extension if not exists pg_trgm;` antes de definir funciones.

---

### Fase A.2 — Customers (opcional) + dedupe asistido de stops

**Problema:** El backend de A ya soporta `customers` y `is_curated`, pero sin UI no hay forma de aprovechar el modo B2B. Además, sin una vista de dedupe, el cache de stops inevitablemente se llena de duplicados cuando los operadores tipean diferente la misma dirección.

**Esta fase es desbloqueante para clientes B2B (mayoría, según decisión del founder).**

#### A.2.1 — CRUD de customers

Nueva feature `presentation/features/customers/`:

```
customers/
├── components/
│   ├── CustomerList.tsx          # tabla paginada con search
│   ├── CustomerForm.tsx          # crear/editar
│   ├── CustomerDetailDrawer.tsx  # ver + stops asociados + histórico orders
│   └── CustomerImportModal.tsx   # CSV de clientes (columnas: code, name, email, phone, address, skills)
├── hooks/
│   ├── useCustomerList.ts
│   ├── useCustomerDetail.ts
│   └── useCustomerMutations.ts
├── utils/
└── index.ts
```

Nueva página `/customers` (router) con link en sidebar, visible solo si `org.feature_flags.customers_enabled` (ver §7 decisiones).

`data/services/customers/customers.services.ts`:
```typescript
export async function list(orgId: string, q?: string): Promise<ServiceResult<Customer[]>>
export async function getById(id: string): Promise<ServiceResult<Customer>>
export async function create(input: CustomerInsert): Promise<ServiceResult<Customer>>
export async function update(id: string, patch: CustomerUpdate): Promise<ServiceResult<Customer>>
export async function deactivate(id: string): Promise<ServiceResult<void>>
export async function importFromCsv(file: File): Promise<ServiceResult<ImportReport>>
```

**Autocompletado en creación manual de orden:** cuando hay ≥ 1 customer, el modal "Nueva orden" (y el mapping Step 2 del ImportWizard) muestra autocomplete por `name` o `customer_code`. Si el operador elige un customer, pre-llena `customer_name`, `customer_email`, `customer_phone`, `required_skills`, `time_window_*` desde los defaults del customer.

#### A.2.2 — Promoción de stop a curado

En `StopDetailDrawer` (presentación existente en `features/stops/`): agregar botón **"Guardar como ubicación recurrente"** que:
- Abre modal pidiendo seleccionar/crear customer asociado (opcional).
- Setea `is_curated=true`.
- Si se eligió customer, setea `customer_id`.

Efecto: próximos imports con matching contra este stop se promueven automáticamente a nivel `high` (ver `match_stop_for_order`).

#### A.2.3 — Vista "Posibles duplicados"

Nueva ruta `/stops/duplicates`:
- Query:
  ```sql
  select s1.id as a_id, s2.id as b_id, s1.address, s2.address,
         similarity(s1.address_hash, s2.address_hash) as score
  from stops s1 join stops s2
    on s1.org_id = s2.org_id
   and s1.id < s2.id
   and (s1.address_hash = s2.address_hash
        or similarity(s1.address_hash, s2.address_hash) >= 0.9)
  where s1.org_id = :org_id;
  ```
- UI: lista de pares, cada uno con botón **"Fusionar"**:
  - Modal side-by-side compara ambos stops (direction, customer, skills, last_used_at, use_count).
  - Operador elige cuál "sobrevive" (default: el `is_curated` o el más usado).
  - Llama RPC `merge_stops(loser_id, winner_id)` que:
    1. UPDATE orders SET stop_id = winner WHERE stop_id = loser.
    2. UPDATE plan_stops SET stop_id = winner WHERE stop_id = loser.
    3. DELETE stops WHERE id = loser.
    4. Mezcla `use_count`, `required_skills`, `is_curated = OR`.
  - Atómico, sin soft-delete (la vista de duplicados no es una pantalla que el operador use a diario).

**Aceptación Fase A.2:**
- Página `/customers` permite CRUD completo y está oculta si feature flag está off.
- Import de 100 customers desde CSV funciona.
- Autocompletado en "Nueva orden" muestra customers del org en < 200 ms.
- Promover un stop a `is_curated` afecta el próximo matching (test end-to-end).
- Vista duplicados detecta 2 stops con address idéntica, permite fusión, orders quedan apuntando al winner.

**Riesgos:**
- Operadores olvidan fusionar duplicados → mitigación: badge numérico en sidebar "Duplicados: 12" cuando hay > 0.
- Fusión elimina información (notes, metadata del loser) → mitigación: copiar campos "blandos" al winner como fallback cuando el winner los tiene nulos.
- Feature flag por org añade complejidad → si el 100% de early customers son B2B, simplemente dejar la página siempre visible y saltar el flag.

---

### Fase B — Ingesta multi-canal sólida

**Problema:** Modal de import actual es secuencial, sin cache, sin pin-drop, con token Mapbox en bundle, sin atomicidad. Y solo tenemos CSV — Shopify/API son placeholders.

#### B.1 — Refactor `ImportWizard` (presentación)

Reemplazar `ImportCsvModal.tsx` por `presentation/features/orders/components/ImportWizard/`:

```
ImportWizard/
├── ImportWizard.tsx                  # Stepper de 4 pasos
├── steps/
│   ├── Step1FileDrop.tsx             # drop zone + sample download
│   ├── Step2Mapping.tsx              # auto-detect + "guardar plantilla"
│   ├── Step3Preview.tsx              # preview validado + pin-drop inline
│   └── Step4Confirm.tsx              # progreso + resultado
├── hooks/
│   ├── useImportTemplate.ts          # CRUD plantillas
│   ├── useColumnAutoDetect.ts        # heurística → mapping inicial
│   └── useImportSubmit.ts            # llama service con progress
├── types/
│   └── import.types.ts
└── index.ts
```

**Step 2 (mapping):** la heurística reusa los aliases actuales (`csv.ts`) pero como **fallback** si no hay template guardado. Cuando el operador ajusta y marca "guardar como plantilla", se persiste en `import_templates`.

**Step 3 (preview):** tabla con dos dimensiones por fila — **calidad de geocoding** y **match contra stops existentes**:

Geocoding:
- 🟢 OK (`confidence ≥ 0.6`).
- 🟡 Warning (`confidence < 0.6` → pedir pin-drop opcional, no bloquea).
- 🔴 Error (sin lat/lng después de retries → bloquea fila específica, no el import completo).

Match contra stops:
- 🔵 "Cliente conocido — [Nombre]" (match `high`, reusa silenciosamente).
- 🟡 "Misma dirección, revisar" (match `medium`, badge clickable → modal comparativo).
- ⚪ "Nueva ubicación" (match `none` / `low`, crea stop).

Pin-drop inline = mini-mapa Mapbox embebido en la celda; el operador arrastra el pin y se guarda en la fila.

**Principio de diseño:** nunca bloquear el import por un pedido sin match. Cada fila resuelve a *reusar-existente* o *crear-nuevo*, ambos son éxitos válidos.

#### B.2 — Servicios

`src/data/services/orders/orders.services.ts` agrega:

```typescript
export async function bulkCreate(rows: OrderInsert[]): Promise<ServiceResult<{ ids: string[] }>>
export async function importFromCsv(
  file: File,
  templateId: string | null,
  onProgress?: (pct: number) => void,
): Promise<ServiceResult<ImportReport>>
```

`importFromCsv` (pipeline Railway):
1. Parse en cliente (rápido).
2. POST `multipart` a Railway `/orders/import` con `templateId` opcional.
3. Backend ejecuta pipeline transaccional:
   - Aplica template → normaliza filas.
   - Llama `/geocode/batch` interno → upsert en `geocoding_cache`.
   - Para cada fila geocoded: llama `match_stop_for_order()` (ver B.2.1) → decide reusar stop existente o crear nuevo.
   - INSERT atómico en `orders` con `stop_id`, `match_quality`, `match_review_needed` seteados.
   - Update `stops.last_used_at`, `stops.use_count`.
4. Devuelve `ImportReport { created, failed, warnings, orderIds, matchStats: { high, medium, low, created } }`.

**Por qué backend y no RPC Supabase:** geocoding requiere token privado. Railway ya está en pie por PRD 06, no inventamos infra. Además el matching se beneficia de logs centralizados para afinar thresholds.

##### B.2.1 — Función de match (Postgres, reusada por import y API)

```sql
create or replace function match_stop_for_order(
  p_org_id uuid,
  p_address text,
  p_customer_name text,
  p_customer_id uuid,           -- nullable; si viene, es pista fuerte
  p_lat numeric,
  p_lng numeric
) returns table (
  stop_id uuid,
  match_quality text,           -- 'high' | 'medium' | 'low' | 'none'
  should_create_new boolean
) language plpgsql stable as $$
declare
  v_hash text := vuoo_normalize_address(p_address);
  v_candidate record;
begin
  -- Nivel alto: address_hash + customer_id exacto (B2B con master)
  if p_customer_id is not null then
    select s.id into v_candidate
      from stops s
      where s.org_id = p_org_id
        and s.address_hash = v_hash
        and s.customer_id = p_customer_id
      order by s.is_curated desc, s.use_count desc
      limit 1;
    if found then
      return query select v_candidate.id, 'high'::text, false;
      return;
    end if;
  end if;

  -- Nivel alto: address_hash exacto + nombre similar (fuzzy ≥ 0.85)
  select s.id into v_candidate
    from stops s
    where s.org_id = p_org_id
      and s.address_hash = v_hash
      and (
        p_customer_name is null
        or similarity(lower(coalesce(s.customer_name, '')), lower(p_customer_name)) >= 0.85
      )
    order by s.is_curated desc, s.use_count desc
    limit 1;
  if found then
    return query select v_candidate.id, 'high'::text, false;
    return;
  end if;

  -- Nivel medio: address_hash exacto, nombre distinto → reusa pero marca review
  select s.id into v_candidate
    from stops s
    where s.org_id = p_org_id and s.address_hash = v_hash
    order by s.is_curated desc, s.use_count desc
    limit 1;
  if found then
    return query select v_candidate.id, 'medium'::text, false;
    return;
  end if;

  -- Nivel bajo / sin match: crear nuevo (nunca bloquear)
  return query select null::uuid, 'none'::text, true;
end;
$$;
```

Requiere `create extension if not exists pg_trgm;` para `similarity()`. Se instala junto con `unaccent` en la migración de Fase A.

**Threshold 0.85** es conservador (validar con concierge test del §7 de la discusión PM). Si en datos reales da muchos falsos positivos, subir a 0.9; si da muchos falsos negativos, bajar a 0.75 y compensar elevando esos casos a `medium`.

#### B.3 — Geocoding centralizado (Railway)

Endpoint nuevo en `vuoo-rutas`:

```
POST /geocode/batch
Authorization: Bearer <supabase-jwt>
Body: { addresses: [{ id, address, country?: 'CL' }] }
Response: { results: [{ id, lat, lng, confidence, provider, fromCache }] }
```

Implementación:
- Normalizar address (`lower + trim + sin acentos`) → `address_hash`.
- Buscar en `geocoding_cache` (filtra por `org_id` del JWT).
- Para los misses: batch a Mapbox Geocoding (concurrencia 10, retry exponencial 3 intentos).
- Upsert en cache. Incrementar `hit_count`.

**Sacar `VITE_MAPBOX_TOKEN` del bundle** para geocoding. Mapbox GL (mapas en cliente) puede seguir con un token público anon **distinto y restringido a styles/tiles**.

#### B.4 — Endpoint público `POST /api/orders`

En `vuoo-rutas`:

```
POST /api/v1/orders
Authorization: Bearer <org_api_token>   ← nuevo, no JWT de usuario
Idempotency-Key: <client-uuid>          ← obligatorio, dedupe 24 h
Body: Order (mismo schema que la tabla, sin org_id)
Response: 201 { id, status: 'pending', stopId: null }
```

- Tabla `org_api_tokens` (id, org_id, name, hashed_token, scopes, created_at, last_used_at, revoked_at).
- UI en `Settings → API & Integraciones` para generar/revocar tokens.
- Rate-limit: 100 req/min por token (suficiente para Shopify webhooks).
- `source` se setea automáticamente desde el scope del token (`shopify_webhook` → `source='shopify'`).

**Habilita inmediatamente:** Shopify (vía webhook), VTEX, Zapier/Make, scripts de cliente, futura integración WhatsApp Business.

**Aceptación Fase B:**
- ImportWizard reemplaza al modal viejo en `OrdersPage.tsx`.
- Import de 200 pedidos < 15 s (con cache caliente: < 5 s).
- 0 tokens Mapbox de geocoding en `dist/`.
- Plantilla guardada se reusa al siguiente import del mismo formato.
- Pin-drop manual funciona y se persiste.
- `match_stop_for_order` devuelve `high` cuando el operador importa dos veces el mismo CSV (validación end-to-end del matching).
- Import de un CSV con clientes mezclados (conocidos + nuevos) resuelve correctamente cada fila sin bloquear ninguna.
- `POST /api/v1/orders` autenticado por token de org crea órdenes correctamente y reporta `match_quality` en la respuesta.

**Riesgos:**
- Cold start de Railway en geocoding masivo → mitigación: keep-warm cron cada 5 min en Railway, o `?warm=true` antes del import.
- Mapbox rate-limit (600/min) → mitigación: cache + batch + backoff. En clientes muy grandes, evaluar Google Geocoding como fallback.

---

### Fase C — Asignación a plan + auto-merge

**Problema:** Hoy `OrdersPage.tsx:1053-1135` hace match secuencial por bounding box ±0.0005° y crea/actualiza fila por fila. Si llegan 5 pedidos para el mismo destinatario el mismo día, terminan como 5 stops separados.

**Diferencia vs Fase B:** Fase B asigna `stop_id` en la tabla `stops` global (cache de ubicaciones). Fase C crea los `plan_stops` (entrega específica de un día) y fusiona pedidos dentro del contexto del plan — 5 pedidos al mismo stop dentro del mismo plan = 1 `plan_stop` con items agregados.

**Solución:** RPC server-side declarativa.

```sql
create or replace function assign_orders_to_plan(
  p_order_ids uuid[],
  p_plan_id uuid,
  p_allow_override boolean default false  -- si true, reasigna órdenes con plan_stop_id ya seteado
) returns table (
  order_id uuid,
  stop_id uuid,
  plan_stop_id uuid,
  action text,                    -- 'merged_existing' | 'created_new' | 'skipped_already_assigned'
  match_quality text              -- hereda del order (seteado en Fase B)
) language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_order record;
  v_existing_plan_stop uuid;
begin
  select org_id into v_org_id from plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan_not_found';
  end if;

  for v_order in
    select o.* from orders o
    where o.id = any(p_order_ids) and o.org_id = v_org_id
  loop
    -- Skip si ya tiene plan_stop y no se forzó override
    if v_order.plan_stop_id is not null and not p_allow_override then
      return query select v_order.id, v_order.stop_id, v_order.plan_stop_id,
                          'skipped_already_assigned'::text, v_order.match_quality;
      continue;
    end if;

    -- Si no tiene stop_id (raro, pero posible en órdenes manuales antiguas), fallar ruidoso
    if v_order.stop_id is null then
      raise exception 'order_without_stop: %', v_order.id;
    end if;

    -- Buscar plan_stop existente en este plan con mismo stop_id + ventana compatible
    select ps.id into v_existing_plan_stop
      from plan_stops ps
      where ps.plan_id = p_plan_id
        and ps.stop_id = v_order.stop_id
        and (
          (ps.time_window_start is null and v_order.time_window_start is null)
          or tstzrange(ps.time_window_start, ps.time_window_end, '[]')
             && tstzrange(v_order.time_window_start, v_order.time_window_end, '[]')
        )
      limit 1;

    if v_existing_plan_stop is not null then
      -- Merge: agregar items, sumar peso/volumen, unir skills
      update plan_stops ps set
        items = ps.items || v_order.items,
        weight_kg = coalesce(ps.weight_kg, 0) + coalesce(v_order.weight_kg, 0),
        volume_m3 = coalesce(ps.volume_m3, 0) + coalesce(v_order.volume_m3, 0),
        required_skills = (
          select array_agg(distinct s)
          from unnest(ps.required_skills || coalesce(v_order.required_skills, '{}')) s
        ),
        priority = greatest(ps.priority, coalesce(v_order.priority, 0)),
        order_count = coalesce(ps.order_count, 1) + 1
      where ps.id = v_existing_plan_stop;

      update orders set plan_stop_id = v_existing_plan_stop where id = v_order.id;

      return query select v_order.id, v_order.stop_id, v_existing_plan_stop,
                          'merged_existing'::text, v_order.match_quality;
    else
      -- Crear plan_stop nuevo, heredando datos del order
      insert into plan_stops (
        plan_id, stop_id, org_id, items, weight_kg, volume_m3,
        required_skills, priority, time_window_start, time_window_end,
        service_minutes, order_count
      ) values (
        p_plan_id, v_order.stop_id, v_org_id, v_order.items,
        v_order.weight_kg, v_order.volume_m3,
        coalesce(v_order.required_skills, '{}'),
        coalesce(v_order.priority, 0),
        v_order.time_window_start, v_order.time_window_end,
        coalesce(v_order.service_minutes, 5), 1
      )
      returning id into v_existing_plan_stop;

      update orders set plan_stop_id = v_existing_plan_stop where id = v_order.id;

      return query select v_order.id, v_order.stop_id, v_existing_plan_stop,
                          'created_new'::text, v_order.match_quality;
    end if;
  end loop;

  -- Refresh cache stats en stops tocados
  update stops s set
    last_used_at = now(),
    use_count = use_count + (
      select count(*) from unnest(p_order_ids) oid
      join orders o on o.id = oid
      where o.stop_id = s.id
    )
  where s.id in (select stop_id from orders where id = any(p_order_ids));
end;
$$;

-- RPC inversa para deshacer
create or replace function unassign_orders_from_plan(
  p_order_ids uuid[],
  p_plan_id uuid
) returns integer language plpgsql security definer as $$
declare
  v_count integer := 0;
begin
  -- Soltar órdenes
  update orders set plan_stop_id = null
  where id = any(p_order_ids) and plan_stop_id in (
    select id from plan_stops where plan_id = p_plan_id
  );
  get diagnostics v_count = row_count;

  -- Limpiar plan_stops huérfanos (sin órdenes)
  delete from plan_stops ps
  where ps.plan_id = p_plan_id
    and not exists (select 1 from orders where plan_stop_id = ps.id);

  return v_count;
end;
$$;
```

**Reglas de merge dentro del plan:**
- Mismo `stop_id` (confianza ya resuelta en Fase B, aquí solo confirmamos agrupamiento por ubicación).
- Ventanas solapadas (`tstzrange && tstzrange`) o ambas null.
- Resultado: items concatenados, `weight_kg = SUM`, `volume_m3 = SUM`, `required_skills = UNION`, `priority = MAX`, `order_count += 1`.

**Por qué no re-matcheamos en Fase C:** el matching contra el catálogo vive en Fase B y es canónico. Fase C solo agrupa *dentro del plan*. Esto separa responsabilidades y evita doble lógica.

**Frontend (`features/orders/hooks/useAssignToPlan.ts`):**
- Reemplaza el loop secuencial por una sola llamada a `assign_orders_to_plan`.
- Recibe `AssignReport` y muestra toast: *"12 pedidos → 9 paradas (3 mergeadas, 6 nuevas)"*.
- Si alguna `action = skipped_already_assigned`, propone botón *"Reasignar de todos modos"* que vuelve a llamar con `p_allow_override=true`.

**Aceptación Fase C:**
- Asignar 50 pedidos a un plan = 1 round-trip a Supabase, < 1 s.
- Tests:
  - 5 pedidos al mismo `stop_id` con ventanas solapadas → 1 `plan_stop` con `order_count=5`.
  - 5 pedidos al mismo `stop_id` con ventanas disjuntas → 2+ `plan_stops` (respetando ventanas).
  - Órdenes ya asignadas → skip por default, reasignan con override.
- Atómico: si falla a mitad, no queda nada inconsistente.
- Rollback: botón "Deshacer asignación" en OrdersPage llama `unassign_orders_from_plan`.

**Riesgos:**
- Orden manual antigua sin `stop_id` → la RPC lanza excepción ruidosa. Mitigación: migración de Fase A debe backfillear stops para todas las órdenes existentes (ejecutar `match_stop_for_order` en bulk durante el deploy).
- Merge incorrecto si ventana fue editada a mano post-asignación → la RPC respeta `p_allow_override`, el operador decide.

---

### Fase D — One-click "Optimizar día"

**Problema:** Para optimizar un día, el operador hoy hace: crear plan → programar pedidos → configurar depot → elegir vehículos → abrir wizard → click optimize. Son 6 pantallas. Routific lo hace en 1.

**Solución:** Botón único en `OrdersPage` y en `PlannerPage`.

#### D.1 — Acción `optimizeDay(date)`

Hook `presentation/features/planner/hooks/useOneClickOptimize.ts`:

1. Si no hay plan para `date` → crearlo (`status='draft'`).
2. Llamar `merge_orders_into_stops(pendingOrderIdsFor(date), plan.id)` (Fase C).
3. Auto-seleccionar vehículos disponibles para ese día cuyas `skills ⊇ UNION(required_skills de los stops)`.
4. Llamar **Railway** `/vroom/optimize` (no Edge Function — ver D.3) con `mode='balance'` por default.
5. Abrir el wizard con preview ya corrido y diff visible (paradas por vehículo, distancia total, ventanas violadas).
6. El operador ajusta modo o vehículos → re-optimiza inline. Confirma → `status='planned'` y notifica a choferes.

#### D.2 — Re-optimización oportunista

Cuando llega un pedido nuevo (vía `POST /api/v1/orders` o import) **y existe un plan `status='planned'` para esa fecha**:
- Suscriptor realtime en `useDispatcherInbox` detecta el INSERT.
- Toast: *"3 pedidos nuevos para hoy. ¿Re-optimizar?"* con botón.
- Click → re-corre `optimizeDay(today)` preservando paradas ya `in_progress` o `completed`.
- **No** auto-aplica: el operador siempre confirma (riesgo de re-rutear a un chofer que ya salió).

#### D.3 — Mover Vroom a Railway (deuda)

`VroomWizardModal.tsx:116`:

```diff
- const { data, error } = await supabase.functions.invoke('optimize-routes-vroom', { body: req });
+ const res = await vroomService.optimize(req);   // → Railway /vroom/optimize
```

`data/services/vroom/vroom.services.ts` ya está descrito en `04-data-services.md`. Solo falta migrar la llamada y borrar la Edge Function (`supabase/functions/optimize-routes-vroom/`).

**Por qué ahora:** evita inconsistencia con la regla, permite warm-up para evitar cold start, centraliza logs, y desbloquea D.2 (Edge Functions tienen 30 s de timeout, Vroom con muchos vehículos puede tomar más).

**Aceptación Fase D:**
- Botón "Optimizar día" en `OrdersPage` funciona end-to-end < 10 s para 50 pedidos / 5 vehículos.
- Auto-selección de vehículos respeta skills.
- Re-optimización oportunista detecta pedidos nuevos y propone re-correr.
- 0 referencias a `supabase.functions.invoke('optimize-routes-vroom')` en el repo.
- Edge Function vieja archivada (no borrada hasta confirmar 1 semana sin tráfico).

**Riesgos:**
- Operador se asusta con re-ruteo automático → mitigación: nunca auto-aplica, siempre confirma.
- Vehículo sin skill que cubra todos los pedidos → la auto-selección falla con mensaje claro: *"Faltan vehículos con skill 'refrigerado' para 3 pedidos"*. El operador agrega vehículo manualmente o quita el skill.

---

## 4. Cambios en archivos (mapa concreto)

| Archivo | Acción |
|---|---|
| `supabase/migrations/0XA_customers_and_stops_cache.sql` | **NUEVO** (Fase A) — tabla `customers`, alters `stops`/`orders`/`vehicles`, `import_templates`, `geocoding_cache`, `vuoo_normalize_address`, extensiones `unaccent` y `pg_trgm`, backfill |
| `supabase/migrations/0XB_match_stop_for_order.sql` | **NUEVO** (Fase B) — función `match_stop_for_order` |
| `supabase/migrations/0XC_assign_orders_to_plan.sql` | **NUEVO** (Fase C) — `assign_orders_to_plan`, `unassign_orders_from_plan`, `merge_stops` |
| `supabase/migrations/0XD_org_api_tokens.sql` | **NUEVO** (Fase B.4) — tabla y RLS |
| `data/types/database.ts` | **REGENERAR** después de cada migración |
| `data/services/customers/` | **NUEVO** (Fase A.2) — `customers.services.ts`, `customers.types.ts`, barrel |
| `data/services/stops/stops.services.ts` | + `listDuplicates`, `mergeStops`, `promoteToCurated` |
| `data/services/orders/orders.services.ts` | + `bulkCreate`, `importFromCsv`, `assignToPlan`, `unassignFromPlan` |
| `data/services/orders/orders.types.ts` | + `OrderInsert`, `ImportReport`, `AssignReport`, `MatchQuality` |
| `data/services/vroom/vroom.services.ts` | Migrar de Edge Function → Railway (Fase D.3) |
| `data/services/geocoding/geocoding.services.ts` | **NUEVO** — proxy a Railway `/geocode/batch` |
| `data/services/importTemplates/` | **NUEVO** — CRUD plantillas |
| `domain/adapters/customer.adapter.ts` | **NUEVO** |
| `domain/adapters/stop.adapter.ts` | Update: `customerId`, `addressHash`, `isCurated`, `geocodingConfidence`, `useCount`, `lastUsedAt` |
| `domain/adapters/order.adapter.ts` | Update: `matchQuality`, `matchReviewNeeded`, `customerId` |
| `domain/adapters/vehicle.adapter.ts` | Update: `skills`, `volumeM3`, `maxStops` |
| `presentation/features/customers/` | **NUEVO** (Fase A.2) — CRUD + import |
| `presentation/features/stops/components/DuplicatesView.tsx` | **NUEVO** (Fase A.2) |
| `presentation/features/stops/components/PromoteToCuratedModal.tsx` | **NUEVO** (Fase A.2) |
| `presentation/features/orders/components/ImportWizard/` | **NUEVO** (Fase B, reemplaza `ImportCsvModal.tsx`) |
| `presentation/features/orders/components/ImportCsvModal.tsx` | **BORRAR** después de Fase B |
| `presentation/features/orders/utils/csv.ts` | Conservar como helper de auto-detect (Step 2) |
| `presentation/features/orders/hooks/useAssignToPlan.ts` | Reescribir: reemplaza loop secuencial por RPC |
| `presentation/features/planner/hooks/useOneClickOptimize.ts` | **NUEVO** (Fase D) |
| `presentation/features/planner/components/VroomWizardModal.tsx` | Recibir preview pre-cargado, modo embebido |
| `presentation/pages/OrdersPage.tsx` | Reducir drásticamente: usar ImportWizard + botón "Optimizar día" |
| `presentation/pages/CustomersPage.tsx` | **NUEVO** |
| `application/navigation/routes.tsx` | + `/customers`, `/stops/duplicates` |
| `mobile/src/data/types/database.ts` | **REGENERAR** en sincronía |
| Backend `vuoo-rutas` (repo aparte) | + `/geocode/batch`, `/api/v1/orders`, `/orders/import` (invoca `match_stop_for_order` + `assign_orders_to_plan`) |

---

## 5. Roadmap sugerido

| Semana | Hitos |
|---|---|
| **S1** | Fase A: migración schema (customers, stops cache fields, orders match flags, extensiones), regenerar tipos web+mobile, adapters, backfill `address_hash` |
| **S2** | Fase A.2: CRUD customers + promoción is_curated + vista duplicados |
| **S3-S4** | Fase B.1-B.3: ImportWizard con match preview + geocoding Railway. Demo: import 200 filas < 15 s, matchea contra catálogo existente |
| **S5** | Fase B.4: tokens API + endpoint público `/api/v1/orders` + Settings UI |
| **S6** | Fase C: `assign_orders_to_plan` + integración OrdersPage. Demo: 50 pedidos → 1 click → plan armado |
| **S7** | Fase D.3: migración Vroom Edge Function → Railway |
| **S8** | Fase D.1: One-click optimize end-to-end |
| **S9** | Fase D.2: re-optimización oportunista + telemetría PostHog |

**Atajo "UX-first" (si urge):** A + B + D primero (saltar A.2 y C), 5-6 semanas. Pierdes autocompletado de customer y merge dentro del plan, pero ganas el flow completo CSV→rutas. A.2 y C se incorporan después sin romper nada.

**Camino crítico:** A bloquea todo; B bloquea D; A.2 es paralelo a B (equipos distintos si hay bandwidth).

---

## 6. Telemetría

Eventos a instrumentar (PostHog / logger):

- `import_started` → `{ rows, source, templateUsed }`.
- `import_completed` → `{ created, failed, durationMs, geocodingHitRate }`.
- `import_pin_drop_used` → `{ rowCount }`.
- `merge_executed` → `{ orderCount, stopCount, mergedCount, durationMs }`.
- `optimize_one_click` → `{ orderCount, vehicleCount, mode, durationMs, success }`.
- `re_optimize_proposed` → `{ newOrderCount, accepted }`.
- `api_order_received` → `{ orgId, source, idempotencyHit }`.

Dashboard en PostHog: tiempo p50/p95 import-to-route, % auto-merge, hit-rate de cache de geocoding, tasa de pin-drops manuales (señal de calidad de geocoding).

---

## 7. Decisiones abiertas (pedir antes de empezar)

1. ~~**Orden A→D vs B+D primero.**~~ **Decidido:** A → A.2 → B → C → D (mayoría de clientes recurrentes justifica invertir en modelo dual desde el inicio).
2. **Thresholds del matching.** `similarity >= 0.85` para high es una apuesta. Validar con concierge test (tomar 1 mes de imports reales, ver qué % matchea "correctamente" según el operador). Ajustar antes de liberar B a prod.
3. **Feature flag `customers_enabled`.** ¿Página de customers visible para todas las orgs desde día 1, o gate por flag? Si 100% B2B justifica dejarla siempre visible y saltar la complejidad.
4. **Customer vs stop sobre `address_hash` duplicado.** Si un stop tiene `customer_id=A` y otro stop con misma address tiene `customer_id=B`, ¿son dos ubicaciones legítimas (edificio compartido) o un error? Propuesta: la vista de duplicados filtra por `customer_id` distinto y muestra warning específico.
5. **Mapbox vs Google Geocoding.** Hoy Mapbox; en LATAM Google suele ser más preciso para direcciones informales. ¿Mantener Mapbox o evaluar híbrido (Mapbox primero, Google como fallback si `confidence < 0.6`)?
6. **Endpoint público: tokens vs OAuth.** Tokens por org son más simples (suficiente para Shopify webhooks). OAuth desbloquea apps multi-tenant en marketplace de Shopify pero cuesta 2-3 semanas adicionales. Para MVP recomiendo tokens.
7. **Re-optimización oportunista (D.2): notificación o silencio.** Hoy propongo "siempre proponer, nunca auto-aplicar". Algunos clientes preferirán "auto-aplicar si el chofer no salió". ¿Configuración por org?
8. **Borrar Edge Function `optimize-routes-vroom`.** Después de migrar a Railway, ¿cuánto tiempo de gracia antes de borrarla? Sugiero 1 semana monitoreando 0 invocaciones.
9. **Mobile sync.** ¿Quién regenera y verifica `database.ts` en `/mobile`? Necesita un check en CI o un owner explícito.
10. **Política de fusión de stops.** ¿Operador confirma cada fusión, o batch ("fusionar 12 pares con score > 0.98 automáticamente")? Propuesta: empezar 100% manual, añadir batch solo si los datos muestran que es seguro.

---

## 8. Definition of done (global)

### Flujo completo
- [ ] Operador importa CSV de 50 pedidos y ve rutas optimizadas en pantalla en < 60 s sin tocar nada más que "siguiente" y "confirmar".
- [ ] El mismo operador, segundo import del mismo formato con clientes repetidos: < 30 s (template guardado, cache de geocoding caliente, matching `high` en mayoría).
- [ ] Shopify webhook crea órdenes vía `POST /api/v1/orders` y aparecen en el inbox del dispatcher en realtime, con `match_quality` correctamente seteado.
- [ ] Llegan 3 pedidos nuevos a un plan ya planificado → toast propone re-optimizar.

### Modelo dual (B2B + B2C)
- [ ] Org en modo B2C puro (sin customers creados) puede usar todo el flujo, los stops se generan como cache automáticamente.
- [ ] Org en modo B2B (con customers) ve autocompletado al crear órdenes manuales y matching `high` en imports de clientes recurrentes.
- [ ] Promover un stop a `is_curated` eleva el siguiente matching de `medium` → `high`.
- [ ] Vista de duplicados permite fusionar dos stops sin perder órdenes asociadas.

### Calidad técnica
- [ ] Vehículo refrigerado solo recibe pedidos con `required_skills` ⊆ sus `skills`.
- [ ] 0 referencias a `supabase.functions.invoke('optimize-routes-vroom')`.
- [ ] 0 tokens de geocoding privados en `dist/`.
- [ ] Todas las RPC (`match_stop_for_order`, `assign_orders_to_plan`, `unassign_orders_from_plan`, `merge_stops`) con tests de integración que cubren happy path + edge cases descritos.
- [ ] Web y mobile comparten el mismo `database.ts` regenerado (check en CI).

### Métricas en producción (7 días)
- [ ] PostHog muestra p50 import-to-route < 60 s.
- [ ] ≥ 85 % de órdenes importadas sin pin-drop ni corrección manual.
- [ ] ≥ 30 % de órdenes con `match_quality=high` en orgs con > 1 semana de operación.
- [ ] 0 imports parciales reportados.
