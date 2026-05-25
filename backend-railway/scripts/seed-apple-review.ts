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

// ---- Pedidos del inbox (pending, sin armar) --------------------------------
// El reviewer/demo ve estos como "pedidos por procesar" y muestra cómo se
// arman en una ruta. Direcciones reales en distintas comunas para que el
// armado se vea geográficamente disperso.
type DemoOrder = {
  external_id: string;
  order_number: string;
  source: 'manual' | 'csv' | 'shopify' | 'vtex' | 'api' | 'whatsapp';
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  address: string;
  lat: number;
  lng: number;
  items: { name: string; quantity: number; sku?: string; weight_kg?: number }[];
  total_weight_kg: number;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  delivery_instructions?: string;
  time_window_start?: string;
  time_window_end?: string;
};

const PENDING_ORDERS: DemoOrder[] = [
  {
    external_id: 'apple-review-pending-001',
    order_number: 'ORD-AR-001',
    source: 'shopify',
    customer_name: 'Valentina Espinoza',
    customer_phone: '+56 9 4444 0001',
    customer_email: 'valentina.espinoza@example.cl',
    address: 'Av. Vitacura 6780, Vitacura, Santiago',
    lat: -33.392500,
    lng: -70.567200,
    items: [{ name: 'Caja de vino x6', quantity: 1, sku: 'VINO-6', weight_kg: 8.4 }],
    total_weight_kg: 8.4,
    priority: 'normal',
    delivery_instructions: 'Edificio Mirador, depto 802. Conserjería recibe.',
  },
  {
    external_id: 'apple-review-pending-002',
    order_number: 'ORD-AR-002',
    source: 'shopify',
    customer_name: 'Tomás Carrasco',
    customer_phone: '+56 9 4444 0002',
    address: 'Av. Manquehue Norte 1900, Vitacura, Santiago',
    lat: -33.394700,
    lng: -70.575800,
    items: [
      { name: 'Smart TV 55"', quantity: 1, sku: 'TV-55-OLED', weight_kg: 18.0 },
      { name: 'Soundbar', quantity: 1, sku: 'SB-200', weight_kg: 3.2 },
    ],
    total_weight_kg: 21.2,
    priority: 'high',
    time_window_start: '10:00',
    time_window_end: '13:00',
  },
  {
    external_id: 'apple-review-pending-003',
    order_number: 'ORD-AR-003',
    source: 'manual',
    customer_name: 'Renata Hidalgo',
    customer_phone: '+56 9 4444 0003',
    address: 'Av. Apoquindo 4501, Las Condes, Santiago',
    lat: -33.408300,
    lng: -70.569400,
    items: [{ name: 'Notebook 14"', quantity: 1, sku: 'NB-14-PRO', weight_kg: 1.6 }],
    total_weight_kg: 1.6,
    priority: 'urgent',
    delivery_instructions: 'Entregar antes del mediodía si es posible.',
    time_window_start: '09:00',
    time_window_end: '12:00',
  },
  {
    external_id: 'apple-review-pending-004',
    order_number: 'ORD-AR-004',
    source: 'vtex',
    customer_name: 'Joaquín Saavedra',
    customer_phone: '+56 9 4444 0004',
    address: 'Av. Irarrázaval 4750, Ñuñoa, Santiago',
    lat: -33.456900,
    lng: -70.582300,
    items: [
      { name: 'Bicicleta urbana', quantity: 1, sku: 'BIKE-URB-M', weight_kg: 14.0 },
      { name: 'Casco', quantity: 1, sku: 'HELM-01', weight_kg: 0.4 },
    ],
    total_weight_kg: 14.4,
    priority: 'normal',
  },
  {
    external_id: 'apple-review-pending-005',
    order_number: 'ORD-AR-005',
    source: 'whatsapp',
    customer_name: 'Pilar Cárdenas',
    customer_phone: '+56 9 4444 0005',
    address: 'Av. José Pedro Alessandri 1242, Ñuñoa, Santiago',
    lat: -33.466800,
    lng: -70.595700,
    items: [{ name: 'Set sartenes x3', quantity: 1, sku: 'SART-3', weight_kg: 4.2 }],
    total_weight_kg: 4.2,
    priority: 'normal',
  },
  {
    external_id: 'apple-review-pending-006',
    order_number: 'ORD-AR-006',
    source: 'csv',
    customer_name: 'Esteban Olivares',
    customer_phone: '+56 9 4444 0006',
    address: 'Av. Pajaritos 3030, Maipú, Santiago',
    lat: -33.500400,
    lng: -70.755300,
    items: [{ name: 'Refrigerador No Frost', quantity: 1, sku: 'FRI-NF-300', weight_kg: 62.0 }],
    total_weight_kg: 62.0,
    priority: 'high',
    delivery_instructions: 'Requiere dos personas para descarga.',
  },
  {
    external_id: 'apple-review-pending-007',
    order_number: 'ORD-AR-007',
    source: 'shopify',
    customer_name: 'Camila Bravo',
    customer_phone: '+56 9 4444 0007',
    address: 'Av. Américo Vespucio 399, Quilicura, Santiago',
    lat: -33.366200,
    lng: -70.728900,
    items: [
      { name: 'Pack pañales', quantity: 4, sku: 'PAÑ-XL', weight_kg: 3.6 },
      { name: 'Fórmula infantil', quantity: 2, sku: 'FOR-INF', weight_kg: 1.8 },
    ],
    total_weight_kg: 5.4,
    priority: 'urgent',
    delivery_instructions: 'Cliente avisa media hora antes por WhatsApp.',
  },
  {
    external_id: 'apple-review-pending-008',
    order_number: 'ORD-AR-008',
    source: 'manual',
    customer_name: 'Ignacio Vargas',
    customer_phone: '+56 9 4444 0008',
    address: 'Av. La Florida 9200, La Florida, Santiago',
    lat: -33.530100,
    lng: -70.583400,
    items: [{ name: 'Set herramientas', quantity: 1, sku: 'HER-PRO', weight_kg: 12.5 }],
    total_weight_kg: 12.5,
    priority: 'normal',
  },
  {
    external_id: 'apple-review-pending-009',
    order_number: 'ORD-AR-009',
    source: 'api',
    customer_name: 'Sofía Aguirre',
    customer_phone: '+56 9 4444 0009',
    customer_email: 'sofia.aguirre@example.cl',
    address: 'Av. Departamental 1455, San Joaquín, Santiago',
    lat: -33.498700,
    lng: -70.628800,
    items: [{ name: 'Caja electrónica', quantity: 2, sku: 'BOX-ELEC', weight_kg: 6.0 }],
    total_weight_kg: 6.0,
    priority: 'normal',
    time_window_start: '14:00',
    time_window_end: '18:00',
  },
  {
    external_id: 'apple-review-pending-010',
    order_number: 'ORD-AR-010',
    source: 'shopify',
    customer_name: 'Matías Lobos',
    customer_phone: '+56 9 4444 0010',
    address: 'Av. Eliodoro Yáñez 1825, Providencia, Santiago',
    lat: -33.429800,
    lng: -70.605400,
    items: [
      { name: 'Cafetera espresso', quantity: 1, sku: 'CAF-ESP', weight_kg: 5.8 },
      { name: 'Café molido 1kg', quantity: 2, sku: 'CAFE-1K', weight_kg: 2.0 },
    ],
    total_weight_kg: 7.8,
    priority: 'low',
  },
];

