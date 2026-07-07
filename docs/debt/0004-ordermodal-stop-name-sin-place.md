---
id: 0004
title: OrderModal crea stops con name = customer_name (sin campo lugar)
area: orders, stops
severity: low
status: open
created: 2026-07-07
created_by: claude (rama feat/stop-place-name)
related_commit: feat/stop-place-name
---

## Qué pasa

El pipeline de import (CSV) y la API pública ya aceptan `place_name` para nombrar
el stop como lugar (sucursal/local) en vez del cliente. Pero el camino de pedido
manual (`OrderModal.tsx`, helper `upsertCustomerStop`) sigue haciendo
`stop.name = customerName`: no hay campo "Lugar" en el formulario.

## Por qué se dejó pasar

Agregar el campo al OrderModal es scope de UI (layout del formulario, copy,
validación) que excede el fix del pipeline de import donde se originó el
problema de nombres tipo "Pedidos Ya - Pedidosya La Reina (16-5-2026 AM)".

## Impacto

Pedidos creados a mano para clientes B2B multi-sucursal generan stops cuyo
nombre es el cliente, no el lugar. Con recurrencia el matching los reusa, así
que el volumen de stops mal nombrados por esta vía es bajo.

## Cómo reproducirlo

1. Pedidos → Nuevo pedido manual con cliente "ACME" y una dirección nueva.
2. Settings → Lugares: el stop nuevo se llama "ACME", no "ACME Sucursal X".

## Workaround actual

Renombrar el stop desde Settings → Lugares (EditStopModal) después de creado.

## Cómo se arregla bien

Campo opcional "Nombre del lugar" en OrderModal, pasarlo por
`upsertCustomerStop` → insert de `stops` con `name: placeName || customerName`
(mismo contrato que `ordersImport.ts` y `createOrder.ts`).

## Notas

Relacionado con 0001 (denormalización customer/stop).
