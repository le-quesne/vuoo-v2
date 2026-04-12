# 09 - Pedidos: Donde Empieza Todo

> **Objetivo:** Crear el concepto de "pedido" como la unidad de trabajo que alimenta todo el sistema. Un pedido llega (manual, CSV, Shopify, API), se convierte en parada, se asigna a un plan, se entrega, se cierra. Sin esto, Vuoo es una herramienta de mapas y no un sistema de entregas.
>
> **Por que es critico:** Hoy el flujo es: crear stop manualmente → agregar a plan → entregar. Pero en la realidad el flujo es: llega pedido del cliente → despachar → entregar → confirmar. El pedido es la unidad que el negocio entiende, no la "parada".

---

## Estado Actual

### Lo que existe:
- **Stop** = ubicacion con datos de cliente (nombre, telefono, email, direccion, peso, ventana horaria)
- **PlanStop** = stop asignado a un plan con status de entrega
- Crear stops manualmente en StopsPage (uno por uno)
- Agregar stops existentes a un plan en PlanDetailPage

### Lo que NO existe:
- Concepto de "pedido" u "orden"
- Numero de referencia / ID externo
- Items, productos, cantidades, SKUs
- Origen del pedido (manual, Shopify, API, CSV)
- Estado del pedido como ciclo de vida (nuevo → programado → en ruta → entregado)
- Bandeja de entrada de pedidos ("inbox" de pedidos nuevos por procesar)
- Import masivo de pedidos
- Conexion con e-commerce

### El problema de producto:
El dispatcher abre Vuoo y tiene que crear stops uno por uno, recordando direcciones, pesos, horarios. En la vida real, los pedidos ya existen en otro sistema (planilla Excel, Shopify, WhatsApp del cliente, ERP). Vuoo deberia recibirlos y convertirlos en entregas, no obligar al usuario a re-tipear todo.

---

## Modelo de Datos

### La relacion correcta

```
Pedido (Order)          →  Lo que el cliente pidio
    ↓
Stop (Location)         →  A donde hay que ir (reutilizable)
    ↓
PlanStop (Assignment)   →  La entrega especifica de hoy
    ↓
Route (Execution)       →  El vehiculo + conductor que lo lleva
```

**Un pedido genera una parada en un plan.** Pero una parada (ubicacion) puede reutilizarse en multiples pedidos — si le entregas al mismo cliente cada semana, la ubicacion es la misma pero el pedido es diferente cada vez.

---

### Nueva tabla: `orders`

```sql
create table orders (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  
  -- Identificacion
  order_number      text not null,            -- "#ORD-0001" (auto-generado o externo)
  external_id       text,                     -- ID en sistema origen (Shopify order ID, etc.)
  source            text not null default 'manual',  -- 'manual' | 'csv' | 'shopify' | 'vtex' | 'api' | 'whatsapp'
  
  -- Cliente
  customer_name     text not null,
  customer_phone    text,
  customer_email    text,
  
  -- Destino
  address           text not null,
  lat               double precision,
  lng               double precision,
  delivery_instructions text,
  
  -- Contenido
  items             jsonb default '[]',       -- [{ name, quantity, sku, weight_kg, price }]
  total_weight_kg   numeric default 0,        -- sum de items.weight * quantity
  total_volume_m3   numeric,
  total_price       numeric,                  -- valor declarado (para seguro, COD)
  currency          text default 'CLP',
  
  -- Entrega
  service_duration_minutes integer default 15,
  time_window_start time,
  time_window_end   time,
  priority          text default 'normal',    -- 'urgent' | 'high' | 'normal' | 'low'
  requires_signature boolean default false,
  requires_photo    boolean default true,
  
  -- Fecha deseada
  requested_date    date,                     -- cuando el cliente quiere recibirlo
  
  -- Estado del pedido (ciclo de vida)
  status            text not null default 'pending',
  -- 'pending'     → recibido, esperando planificacion
  -- 'scheduled'   → asignado a un plan
  -- 'in_transit'  → conductor en ruta
  -- 'delivered'   → entregado exitosamente
  -- 'failed'      → intento fallido
  -- 'cancelled'   → cancelado
  -- 'returned'    → devuelto al origen
  
  -- Relaciones
  stop_id           uuid references stops(id) on delete set null,      -- ubicacion reutilizable
  plan_stop_id      uuid references plan_stops(id) on delete set null, -- asignacion especifica
  
  -- Notas internas
  internal_notes    text,
  tags              text[],                   -- ['fragil', 'frio', 'urgente', 'VIP']
  
  -- Metadata
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_orders_org on orders(org_id);
create index idx_orders_status on orders(org_id, status);
create index idx_orders_date on orders(org_id, requested_date);
create index idx_orders_number on orders(org_id, order_number);
create index idx_orders_external on orders(org_id, external_id) where external_id is not null;
```

