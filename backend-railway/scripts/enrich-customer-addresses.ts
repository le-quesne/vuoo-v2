/**
 * Enriquece la tabla `customers` creando un `stop` con dirección + lat/lng
 * para cada cliente sin stop asociado, usando Google Places "Find Place From Text".
 *
 * Uso:
 *   cd backend-railway
 *   tsx scripts/enrich-customer-addresses.ts --org-id <uuid> [--dry-run] [--limit N]
 *
 * Variables de entorno requeridas (en backend-railway/.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GOOGLE_PLACES_API_KEY
 *
 * NOTA seguridad: el script usa service-role; bypassea RLS. Filtra siempre por
 * el org_id pasado como argumento. Nunca loguea la API key ni el service-role.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---- env loader minimal (sin agregar dotenv) ------------------------------
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

// ---- args ------------------------------------------------------------------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const ORG_ID = arg('org-id');
const DRY_RUN = flag('dry-run');
const LIMIT = arg('limit') ? parseInt(arg('limit')!, 10) : undefined;
const COUNTRY = (arg('country') ?? 'CL').toUpperCase();
const MIN_DELAY_MS = 120; // throttle simple (~8 req/s) — Places permite mucho más

if (!ORG_ID) {
  console.error('Falta --org-id <uuid>');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend-railway/.env');
  process.exit(1);
}
if (!PLACES_KEY) {
  console.error('Falta GOOGLE_PLACES_API_KEY en backend-railway/.env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---- normalizador idempotente (espejo de vuoo_normalize_address en Postgres)
function normalizeAddressHash(addr: string): string {
  return addr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Google Places (New) - searchText -------------------------------------
interface PlaceMatch {
  formattedAddress: string;
  lat: number;
  lng: number;
  displayName: string;
}

async function findPlace(query: string): Promise<PlaceMatch | null> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY!,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: COUNTRY,
      languageCode: 'es',
      maxResultCount: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Places HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude: number; longitude: number };
    }>;
  };
  const p = data.places?.[0];
  if (!p?.formattedAddress || !p.location) return null;
  return {
    formattedAddress: p.formattedAddress,
    lat: p.location.latitude,
    lng: p.location.longitude,
    displayName: p.displayName?.text ?? '',
  };
}

// ---- main ------------------------------------------------------------------
async function main() {
  console.log(`[enrich] org=${ORG_ID} dryRun=${DRY_RUN} country=${COUNTRY}${LIMIT ? ` limit=${LIMIT}` : ''}`);

  // 1) Pick a user_id de la org para satisfacer stops.user_id NOT NULL.
  const { data: members, error: membersErr } = await db
    .from('organization_members')
    .select('user_id')
    .eq('org_id', ORG_ID)
    .limit(1);
  if (membersErr || !members || members.length === 0) {
    console.error('No se encontró ningún usuario en la org. Necesario para stops.user_id.');
    if (membersErr) console.error(membersErr.message);
    process.exit(1);
  }
  const ownerUserId = (members[0] as { user_id: string }).user_id;

  // 2) Customers de la org sin stop asociado.
  const { data: customers, error: cErr } = await db
    .from('customers')
    .select('id, customer_code, name')
    .eq('org_id', ORG_ID)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (cErr || !customers) {
    console.error('Error leyendo customers:', cErr?.message);
    process.exit(1);
  }

  // Filtra los que YA tienen stop.
  const ids = customers.map((c) => (c as { id: string }).id);
  const { data: existingStops, error: sErr } = await db
    .from('stops')
    .select('customer_id')
    .eq('org_id', ORG_ID)
    .in('customer_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (sErr) {
    console.error('Error leyendo stops:', sErr.message);
    process.exit(1);
  }
  const withStop = new Set((existingStops ?? []).map((s) => (s as { customer_id: string }).customer_id));
  let pending = customers.filter((c) => !withStop.has((c as { id: string }).id)) as Array<{
    id: string;
    customer_code: string | null;
    name: string;
  }>;
  if (LIMIT) pending = pending.slice(0, LIMIT);

  console.log(`[enrich] ${pending.length} clientes sin dirección de ${customers.length} totales`);

  let resolved = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of pending) {
    const query = `${c.name}, Chile`;
    try {
      const match = await findPlace(query);
      if (!match) {
        skipped++;
        console.log(`SKIP  ${c.customer_code ?? '-'}  ${c.name}  (sin resultado)`);
        await delay(MIN_DELAY_MS);
        continue;
      }

      console.log(
        `OK    ${c.customer_code ?? '-'}  ${c.name}  →  ${match.formattedAddress}`,
      );

      if (!DRY_RUN) {
        const { error: insErr } = await db.from('stops').insert({
          org_id: ORG_ID,
          user_id: ownerUserId,
          customer_id: c.id,
          name: c.name,
          customer_name: c.name,
          address: match.formattedAddress,
          lat: match.lat,
          lng: match.lng,
          address_hash: normalizeAddressHash(match.formattedAddress),
          geocoding_provider: 'google',
          geocoding_confidence: 0.8,
          is_curated: false,
        });
        if (insErr) {
          failed++;
          console.error(`FAIL  ${c.customer_code ?? '-'}  insert stop: ${insErr.message}`);
          await delay(MIN_DELAY_MS);
          continue;
        }
      }
      resolved++;
    } catch (e) {
      failed++;
      console.error(`FAIL  ${c.customer_code ?? '-'}  ${c.name}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    await delay(MIN_DELAY_MS);
  }

  console.log(
    `\n[enrich] done — resolved=${resolved} skipped=${skipped} failed=${failed} ${DRY_RUN ? '(DRY RUN, nada escrito)' : ''}`,
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error('[enrich] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
