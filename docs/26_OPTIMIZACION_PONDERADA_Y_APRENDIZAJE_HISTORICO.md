# PRD 26 — Optimización Ponderada y Aprendizaje Histórico de Rutas

**Pri**: P1
**Extiende**: PRD 06 (Optimización Inteligente), PRD 19 (Optimización Vroom Avanzada)
**Estado**: Fase 0 diferida (decisión: quedarse en VROOM v1.13.0 por ahora,
ver §Riesgos). **Fases 1–4 implementadas, y las migraciones de Fase 3/4 ya
están aplicadas al proyecto Supabase real (`vuoo-v2`, ref
`iywjnoojchdcjswmikxg`)** vía MCP autenticado — ver §Aplicado a producción.
`weights` expuesto en `VroomWizardModal` detrás de un toggle "beta"
explícito, sin desplegar a Railway todavía (`OSRM_URL` pendiente — ver
§Pendiente).

## Aplicado a producción (2026-07-07)

Con acceso vía Supabase MCP (autenticado por el usuario) se aplicaron las 4
migraciones de PRD 26 directo al proyecto real:

- `stop_visits_and_service_stats` y `stop_visits_batch_functions` (Fase 3/4).
- `harden_stop_visits_functions` + `harden_stop_visits_functions_fix_public_grant`:
  **hallazgo real de seguridad**, ver abajo.

Se corrió `run_stop_visits_batch` contra las 32 rutas `completed` reales del
proyecto (no sintéticas). Resultado: **0 `stop_visits` generadas** — no es
un bug, es que no hay datos reales de operación todavía. Se investigó cada
caso con pings: parte es data de seed/demo (trayecto recto simulado,
sin relación geográfica con los stops) y parte es GPS real de testing del
dev (el teléfono físicamente en otro lugar que la dirección de prueba). Es
exactamente lo esperable en fase pre-clientes. En cambio,
`refresh_customer_pair_affinity` **sí encontró señal real hoy**: 49 pares
de clientes que ya comparten ruta en el historial — esa parte de Fase 4 no
depende de GPS y funciona con los datos que ya existen.

**Hallazgo de seguridad (encontrado y corregido)**: `get_advisors` detectó
que las 4 funciones nuevas (`security definer`) quedaron ejecutables por
`anon`/`authenticated` vía la API REST de Supabase — cualquiera sin login
podía invocar `run_stop_visits_batch()` gratis, y `compute_stop_visits_for_route(route_id)`
acepta cualquier UUID sin verificar org, así que en teoría se podía escribir
`stop_visits` falsos de una organización ajena. Primer intento de fix
(`revoke ... from anon, authenticated`) **no alcanzó** — el grant real
estaba en `PUBLIC` (default de Postgres para funciones nuevas), confirmado
con `has_function_privilege(...)` devolviendo `true` después del primer
intento. Corregido revocando de `PUBLIC` explícitamente y reverificado
(`anon`/`authenticated` → `false`, `postgres`/cron → sigue en `true`).

## Validación funcional previa (Postgres local)

Sin Docker/Supabase CLI vinculado disponibles en este entorno, se instaló
Postgres 16 local (`brew install postgresql@16`) y se armó un fixture
mínimo con las tablas reales de las que dependen las migraciones
(`organizations`, `customers`, `drivers`, `stops`, `plans`, `routes`,
`plan_stops`, `driver_locations`) para correr ambas migraciones de PRD 26
de punta a punta:

- `compute_stop_visits_for_route`: probado con una ruta donde el camión se
  queda 3 min en un stop (genera visita, dwell correcto) y pasa 30s por
  otro (bajo el umbral de 90s, correctamente **no** genera visita — filtra
  ruido/tránsito).
- `refresh_customer_service_stats`: mean/median/stddev verificados a mano
  contra los números esperados.
- `refresh_customer_pair_affinity`: co-ocurrencia de 2 clientes que
  comparten una ruta detectada correctamente (`count=1`).
- `run_stop_visits_batch`: marca `visits_computed_at`, y reprocesar no
  duplica filas (`on conflict do nothing` funciona).
- `vuoo_distance_meters`: contrastado contra distancias conocidas (1° de
  latitud ≈ 111,195 m — correcto).
- La fórmula de confianza (`effectiveServiceMinutes` en `vroom.ts`)
  probada aparte en Node con casos límite (pocas muestras, alta
  variabilidad, cv exactamente en el borde, shrinkage gradual con n
  creciente) — se comporta como se diseñó.

Esto valida que la **lógica es correcta**, no que la infraestructura de
producción (red Railway, cron real, volumen real de datos) se comporta
igual — eso sigue pendiente.

