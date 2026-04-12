# 02 - Ejecucion en Terreno: App Movil + GPS + POD

> **Objetivo:** Darle al conductor una app para ejecutar su ruta y al dispatcher visibilidad en tiempo real. Esto convierte a Vuoo de herramienta de planificacion a plataforma de ejecucion.
>
> **Depende de:** 01_GESTION_FLOTA (entidad Driver con user_id para auth)

---

## Estado Actual

### Lo que ya existe en la DB (campos definidos pero sin UI):

- `PlanStop.status`: pending | completed | cancelled | incomplete
- `PlanStop.execution_date`: fecha de ejecucion
- `PlanStop.report_location`: ubicacion de ejecucion
- `PlanStop.report_time`: hora de ejecucion
- `PlanStop.report_comments`: comentarios del conductor
- `PlanStop.report_signature_url`: URL firma (sin storage configurado)
- `PlanStop.report_images`: array URLs fotos (sin storage configurado)
- `PlanStop.cancellation_reason`: razon de cancelacion
- `PlanStop.delivery_attempts`: intentos de entrega (nunca se incrementa)

### Lo que NO existe:

- App movil (ni React Native, ni PWA, ni nada)
- Supabase Storage (no hay buckets para fotos/firmas)
- Supabase Realtime (no se usa en ningun lado)
- GPS tracking de conductores
- Push notifications
- Modo offline

---

## Stack Tecnologico Recomendado

### Por que React Native + Expo (no Flutter, no PWA)


| Requisito                | Expo                                     | Flutter               | PWA         |
| ------------------------ | ---------------------------------------- | --------------------- | ----------- |
| GPS background           | expo-location                            | geolocator            | Roto en iOS |
| Camara                   | expo-image-picker                        | camera                | Limitado    |
| Offline                  | expo-sqlite                              | Drift                 | Limitado    |
| Push notifications       | expo-notifications                       | firebase_messaging    | Roto en iOS |
| Compartir codigo con web | **Alto** (mismos types, Supabase client) | Zero (Dart)           | Moderado    |
| Curva de aprendizaje     | **Minima** (ya sabes React + TS)         | Alta (nuevo lenguaje) | Minima      |


**PWA descartada:** iOS mata background tasks agresivamente. Un conductor necesita GPS con pantalla apagada.

**Flutter descartado:** Dart es otro lenguaje. No se comparte nada con el web app.

### Dependencias Principales

```
expo ~52
expo-router            → Navegacion file-based
expo-location          → GPS foreground + background  
expo-task-manager      → Background tasks
expo-image-picker      → Camara para fotos POD
expo-notifications     → Push notifications
expo-sqlite            → Offline queue
@supabase/supabase-js  → Mismo cliente que el web
@react-native-async-storage/async-storage → Auth persistence
react-native-maps      → Mapa de ruta (o mapbox-gl via @rnmapbox/maps)
```

---

## Estructura del Proyecto

```
vuoo-v2/
├── src/                    ← Web app actual (no se toca)
├── mobile/                 ← Nueva app Expo
│   ├── app/                ← Expo Router (file-based routing)
│   │   ├── (auth)/
│   │   │   └── login.tsx
│   │   ├── (app)/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx          ← Lista de rutas del dia
│   │   │   ├── route/[id].tsx     ← Detalle de ruta con lista de paradas
│   │   │   └── stop/[id].tsx      ← Ejecucion de parada (POD)
│   │   └── _layout.tsx
│   ├── components/
│   │   ├── StopCard.tsx
│   │   ├── SignatureCapture.tsx
│   │   ├── PhotoCapture.tsx
│   │   └── RouteProgress.tsx
│   ├── lib/
│   │   ├── supabase.ts            ← Cliente Supabase con AsyncStorage
│   │   ├── location.ts            ← GPS tracking service
│   │   ├── offline.ts             ← SQLite sync queue
│   │   └── notifications.ts       ← Push notification setup
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useRoute.ts
│   │   └── useLocation.ts
│   └── app.json
├── shared/                 ← Codigo compartido web + mobile
│   └── types/
│       └── database.ts     ← Mover types aca (importado por ambos)
└── docs/
```

---

## Pantallas de la App

### 1. Login

