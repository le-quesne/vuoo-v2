-- Drop denormalized customer contact columns from orders.
--
-- Email y teléfono son atributos del Customer master, no de cada pedido.
-- Mantenerlos duplicados en `orders` creaba pedidos fantasma cuando el import
-- CSV linkeaba customer_id pero dejaba las columnas en NULL. Single source of
-- truth: `customers.email` / `customers.phone`. La UI hace JOIN.
--
-- Se mantiene `customer_name` porque puede diferir del nombre del master
-- (ej. nombre del destinatario en sucursal vs. razón social del cliente).

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS customer_email,
  DROP COLUMN IF EXISTS customer_phone;
