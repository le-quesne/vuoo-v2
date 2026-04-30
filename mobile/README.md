# Vuoo Mobile — App del conductor

App Expo (React Native) para que los conductores ejecuten sus rutas en terreno.

## Credenciales demo

Una org demo (`demo-apple-review`, `is_demo=true`) está aislada de clientes
reales y poblada con 5 planes, 80 paradas en Santiago, 5 rutas activas y
drivers que se mueven solos por un simulador (Edge Function `demo-simulator`
+ pg_cron cada minuto).

### Apple App Review

Cargar en App Store Connect → "App Review Information" → "Sign-In Information":

- **Email:** `apple-review@vuoo.cl`
- **Password:** `apple2026`

Atajos para que el reviewer encuentre la cuenta:
- En la pantalla de login hay un link discreto **"Probar con cuenta demo"** que
  hace auto-login con estas credenciales.
- Deeplink universal: `vuoo://demo` abre la app y auto-logea (TestFlight links
  pueden apuntar acá).

Son credenciales públicas (App Store Connect ya las expone a todos los
reviewers Apple) y el user no tiene acceso a data de ningún cliente real.

### Sales / prospectos

Para demos de ventas en el panel web (no la mobile app):

- `sales1@vuoo.cl`, `sales2@vuoo.cl`, `sales3@vuoo.cl`, `demo@vuoo.cl` —
  todos password `vuoo-demo-2026`, todos admin de la org demo.
- Cada sales puede demoear en paralelo sin pisarse.
- En `/control` y `/tracking` aparece un badge "Datos demo simulados" para
  evitar confusión con producción.

### Reset del demo

El demo se ensucia naturalmente durante una sesión (paradas movidas, status
flippeados). Tres formas de volver al baseline:

1. **CLI** (rápido, ~400ms):
   ```bash
   cd backend-railway
   npm run demo:reset
   ```

2. **Botón en super-admin:** abrir `/admin/orgs/<demo-org-id>` → click
   "Reset demo" → tipear `RESET` para confirmar.

3. **Cron automático:** corre cada hora en :00. Se skipea si detecta
   actividad humana (sales-edit) en los últimos 5 min.

### Apple-review seed legacy (deprecated)

`npm run seed:apple-review` aún funciona pero está superseded por
`npm run demo:reset`. La diferencia: el seed-apple-review solo crea el usuario
+ plan mínimo (5 paradas), `demo:reset` regenera la base completa. Apple
review funciona con cualquiera de los dos.

## Features

- **Auth con Supabase** — el conductor debe existir en `drivers` con `user_id` vinculado.
- **Home** — rutas del día asignadas al conductor, pull-to-refresh, tarjetas con progreso.
- **Detalle de ruta** — lista de paradas + mapa embebido (Mapbox) con ruta por calles,
  botón "Iniciar ruta", "Finalizar ruta" y "Reabrir".
- **Ejecución de parada** — foto obligatoria (cámara), firma digital opcional,
  comentarios, completar / fallida con motivo.
- **GPS tracking** — foreground + background vía `expo-location` + `TaskManager`.
  En Expo Go solo foreground; en dev client / standalone se agrega background.
- **Modo offline** — cola SQLite local (`sync_queue`) que encola `plan_stops`
  updates, fotos y firmas cuando no hay red; drena automáticamente al volver
  la conexión (NetInfo listener).
- **Push notifications** — token Expo registrado en `device_tokens` al login;
  el web dispara push vía `send-push` edge function cuando se asigna una
  ruta, y el tap abre directamente la pantalla de la ruta.
- **Perfil editable** — nombre, apellido, teléfono y cambio de contraseña.
- **Indicadores de estado** — banner "Sin conexión" / "Sincronizando N pendientes"
  y pill "GPS activo" en ruta.

## Setup

```bash
cd mobile
cp .env.example .env
# Pega el anon key de Supabase y el token de Mapbox en .env
npm install
npm start
```

Escanea el QR con Expo Go (Android o iOS). Para probar background location
o push en device real usa dev client con `eas build --profile development`.

## Variables de entorno

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_MAPBOX_TOKEN`

## Estructura

```
mobile/
├── app/                        ← Expo Router (file-based)
│   ├── _layout.tsx             ← Root: offline init, push deep-link, location task
│   ├── index.tsx
│   ├── (auth)/login.tsx
│   └── (app)/
│       ├── _layout.tsx
│       ├── (tabs)/
│       │   ├── index.tsx       ← Home
│       │   ├── history.tsx
│       │   └── profile.tsx
│       ├── profile/edit.tsx    ← Editar perfil + cambiar contraseña
│       ├── route/[id].tsx      ← Detalle ruta + mapa
│       └── stop/[id].tsx       ← Ejecución parada
├── src/
│   ├── components/
│   │   ├── RouteMapWebView.tsx
│   │   ├── SignatureCapture.tsx
│   │   ├── SyncStatusBar.tsx
│   │   ├── TrackingBadge.tsx
│   │   └── ...
│   ├── contexts/AuthContext.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── location.ts         ← fg + bg GPS via TaskManager
│   │   ├── offline.ts          ← SQLite sync queue
│   │   ├── offline.web.ts      ← no-op web fallback
│   │   └── notifications.ts    ← expo push token registration
│   ├── types/database.ts
│   └── theme.ts
```

## Prerrequisitos en Supabase

1. Migración `004_field_execution.sql` (buckets `delivery-photos`, `signatures`,
   `device_tokens`, `driver_locations`).
2. Migración `011_driver_self_access.sql` (el driver puede leer y editar
   su propio row de `drivers`).
3. Edge Functions deployadas: `invite-driver`, `send-push`.
4. Al menos un `driver` con `user_id` vinculado a un `auth.users.id` real
   (crear desde `/drivers` en el web).

## Dispara de push desde el web

Al asignar un driver a una ruta desde `PlanDetailPage` o `EditRouteModal`,
el web invoca `supabase.functions.invoke('send-push', …)` con
`data: { type: 'route_assigned', routeId }`. El mobile en `_layout.tsx`
intercepta el tap con `Notifications.addNotificationResponseReceivedListener`
y hace `router.push('/(app)/route/{routeId}')`.
