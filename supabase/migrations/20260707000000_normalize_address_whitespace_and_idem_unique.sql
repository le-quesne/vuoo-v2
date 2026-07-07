-- =============================================
-- API pública: hash de dirección consistente + idempotencia sin races
-- =============================================
--
-- 1. `vuoo_normalize_address()` no colapsaba espacios ni hacía trim, pero las
--    réplicas JS del backend (geocode, import CSV) sí. Un stop guardado desde
--    CSV con "Calle  X " no matcheaba el mismo address llegando por API.
--    Se alinea la función SQL con la semántica JS (que es la correcta para
--    matching: "Suecia  0155" y "Suecia 0155" son la misma dirección) y se
--    re-backfillean los hashes.
--
-- 2. La idempotencia de `createOrderForOrg` era SELECT-then-INSERT sin unique:
--    dos requests concurrentes con la misma Idempotency-Key podían duplicar.
--    Se agrega unique parcial sobre (org_id, external_id); el backend trata el
--    23505 de este índice como replay idempotente (devuelve 200).

create or replace function public.vuoo_normalize_address(addr text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        lower(unaccent(coalesce(addr, ''))),
        '[^a-z0-9 ]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

comment on function public.vuoo_normalize_address(text) is
  'Normalización idempotente de direcciones (lower + unaccent + solo [a-z0-9 ] + colapso de espacios + trim). Debe mantenerse en paridad con normalizeAddressHash() en backend-railway/src/lib/addressHash.ts.';

-- Re-backfill: los hashes guardados con la versión anterior pueden diferir
-- (espacios múltiples / bordes).
update stops
   set address_hash = public.vuoo_normalize_address(address)
 where address is not null
   and address_hash is distinct from public.vuoo_normalize_address(address);

-- geocoding_cache se indexa por el mismo hash. Es un cache: más simple
-- vaciarlo que re-hashear esquivando colisiones del unique; se repuebla solo.
truncate geocoding_cache;

-- Unique parcial para el dedupe idempotente (solo órdenes de conectores:
-- external_id lleva `idem:<sha256(org, key)>`; manual/CSV lo dejan null).
create unique index if not exists orders_org_external_id_unique
  on orders(org_id, external_id)
  where external_id is not null;