// ---- Pedidos ya armados (uno por plan_stop existente) ----------------------
// Estos quedan attached al plan_stop correspondiente para que el demo
// muestre la columna "ya en ruta de hoy" con status=scheduled.
const SCHEDULED_ORDERS = STOPS.map((s, i) => ({
  external_id: `apple-review-scheduled-${String(i + 1).padStart(2, '0')}`,
  order_number: `ORD-AR-1${String(i + 1).padStart(2, '0')}`,
  source: 'shopify' as const,
  customer_name: s.customer_name,
  customer_phone: s.customer_phone,
  address: s.address,
  lat: s.lat,
  lng: s.lng,
  items: [
    { name: 'Bolsa entrega', quantity: 1, sku: `PKG-${i + 1}`, weight_kg: 3 + i },
  ],
  total_weight_kg: 3 + i,
  priority: 'normal' as const,
}));

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

  // 10) Orders pending (inbox sin armar)
  // Identificados por (org_id, external_id) para mantener idempotencia.
  let pendingCreated = 0;
  let pendingUpdated = 0;
  for (const o of PENDING_ORDERS) {
    const { data: existing } = await db
      .from('orders')
      .select('id, status, plan_stop_id')
      .eq('org_id', orgId)
      .eq('external_id', o.external_id)
      .maybeSingle();

    const payload = {
      org_id: orgId,
      order_number: o.order_number,
      external_id: o.external_id,
      source: o.source,
      customer_name: o.customer_name,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      delivery_instructions: o.delivery_instructions ?? null,
      items: o.items,
      total_weight_kg: o.total_weight_kg,
      currency: 'CLP',
      service_duration_minutes: 15,
      time_window_start: o.time_window_start ?? null,
      time_window_end: o.time_window_end ?? null,
      priority: o.priority,
      requires_signature: false,
      requires_photo: true,
      requested_date: today,
      status: 'pending' as const,
      stop_id: null,
      plan_stop_id: null,
      created_by: userId,
    };

    if (existing) {
      // Solo "rebotar" a pending si no quedó delivered/failed por una corrida previa.
      const { error } = await db.from('orders').update(payload).eq('id', existing.id);
      if (error) throw new Error(`order update (${o.external_id}): ${error.message}`);
      pendingUpdated += 1;
    } else {
      const { error } = await db.from('orders').insert(payload);
      if (error) throw new Error(`order insert (${o.external_id}): ${error.message}`);
      pendingCreated += 1;
    }
  }
  console.log(`[apple-review] orders pending: ${pendingCreated} creados, ${pendingUpdated} actualizados`);

  // 11) Orders scheduled (uno por plan_stop existente)
  // Linkeamos cada uno al plan_stop correspondiente para que aparezcan
  // "ya armados en la ruta de hoy". El trigger sync_order_status mantiene
  // el status sincronizado con el plan_stop, así que partimos en 'scheduled'.
  let scheduledCreated = 0;
  let scheduledUpdated = 0;

  const { data: planStopsForOrders, error: psFetchErr } = await db
    .from('plan_stops')
    .select('id, stop_id, order_index')
    .eq('plan_id', planId)
    .order('order_index', { ascending: true });
  if (psFetchErr) throw new Error(`plan_stops fetch: ${psFetchErr.message}`);

  const planStopByStopId = new Map<string, string>(
    (planStopsForOrders ?? []).map((ps) => [ps.stop_id, ps.id]),
  );

  for (let i = 0; i < SCHEDULED_ORDERS.length; i++) {
    const o = SCHEDULED_ORDERS[i];
    const stopId = stopIds[i];
    const planStopId = planStopByStopId.get(stopId) ?? null;

    const { data: existing } = await db
      .from('orders')
      .select('id')
      .eq('org_id', orgId)
      .eq('external_id', o.external_id)
      .maybeSingle();

    const payload = {
      org_id: orgId,
      order_number: o.order_number,
      external_id: o.external_id,
      source: o.source,
      customer_name: o.customer_name,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      items: o.items,
      total_weight_kg: o.total_weight_kg,
      currency: 'CLP',
      service_duration_minutes: 10,
      priority: o.priority,
      requires_signature: false,
      requires_photo: true,
      requested_date: today,
      status: 'scheduled' as const,
      stop_id: stopId,
      plan_stop_id: planStopId,
      created_by: userId,
    };

    if (existing) {
      const { error } = await db.from('orders').update(payload).eq('id', existing.id);
      if (error) throw new Error(`order update (${o.external_id}): ${error.message}`);
      scheduledUpdated += 1;
    } else {
      const { error } = await db.from('orders').insert(payload);
      if (error) throw new Error(`order insert (${o.external_id}): ${error.message}`);
      scheduledCreated += 1;
    }
  }
  console.log(
    `[apple-review] orders scheduled: ${scheduledCreated} creados, ${scheduledUpdated} actualizados`,
  );

  // ---- Summary ------------------------------------------------------------
  console.log('\n=== APPLE REVIEW SEED COMPLETO ===');
  console.log(`  email     : ${APPLE_EMAIL}`);
  console.log(`  user_id   : ${userId}`);
  console.log(`  org_id    : ${orgId}  (slug: ${ORG_SLUG})`);
  console.log(`  driver_id : ${driverId}`);
  console.log(`  plan_id   : ${planId}  (date: ${today})`);
  console.log(`  route_id  : ${routeId}`);
  console.log(`  stops     : ${stopIds.length} en Santiago`);
  console.log(`  orders    : ${PENDING_ORDERS.length} pending + ${SCHEDULED_ORDERS.length} scheduled`);
  console.log('\nApple debería poder hacer login y ver la ruta del día.');
  console.log('Re-correr el script mañana para regenerar el plan con la fecha de hoy.');
}

main().catch((e) => {
  console.error('[apple-review] FAILED:', e);
  process.exit(1);
});