### Auto-generacion de order_number

```sql
-- Secuencia por organizacion
create or replace function generate_order_number(p_org_id uuid)
returns text as $$
declare
  next_num integer;
begin
  select coalesce(max(
    nullif(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::integer
  ), 0) + 1
  into next_num
  from orders
  where org_id = p_org_id and source = 'manual';
  
  return 'ORD-' || lpad(next_num::text, 5, '0');
end;
$$ language plpgsql;
```

---

## Ciclo de Vida del Pedido

```
                    ┌──────────┐
        Ingreso →   │ pending  │  ← Pedido recibido, sin planificar
                    └────┬─────┘
                         │ asignar a plan
                    ┌────▼─────┐
                    │scheduled │  ← Asignado a un plan/ruta
                    └────┬─────┘
                         │ conductor inicia ruta
                    ┌────▼─────┐
                    │in_transit│  ← Conductor en camino
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │delivered │ │ failed │ │cancelled │
        └──────────┘ └───┬────┘ └──────────┘
                         │ reprogramar
                    ┌────▼─────┐
                    │ pending  │  ← Vuelve a la bandeja
                    └──────────┘
```

### Sincronizacion order.status ↔ plan_stop.status

Cuando `plan_stop.status` cambia (desde la app movil del conductor), el `order.status` se actualiza automaticamente:

| plan_stop.status | order.status | Trigger |
|------------------|--------------|---------|
| pending | scheduled | Al crear plan_stop |
| (ruta inicia) | in_transit | route.status → in_transit |
| completed | delivered | Conductor completa |
| incomplete | failed | Conductor reporta fallo |
| cancelled | cancelled | Dispatcher cancela |

Esto se hace via DB trigger o en la Edge Function que procesa status changes.

---

## Formas de Ingresar Pedidos

### 1. Manual (desde el dashboard)

Nueva pagina: `/orders` (o seccion en la bandeja)

```
┌──────────────────────────────────────────────────────────────────┐
│  Pedidos          [+ Nuevo pedido]  [Importar CSV]  [🔍 Buscar] │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Filtros: [Todos ▼] [Hoy ▼] [Pendientes: 12 🟡]                │
│                                                                  │
│  ┌────┬──────────┬──────────────┬──────────┬────────┬─────────┐ │
│  │ ☐  │ #ORD-042 │ Juan Perez   │ Prov 1234│ 5.2 kg │ 🟡 Pend │ │
│  │ ☐  │ #ORD-043 │ Maria Lopez  │ Ñuñoa 56 │ 3.0 kg │ 🟡 Pend │ │
│  │ ☐  │ #ORD-044 │ Carlos Soto  │ Macul 78 │ 8.5 kg │ 🟢 Prog │ │
│  │ ☐  │ #ORD-045 │ Ana Torres   │ LC 901   │ 2.1 kg │ 🔵 Ruta │ │
│  │ ☐  │ #ORD-046 │ Pedro Diaz   │ Stgo Ctr │ 1.5 kg │ ✅ Entr │ │
│  └────┴──────────┴──────────────┴──────────┴────────┴─────────┘ │
│                                                                  │
│  12 pendientes · 5 programados · 3 en ruta · 8 entregados       │
│                                                                  │
│  [Programar seleccionados →]                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Crear pedido manual:**

```
┌────────────────────────────────────────┐
│  Nuevo pedido                      [X] │
│                                        │
│  ── Cliente ──                         │
│  Nombre *         [________________]   │
│  Telefono         [+56 ___________]    │
│  Email            [________________]   │
│                                        │
│  ── Destino ──                         │
│  Direccion *      [________________]   │  ← autocomplete Mapbox
│  Instrucciones    [________________]   │
│                                        │
│  ── Contenido ──                       │
│  + Agregar item                        │
│  ┌──────────────┬─────┬───────┐        │
│  │ Caja zapatos │  2  │ 1.5kg │  [x]   │
│  │ Bolsa ropa   │  1  │ 0.8kg │  [x]   │
│  └──────────────┴─────┴───────┘        │
│  Peso total: 3.8 kg                    │
│                                        │
│  ── Entrega ──                         │
│  Fecha deseada    [11/04/2026]         │
│  Ventana horaria  [09:00] - [12:00]    │
│  Duracion         [15] min             │
│  Prioridad        [Normal ▼]           │
│  Tags             [fragil] [VIP] [+]   │
│                                        │
│  ── Opciones ──                        │
│  ☑ Requiere foto                       │
│  ☐ Requiere firma                      │
│                                        │
│  [Cancelar]  [Crear pedido]            │
└────────────────────────────────────────┘
```

### 2. Import CSV / Excel

```
Click [Importar CSV]
     │
     ▼
