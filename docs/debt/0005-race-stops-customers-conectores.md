---
id: 0005
title: Requests concurrentes de conectores pueden crear stops/customers duplicados
area: orders / api pública / shopify
severity: low
status: open
created: 2026-07-07
created_by: claude (review adversarial PR #39)
related_commit: PR #39
---

## Qué pasa

La idempotencia de `createOrderForOrg` protege la fila de `orders` (unique
parcial en `(org_id, external_id)` + replay del 23505), pero no sus efectos
secundarios: dos requests concurrentes con la misma Idempotency-Key ejecutan
`match_stop_for_order` antes de que ningún insert commitee, ninguna ve el stop
de la otra, y ambas insertan un stop nuevo. La orden ganadora referencia uno;
el otro queda huérfano en el catálogo de lugares. Lo mismo puede pasar con
`customers` en el path de `customer_code` (ahí el 23505 tiene retry, pero el
stop no).

## Por qué se dejó pasar

No hay fix trivial: un unique en `stops(org_id, address_hash)` rompería stops
legítimos de distintos clientes en la misma dirección (edificios, strip
centers). El fix real es mover la creación orden+stop+customer a una RPC
transaccional en Postgres, que es un refactor del flujo completo de
conectores — fuera de scope del PR #39.

## Impacto

Contaminación menor de datos, no corrupción: aparece un lugar duplicado en
Settings → Lugares que nadie referencia. Solo ocurre con requests
verdaderamente concurrentes de la misma key (reintentos agresivos sin esperar
el timeout), algo raro en integraciones bien portadas.

## Cómo se arregla bien

RPC `create_order_for_org` transaccional en Postgres que haga
match → insert stop → insert order en una sola transacción, y que
`createOrderForOrg` (TS) sea solo el wrapper de validación. De paso elimina
los N round-trips de hoy.
