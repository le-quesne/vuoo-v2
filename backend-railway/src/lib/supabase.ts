import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el entorno del backend.');
}

/**
 * Cliente anónimo. Usado principalmente para validar JWTs
 * (`supabaseAnon.auth.getUser(jwt)` funciona con anon key).
 */
export const supabaseAnon: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Cliente con JWT del caller — RLS aplica como si fuera el usuario autenticado.
 * Usar para la mayoría de operaciones (lecturas + inserts dentro del scope del user).
 */
export function supabaseFromJWT(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente con service-role — BYPASSEA RLS. Solo disponible si
 * `SUPABASE_SERVICE_ROLE_KEY` está provisionada. `null` si no.
 * Rutas que lo requieren (/api/v1/orders con opaque tokens) deben chequear
 * y devolver 501 si es null.
 */
export const supabaseServiceRole: SupabaseClient | null = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/**
 * Alias explícito al cliente service-role. NO usar para queries del usuario:
 * bypassea RLS. Las rutas autenticadas deben usar `supabaseFromJWT(authHeader)`
 * para que la RLS aplique. Solo usar este alias cuando la ruta autentica vía
 * `org_api_tokens` (donde no hay JWT del usuario) y se filtra `org_id`
 * manualmente en cada query.
 */
export const supabaseUnsafeServiceRole: SupabaseClient | null = supabaseServiceRole;
