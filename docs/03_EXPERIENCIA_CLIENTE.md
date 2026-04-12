# 03 - Experiencia del Cliente: Tracking + Notificaciones + Satisfaccion

> **Objetivo:** El cliente final (quien recibe la entrega) necesita saber cuando llega su pedido, poder ver al conductor en vivo, y dar feedback despues. Hoy no existe nada customer-facing en Vuoo.
>
> **Depende de:** 01_GESTION_FLOTA (conductores) + 02_EJECUCION_TERRENO (GPS tracking, POD, status updates)

---

## Estado Actual

### Lo que NO existe:

- Ninguna pagina publica (todo requiere auth)
- Ningun campo de contacto del cliente en `stops` (ni nombre, ni telefono, ni email)
- Ninguna integracion de mensajeria (WhatsApp, SMS, email)
- Ninguna pagina de tracking
- Ninguna encuesta de satisfaccion
- Ningun historial de notificaciones enviadas

### Lo que SI existe y se puede aprovechar:

- `driver_locations` con GPS en tiempo real (doc 02)
- `PlanStop.status` con flujo pending → completed/cancelled/incomplete
- POD: fotos, firma, GPS, timestamp (doc 02)
- Supabase Edge Functions ya configuradas (push notifications)
- Supabase Realtime habilitado en `driver_locations`

---

## Canales de Notificacion

### Por que WhatsApp primero (Chile/LATAM)

En Chile, WhatsApp tiene ~95% de penetracion. SMS se lee menos y cuesta mas. Email es complementario.


| Canal              | Costo por mensaje (Chile) | Tasa apertura | Recomendacion                      |
| ------------------ | ------------------------- | ------------- | ---------------------------------- |
| WhatsApp (utility) | ~$0.02 USD                | ~90%          | **Canal principal**                |
|                    |                           |               |                                    |
| Email              | ~$0.0002 USD              | ~25%          | Complementario (con tracking link) |


### Proveedores recomendados


| Canal    | Proveedor                    | Por que                                                   |
| -------- | ---------------------------- | --------------------------------------------------------- |
| WhatsApp | **Meta Cloud API** (directo) | Sin intermediario, mas barato, facil desde Edge Functions |
|          |                              |                                                           |
| Email    | **Resend**                   | DX moderna, React Email templates, free tier suficiente   |


**Alternativa unificada:** Twilio para todo (WhatsApp + SMS) si se prefiere un solo proveedor, pero cuesta ~$0.005-0.01 mas por mensaje WhatsApp.

---

## Datos del Cliente en Stops

### Nuevos campos en `stops`

```sql
alter table stops add column customer_name  text;
alter table stops add column customer_phone text;      -- formato: +56912345678
alter table stops add column customer_email text;
alter table stops add column delivery_instructions text;
```

### Nuevo campo en `plan_stops`

```sql
alter table plan_stops add column tracking_token uuid default gen_random_uuid();
alter table plan_stops add column notification_preferences jsonb default '{"whatsapp": true, "sms": false, "email": true}';

create unique index idx_plan_stops_tracking_token on plan_stops(tracking_token);
```

El `tracking_token` es la llave publica para acceder a la pagina de tracking sin auth. Es un UUID no-adivinable.

---

## Pagina de Tracking Publica

### URL

```
https://app.vuoo.cl/track/{tracking_token}
```

### Sin autenticacion

- No requiere login
- El token UUID es el control de acceso (no adivinable)
- Se accede via Edge Function que usa service key (bypasa RLS)

### Que muestra la pagina

```
┌─────────────────────────────────────────────┐
│  🟢 Tu entrega esta en camino              │
│                                             │
│  [MAPA con posicion del conductor en vivo]  │
│                                             │
│  ── Timeline ──                             │
│  ✓ Pedido confirmado        10:00          │
│  ✓ En camino                10:45          │
│  ● Llegando (3 paradas antes) ~11:20       │
│  ○ Entregado                               │
│                                             │
│  Conductor: Juan P.                         │
│  Vehiculo: AB-1234                          │
│  ETA: ~11:20 (actualizado en vivo)          │
│                                             │
│  ── Detalle ──                              │
│  Direccion: Av. Providencia 1234            │
│  Ventana: 10:00 - 12:00                     │
│  Referencia: #ORD-4521                      │
│                                             │
│  [Logo de la organizacion]                  │
│  Powered by Vuoo                            │
└─────────────────────────────────────────────┘
```

