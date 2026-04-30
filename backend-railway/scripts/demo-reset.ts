/**
 * Wipea y re-seedea la org demo en Supabase. Idempotente y rápido (<5s).
 *
 * Uso:
 *   cd backend-railway
 *   npm run demo:reset
 *
 * Variables de entorno requeridas (en backend-railway/.env o exportadas):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Opcionales:
 *   DEMO_ORG_SLUG   — default demo-apple-review
 *
 * NOTA seguridad: usa service-role; la función reset_demo_org() ya valida
 * que la org tenga is_demo=true antes de tocar nada. Refuse on real orgs.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const ORG_SLUG = process.env.DEMO_ORG_SLUG ?? 'demo-apple-review';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend-railway/.env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const t0 = Date.now();
  console.log(`[demo-reset] target slug=${ORG_SLUG}`);

  const { data: org, error: orgErr } = await db
    .from('organizations')
    .select('id, name, is_demo')
    .eq('slug', ORG_SLUG)
    .maybeSingle();

  if (orgErr) throw new Error(`org lookup: ${orgErr.message}`);
  if (!org) {
    console.error(`[demo-reset] no se encontró org con slug=${ORG_SLUG}`);
    console.error('  (Si nunca corriste el seed inicial, ejecuta primero seed:apple-review)');
    process.exit(1);
  }
  if (!org.is_demo) {
    console.error(`[demo-reset] REFUSE: org ${org.id} no tiene is_demo=true. Abort.`);
    process.exit(1);
  }

  const { data, error } = await db.rpc('reset_demo_org', { p_org_id: org.id });
  if (error) throw new Error(`reset_demo_org: ${error.message}`);

  const elapsed = Date.now() - t0;
  console.log(`[demo-reset] OK en ${elapsed}ms (db elapsed: ${data?.elapsed_ms?.toFixed?.(0) ?? '?'}ms)`);
  console.log(`  stops: ${data?.stops_created} | plans: ${data?.plans_created} | routes: ${data?.routes_created} | plan_stops: ${data?.plan_stops_created}`);
}

main().catch((e) => {
  console.error('[demo-reset] FAILED:', e);
  process.exit(1);
});
