-- Permite crear orders sin address cuando se provee customer_code.
-- El backend de import resuelve customer_code → stop si existe; si no, deja
-- la orden como "pendiente de dirección" para que el dispatcher la complete
-- desde OrdersPage tras el bulk import.
ALTER TABLE orders ALTER COLUMN address DROP NOT NULL;

COMMENT ON COLUMN orders.address IS
  'Dirección de entrega. Nullable para soportar imports de ERPs que solo traen customer_code; el dispatcher completa después.';