## Pendiente antes de producción (requiere al usuario)

1. ~~Aplicar las migraciones a la base real~~ — **hecho** (ver §Aplicado a
   producción).
2. **Confirmar reachability de red**: `backend-railway` → OSRM privado
   (`OSRM_URL=http://vuoo-routing.railway.internal:5000`, mismo proyecto
   Railway `vuoo-rutas`). Pendiente de acceso a Railway.
3. **Decisión de producto: `max_distance`** — resuelta con el usuario: no
   se implementa por ahora (nadie lo pidió explícitamente, era "fruta al
   alcance" del análisis original, no una necesidad real hoy).
4. **Calibrar constantes con datos reales** una vez que haya operación real
   (geofence 100m/90s, confianza `MIN_SAMPLES=5`/`MAX_CV=0.5`/`k=5`) — no
   es un blocker, es trabajo de seguimiento. Hoy no hay ninguna visita real
   detectada porque no hay datos de producción todavía (ver §Aplicado a
   producción).
5. Pushear la rama y abrir PR — resuelto con el usuario: sí, hacerlo.

---

## Contexto

Hoy `backend-railway/src/routes/vroom.ts` arma cada request a Vroom leyendo
solo una fracción de lo que Vroom soporta nativamente y de lo que ya vive en
la DB: `location`, `service` (de `stops.duration_minutes`), `delivery` (peso,
una sola dimensión), `time_windows`, y 5 presets fijos de `costs`/`max_tasks`
por "modo" (`efficiency`, `consolidate`, `balance_stops`, `balance_time`,
`on_time`).

Sin usar: `priority`, `skills` (aunque ya se lee `vehicles.skills` en el
SELECT, nunca se envía a Vroom), `capacity`/`delivery` multi-dimensional
(volumen), `per_km`, `max_distance`, matriz de costo propia, `steps` (semilla
de ruta).

Este PRD junta dos iniciativas que comparten la misma pieza técnica de fondo
(una matriz de costo propia, calculada fuera de Vroom):

1. **Optimizador ponderado por criterios** — hoy los "modos" son 5 presets
   fijos; el objetivo es que sean sliders continuos (tiempo vs. distancia vs.
   prioridad de cliente vs. consistencia operativa).
2. **Aprendizaje histórico de la operación** — capturar tiempos de espera
   reales (dwell time) por dirección desde el GPS de los choferes, y aprender
   qué stops "suelen ir juntos" en una ruta, para que la optimización no solo
   minimice costo teórico sino que refleje la operación real. **Explícitamente
   no es afinidad por conductor** — es patrón agregado de la operación,
   independiente de quién manejó.

`docs/19_OPTIMIZACION_VROOM_AVANZADA.md` ya había puesto el ML de service
time como *Scope OUT: "datos insuficientes hoy"*. Este PRD es la base de
datos e infraestructura que faltaba para sacarlo de ese scope.

---

## Objetivos

1. Enviar a Vroom los campos que ya existen en la DB y no se usan (quick
   wins, sin tocar el solver ni su matriz).
2. Separar "realidad física" (matriz `durations`, calculada por OSRM) de
   "preferencia" (matriz `costs` propia) para poder ponderar múltiples
   criterios en un solo objetivo, sin comprometer la factibilidad de
   ventanas horarias ni tiempos de viaje reales.
3. Instrumentar la operación real (dwell time por visita) para alimentar esa
   matriz con datos, no solo con sliders manuales.
4. Que "parecido a una ruta anterior" sea una señal más dentro del mismo
   mecanismo (matriz de costo), no un sistema aparte.

---

## Scope IN — por fase

### Fase 0 — Upgrade de VROOM (diferida)

**Decisión (2026-07-07): quedarse en `vroomvrp/vroom-docker:v1.13.0` por
ahora.** No existe imagen publicada más nueva que sea estable (v1.14.0 solo
tiene release candidates, v1.15.0 no existe como imagen — ver §Riesgos).
Consecuencia directa: `per_km` y `max_distance` a nivel de vehículo no
tienen efecto real hasta que se resuelva esto (ninguno de los dos existe en
la API de VROOM v1.13.0 — se agregaron en v1.14.0 río arriba en el proyecto,
confirmado contra `gh api repos/VROOM-Project/vroom/releases`). El código de
Fase 1 ya envía `per_km`; VROOM v1.13.0 lo ignora sin romper la request
(confirmado contra el parser fuente `input_parser.cpp` de esa versión), así
que no hace falta ningún cambio de código cuando se decida upgradear —
alcanza con subir el tag del Dockerfile. Revisar esta decisión si en algún
momento se justifica compilar una imagen propia desde
`VROOM-Project/vroom` en vez de depender de `vroomvrp/vroom-docker`.

### Fase 1 — Quick wins sin tocar el solver (no depende de Fase 0) [implementada]

En `backend-railway/src/routes/vroom.ts`:

- `priority`: `plan_stops.priority` (merge ya hecho por `assign_orders_to_plan`,
  ver `023_assign_orders_to_plan.sql`) con fallback a `stops.priority` cuando
  el plan_stop no viene de un flujo de órdenes. Rango Vuoo es `0–10`
  (constraint `stops_priority_range`); Vroom espera `0–100` → se escala ×10.
- `skills`: mismo patrón de merge que priority (`plan_stops.required_skills`
  con fallback a `stops.required_skills`), más `vehicles.skills`. Vroom
  exige **enteros**, no strings — se construye un índice string→int
  *ad-hoc* por request (no necesita persistir entre llamadas).
- `capacity`/`delivery` multi-dimensional: agrega volumen (`vehicles.volume_m3`
  como capacidad, `orders.total_volume_m3` sumado por plan_stop — mismo
  patrón ya usado para peso — con fallback a `plan_stops.volume_m3`). Los
  arrays de capacidad/entrega deben tener la misma longitud en toda la
  request; si ningún vehículo tiene volumen configurado, se mantiene el
  comportamiento actual de 1 sola dimensión (cero riesgo de regresión para
  orgs que no usan volumen).
- `max_stops` (`vehicles.max_stops`) se aplica como techo duro sobre el
  `max_tasks` que ya calculan los modos `balance_stops`/`balance_time`
  (`min` entre ambos — el configurado por vehículo nunca se relaja por el
  modo).
- `per_km` (`vehicles.price_per_km`, existe desde el schema original, nunca
  se dropeó): se agrega al objeto `costs` del vehículo. Los modos actuales
  **reemplazaban** `v.costs` entero (`v.costs = { fixed: X }`), lo que
  hubiera borrado `per_km` — se cambia a merge (`v.costs = { ...v.costs, fixed: X }`)
  para que convivan. Requiere Fase 0 para tener efecto real en producción;
  el campo se envía igual y Vroom v1.13.0 debería ignorarlo si no lo soporta
  (se valida en pruebas locales antes de confiar en esto).
- `max_distance`: **no incluido** — no existe columna en `vehicles` hoy
  (a diferencia de `max_stops`). Agregarlo requiere una migración nueva +
  decisión de UI (¿por vehículo? ¿por org?) — se deja fuera de "quick wins"
  a propósito, no es solo cablear algo que ya existe.

### Fase 2 — Matriz de costo ponderada [implementada, UI beta en VroomWizardModal]

- Nuevo `backend-railway/src/lib/osrm.ts`: cliente para `/table` de la
  instancia OSRM (mismo host que usa Vroom internamente via
  `routingServers.osrm.car` en `vuoo routing/vroom/config.yml`; falta
  confirmar si `backend-railway` tiene alcance de red privada de Railway a
  ese host o si hace falta exponerlo).
- `costs[i][j] = wTiempo·dur[i][j] + wDist·dist[i][j]/V_REF + nodeCost[j]`,
  enviada como `matrices.car.{durations, costs}` — `durations` real para
  restricciones (ventanas horarias, `max_travel_time`), `costs` para lo que
  Vroom optimiza. Sliders del `VroomWizardModal` pasan a mapear a
  `wTiempo`/`wDist` (y luego `wHist`, `wZona`) en vez de a los 5 presets.
- **Conflicto a resolver**: la documentación de Vroom es explícita —
  *"Using a non-default per-hour value means... providing a custom costs
  matrix for the vehicle is inconsistent and will raise an error."* El modo
  `on_time` hoy setea `per_hour: 360` (no-default). Con una matriz `costs`
  propia activa, ese modo tal como está **rompe la request**. Hay que
  rediseñar `on_time` para lograr "prioriza ventanas" solo con `fixed` bajo
  + el propio sesgo de la matriz, sin tocar `per_hour`.

### Fase 3 — Captura de dwell time real [implementada, sin correr contra datos reales]

- Tabla `stop_visits` (`stop_id, customer_id, driver_id, route_id, org_id,
  arrived_at, departed_at, dwell_seconds, radius_m, source`).
- Batch nocturno (mismo patrón `pg_cron` que
  `20260522030000_notification_crons.sql`) sobre `driver_locations` de rutas
  que pasaron a `completed` desde la última corrida. Radio de geofence y
  umbral mínimo de permanencia **fijos globales** para el MVP (a calibrar
  con datos reales, no bloquea el diseño).
- `customer_service_stats` (`org_id, customer_id, n_samples, mean/median/
  stddev_dwell_seconds`), recalculada en el mismo cron.
- Reemplazo de `duration_minutes` gateado por confianza (no 1:1):

  ```
  cv = stddev_dwell_seconds / mean_dwell_seconds
  usar_historico = n_samples >= MIN_SAMPLES (~5) AND cv <= MAX_CV (~0.5)
  w = n_samples / (n_samples + k)   // k ~ 5
  service_time = usar_historico
    ? w * median_dwell_seconds + (1 - w) * duration_minutes_manual
    : duration_minutes_manual
  ```

  `MIN_SAMPLES`, `MAX_CV`, `k` son constantes a tunear con datos reales.

### Fase 4 — Sesgo histórico de agrupación [implementada]

- Co-ocurrencia de pares de stops en rutas `completed` (sin importar
  conductor) → término `wHist·histPenalty[i][j]` en la misma matriz de la
  Fase 2. Pares que casi nunca compartieron ruta reciben penalización
  artificial en `costs`, nunca en `durations` (así ETAs/distancia mostrada
  al usuario siguen siendo reales).

---

## Scope OUT

- Afinidad conductor↔cliente (decisión explícita del producto: el
  aprendizaje es sobre el patrón de la operación, no sobre quién la
  manejó).
- `steps` como semilla de ruta histórica — mecanismo alternativo válido
  (ver discusión), pero se prioriza el sesgo de matriz (Fase 4) porque es
  la misma pieza que ya se construye para Fase 2. Reevaluar si el sesgo de
  matriz no logra suficiente "parecido" en la práctica.
- Multi-run + scoring externo para objetivos globales no-lineales (ej.
  varianza de jornada entre vehículos) — solo si el balanceo actual
  (`max_tasks`/`max_travel_time`) resulta insuficiente.
- Geofence/umbral configurable por org — fijo global en el MVP.

---

## Riesgos

- **Bloqueante de Fase 0**: `vroomvrp/vroom-docker` (la imagen Docker
  comunitaria que usa `vuoo routing/vroom/Dockerfile`) no publica v1.14.0
  estable (solo `-rc.1`/`-rc.2`) ni v1.15.0, aunque el proyecto VROOM en
  GitHub sí llegó a esa versión en código fuente. Verificado contra
  `hub.docker.com/v2/repositories/vroomvrp/vroom-docker/tags` el
  2026-07-07. Opciones: quedarse en v1.13.0 (pierde `per_km`/
  `max_distance`), usar un release candidate (v1.14.0-rc.2), o compilar
  una imagen propia desde el código fuente de VROOM-Project/vroom.
  Decisión pendiente del usuario — no se avanza Fase 0 hasta resolver esto.
- **Conflicto `on_time` / matriz de costos** (ver Fase 2) — hay que
  rediseñar ese modo antes de activar la matriz `costs` en producción.
- **Alcance de red Railway**: sin confirmar si `backend-railway` puede
  llegar a la instancia OSRM por red privada o si hace falta exponer una
  URL pública (impacto en Fase 2).
- **Capacity multi-dimensional**: si se hace mal el default de "sin
  límite" en la dimensión de volumen, puede volver infactibles planes que
  hoy funcionan. Se mitiga con un sentinel de capacidad grande (no
  restrictivo) cuando el vehículo no tiene volumen configurado, y
  activando la segunda dimensión solo si al menos un vehículo del plan la
  usa.

---

## Dependencias

- `docs/19_OPTIMIZACION_VROOM_AVANZADA.md` — el `VroomWizardModal` que
  hoy expone los 5 modos es lo que se refactoriza a sliders en Fase 2.
- `mobile/src/lib/location.ts` — fuente de los pings de `driver_locations`
  que alimentan la Fase 3 (dwell time).
- `supabase/migrations/023_assign_orders_to_plan.sql` — confirma que
  `plan_stops.priority`/`required_skills` ya vienen mergeados
  (`greatest`/unión) desde el stop y las órdenes; Fase 1 lee de ahí en vez
  de re-derivar.

---

## Criterios de éxito

- Fase 1 no cambia el resultado de ninguna optimización existente para
  orgs que no configuran `skills`/`volume`/`price_per_km`/`max_stops`
  (regresión cero por default).
- Fase 2: tiempo de optimización p95 se mantiene bajo el mismo techo que
  PRD 19 (<30s para 200 stops/10 vehículos) pese a la llamada extra a
  OSRM `/table`.
- Fase 3: al menos un 30% de los stops con >5 visitas históricas
  cumpliendo el gate de confianza (`cv <= MAX_CV`) a los 60 días de
  instrumentado.
