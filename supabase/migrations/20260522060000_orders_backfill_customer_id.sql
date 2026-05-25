-- Backfill orders.customer_id por customer_code.
--
-- El backend de import (`ordersImport.ts`) hasta ahora solo persistía
-- `customer_code` pero no la FK `customer_id`. Con la migración
-- `20260522050000_orders_drop_customer_denorm.sql`, email/teléfono salen del
-- JOIN con `customers`, y ese JOIN necesita la FK poblada para no devolver
-- NULL.
--
-- Esta migración cruza órdenes con customers de la misma org por code y
-- setea customer_id. Idempotente: solo actualiza filas donde customer_id es
-- NULL. Si dos customers en la misma org comparten code (no debería pasar,
-- el unique constraint debería prevenirlo), el primer match gana.

UPDATE public.orders o
SET customer_id = c.id
FROM public.customers c
WHERE o.org_id = c.org_id
  AND o.customer_code IS NOT NULL
  AND o.customer_code = c.customer_code
  AND o.customer_id IS NULL;
