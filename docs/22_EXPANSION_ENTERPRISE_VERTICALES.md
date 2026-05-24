# PRD 22 — Expansión Enterprise & Verticales

**Pri**: P2 (diferenciador, no urgente — abre tras 5+ clientes pagando)
**Estado**: Nada implementado. Roadmap de mediano plazo (12–18 meses).

---

## Contexto

Tras cerrar SMB con PRDs 13–16, el siguiente layer son los diferenciadores
enterprise + verticales:

- **Territorios/zonas**: operaciones grandes lo piden estándar.
- **Multi-fleet / 3PL**: enterprise con flota propia + tercerizada.
- **Self-scheduling**: experiencia CX avanzada (DispatchTrack lo usa como
  wedge).
- **Sustainability**: empieza a ser bloqueador en RFPs grandes (ESG).
- **Verticales** (cold chain, big & bulky, hazmat, quick commerce):
  comoditización en horizontal se evita yendo profundo en una.

Este PRD agrupa 5 sub-iniciativas. Cada sección se promueve a PRD propio
cuando se decida ejecutar.

---

## Objetivos

1. Catalogar las 5 expansiones con scope claro para tomarlas cuando haya
   pull comercial.
2. Definir mínimos viables que se puedan shippear en 1–2 sprints cada uno
   (no monsters).

---

## Scope IN

### §A — Territorios y zonas
**Pri**: P2 / **Effort**: M (~2 sprints)

- Dibujar polígonos en mapa (geofencing) en `/settings/territories`.
- Asignar choferes/vehículos default a territorios.
- Auto-clustering: al lanzar optimización, agrupar stops por zona antes de
  asignar a vehículo.
- Zonas de exclusión (no-go: avenidas restringidas, comunas excluidas).
- Reglas: stop en zona X → debe ir en vehículo del cluster X.
- Benchmark: Beetrack "AI Territory Planner", SimpliRoute zone blocking.

### §B — Multi-fleet / 3PL externos
**Pri**: P2 / **Effort**: L (~3–4 sprints)

- Modelo "proveedor de transporte" (carrier) además de flota propia.
- Tipos: propia, contractor independiente, 3PL externo.
- Asignar rutas a 3PL → no expone vehículos/choferes internos, solo
  capacidad agregada.
- Visibilidad unificada en Torre de Control: rutas propias + tercerizadas.
- Settlement / liquidación:
  - Tarifa por ruta o por stop con el carrier.
  - Reporte mensual exportable.
  - Pago via integración (futuro).
- Benchmark: Onfleet, Beetrack FleetMaster, Bringg ROAD, Drivin, SimpliRoute.

### §C — Self-scheduling cliente
**Pri**: P2 / **Effort**: M (~2 sprints)

- Widget embeddable JS (`<vuoo-scheduler>`):
  - Cliente final ve slots disponibles según capacity de la zona.
  - Elige ventana de entrega al momento de comprar.
  - Confirmación via WhatsApp con `/track/:token`.
- Reschedule por el cliente cuando entrega falla:
  - Botón en `/track/:token` para "Reagendar".
  - Slots recalculados.
  - Acepta dispatcher con un click.
- Benchmark: DispatchTrack, Convey (post-acquisition por project44).

### §D — Sustainability / CO2 tracking
**Pri**: P2 / **Effort**: S (~1 sprint)

- Cálculo de emisiones por ruta:
  ```
  CO2_kg = distance_km × emission_factor(vehicle_type)
  emission_factors = {
    diesel_van: 0.21 kg/km,
    gas_van: 0.18,
    electric_van: 0.04 (depende grid local),
    bike: 0.0
  }
  ```
- Dashboard ESG en Analytics:
  - CO2 total por org / mes.
  - CO2 / entrega.
  - Tendencia.
  - Comparativo (flota actual vs si fuera 100% EV).
- Soporte vehículos eléctricos:
  - Atributos `vehicle.battery_range_km`, `vehicle.charge_stations[]`.
  - Vroom constraint: ruta no excede battery range.
- Reporte ESG exportable para compliance corporativo.
- Útil en RFPs de retail grande (Walmart, Falabella ya piden esto).

### §E — Verticales especializadas
**Pri**: P2 / **Effort**: M cada una (~2 sprints)

Elegir **1 o 2** verticales y profundizar antes de horizontalizar:

**E.1 — Cold chain / temperatura controlada**
- Atributo `vehicle.temperature_range`.
- Logging de temperatura por stop (integración con sensores BLE en piloto
  con paciencia, o ingreso manual del chofer).
- Alerta si temperatura fuera de rango.
- Validación en POD: chofer registra temperatura al entregar.
- Vertical fuerte: farma, foodservice.
- Benchmark: DispatchTrack, SimpliRoute, Beetrack.

**E.2 — Big & bulky / install services**
- POD diferenciado: foto pre + foto post + checklist daños.
- Service time configurable (60 min vs 5 min entrega normal).
- Equipos de 2 choferes por ruta.
- Vertical fuerte: muebles, electrodomésticos.
- Benchmark: DispatchTrack es dominante en US.

**E.3 — Hazmat / mercancía peligrosa**
- Skills + certificaciones: chofer debe tener cert IMDG/IATA.
- Restricciones de ruta (no túneles, no zonas residenciales).
- Tracking de cargas peligrosas con normativa local (Chile DS 148).
- Vertical fuerte: gas, cemento, químicos.
- Beetrack es único en LATAM hoy.

**E.4 — Quick commerce / on-demand**
- Optimización en streaming (re-optimizar cada N segundos según nuevas
  órdenes).
- ETA garantizado (15min / 30min / 1h).
- Geofence-trigger automation.
- Benchmark: DispatchTrack, Shipsy, LogiNext.

---

## Scope OUT

- Multi-carrier orchestration tipo Bringg (250+ carriers integrados):
  fuera, requiere equipo dedicado.
- Reverse logistics avanzada: fuera.

---

## Decisión

Antes de ejecutar cualquier sección, decidir:
- ¿Cuál vertical priorizar? (recomendado: cold chain por overlap con base
  cliente existente).
- ¿Multi-fleet 3PL ahora o esperar enterprise pull?
- ¿Self-scheduling como diferenciador o como follow-up de PRD 13?

Cada sección merece su propio mini-PRD cuando se ejecute.

---

## Criterios de éxito (cuando se ejecute)

- §A territorios: 1+ cliente con 5+ territorios definidos.
- §B 3PL: 1+ cliente con flota mixta operando.
- §C self-scheduling: 5% de las órdenes auto-scheduled por cliente final.
- §D sustainability: 1+ RFP cerrado citando dashboard ESG.
- §E vertical: clientes específicos del vertical reemplazando competidor.

---

## Dependencias

- PRDs 13–16 completos.
- PRD 18 §C (compliance) si se va por enterprise grande.
- Decisión de inversión comercial (no es free).
