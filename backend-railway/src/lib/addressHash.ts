/**
 * Hash de dirección para `geocoding_cache` (lookup + upsert en geocode.ts).
 * Dominio autocontenido: el cache se escribe y se lee SOLO con este hash JS,
 * así que no necesita paridad con Postgres.
 *
 * NO usar para `stops.address_hash`: ese lo calcula el trigger
 * `trg_stops_address_hash` en Postgres (migración 20260707170000) con
 * `vuoo_normalize_address`, que translitera distinto (unaccent vs NFD-strip).
 */
export function normalizeAddressHash(addr: string): string {
  return addr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
