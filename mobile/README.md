# Vuoo Mobile — App del conductor

App Expo (React Native) para que los conductores ejecuten sus rutas en terreno.

## Fase actual: MVP

- Login con Supabase Auth (el conductor debe existir en `drivers` con `user_id` vinculado).
- Home: rutas del dia asignadas al conductor.
- Detalle de ruta: lista de paradas, boton "Navegar" (Google Maps), "Iniciar ruta".
- Ejecucion de parada: foto obligatoria, comentarios, completar / entrega fallida con motivo.
- Upload de fotos a Supabase Storage (`delivery-photos/{org_id}/{plan_stop_id}/...`).

**No incluido aun** (ver `/docs/02_EJECUCION_TERRENO.md`):
- GPS tracking background
- Modo offline (SQLite queue)
- Push notifications
- Firma digital
- Mapa embebido en la app

## Setup

```bash
cd mobile
cp .env.example .env
# Pega el anon key de Supabase en .env
npm install
npm start
```

Escanea el QR con Expo Go (Android o iOS).

## Variables de entorno

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Estructura

```
mobile/
├── app/                    ← Expo Router (file-based)
│   ├── _layout.tsx
│   ├── index.tsx
│   ├── (auth)/login.tsx
│   └── (app)/
│       ├── _layout.tsx
│       ├── index.tsx       ← Home
│       ├── route/[id].tsx  ← Detalle ruta
│       └── stop/[id].tsx   ← Ejecucion parada
├── src/
│   ├── lib/supabase.ts
│   ├── contexts/AuthContext.tsx
│   ├── types/database.ts
│   └── theme.ts
```

## Prerequisitos en Supabase

1. Migracion `004_field_execution.sql` aplicada (buckets + RLS).
2. Edge Function `invite-driver` deployada.
3. Al menos un `driver` con `user_id` vinculado a un `auth.users.id` real (crear desde `/drivers` en el web).
