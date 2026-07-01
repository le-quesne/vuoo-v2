import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * `state` firmado para el flujo OAuth de Shopify. Liga la instalación a la org
 * de Vuoo (multi-tenant) y protege contra CSRF. Formato: base64url(payload).sig
 * donde sig = HMAC-SHA256(payload, SHOPIFY_API_SECRET).
 */
export interface ShopifyOAuthState {
  org_id: string;
  shop: string;
  nonce: string;
  exp: number; // epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function signState(secret: string, org_id: string, shop: string, ttlMs = 10 * 60 * 1000): string {
  const payload: ShopifyOAuthState = {
    org_id,
    shop,
    nonce: randomBytes(8).toString('hex'),
    exp: Date.now() + ttlMs,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(secret: string, state: string): ShopifyOAuthState | null {
  const dot = state.lastIndexOf('.');
  if (dot < 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = b64url(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(body).toString('utf8')) as ShopifyOAuthState;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    if (!parsed.org_id || !parsed.shop) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Valida un dominio `*.myshopify.com`. */
export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop);
}

/** Normaliza input del usuario ("mi-tienda", "mi-tienda.myshopify.com", URL) → dominio. */
export function normalizeShopDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) s = `${s}.myshopify.com`;
  return isValidShopDomain(s) ? s : null;
}