### Despues de entrega completada:

- Mostrar POD: foto + firma + hora + ubicacion
- Boton "Calificar entrega" (1-5 estrellas + comentario)

### Arquitectura

```
Browser                    Supabase Edge Function           DB
───────                    ────────────────────            ──
GET /track/:token    →     get-tracking-status       →    plan_stops + stops + routes + driver_locations
                     ←     JSON: status, ETA, driver, map data
                     
Realtime subscription →    Supabase Realtime         ←    driver_locations (INSERT)
                           (filtrado por route_id)
```

### Edge Function: `get-tracking-status`

```typescript
// supabase/functions/get-tracking-status/index.ts
// Recibe: tracking_token
// Retorna: estado de la entrega, posicion del conductor, ETA, info de parada

// Usa supabaseAdmin (service key) para bypasear RLS
// Solo expone datos necesarios: nada de IDs internos, org data, etc.

interface TrackingResponse {
  status: 'scheduled' | 'in_transit' | 'arriving' | 'delivered' | 'failed'
  stop: {
    address: string
    time_window_start: string | null
    time_window_end: string | null
    customer_name: string | null
    delivery_instructions: string | null
  }
  driver: {
    first_name: string
    vehicle_plate: string | null
  } | null
  eta: {
    estimated_arrival: string | null
    stops_before: number
  } | null
  location: {
    lat: number
    lng: number
    updated_at: string
  } | null
  pod: {
    photos: string[]           // signed URLs temporales
    signature_url: string | null
    completed_at: string | null
    location: string | null
  } | null
  org: {
    name: string
    logo_url: string | null    // branding futuro
  }
}
```

### Pagina React: `/track/:token`

- Ruta publica en App.tsx (fuera de RequireAuth)
- Componente liviano: solo fetch + mapa + timeline
- Supabase Realtime para posicion del conductor en vivo
- Auto-refresh de ETA cada 30 segundos
- Responsive (mobile-first, los clientes abren en telefono)
- No mostrar datos sensibles (no IDs internos, no info de otros clientes)

---

## Sistema de Notificaciones

### Eventos y mensajes


| Evento                 | Trigger                                     | Canal            | Mensaje                                                                                             |
| ---------------------- | ------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| **Entrega programada** | Plan se publica / parada se asigna a ruta   | WhatsApp + Email | "Tu entrega para {fecha} esta confirmada. Ventana: {hora_inicio} - {hora_fin}. Seguimiento: {link}" |
| **En camino**          | Conductor inicia ruta (status → in_transit) | WhatsApp         | "Tu pedido esta en camino! Conductor: {nombre}. Seguimiento en vivo: {link}"                        |
| **Llegando**           | Conductor esta a N paradas de distancia     | WhatsApp         | "Tu entrega llega pronto (~{eta}). Seguimiento: {link}"                                             |
| **Entregado**          | PlanStop.status → completed                 | WhatsApp + Email | "Tu entrega fue completada a las {hora}. Ver comprobante: {link}"                                   |
| **No entregado**       | PlanStop.status → incomplete                | WhatsApp         | "No pudimos completar tu entrega ({razon}). Contactanos: {telefono_org}"                            |
| **Encuesta**           | 30min despues de entrega completada         | WhatsApp o Email | "Como fue tu experiencia? Califica tu entrega: {link}"                                              |


### Templates de WhatsApp (Meta Cloud API)

Los templates deben ser pre-aprobados por Meta. Categoria: **utility** (la mas barata).

```
Template: delivery_scheduled (es)
─────────────────────────────────
Tu entrega esta confirmada para el {{1}}.
Horario estimado: {{2}} - {{3}}.

Seguimiento en vivo:
{{4}}

[Boton: "Ver seguimiento"]
```

