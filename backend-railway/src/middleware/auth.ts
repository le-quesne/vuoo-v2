import type { MiddlewareHandler } from 'hono';
import { createHash } from 'node:crypto';
import { supabaseAnon, supabaseFromJWT, supabaseServiceRole } from '../lib/supabase.js';

export interface AuthContext {
  authKind: 'user_jwt' | 'org_api_token';
  userId: string | null;
  orgId: string;
  scopes: string[];
  source: 'manual' | 'shopify' | 'vtex' | 'api';
  apiTokenId?: string;
  /** Authorization header crudo — para construir clientes JWT-scoped en las rutas. */
  authHeader: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/**
 * Middleware que acepta Bearer tokens de dos tipos:
 *   1. Supabase JWT (usuario de la app web) — validado con anon key, resuelve
 *      `org_id` vía membership consultando con JWT-scoped client (RLS aplica).
 *   2. Token opaco de `org_api_tokens` — REQUIERE `SUPABASE_SERVICE_ROLE_KEY`
 *      (para bypassear RLS en la tabla de tokens). Si no está provisionada,
 *      devuelve 501.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const raw = c.req.header('Authorization') ?? '';
  const bearer = raw.toLowerCase().startsWith('bearer ')
    ? raw.slice(7).trim()
    : '';

  if (!bearer) {
    return c.json({ error: 'missing_authorization' }, 401);
  }

  const isJwt = bearer.split('.').length === 3;

  if (isJwt) {
    // Validar JWT con anon client (supabase.auth.getUser funciona con anon).
    const { data, error } = await supabaseAnon.auth.getUser(bearer);
    if (error || !data.user) {
      return c.json({ error: 'invalid_jwt', detail: error?.message }, 401);
    }

    const userId = data.user.id;

    // Memberships con JWT-scoped client → RLS garantiza que solo ve las propias.
    const userClient = supabaseFromJWT(raw);
    const requestedOrg = c.req.header('x-org-id');
    const { data: memberships, error: mErr } = await userClient
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId);

    if (mErr || !memberships || memberships.length === 0) {
      return c.json({ error: 'no_org_membership', detail: mErr?.message }, 403);
    }

    const orgId =
      requestedOrg && memberships.some((m) => m.org_id === requestedOrg)
        ? requestedOrg
        : memberships[0].org_id;

    c.set('auth', {
      authKind: 'user_jwt',
      userId,
      orgId,
      scopes: [],
      source: 'manual',
      authHeader: raw,
    });
    await next();
    return;
  }

  // ─── Token opaco (org_api_tokens) — requiere service role ──────────
  if (!supabaseServiceRole) {
    return c.json(
      {
        error: 'opaque_tokens_not_configured',
        detail:
          'Este endpoint requiere SUPABASE_SERVICE_ROLE_KEY en el backend. Provisionalo en Railway.',
      },
      501,
    );
  }

  const hashed = hashToken(bearer);
  const { data: tokenRow, error: tErr } = await supabaseServiceRole
    .from('org_api_tokens')
    .select('id, org_id, scopes, revoked_at')
    .eq('token_hash', hashed)
    .maybeSingle();

  if (tErr || !tokenRow) {
    return c.json({ error: 'invalid_token' }, 401);
  }
  if (tokenRow.revoked_at) {
    return c.json({ error: 'token_revoked' }, 401);
  }

  void supabaseServiceRole
    .from('org_api_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id);

  const scopes = (tokenRow.scopes ?? []) as string[];

  c.set('auth', {
    authKind: 'org_api_token',
    userId: null,
    orgId: tokenRow.org_id,
    scopes,
    source: scopes.includes('shopify_webhook')
      ? 'shopify'
      : scopes.includes('vtex_webhook')
        ? 'vtex'
        : 'api',
    apiTokenId: tokenRow.id,
    authHeader: raw,
  });

  await next();
};

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export function requireScope(scope: string): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.var.auth;
    if (!auth) return c.json({ error: 'unauthenticated' }, 401);
    if (auth.authKind === 'org_api_token' && !auth.scopes.includes(scope)) {
      return c.json({ error: 'insufficient_scope', required: scope }, 403);
    }
    await next();
  };
}
