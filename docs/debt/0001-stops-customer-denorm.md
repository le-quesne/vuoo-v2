---
id: 0001
title: stops.customer_email/phone duplican datos del Customer master
area: stops
severity: medium
status: open
created: 2026-05-22
created_by: le-quesne
related_commit: refactor/orders-customer-denorm
---

## Qué pasa

La tabla `stops` mantiene columnas `customer_email` y `customer_phone` que en
muchos casos duplican `customers.email` / `customers.phone` (cuando `stops.customer_id`
está vinculado). Mismo patrón que el bug de fantasma que cerramos en `orders`:
pueden desincronizarse o quedar `NULL` mientras el master tiene el dato.

## Por qué se dejó pasar

El significado del `customer_email/phone` en `stops` es ambiguo:

- Podría ser **duplicación denormalizada** del Customer master (caso que en `orders`
  acabamos de eliminar).
- O podría ser **contacto del destinatario en esa dirección específica** (ej. Juan
  recibe en la bodega central, María en sucursal), distinto del cliente master.

Resolverlo bien requiere decisión de producto + auditar todos los lugares que escriben
a `stops` (UI de Stops, ImportWizard que crea stops, `upsertCustomerStop` en
`OrderModal`, `ordersApi.ts`, `ordersImport.ts`).

## Impacto

- Si el dispatcher edita el email en `customers` (settings), los stops vinculados
  no se enteran. Notificaciones futuras pueden usar el dato viejo del stop.
- Si el dispatcher edita el email en un stop, no se propaga al master.
- Confusión en `EditStopModal` / `CreateStopModal` cuando el campo está vacío pero
  el master tiene el valor.

## Cómo reproducirlo

1. Importar un cliente vía CSV con email A → crea Customer y Stop.
2. Editar el email del Customer a B en Settings → Clientes.
3. Abrir el Stop: sigue mostrando A (o vacío). Notificaciones siguen yendo a A.

## Workaround actual

Ninguno. En la práctica el primer email importado suele quedarse pegado al stop.

## Cómo se arregla bien

Dos pasos, dependientes de la decisión de producto:

1. **Si el email del stop es "el del cliente"** (mismo caso que orders): dropear las
   columnas, hacer JOIN con `customers` en el service de stops. Misma estrategia
   que se aplicó a orders en este PR (ver `data/services/orders/orders.services.ts`,
   helper `flattenOrder`).
2. **Si el email del stop es "contacto en esta dirección"**: mantener las columnas
   pero renombrarlas a `recipient_email`/`recipient_phone` para que el modelo deje
   claro que **no** son del cliente master, y ajustar la UI para evidenciarlo
   (campo "Contacto en esta dirección" separado del bloque "Cliente").

Opción (1) es probablemente lo correcto para el 95% de los usos actuales — el código
trata estos campos como datos del cliente, no del destinatario en sucursal.

## Notas

Cerrado el caso equivalente en `orders` en la rama `refactor/orders-customer-denorm`:
migración SQL drop columns + JOIN con customers en `listOrders`/`getByIds` +
`OrderModal` ahora persiste contacto al master vía `syncCustomerContact`.