```
Template: delivery_in_transit (es)
──────────────────────────────────
Tu pedido esta en camino!
Conductor: {{1}}
Llegada estimada: {{2}}

[Boton: "Seguir en vivo"]
```

```
Template: delivery_completed (es)
─────────────────────────────────
Tu entrega fue completada a las {{1}}.

Ver comprobante de entrega:
{{2}}

[Boton: "Ver comprobante"]
[Boton: "Calificar entrega"]
```

### Arquitectura de envio

```
Status change (plan_stop)
        │
        ▼
Supabase DB Webhook (on UPDATE plan_stops)
        │
        ▼
Edge Function: send-notification
        │
        ├─ Buscar stop → customer_phone, customer_email
        ├─ Buscar plan_stop → tracking_token, notification_preferences
        ├─ Determinar evento (scheduled, in_transit, delivered, etc.)
        │
        ├─ WhatsApp? → Meta Cloud API (graph.facebook.com)
        ├─ SMS? → Twilio API
        ├─ Email? → Resend API
        │
        └─ INSERT notification_logs (historial)
```

### Nueva tabla: `notification_logs`

```sql
create table notification_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plan_stop_id    uuid not null references plan_stops(id) on delete cascade,
  channel         text not null,      -- 'whatsapp' | 'sms' | 'email'
  event_type      text not null,      -- 'scheduled' | 'in_transit' | 'arriving' | 'delivered' | 'failed' | 'survey'
  recipient       text not null,      -- telefono o email
  template_id     text,               -- ID del template de WhatsApp
  status          text not null default 'pending',  -- 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  error_message   text,
  external_id     text,               -- ID del proveedor (Twilio SID, Meta message ID)
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_notification_logs_plan_stop on notification_logs(plan_stop_id);
create index idx_notification_logs_org on notification_logs(org_id, created_at desc);
```

---

## Encuestas de Satisfaccion

### Flujo

```
Entrega completada
     │ (30 min delay)
     ▼
Edge Function: send-survey
     │
     ├─ WhatsApp: template con boton "Calificar"
     └─ Email: link a pagina de encuesta
            │
            ▼
     /track/{token}#feedback
            │
            ▼
     Cliente da rating (1-5) + comentario
            │
            ▼
     Edge Function: submit-feedback
            │
            ▼
     INSERT delivery_feedback
```

### Nueva tabla: `delivery_feedback`

```sql
create table delivery_feedback (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plan_stop_id    uuid not null references plan_stops(id) on delete cascade,
  driver_id       uuid references drivers(id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  submitted_at    timestamptz not null default now()
);

create index idx_delivery_feedback_org on delivery_feedback(org_id, submitted_at desc);
create index idx_delivery_feedback_driver on delivery_feedback(driver_id);
```

### Metricas derivadas

- **NPS:** (% ratings 5) - (% ratings 1-3) → calculado en queries
- **Rating promedio por conductor**
- **Rating promedio por organizacion**
- **Tendencia semanal/mensual**
- Visible en AnalyticsPage (doc 05 futuro)

---

## Configuracion por Organizacion

### Nueva tabla: `org_notification_settings`

```sql
create table org_notification_settings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade unique,
  
  -- Canales habilitados
  whatsapp_enabled    boolean default false,
  sms_enabled         boolean default false,
  email_enabled       boolean default true,
  
  -- Credenciales WhatsApp (Meta Cloud API)
  whatsapp_phone_id   text,            -- Phone Number ID de Meta
  whatsapp_token      text,            -- Access token (encriptado)
  whatsapp_verified   boolean default false,
  
  -- Credenciales SMS (Twilio)
  twilio_account_sid  text,
  twilio_auth_token   text,            -- encriptado
  twilio_phone_number text,
  
  -- Credenciales Email (Resend)
  resend_api_key      text,            -- encriptado
  email_from_address  text,            -- "entregas@miempresa.cl"
  email_from_name     text,            -- "Mi Empresa Entregas"
  
  -- Eventos habilitados
  notify_on_scheduled boolean default true,
  notify_on_transit   boolean default true,
  notify_on_arriving  boolean default true,
  notify_on_delivered boolean default true,
  notify_on_failed    boolean default true,
  send_survey         boolean default true,
  survey_delay_min    integer default 30,
  
  -- Branding
  logo_url            text,
  primary_color       text default '#6366f1',
  
  -- Proximity trigger
  arriving_stops_threshold integer default 3,  -- "llegando" cuando faltan N paradas
  
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
```

