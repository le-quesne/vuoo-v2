/**
 * Réplica en JS de `vuoo_normalize_address()` de Postgres (migración
 * 20260707000000). Es la clave del matching en `match_stop_for_order`: todo
 * INSERT de stops desde el backend DEBE pasar `address_hash` con esta función,
 * porque no hay trigger que lo calcule — un stop con hash null nunca matchea.
 *
 * Si cambia la función SQL, cambiar acá en el mismo PR (y viceversa).
 */
export function normalizeAddressHash(addr: string): string {
  return addr
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // unaccent
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