- Email + password (mismo Supabase Auth del web)
- El conductor debe tener un `user_id` vinculado a su registro en `drivers`
- Persist session con AsyncStorage
- Sin signup: el admin crea el conductor desde el web y le da credenciales

### 2. Mis Rutas del Dia (Home)

- Lista de rutas asignadas al conductor para hoy
- Cada tarjeta muestra: nombre plan, vehiculo, N paradas, progreso (completadas/total)
- Estado de ruta: no_started | in_transit | completed
- Boton "Iniciar Ruta" → cambia status a in_transit, activa GPS tracking
- Pull-to-refresh

### 3. Detalle de Ruta (`route/[id]`)

- Lista ordenada de paradas con:
  - Numero de orden
  - Nombre de la parada
  - Direccion
  - Ventana horaria (si tiene)
  - Status badge (pending/completed/cancelled/incomplete)
  - ETA estimado
- Mapa con todas las paradas y posicion actual del conductor
- Boton "Navegar" → deep link a Google Maps/Waze con siguiente parada
- Boton "Siguiente Parada" destacado arriba

### 4. Ejecucion de Parada (`stop/[id]`)

- Info de la parada: nombre, direccion, notas, peso, ventana horaria
- **Acciones:**
  - "Llegue" → registra report_time + report_location (GPS automatico)
  - **Completar entrega:**
    - Foto obligatoria (camara)
    - Firma del receptor (canvas tactil)
    - Comentarios (opcional)
    - → status = 'completed'
  - **Entrega fallida:**
    - Seleccionar razon: no_hay_nadie, direccion_incorrecta, rechazado, otro
    - Comentario (opcional)
    - Foto (opcional)
    - → status = 'incomplete', delivery_attempts++
  - **Cancelar:**
    - Razon obligatoria
    - → status = 'cancelled'
- Al completar/fallar → volver a lista de ruta, siguiente parada

---

## GPS Tracking

### Arquitectura

```
App Movil                              Supabase
─────────                              ────────
expo-location                    
  ↓ cada 50m o 10s              
expo-task-manager               
  ↓ batch cada 30s              
  ├─ online → INSERT driver_locations   → tabla driver_locations
  └─ offline → SQLite queue             → sync cuando hay red
                                        
Dashboard Web                          
─────────────                          
Supabase Realtime subscription         ← escucha driver_locations
  ↓                                    
Actualizar posicion en mapa en vivo    
```

### Nueva tabla: `driver_locations`

```sql
create table driver_locations (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references drivers(id) on delete cascade,
  route_id    uuid references routes(id) on delete set null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    real,                    -- metros
  speed       real,                    -- m/s
  heading     real,                    -- grados
  battery     real,                    -- 0-1
  recorded_at timestamptz not null,    -- cuando se capturo en el device
  created_at  timestamptz not null default now()
);

-- Indice para queries por conductor + tiempo
create index idx_driver_locations_driver_time 
  on driver_locations(driver_id, recorded_at desc);

-- Partitioning o cleanup: borrar locations > 30 dias
-- (implementar como cron job en Supabase)
```

### Configuracion GPS en la app

```typescript
// Iniciar tracking cuando conductor inicia ruta
await Location.startLocationUpdatesAsync('gps-tracking', {
  accuracy: Location.Accuracy.Balanced,   // no BestForNavigation (mata bateria)
  distanceInterval: 50,                   // cada 50 metros
  timeInterval: 10000,                    // o cada 10 segundos
  foregroundService: {
    notificationTitle: 'Ruta activa',
    notificationBody: 'Seguimiento de ubicacion activo',
    notificationColor: '#6366f1',
  },
  pausesUpdatesAutomatically: false,
})

// Detener cuando ruta se completa
await Location.stopLocationUpdatesAsync('gps-tracking')
```

### Visualizacion en Dashboard Web

```typescript
// En PlanDetailPage o nuevo LiveTrackingView
const channel = supabase
  .channel('driver-locations')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'driver_locations',
    filter: `route_id=eq.${routeId}`
  }, (payload) => {
    updateDriverPosition(payload.new.lat, payload.new.lng)
  })
  .subscribe()
```

---

## Proof of Delivery (POD)

### Supabase Storage Setup

