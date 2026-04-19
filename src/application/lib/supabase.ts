import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
}

// TODO(fase-0): tipar con <Database> una vez que se regenere src/types/database.ts
// con la CLI de Supabase (`supabase gen types typescript --project-id <id>`).
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