┌──────────────────────────────────────────┐
│  Importar pedidos                    [X] │
│                                          │
│  [Arrastra archivo CSV o click aqui]     │
│                                          │
│  Columnas esperadas:                     │
│  nombre_cliente, telefono, email,        │
│  direccion, peso_kg, ventana_inicio,     │
│  ventana_fin, items, notas               │
│                                          │
│  [Descargar plantilla CSV]               │
└──────────────────────────────────────────┘
     │ (archivo cargado)
     ▼
┌──────────────────────────────────────────┐
│  Preview: 45 pedidos encontrados         │
│                                          │
│  ┌─────┬──────────┬──────────┬────────┐  │
│  │  #  │ Cliente  │Direccion │ Estado │  │
│  │  1  │ Juan P.  │ Prov 123 │ ✅ OK  │  │
│  │  2  │ Maria L. │ Ñuñoa 45 │ ✅ OK  │  │
│  │  3  │ Carlos S.│          │ ❌ Sin │  │
│  │     │          │          │   dir. │  │
│  │  4  │ Ana T.   │ xyz 999  │ ⚠ No  │  │
│  │     │          │          │  geoc. │  │
│  └─────┴──────────┴──────────┴────────┘  │
│                                          │
│  42 validos · 2 con errores · 1 warning  │
│                                          │
│  [Cancelar]  [Importar 42 pedidos]       │
└──────────────────────────────────────────┘
```

- Geocoding automatico de direcciones via Mapbox
- Preview con validacion antes de importar
- Errores marcados en rojo (sin direccion, sin nombre)
- Warnings en amarillo (direccion no geocodificada con certeza)
- Descartar filas con error o corregir inline

### 3. Integracion Shopify / VTEX (futuro, doc 04)

```
Shopify webhook (order.created)
     │
     ▼
Edge Function: shopify-ingest
     │
     ├─ Extraer: cliente, direccion, items, peso
     ├─ Geocodificar direccion
     ├─ Buscar stop existente (misma direccion) o crear nuevo
     ├─ Crear order con source='shopify', external_id=shopify_order_id
     └─ Status: 'pending' (aparece en bandeja)
```

### 4. API (futuro, doc 04)

```
POST /v1/orders
{
  "customer_name": "Juan Perez",
  "customer_phone": "+56912345678",
  "address": "Av. Providencia 1234, Santiago",
  "items": [{ "name": "Caja", "quantity": 2, "weight_kg": 1.5 }],
  "requested_date": "2026-04-12",
  "time_window_start": "09:00",
  "time_window_end": "12:00"
}
```

---

## Bandeja de Pedidos (Inbox)

### Concepto

La bandeja es donde llegan TODOS los pedidos pendientes de programar. Es la primera cosa que ve el dispatcher cada mañana.

```
┌──────────────────────────────────────────────────────────────────┐
│  📥 Bandeja de pedidos                                           │
│                                                                  │
│  🟡 12 pendientes  │  📅 5 para hoy  │  ⚠ 2 atrasados          │
│                                                                  │
│  [Seleccionar todos]  [Programar seleccion →]                    │
│                                                                  │
│  ── Para hoy (5) ──                                              │
│  ☐ #ORD-042  Juan Perez     Prov 1234    5.2kg  09:00-12:00     │
│  ☐ #ORD-043  Maria Lopez    Ñuñoa 567    3.0kg  10:00-14:00     │
│  ☐ #ORD-048  Pedro Diaz     Stgo Centro  1.5kg  sin ventana     │
│  ☐ #ORD-049  Luis Rojas     Las Condes   8.0kg  08:00-10:00 ⚠  │
│  ☐ #ORD-050  Sofia Vega     Vitacura     2.3kg  14:00-18:00     │
│                                                                  │
│  ── Para mañana (3) ──                                           │
│  ☐ #ORD-051  ...                                                 │
│                                                                  │
│  ── Sin fecha (4) ──                                             │
│  ☐ #ORD-055  ...                                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo: Bandeja → Plan