```sql
-- Crear buckets (via Supabase Dashboard o migration)
insert into storage.buckets (id, name, public)
values 
  ('delivery-photos', 'delivery-photos', false),
  ('signatures', 'signatures', false);

-- RLS: solo el conductor de la org puede subir
create policy "Org members can upload delivery photos"
  on storage.objects for insert
  with check (
    bucket_id = 'delivery-photos' 
    and (storage.foldername(name))[1] in (select id::text from organizations where id in (select user_org_ids()))
  );

create policy "Org members can view delivery photos"
  on storage.objects for select
  using (
    bucket_id = 'delivery-photos'
    and (storage.foldername(name))[1] in (select id::text from organizations where id in (select user_org_ids()))
  );
```

### Estructura de archivos en Storage

```
delivery-photos/
  └── {org_id}/
      └── {plan_stop_id}/
          ├── photo_1713456789.jpg
          ├── photo_1713456790.jpg
          └── ...

signatures/
  └── {org_id}/
      └── {plan_stop_id}/
          └── signature.png
```

### Flujo de captura

```
1. Conductor llega a parada → toca "Llegue"
   → Auto-captura: GPS coords + timestamp
   → PlanStop.report_location = "{lat},{lng}"
   → PlanStop.report_time = now()

2. Conductor toma foto → expo-image-picker (camara)
   → Compress a 70% quality
   → Si online: upload a Supabase Storage → guardar URL en report_images[]
   → Si offline: guardar en FileSystem local → agregar a sync queue

3. Conductor captura firma → react-native-signature-canvas
   → Exportar como PNG base64
   → Upload a Supabase Storage → guardar URL en report_signature_url

4. Conductor toca "Completar"
   → Update PlanStop: status='completed', execution_date=today
   → Siguiente parada
```

---

## Push Notifications

### Arquitectura

```
Evento en Web Dashboard                Supabase Edge Function
(dispatcher asigna ruta,        →      (trigger por DB webhook o llamada directa)
 modifica paradas, etc.)                       │
                                               ▼
                                        Expo Push API
                                        (exp.host/--/api/v2/push/send)
                                               │
                                               ▼
                                        App del Conductor
                                        (expo-notifications)
```

### Nueva tabla: `device_tokens`

```sql
create table device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null,          -- 'ios' | 'android'
  created_at  timestamptz not null default now(),
  unique(user_id, token)
);
```

### Eventos que generan push:


| Evento                         | Mensaje                                        |
| ------------------------------ | ---------------------------------------------- |
| Ruta asignada al conductor     | "Tienes una nueva ruta para hoy: {plan_name}"  |
| Parada agregada a ruta activa  | "Nueva parada agregada a tu ruta: {stop_name}" |
| Ruta modificada por dispatcher | "Tu ruta fue actualizada. Revisa los cambios." |
| Mensaje del dispatcher         | "Mensaje de {dispatcher}: {message}"           |


---

## Cambios en el Dashboard Web

### Nuevo: Vista de Tracking en Vivo

- En PlanDetailPage agregar tab "En Vivo" o toggle en el mapa
- Mostrar posicion actual de cada conductor con icono animado
- Linea de breadcrumbs (ruta real vs planificada)
- ETA actualizado en tiempo real para cada parada pendiente
- Badge "En vivo" cuando conductor tiene GPS activo

### Nuevo: Vista de POD

- En PlanDetailPage, al hacer click en parada completada:
  - Mostrar foto(s) de entrega
  - Mostrar firma digital
  - Mostrar comentarios del conductor
  - Mostrar ubicacion GPS + hora exacta de entrega
  - Comparar ubicacion reportada vs ubicacion de la parada

### Modificar: Sidebar de PlanDetailPage

- Indicador visual por ruta: conductor online/offline
- Ultima actualizacion de GPS (hace X minutos)
- Progreso en vivo (paradas completadas se actualizan via Realtime)

---

## Migracion SQL

