-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Trigger BEFORE INSERT/UPDATE en stops: si trae customer_id pero el
-- contacto (email/phone/name) viene vacío, lo completa desde customers.
--
-- Esto mantiene el snapshot del contacto en stops (que es lo que leen
-- las edge functions de notificación) sin obligar a la UI a duplicar
-- la información manualmente al crear el stop.
--
-- También se ejecuta un backfill puntual fuera de la migration (ver
-- README de operación) para arrastrar emails de stops históricos sin
-- contacto.
-- =============================================

create or replace function public.stops_inherit_customer_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_phone text;
  v_name  text;
begin
  if new.customer_id is null then
    return new;
  end if;

  if new.customer_email is null or new.customer_email = ''
     or new.customer_phone is null or new.customer_phone = ''
     or new.customer_name is null or new.customer_name = '' then

    select email, phone, name
      into v_email, v_phone, v_name
      from customers
     where id = new.customer_id;

    if (new.customer_email is null or new.customer_email = '') and v_email is not null and v_email <> '' then
      new.customer_email := v_email;
    end if;
    if (new.customer_phone is null or new.customer_phone = '') and v_phone is not null and v_phone <> '' then
      new.customer_phone := v_phone;
    end if;
    if (new.customer_name is null or new.customer_name = '') and v_name is not null and v_name <> '' then
      new.customer_name := v_name;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stops_inherit_customer_contact on stops;

create trigger trg_stops_inherit_customer_contact
  before insert or update of customer_id, customer_email, customer_phone, customer_name on stops
  for each row
  execute function public.stops_inherit_customer_contact();
