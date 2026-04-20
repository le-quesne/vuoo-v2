-- =============================================
-- Flujo pedido → ruta — Fase B.2.1 (PRD 12)
-- =============================================
--
-- match_stop_for_order(): resuelve, para un order entrante, si debemos
-- reusar un stop existente (y con qué nivel de confianza) o crear uno
-- nuevo. Regla de oro: **nunca bloquear** — "none" siempre deriva en
-- should_create_new=true.
--
-- Niveles:
--   high   → address_hash exacto + (customer_id match o customer_name
--            similarity ≥ 0.85). Reusa silenciosamente.
--   medium → solo address_hash exacto, customer distinto → reusa pero
--            marca match_review_needed en el order.
--   none   → sin match → crear stop nuevo.
--
-- Threshold similarity HARDCODED en 0.85 (decisión de producto, no
-- configurable por org hasta validar con datos reales — ver §7.2 del
-- PRD 12).

create or replace function public.match_stop_for_order(
  p_org_id         uuid,
  p_address        text,
  p_customer_name  text,
  p_customer_id    uuid,
  p_lat            numeric,
  p_lng            numeric
) returns table (
  stop_id           uuid,
  match_quality     text,
  should_create_new boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash      text := public.vuoo_normalize_address(p_address);
  v_candidate uuid;
begin
  -- ─── Nivel alto: hash exacto + customer_id exacto ──────────
  if p_customer_id is not null then
    select s.id into v_candidate
      from stops s
     where s.org_id = p_org_id
       and s.address_hash = v_hash
       and s.customer_id = p_customer_id
     order by s.is_curated desc, s.use_count desc
     limit 1;

    if v_candidate is not null then
      return query select v_candidate, 'high'::text, false;
      return;
    end if;
  end if;

  -- ─── Nivel alto: hash exacto + nombre similar (≥ 0.85) ─────
  select s.id into v_candidate
    from stops s
   where s.org_id = p_org_id
     and s.address_hash = v_hash
     and (
       p_customer_name is null
       or similarity(lower(coalesce(s.customer_name, '')), lower(p_customer_name)) >= 0.85
     )
   order by s.is_curated desc, s.use_count desc
   limit 1;

  if v_candidate is not null then
    return query select v_candidate, 'high'::text, false;
    return;
  end if;

  -- ─── Nivel medio: hash exacto, nombre distinto ─────────────
  select s.id into v_candidate
    from stops s
   where s.org_id = p_org_id
     and s.address_hash = v_hash
   order by s.is_curated desc, s.use_count desc
   limit 1;

  if v_candidate is not null then
    return query select v_candidate, 'medium'::text, false;
    return;
  end if;

  -- ─── Sin match → crear nuevo (nunca bloquea) ───────────────
  return query select null::uuid, 'none'::text, true;
end;
$$;

grant execute on function public.match_stop_for_order(uuid, text, text, uuid, numeric, numeric)
  to authenticated;

comment on function public.match_stop_for_order(uuid, text, text, uuid, numeric, numeric) is
  'Resuelve stop_id reusable o señal para crear uno nuevo. Threshold similarity HARDCODED en 0.85. Nunca bloquea: fallback siempre crea stop nuevo.';