```sql
-- 004_field_execution.sql

-- 1. Tabla de ubicaciones GPS de conductores
create table driver_locations (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references drivers(id) on delete cascade,
  route_id    uuid references routes(id) on delete set null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    real,
  speed       real,
  heading     real,
  battery     real,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index idx_driver_locations_driver_time 
  on driver_locations(driver_id, recorded_at desc);

create index idx_driver_locations_route 
  on driver_locations(route_id, recorded_at desc);

-- 2. Tabla de device tokens para push notifications
create table device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null default 'android',
  created_at  timestamptz not null default now(),
  unique(user_id, token)
);

-- 3. Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('delivery-photos', 'delivery-photos', false, 5242880, '{image/jpeg,image/png}'),
  ('signatures', 'signatures', false, 1048576, '{image/png}');

-- 4. RLS para driver_locations
alter table driver_locations enable row level security;

create policy "Drivers can insert own locations"
  on driver_locations for insert
  with check (driver_id in (
    select d.id from drivers d where d.user_id = auth.uid()
  ));

create policy "Org members can view driver locations"
  on driver_locations for select
  using (driver_id in (
    select d.id from drivers d where d.org_id in (select user_org_ids())
  ));

-- 5. RLS para device_tokens
alter table device_tokens enable row level security;

create policy "Users manage own tokens"
  on device_tokens for all
  using (user_id = auth.uid());

-- 6. Storage RLS
create policy "Org upload delivery photos"
  on storage.objects for insert
  with check (bucket_id = 'delivery-photos');

create policy "Org view delivery photos"
  on storage.objects for select
  using (bucket_id in ('delivery-photos', 'signatures'));

-- 7. Habilitar Realtime en driver_locations
alter publication supabase_realtime add table driver_locations;

-- 8. Cleanup: funcion para borrar locations viejas (ejecutar via cron)
create or replace function cleanup_old_locations()
returns void as $$
begin
  delete from driver_locations where recorded_at < now() - interval '30 days';
end;
$$ language plpgsql security definer;
```

---

## Preguntas Abiertas

1. **Monorepo o repos separados?**
  - Opcion A: `/mobile` dentro del mismo repo (monorepo con shared types)
  - Opcion B: Repo separado para la app movil
  - **Recomendacion:** Monorepo. Compartir `database.ts` y poder hacer cambios atomicos web+mobile
2. **Mapbox o Google Maps en mobile?**
  - Opcion A: `@rnmapbox/maps` (consistente con web, mismo token)
  - Opcion B: `react-native-maps` (Google Maps, mas estable en RN)
  - **Recomendacion:** `react-native-maps` para estabilidad, deep link a Google Maps/Waze para navegacion
  USAREMOS LA OPCION A mapbox por mientras
3. **Firma digital: libreria?**
  - `react-native-signature-canvas` — la mas usada, exporta PNG/base64
  - `expo-draw` — mas nuevo pero menos probado
  - **Recomendacion:** `react-native-signature-canvas`
4. **Foto obligatoria o opcional?**
  - La competencia permite configurar por org/tipo de entrega
  - **Recomendacion:** Configurable a nivel org. Default: obligatoria para completar, opcional para fallo
5. **Frecuencia de GPS tracking?**
  - Cada 50m + cada 10s es un buen balance bateria/precision
  - Batch upload cada 30s cuando hay red
  - **Recomendacion:** Empezar con estos valores, hacer configurable despues
6. **Scope del MVP movil?**
  - Minimo: Login + ver ruta + navegar + marcar completado/fallido + foto
  - Completo: + firma + GPS tracking + offline + push notifications
    - VAMOS CON EL COMPLETO

---

## Definicion de Done

### MVP App Movil

- Proyecto Expo creado en `/mobile`
- Login con Supabase Auth
- Pantalla "Mis Rutas" — lista rutas del dia
- Pantalla "Detalle Ruta" — lista ordenada de paradas + mapa
- Navegacion a parada via deep link Google Maps/Waze
- Pantalla "Ejecucion Parada" — completar/fallar/cancelar
- Captura de foto con expo-image-picker
- Upload foto a Supabase Storage
- Update status de PlanStop

### GPS Tracking

- Background location con expo-location + expo-task-manager
- Tabla driver_locations en Supabase
- Batch upload de coordenadas
- Vista "En Vivo" en dashboard web con Supabase Realtime
- Breadcrumbs (ruta real vs planificada)

### POD Completo

- Firma digital con react-native-signature-canvas
- Upload firma a Supabase Storage
- Registro automatico de GPS + timestamp al llegar
- Razon de fallo con opciones predefinidas
- Visualizacion de POD en dashboard web

### Push Notifications

- Tabla device_tokens
- Registro de token al login
- Edge Function para enviar push via Expo Push API
- Notificacion de ruta asignada
- Notificacion de cambios en ruta activa