```
1. Dispatcher abre bandeja: ve 12 pedidos pendientes
2. Selecciona los 5 que son para hoy
3. Click "Programar seleccion"
4. Modal: "Agregar a plan existente o crear nuevo?"
   - Plan existente: dropdown de planes de hoy
   - Nuevo plan: nombre + fecha
5. Sistema:
   - Busca o crea stop por cada pedido (match por direccion)
   - Crea plan_stop por cada pedido
   - Vincula order.plan_stop_id
   - Cambia order.status de 'pending' a 'scheduled'
6. Dispatcher va al plan → las paradas ya estan ahi, listas para optimizar
```

---

## Relacion Order ↔ Stop ↔ PlanStop

### Stop reutilizable

Cuando llega un pedido para una direccion que ya existe:
- Buscar stop existente con misma direccion (match por lat/lng con tolerancia ~50m, o por address text)
- Si existe: reutilizar ese stop_id
- Si no existe: crear nuevo stop

Esto permite que un cliente recurrente siempre use la misma parada base, pero cada pedido sea un registro unico.

```
Stop: "Av. Providencia 1234"  (ubicacion permanente)
  ├── Order #ORD-042  (pedido del 11 abril)
  │     └── PlanStop (plan "Lunes AM", ruta 1, posicion 3)
  ├── Order #ORD-089  (pedido del 18 abril) 
  │     └── PlanStop (plan "Lunes AM", ruta 2, posicion 5)
  └── Order #ORD-134  (pedido del 25 abril)
        └── (aun en bandeja, sin programar)
```

---

## Cambios en UI Existente

### Sidebar: Nueva entrada "Pedidos"

```
📅 Planner
📦 Pedidos        ← NUEVO (con badge de pendientes)
📍 Paradas
🗺️ Rutas
🚛 Vehiculos
👤 Conductores
📡 Control
📊 Analytics
```

### PlanDetailPage: Mostrar info del pedido

En cada parada del sidebar, mostrar el numero de pedido:

```
┌──────────────────────────────────────┐
│ ⠿ 3  Av. Providencia 1234    ✅     │
│      #ORD-042 · 2 items · 3.8 kg    │
│      Juan Perez · 09:00-12:00       │
└──────────────────────────────────────┘
```

Click en la parada → panel con detalle del pedido (items, notas, historial).

### AnalyticsPage: Metricas de pedidos

- Pedidos recibidos por dia/semana/mes
- Tiempo promedio bandeja → entrega
- Pedidos por fuente (manual, CSV, Shopify, API)
- Tasa de entrega exitosa por pedido (no solo por parada)

---

## Migracion SQL