### UI: Pagina de Configuracion de Notificaciones

- Accesible desde Settings o VehiclesPage sidebar (seccion "Settings")
- Wizard paso a paso:
  1. **Conectar WhatsApp** — ingresar Phone Number ID + token de Meta Business
  2. **Conectar Email** — ingresar Resend API key + from address
  3. **Conectar SMS** (opcional) — Twilio credentials
  4. **Personalizar** — logo, color, eventos habilitados, delay de encuesta
  5. **Test** — enviar notificacion de prueba

---

## Cambios en UI Existente

### StopsPage: Agregar campos de cliente

- En CreateStopModal y EditStopModal agregar seccion "Cliente":
  - customer_name
  - customer_phone (con formato +56)
  - customer_email
  - delivery_instructions
- Estos campos son opcionales (no todas las paradas tienen cliente directo)

### PlanDetailPage: Info de notificaciones

- En cada parada, mostrar iconos de notificaciones enviadas (WhatsApp ✓, Email ✓)
- Click para ver historial de notificaciones de esa parada
- Boton "Reenviar notificacion" manual

### AnalyticsPage: Seccion satisfaccion (futuro)

- Rating promedio
- NPS score
- Ultimos comentarios
- Ranking de conductores por rating

---

## Migracion SQL

```sql
-- 005_customer_experience.sql

-- 1. Campos de cliente en stops
alter table stops add column customer_name text;
alter table stops add column customer_phone text;
alter table stops add column customer_email text;
alter table stops add column delivery_instructions text;

-- 2. Tracking token en plan_stops
alter table plan_stops add column tracking_token uuid default gen_random_uuid();
create unique index idx_plan_stops_tracking_token on plan_stops(tracking_token);

-- 3. Preferencias de notificacion por plan_stop
alter table plan_stops add column notification_preferences jsonb 
  default '{"whatsapp": true, "sms": false, "email": true}';

-- 4. Tabla de logs de notificaciones
create table notification_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plan_stop_id    uuid not null references plan_stops(id) on delete cascade,
  channel         text not null,
  event_type      text not null,
  recipient       text not null,
  template_id     text,
  status          text not null default 'pending',
  error_message   text,
  external_id     text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_notification_logs_plan_stop on notification_logs(plan_stop_id);
create index idx_notification_logs_org on notification_logs(org_id, created_at desc);

-- 5. Tabla de feedback
create table delivery_feedback (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plan_stop_id    uuid not null references plan_stops(id) on delete cascade,
  driver_id       uuid references drivers(id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  submitted_at    timestamptz not null default now()
);

create index idx_delivery_feedback_org on delivery_feedback(org_id, submitted_at desc);
create index idx_delivery_feedback_driver on delivery_feedback(driver_id);

-- 6. Configuracion de notificaciones por org
create table org_notification_settings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade unique,
  whatsapp_enabled    boolean default false,
  sms_enabled         boolean default false,
  email_enabled       boolean default true,
  whatsapp_phone_id   text,
  whatsapp_token      text,
  whatsapp_verified   boolean default false,
  twilio_account_sid  text,
  twilio_auth_token   text,
  twilio_phone_number text,
  resend_api_key      text,
  email_from_address  text,
  email_from_name     text,
  notify_on_scheduled boolean default true,
  notify_on_transit   boolean default true,
  notify_on_arriving  boolean default true,
  notify_on_delivered boolean default true,
  notify_on_failed    boolean default true,
  send_survey         boolean default true,
  survey_delay_min    integer default 30,
  logo_url            text,
  primary_color       text default '#6366f1',
  arriving_stops_threshold integer default 3,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 7. RLS
alter table notification_logs enable row level security;
alter table delivery_feedback enable row level security;
alter table org_notification_settings enable row level security;

create policy "Org members can view notification logs"
  on notification_logs for select
  using (org_id in (select user_org_ids()));

create policy "System can insert notification logs"
  on notification_logs for insert
  with check (org_id in (select user_org_ids()));

create policy "Org members can view feedback"
  on delivery_feedback for select
  using (org_id in (select user_org_ids()));

create policy "Public can submit feedback via token"
  on delivery_feedback for insert
  with check (true);  -- controlado por Edge Function con validacion

create policy "Org admins can manage notification settings"
  on org_notification_settings for all
  using (org_id in (select user_org_ids()));

-- 8. Habilitar Realtime en plan_stops (para tracking page)
alter publication supabase_realtime add table plan_stops;
```

