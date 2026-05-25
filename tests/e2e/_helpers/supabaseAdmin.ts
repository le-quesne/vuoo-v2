import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Cliente admin para tests E2E. Bypassa RLS. NUNCA usar en código de app.
export function adminClient(): SupabaseClient {
  const url = process.env.E2E_SUPABASE_URL
  const key = process.env.E2E_SUPABASE_SERVICE_KEY

  if (!url || !key) {
    throw new Error(
      'E2E_SUPABASE_URL y E2E_SUPABASE_SERVICE_KEY son requeridas. ' +
        'Setear en .env.e2e o exportar antes de correr playwright.',
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonHeaders(): { apikey: string; authorization: string } {
  const key = process.env.E2E_SUPABASE_ANON_KEY
  if (!key) throw new Error('E2E_SUPABASE_ANON_KEY no definida')
  return { apikey: key, authorization: `Bearer ${key}` }
}

export function supabaseUrl(): string {
  const url = process.env.E2E_SUPABASE_URL
  if (!url) throw new Error('E2E_SUPABASE_URL no definida')
  return url
}