```sql
-- 010_orders.sql

-- 1. Tabla de pedidos
create table orders (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  order_number          text not null,
  external_id           text,
  source                text not null default 'manual',
  customer_name         text not null,
  customer_phone        text,
  customer_email        text,
  address               text not null,
  lat                   double precision,
  lng                   double precision,
  delivery_instructions text,
  items                 jsonb default '[]',
  total_weight_kg       numeric default 0,
  total_volume_m3       numeric,
  total_price           numeric,
  currency              text default 'CLP',
  service_duration_minutes integer default 15,
  time_window_start     time,
  time_window_end       time,
  priority              text default 'normal',
  requires_signature    boolean default false,
  requires_photo        boolean default true,
  requested_date        date,
  status                text not null default 'pending',
  stop_id               uuid references stops(id) on delete set null,
  plan_stop_id          uuid references plan_stops(id) on delete set null,
  internal_notes        text,
  tags                  text[],
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 2. Indices
create index idx_orders_org on orders(org_id);
create index idx_orders_status on orders(org_id, status);
create index idx_orders_date on orders(org_id, requested_date);
create index idx_orders_number on orders(org_id, order_number);
create index idx_orders_external on orders(org_id, external_id) where external_id is not null;
create index idx_orders_source on orders(org_id, source);

-- 3. RLS
alter table orders enable row level security;

create policy "Org members can view orders"
  on orders for select using (org_id in (select user_org_ids()));

create policy "Org members can manage orders"
  on orders for insert with check (org_id in (select user_org_ids()));

create policy "Org members can update orders"
  on orders for update using (org_id in (select user_org_ids()));

create policy "Org members can delete orders"
  on orders for delete using (org_id in (select user_org_ids()));

-- 4. Funcion para generar order_number
create or replace function generate_order_number(p_org_id uuid)
returns text as $$
declare next_num integer;
begin
  select coalesce(max(
    nullif(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::integer
  ), 0) + 1 into next_num
  from orders where org_id = p_org_id;
  return 'ORD-' || lpad(next_num::text, 5, '0');
end;
$$ language plpgsql;

-- 5. Trigger para sync order.status cuando plan_stop.status cambia
create or replace function sync_order_status()
returns trigger as $$
begin
  if NEW.status != OLD.status then
    update orders set
      status = case NEW.status
        when 'completed' then 'delivered'
        when 'incomplete' then 'failed'
        when 'cancelled' then 'cancelled'
        else status
      end,
      updated_at = now()
    where plan_stop_id = NEW.id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_sync_order_status
  after update of status on plan_stops
  for each row execute function sync_order_status();

-- 6. Habilitar Realtime (para bandeja en vivo)
alter publication supabase_realtime add table orders;
```

---

## Preguntas Abiertas

1. **Order vs Stop: cual es la entidad principal?**
   - Hoy todo gira en torno a Stops. Con pedidos, el flujo es: Order → genera Stop + PlanStop.
   - Los stops siguen existiendo como ubicaciones reutilizables.
   - **Recomendacion:** El pedido es lo que el usuario crea. El stop se crea automaticamente detras.

2. **Items: campo JSONB o tabla separada?**
   - JSONB es mas simple (un campo, no joins)
   - Tabla separada permite queries por SKU, stock, etc.
   - **Recomendacion:** JSONB para V1. Si necesitan inventario real, migrar a tabla.

3. **Order_number: auto-generado o del sistema externo?**
   - Para pedidos manuales: auto-generado (ORD-00001)
   - Para integraciones: usar el ID externo como order_number
   - **Recomendacion:** Auto-generar siempre, guardar el externo en `external_id`

4. **La pagina de pedidos reemplaza StopsPage?**
   - No. StopsPage sigue como "directorio de ubicaciones" (maestro de direcciones).
   - OrdersPage es la "bandeja de trabajo" (pedidos por procesar).
   - Son complementarias, no sustitutas.

5. **Pedidos recurrentes?**
   - Un cliente que recibe cada semana = mismo stop, nuevo pedido cada vez
   - Futuro: "crear pedido recurrente" que auto-genera orders cada semana
   - **Recomendacion:** No implementar recurrencia ahora, el flujo manual + CSV cubre

---

## Definicion de Done

### Tabla y tipos
- Tabla `orders` en Supabase con RLS
- Type `Order` en database.ts
- Trigger `sync_order_status` funcional
- Funcion `generate_order_number` funcional

### Pagina de Pedidos (`/orders`)
- Tabla con: order_number, cliente, direccion, peso, status, fecha, source
- Filtros: status (pending/scheduled/delivered/etc.), fecha, busqueda
- Crear pedido manual (modal con cliente + items + entrega)
- Editar pedido
- Eliminar pedido (solo si status=pending)
- Badge en sidebar con conteo de pendientes

### Bandeja (Inbox)
- Vista de pedidos pendientes agrupados por fecha
- Seleccion multiple
- "Programar seleccion" → asignar a plan existente o crear nuevo
- Auto-crear stop si no existe para esa direccion
- Auto-crear plan_stop y vincular con order

### Import CSV
- Upload de archivo CSV
- Mapeo de columnas
- Preview con validacion y errores
- Geocoding batch de direcciones
- Plantilla CSV descargable

### Integracion con PlanDetailPage
- Mostrar order_number en cada parada
- Click en parada muestra detalle del pedido
- Status del pedido se actualiza automaticamente cuando la entrega cambia