---

## Edge Functions Necesarias


| Funcion               | Trigger                                      | Que hace                                                    |
| --------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `get-tracking-status` | GET request con token                        | Retorna estado, ETA, ubicacion conductor, POD               |
| `send-notification`   | DB webhook on plan_stops UPDATE              | Determina evento, busca config org, envia por canal(es)     |
| `send-survey`         | Cron o delayed trigger (30min post-delivery) | Envia encuesta por WhatsApp/Email                           |
| `submit-feedback`     | POST request publico con token + rating      | Valida token, inserta feedback                              |
| `whatsapp-webhook`    | POST desde Meta (delivery receipts)          | Actualiza status en notification_logs (sent→delivered→read) |


---

## Preguntas Abiertas

1. **Cada org trae sus propias credenciales de WhatsApp/Twilio?**
  - Opcion A: Si, cada org configura su WhatsApp Business (mas complejo, mas profesional)
  - Opcion B: Vuoo tiene una cuenta central y cobra por mensaje (mas simple, revenue stream)
  - **Recomendacion:** Opcion B para empezar (Vuoo como intermediario), migrar a A cuando haya demanda  
    
  Hagamos Ambas opciones.  

2. **Tracking page: branding por org?**
  - Logo + color primario es suficiente para V1
  - Custom domain (track.miempresa.cl) seria P2
  - **Recomendacion:** Logo + color V1, custom domain despues
3. **Donde vive la tracking page?**
  - Opcion A: Dentro del mismo React app (ruta publica `/track/:token`)
  - Opcion B: Pagina separada (Next.js/Astro para SEO y performance)
  - **Recomendacion:** Opcion A, es una sola pagina liviana, no necesita SSR
4. **Survey: formulario en la tracking page o pagina separada?**
  - **Recomendacion:** En la misma tracking page (seccion que aparece post-delivery). Menos friction.
5. **Notificacion "Llegando": por distancia, tiempo, o numero de paradas?**
  - Numero de paradas es mas predecible y facil de implementar
  - Configurable por org (default: 3 paradas antes)
  - **Recomendacion:** Por paradas, configurable

---

## Definicion de Done

### Datos del Cliente

- Campos customer_name, customer_phone, customer_email, delivery_instructions en stops
- UI de crear/editar parada actualizada con seccion "Cliente"
- Tracking token auto-generado en plan_stops

### Pagina de Tracking

- Ruta publica `/track/:token` en App.tsx
- Edge Function `get-tracking-status`
- Timeline visual (confirmado → en camino → llegando → entregado)
- Mapa con posicion del conductor en vivo (Supabase Realtime)
- ETA dinamico
- Info del conductor y vehiculo
- Vista de POD post-entrega (fotos + firma)
- Responsive mobile-first
- Branding basico (logo + color de la org)

### Notificaciones

- Tabla org_notification_settings con UI de configuracion
- Edge Function `send-notification` con soporte WhatsApp + Email
- Templates WhatsApp pre-aprobados (scheduled, in_transit, delivered)
- Tabla notification_logs
- Historial de notificaciones visible en PlanDetailPage
- Boton "Reenviar" manual

### Encuestas

- Formulario de rating en tracking page (1-5 + comentario)
- Edge Function `submit-feedback`
- Tabla delivery_feedback
- Edge Function `send-survey` (trigger 30min post-delivery)
- Metricas basicas en dashboard (rating promedio, NPS)

