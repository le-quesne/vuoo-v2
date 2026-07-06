-- =============================================
-- Fix: generate_order_number desborda con números externos
-- =============================================
--
-- La versión original (migración 008) extraía TODOS los dígitos de CADA
-- order_number de la org y casteaba a `integer` para calcular el siguiente
-- correlativo. Falla cuando existen pedidos con order_number externo cuyos
-- dígitos exceden int4 (ej. números tipo fecha "20260519001" de Shopify/guías),
-- devolviendo `value "..." is out of range for type integer`.
--
-- Esto rompía tanto el endpoint público `POST /api/v1/orders` (cuando el
-- conector omite order_number) como el import CSV, que usan esta misma RPC.
--
-- Fix: la RPC sólo considera la serie propia autogenerada `ORD-NNNNN`. Los
-- números externos (Shopify, guías, VTEX) no participan del correlativo — y no
-- pueden colisionar con `ORD-*` de todos modos por el unique (org_id, order_number).

create or replace function public.generate_order_number(p_org_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  next_num integer;
begin
  select coalesce(
           max((substring(order_number from '^ORD-([0-9]+)$'))::integer),
           0
         ) + 1
    into next_num
    from orders
   where org_id = p_org_id
     and order_number ~ '^ORD-[0-9]+$';

  return 'ORD-' || lpad(next_num::text, 5, '0');
end;
$$;
