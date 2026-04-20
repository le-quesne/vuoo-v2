import { Hono } from 'hono';
import { z } from 'zod';
import { supabaseFromJWT } from '../lib/supabase.js';
import { getGeocodingProvider } from '../lib/geocoding/provider.js';
import type { GeocodeResult } from '../lib/geocoding/provider.js';

const BatchSchema = z.object({
  addresses: z
    .array(
      z.object({
        id: z.string(),
        address: z.string().min(1),
        country: z.string().length(2).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const geocodeRoutes = new Hono();

/**
 * POST /geocode/batch
 *
 * Request:
 *   { addresses: [{ id, address, country?: 'CL' }] }
 *
 * Response:
 *   { results: [{ id, lat, lng, confidence, provider, fromCache }] }
 *
 * Flow:
 *   1. Normaliza address → `address_hash`.
 *   2. Lookup en `geocoding_cache` (filtrado por org_id).
 *   3. Los misses se envían al proveedor (Mapbox via `GeocodingProvider`).
 *   4. Upsert cache + incrementa `hit_count`.
 */
geocodeRoutes.post('/batch', async (c) => {
  const auth = c.var.auth;
  const db = supabaseFromJWT(auth.authHeader);
  const body = await c.req.json().catch(() => null);
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid_body', detail: parsed.error.issues }, 400);
  }

  const { addresses } = parsed.data;
  const orgId = auth.orgId;

  // 1. hash + cache lookup
  const hashes = addresses.map((a) => ({ ...a, hash: normalizeAddress(a.address) }));
  const { data: cached, error: cacheErr } = await db
    .from('geocoding_cache')
    .select('address_hash, lat, lng, confidence, provider')
    .eq('org_id', orgId)
    .in(
      'address_hash',
      hashes.map((h) => h.hash),
    );

  if (cacheErr) return c.json({ error: 'cache_lookup_failed', detail: cacheErr.message }, 500);

  const cacheMap = new Map((cached ?? []).map((r) => [r.address_hash, r]));

  const misses = hashes.filter((h) => !cacheMap.has(h.hash));
  let geocoded: GeocodeResult[] = [];

  if (misses.length > 0) {
    const provider = getGeocodingProvider();
    geocoded = await provider.geocode(
      misses.map((m) => ({ id: m.id, address: m.address, country: m.country })),
    );
  }

  const geocodedById = new Map(geocoded.map((g) => [g.id, g]));

  // Upsert exitosos al cache.
  const upserts = misses
    .map((m) => {
      const g = geocodedById.get(m.id);
      if (!g || g.lat == null || g.lng == null) return null;
      return {
        org_id: orgId,
        address_hash: m.hash,
        address_raw: m.address,
        lat: g.lat,
        lng: g.lng,
        confidence: g.confidence,
        provider: g.provider,
      };
    })
    .filter(Boolean);

  if (upserts.length > 0) {
    await db
      .from('geocoding_cache')
      .upsert(upserts as object[], { onConflict: 'org_id,address_hash' });
  }

  // hit_count increment: deuda técnica, requiere RPC dedicado. Skipeado por ahora.
  // TODO: migración con `increment_geocoding_cache_hits(p_org_id, p_hashes text[])`.

  const results = hashes.map((h) => {
    const cacheHit = cacheMap.get(h.hash);
    if (cacheHit) {
      return {
        id: h.id,
        lat: cacheHit.lat,
        lng: cacheHit.lng,
        confidence: cacheHit.confidence,
        provider: cacheHit.provider,
        fromCache: true,
      };
    }
    const g = geocodedById.get(h.id);
    return {
      id: h.id,
      lat: g?.lat ?? null,
      lng: g?.lng ?? null,
      confidence: g?.confidence ?? null,
      provider: g?.provider ?? 'mapbox',
      fromCache: false,
      error: g?.error,
    };
  });

  return c.json({ results });
});

/** Mantiene paridad con `vuoo_normalize_address` en Postgres. */
function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
