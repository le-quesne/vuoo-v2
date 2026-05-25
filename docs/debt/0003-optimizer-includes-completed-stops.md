---
id: 0003
title: Re-optimización en planes con paradas completadas — capacidad inflada y orden mezclado
area: vroom / planner
severity: high
status: fixed
created: 2026-05-24
created_by: adrian
related_commit: —
---

## Qué pasaba

Dos bugs separados con el mismo síntoma visible ("las completadas se cuentan/aparecen donde no deben"):

1. **Barra de capacidad del frontend** sumaba el peso de paradas `completed` y `cancelled` al calcular `usado/capacidad`. Resultado: una ruta con 2 entregas ya hechas (14.572 kg) + 4 pendientes (4.315 kg) mostraba `1259% — 18887/1500 kg` cuando la sobrecarga real era `~288%`.
2. **Apply del wizard Vroom (`VroomWizardModal.handleApply`)** renumeraba los `order_index` de las paradas pendientes desde `0..N-1` sin saltar los índices que las paradas completadas ya tenían ocupados. Resultado: colisiones de `order_index` en la misma ruta y la UI (que ordena por `order_index`) intercalaba completadas con pendientes en un orden absurdo.

El backend Railway (`app/backend-railway/src/routes/vroom.ts:92-93`) **sí filtra** correctamente `status in (completed, cancelled)` antes de mandar jobs a Vroom — Vroom nunca rerutea entregas ya hechas. El problema vivía 100% en el frontend.

## Fix aplicado

- `src/presentation/features/plans/utils/capacity.ts:calculateRouteWeight` salta `status === 'completed' | 'cancelled'`.
- `src/presentation/features/planner/components/VroomWizardModal.tsx:handleApply` precarga los `order_index` ocupados por completadas/canceladas de cada ruta destino y usa un cursor que los salta al renumerar las pendientes optimizadas. Las completadas mantienen su posición física; las pendientes ocupan los huecos siguientes.

## Cómo reproducir el bug original

1. Crear plan, publicarlo, marcar 2 `plan_stops` como `completed` con `orders.total_weight_kg` alto.
2. Volver a `/planner/<plan_id>` → barra de capacidad mostraba peso total (incluyendo entregas hechas) y % inflado.
3. Click **Optimizar con Vuoo** → aplicar resultado → las pendientes quedaban con `order_index` colisionando con las completadas y la lista se mezclaba.

## Notas

- El contador "10 paradas" del header de plan sigue siendo el total histórico (incluye completadas). Decisión de diseño: ese KPI representa el tamaño del plan, no las pendientes. Si se quisiera cambiar, ajustar `totalStops` en `PlanDetailPage.tsx:402`.
- El apply hace `N` updates secuenciales — si crece el plan, considerar consolidar en un RPC `apply_vroom_plan` que actualice todo en una transacción.
