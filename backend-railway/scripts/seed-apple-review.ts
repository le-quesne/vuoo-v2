/**
 * Crea (o actualiza) el usuario apple-review@vuoo.cl en Supabase, lo vincula
 * a un driver dentro de una org dedicada, y le seedea un plan + ruta + paradas
 * para que el reviewer de Apple pueda probar la driver app de extremo a extremo:
 *
 *   1. Login con apple-review@vuoo.cl
 *   2. Ver la ruta del día con 5 paradas en Santiago
 *   3. Iniciar la ruta
 *   4. Completar una parada con foto + firma
 *
 * Es IDEMPOTENTE: correrlo varias veces no duplica nada. Cada paso hace
 * find-or-create por slug/email/nombre estable.
 *
 * Uso:
 *   cd backend-railway
 *   APPLE_REVIEW_PASSWORD=apple2026 npm run seed:apple-review
 *
 * Variables de entorno requeridas (en backend-railway/.env o exportadas):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APPLE_REVIEW_PASSWORD          ← obligatorio, sin default
 *
 * Opcionales:
 *   APPLE_REVIEW_EMAIL             ← default apple-review@vuoo.cl
 *   APPLE_REVIEW_ORG_SLUG          ← default demo-apple-review
 *
 * NOTA seguridad: usa service-role; bypassea RLS. El password se lee de env,
 * NUNCA de archivo committeado. El user creado es solo para review de Apple,
 * NO para producción real.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// ---- env loader ------------------------------------------------------------
function loadDotenv(): void {
  try {
    const path = resolve(process.cwd(), '.env');
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env opcional
  }
}
loadDotenv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLE_EMAIL = process.env.APPLE_REVIEW_EMAIL ?? 'apple-review@vuoo.cl';
const APPLE_PASSWORD = process.env.APPLE_REVIEW_PASSWORD;
const ORG_SLUG = process.env.APPLE_REVIEW_ORG_SLUG ?? 'demo-apple-review';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend-railway/.env');
  process.exit(1);
}
if (!APPLE_PASSWORD) {
  console.error('Falta APPLE_REVIEW_PASSWORD. Pasalo como env var:');
  console.error('  APPLE_REVIEW_PASSWORD=xxx npm run seed:apple-review');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- 5 paradas reales de Santiago, lat/lng aproximados pero válidos --------
const STOPS = [
  {
    name: 'Parque Arauco',
    address: 'Av. Presidente Kennedy 5413, Las Condes, Santiago',
    lat: -33.402194,
    lng: -70.567778,
    customer_name: 'María González',
    customer_phone: '+56 9 5555 0001',
  },
  {
    name: 'Costanera Center',
    address: 'Av. Andrés Bello 2425, Providencia, Santiago',
    lat: -33.418033,
    lng: -70.606458,
    customer_name: 'Diego Pérez',
    customer_phone: '+56 9 5555 0002',
  },
  {
    name: 'Mall Plaza Vespucio',
    address: 'Av. Vicuña Mackenna 7110, La Florida, Santiago',
    lat: -33.518611,
    lng: -70.598889,
    customer_name: 'Camila Rojas',
    customer_phone: '+56 9 5555 0003',
  },
  {
    name: 'Mall Plaza Norte',
    address: 'Av. Américo Vespucio 1737, Huechuraba, Santiago',
    lat: -33.367500,
    lng: -70.665000,
    customer_name: 'Felipe Soto',
    customer_phone: '+56 9 5555 0004',
  },
  {
    name: 'Mall Plaza Oeste',
    address: 'Av. Américo Vespucio 1501, Cerrillos, Santiago',
    lat: -33.495278,
    lng: -70.706944,
    customer_name: 'Antonia Muñoz',
    customer_phone: '+56 9 5555 0005',
  },
];

const DEPOT = {
  lat: -33.398845,
  lng: -70.591168,
  address: 'Av. Vitacura 4380, Vitacura, Santiago',
};

async function main() {
  console.log(`[apple-review] target email=${APPLE_EMAIL} org=${ORG_SLUG}`);

  // 1) Find or create user
  let userId: string;
  const { data: existingPage } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = existingPage?.users?.find((u) => u.email?.toLowerCase() === APPLE_EMAIL.toLowerCase());
  if (existing) {
    userId = existing.id;
    console.log(`[apple-review] user existe: ${userId} — actualizando password`);
    const { error: updErr } = await db.auth.admin.updateUserById(userId, {
      password: APPLE_PASSWORD,
      email_confirm: true,
    });
    if (updErr) throw new Error(`updateUserById: ${updErr.message}`);
  } else {
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: APPLE_EMAIL,
      password: APPLE_PASSWORD,
      email_confirm: true,
      user_metadata: { name: 'Apple Review' },
    });
    if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message ?? 'no user'}`);
    userId = created.user.id;
    console.log(`[apple-review] user creado: ${userId}`);
  }

  // 2) Find or create org
  const { data: orgExisting } = await db
    .from('organizations')
    .select('id, name, slug')
    .eq('slug', ORG_SLUG)
    .maybeSingle();

  let orgId: string;
  if (orgExisting) {
    orgId = orgExisting.id;
    console.log(`[apple-review] org existe: ${orgId}`);
    await db
      .from('organizations')
      .update({
        default_depot_lat: DEPOT.lat,
        default_depot_lng: DEPOT.lng,
        default_depot_address: DEPOT.address,
      })
      .eq('id', orgId);
  } else {
    const { data: orgNew, error: orgErr } = await db
      .from('organizations')
      .insert({
        name: 'Vuoo Demo (Apple Review)',
        slug: ORG_SLUG,
        default_depot_lat: DEPOT.lat,
        default_depot_lng: DEPOT.lng,
        default_depot_address: DEPOT.address,
      })
      .select('id')
      .single();
    if (orgErr || !orgNew) throw new Error(`org insert: ${orgErr?.message}`);
    orgId = orgNew.id;
    console.log(`[apple-review] org creada: ${orgId}`);
  }

  // 3) Membership
  const { data: memExisting } = await db
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!memExisting) {
    const { error: memErr } = await db
      .from('organization_members')
      .insert({ org_id: orgId, user_id: userId, role: 'member' });
    if (memErr) throw new Error(`membership insert: ${memErr.message}`);
    console.log(`[apple-review] membership creada`);
  }

  // 4) Vehicle (find or create por nombre estable dentro de la org)
  const VEHICLE_NAME = 'Apple Review Van';
  const { data: vehExisting } = await db
    .from('vehicles')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', VEHICLE_NAME)
    .maybeSingle();
  let vehicleId: string;
  if (vehExisting) {
    vehicleId = vehExisting.id;
    console.log(`[apple-review] vehicle existe: ${vehicleId}`);
  } else {
    const { data: vehNew, error: vehErr } = await db
      .from('vehicles')
      .insert({
        org_id: orgId,
        user_id: userId,
        name: VEHICLE_NAME,
        license_plate: 'APPLE-01',
        capacity_weight_kg: 1500,
        fuel_type: 'gasoline',
        depot_lat: DEPOT.lat,
        depot_lng: DEPOT.lng,
        depot_address: DEPOT.address,
      })
      .select('id')
      .single();
    if (vehErr || !vehNew) throw new Error(`vehicle insert: ${vehErr?.message}`);
    vehicleId = vehNew.id;
    console.log(`[apple-review] vehicle creado: ${vehicleId}`);
  }

  // 5) Driver linked to user
  const { data: drvExisting } = await db
    .from('drivers')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  let driverId: string;
  if (drvExisting) {
    driverId = drvExisting.id;
    console.log(`[apple-review] driver existe: ${driverId}`);
    await db.from('drivers').update({ default_vehicle_id: vehicleId, status: 'active' }).eq('id', driverId);
  } else {
    const { data: drvNew, error: drvErr } = await db
      .from('drivers')
      .insert({
        org_id: orgId,
        user_id: userId,
        first_name: 'Apple',
        last_name: 'Review',
        email: APPLE_EMAIL,
        phone: '+56 9 0000 0000',
        status: 'active',
        default_vehicle_id: vehicleId,
      })
      .select('id')
      .single();
    if (drvErr || !drvNew) throw new Error(`driver insert: ${drvErr?.message}`);
    driverId = drvNew.id;
    console.log(`[apple-review] driver creado: ${driverId}`);
  }

  // 6) Plan for today (find by name+date stable)
  const today = new Date().toISOString().slice(0, 10);
  const PLAN_NAME = `Apple Review — ${today}`;
  const { data: planExisting } = await db
    .from('plans')
    .select('id')
    .eq('org_id', orgId)
    .eq('name', PLAN_NAME)
    .eq('date', today)
    .maybeSingle();
  let planId: string;
  if (planExisting) {
    planId = planExisting.id;
    console.log(`[apple-review] plan existe: ${planId}`);
  } else {
    const { data: planNew, error: planErr } = await db
      .from('plans')
      .insert({ org_id: orgId, user_id: userId, name: PLAN_NAME, date: today })
      .select('id')
      .single();
    if (planErr || !planNew) throw new Error(`plan insert: ${planErr?.message}`);
    planId = planNew.id;
    console.log(`[apple-review] plan creado: ${planId}`);
  }

  // 7) Stops (find or create por name+org)
  const stopIds: string[] = [];
  for (const s of STOPS) {
    const { data: stopExisting } = await db
      .from('stops')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', s.name)
      .maybeSingle();
    if (stopExisting) {
      stopIds.push(stopExisting.id);
      continue;
    }
    const { data: stopNew, error: stopErr } = await db
      .from('stops')
      .insert({
        org_id: orgId,
        user_id: userId,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        customer_name: s.customer_name,
        customer_phone: s.customer_phone,
        duration_minutes: 10,
      })
      .select('id')
      .single();
    if (stopErr || !stopNew) throw new Error(`stop insert (${s.name}): ${stopErr?.message}`);
    stopIds.push(stopNew.id);
  }
  console.log(`[apple-review] stops listos (${stopIds.length})`);

  // 8) Route linking plan→vehicle→driver
  const ROUTE_NAME = 'Ruta Apple Review';
  const { data: routeExisting } = await db
    .from('routes')
    .select('id')
    .eq('plan_id', planId)
    .eq('vehicle_id', vehicleId)
    .maybeSingle();
  let routeId: string;
  if (routeExisting) {
    routeId = routeExisting.id;
    console.log(`[apple-review] route existe: ${routeId}`);
    await db
      .from('routes')
      .update({ driver_id: driverId, status: 'not_started', name: ROUTE_NAME })
      .eq('id', routeId);
  } else {
    const { data: routeNew, error: routeErr } = await db
      .from('routes')
      .insert({
        org_id: orgId,
        user_id: userId,
        plan_id: planId,
        vehicle_id: vehicleId,
        driver_id: driverId,
        status: 'not_started',
        name: ROUTE_NAME,
      })
      .select('id')
      .single();
    if (routeErr || !routeNew) throw new Error(`route insert: ${routeErr?.message}`);
    routeId = routeNew.id;
    console.log(`[apple-review] route creada: ${routeId}`);
  }

  // 9) Plan_stops (find or create por stop_id+plan_id)
  for (let i = 0; i < stopIds.length; i++) {
    const stopId = stopIds[i];
    const { data: psExisting } = await db
      .from('plan_stops')
      .select('id')
      .eq('plan_id', planId)
      .eq('stop_id', stopId)
      .maybeSingle();
    if (psExisting) continue;
    const { error: psErr } = await db.from('plan_stops').insert({
      org_id: orgId,
      plan_id: planId,
      stop_id: stopId,
      route_id: routeId,
      vehicle_id: vehicleId,
      order_index: i + 1,
      status: 'pending',
      tracking_token: randomUUID(),
    });
    if (psErr) throw new Error(`plan_stop insert (${stopId}): ${psErr.message}`);
  }
  console.log(`[apple-review] plan_stops listos`);

  // ---- Summary ------------------------------------------------------------
  console.log('\n=== APPLE REVIEW SEED COMPLETO ===');
  console.log(`  email     : ${APPLE_EMAIL}`);
  console.log(`  user_id   : ${userId}`);
  console.log(`  org_id    : ${orgId}  (slug: ${ORG_SLUG})`);
  console.log(`  driver_id : ${driverId}`);
  console.log(`  plan_id   : ${planId}  (date: ${today})`);
  console.log(`  route_id  : ${routeId}`);
  console.log(`  stops     : ${stopIds.length} en Santiago`);
  console.log('\nApple debería poder hacer login y ver la ruta del día.');
  console.log('Re-correr el script mañana para regenerar el plan con la fecha de hoy.');
}

main().catch((e) => {
  console.error('[apple-review] FAILED:', e);
  process.exit(1);
});
