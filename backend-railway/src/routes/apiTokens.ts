import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { supabaseFromJWT } from '../lib/supabase.js';
import { hashToken } from '../middleware/auth.js';

export const apiTokensRoutes = new Hono();

const CreateSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).max(80),
  scopes: z
    .array(z.enum(['orders:write', 'shopify_webhook', 'vtex_webhook']))
    .min(1),
});

/**
 * POST /settings/api-tokens
 *
 * Solo accesible con Authorization: Bearer <supabase-jwt> de un usuario con
 * membresía en la org solicitada. Genera un token con 32 bytes de entropía,
 * lo hashea (sha256) y guarda solo el hash + prefijo visible.
 *
 * Respuesta:
 *   201 { token: ApiTokenRow, plaintext: "vuoo_xxxxxxxx..." }
 *
 * IMPORTANTE: `plaintext` se devuelve UNA SOLA VEZ y no se vuelve a exponer.
 */
apiTokensRoutes.post('/', async (c) => {
  const auth = c.var.auth;
  if (auth.authKind !== 'user_jwt') {
    return c.json({ error: 'user_jwt_required' }, 403);
  }
  const db = supabaseFromJWT(auth.authHeader);

  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', detail: parsed.error.issues }, 400);
  }
  const { org_id, name, scopes } = parsed.data;

  // Verificar que el user pertenece a la org.
  if (auth.orgId !== org_id) {
    const { data: membership } = await db
      .from('organization_members')
      .select('id')
      .eq('user_id', auth.userId!)
      .eq('org_id', org_id)
      .maybeSingle();
    if (!membership) return c.json({ error: 'forbidden' }, 403);
  }

  // Generar token: `vuoo_<base64url(32 bytes)>`
  const secret = randomBytes(32).toString('base64url');
  const plaintext = `vuoo_${secret}`;
  const hashed = hashToken(plaintext);
  const tokenPrefix = plaintext.slice(0, 10); // "vuoo_xxxxx"

  const { data, error } = await db
    .from('org_api_tokens')
    .insert({
      org_id,
      name,
      scopes,
      token_prefix: tokenPrefix,
      token_hash: hashed,
      created_by: auth.userId,
    })
    .select(
      'id, org_id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, created_by',
    )
    .single();

  if (error || !data) {
    return c.json({ error: 'insert_failed', detail: error?.message }, 500);
  }

  return c.json({ token: data, plaintext }, 201);
});
