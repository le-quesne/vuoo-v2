-- =============================================
-- stops.address_hash: una sola fuente de verdad (trigger en Postgres)
-- =============================================
--
-- La réplica JS del backend (NFD-strip) y `vuoo_normalize_address` (unaccent)
-- divergen en caracteres transliterables (Straße → "strae" vs "strasse",
-- ø → "" vs "o"). Como `match_stop_for_order` compara contra el hash SQL,
-- un stop insertado con hash JS divergente queda invisible para el matching
-- y genera duplicados. En vez de perseguir paridad entre dos implementaciones,
-- el hash se calcula SIEMPRE en Postgres vía trigger; los inserts del backend
-- ya no envían address_hash.

create or replace function public.stops_set_address_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.address_hash := public.vuoo_normalize_address(new.address);
  return new;
end;
$$;

drop trigger if exists trg_stops_address_hash on stops;
create trigger trg_stops_address_hash
  before insert or update of address on stops
  for each row
  execute function public.stops_set_address_hash();

comment on trigger trg_stops_address_hash on stops is
  'Calcula address_hash con vuoo_normalize_address en cada insert/cambio de address. Los clientes NO deben enviar address_hash.';

-- Re-backfill defensivo: corrige cualquier hash que haya quedado con la
-- versión JS divergente.
update stops
   set address_hash = public.vuoo_normalize_address(address)
 where address is not null
   and address_hash is distinct from public.vuoo_normalize_address(address);
