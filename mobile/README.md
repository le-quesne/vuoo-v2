# Vuoo Mobile — App del conductor

App Expo (React Native) para que los conductores ejecuten sus rutas en terreno.

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
