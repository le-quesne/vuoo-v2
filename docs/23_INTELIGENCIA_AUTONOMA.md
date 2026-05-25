# PRD 23 — Inteligencia Autónoma (Agentes IA)

**Pri**: P3 (futuro 2027+)
**Estado**: No iniciado. Apuesta de largo plazo.

---

## Contexto

El mercado se movió en 2025–2026 hacia **agentes IA autónomos** que no
solo recomiendan sino ejecutan:

- **SimpliRoute ADA**: reintentos automáticos de entregas fallidas y
  resolución de incidentes sin escalar a humano.
- **Shipsy AgentFleet**: 4 agentes nombrados — Clara (CX/WhatsApp), Astra
  (driver-ops), Nexa (finanzas), Vera (disputas).
- **Locus**: "agentic TMS" enterprise.

Para Vuoo, esto **no es ejecutable hoy** porque:
1. Requiere histórico de incidentes que aún no tenemos en volumen.
2. Requiere etiquetado de causas / intervenciones / resultados para
   entrenar.
3. Requiere infraestructura de evals y guardrails.

Pero **sí podemos sembrar hoy** para tener data útil en 12–18 meses.

---

## Objetivos (largo plazo)

1. Reducir intervención humana en operaciones repetitivas (reintentos,
   reagendamientos, comunicación con cliente).
2. Diferenciador comercial vs competidores LATAM tradicionales.
3. Mejor unit economics por automatización.

---

## Scope IN

### §A — Preparación de data (ejecutar AHORA, P3 hoy / P0 para 2027)

**A.1 — Enriquecer `event_log` con etiquetas semánticas**
- Todo evento que hoy ocurre (stop completed, failed, reassigned, alerta
  acknowledged) debe registrarse con:
  - `cause` (string, categorizado): "customer_absent", "wrong_address", etc.
  - `intervention` (string): "dispatcher_called_customer", "auto_retry_24h", etc.
  - `outcome` (string): "delivered_next_attempt", "cancelled_by_customer", etc.
- Tablas:
  ```sql
  alter table stop_events add column cause text;
  alter table stop_events add column intervention text;
  alter table stop_events add column outcome text;
  alter table stop_events add column resolved_at timestamptz;
  ```
- Política: 6–12 meses de data limpia = base de training real.

**A.2 — Catálogos taxonómicos**
- `event_causes(id, code, label, vertical)`.
- `event_interventions(id, code, label, target_role)`.
- `event_outcomes(id, code, label, is_success)`.
- Mantenidos como producto, no como soft-strings.

**A.3 — Feedback loop UX**
- En cada incident, dispatcher debe categorizar (no texto libre).
- Razones de fallo estructuradas (compartido con [[PRD 16]] §D).

### §B — Agentes v1 (cuando haya 12+ meses de data, ~2027)

**B.1 — Customer agent (estilo Clara de Shipsy)**
- Responde en WhatsApp al cliente final sobre status del envío.
- Acciones que puede tomar: reagendar (con confirmación dispatcher),
  redirigir a otra dirección (con confirmación), escalar a humano.
- Modelo: LLM (Claude Haiku 4.5 o equivalente del momento) + tools.

**B.2 — Driver-ops agent (estilo Astra)**
- Detecta drivers con OTIF deteriorándose → propone intervención
  (capacitación, cambio de zona).
- Detecta rutas que recurrentemente se desvían → propone re-diseño de
  plan template.

**B.3 — Retry agent (estilo ADA de SimpliRoute)**
- Stop fallido por "customer_absent" → auto-reagenda al día siguiente
  mismo horario (si el cliente ha estado disponible en esa franja
  históricamente).
- Stop "wrong_address" → llama geocoder con prompt enriquecido
  (orden + ciudad + barrio) + LLM cleanup → re-geocoda y reagenda.
- Stop "vehicle_breakdown" → reasigna a chofer más cercano con capacity.

### §C — Infrastructure de evals (pre-requisito de B)

**C.1 — Eval suite**
- Dataset de 1000+ casos históricos con outcome ground-truth.
- Test cada decisión del agente vs ground-truth.
- Score: accuracy, precision, recall, time-to-resolve.

**C.2 — Guardrails**
- Agente nunca puede:
  - Cancelar un stop sin confirmación.
  - Mandar mensaje a cliente final fuera de templates aprobados.
  - Decidir > $X de costo sin escalación.
- Tabla `agent_decisions(id, agent, action, status, escalated, reviewed_by)`.

**C.3 — Observability**
- Cada decisión del agente loggeada en PostHog.
- Dashboard de "agent ROI": acciones tomadas, escaladas a humano,
  outcomes positivos vs negativos.

### §D — Mantener humanos al control

- Modo "shadow": agente sugiere pero no ejecuta. Dispatcher revisa.
- Modo "co-pilot": agente ejecuta acciones reversibles automáticamente,
  propone otras.
- Modo "autopilot": agente toma decisiones, dispatcher revisa rollback.
- Progressively unlock por org / categoría de acción.

---

## Scope OUT

- AGI / razonamiento general → no aplica.
- Voice agents (call center) → fase posterior si demanda.
- Computer-use para reemplazar dispatcher → fuera.

---

## Criterios de éxito (cuando se ejecute)

- 30%+ de incidents resueltos sin intervención humana (mode autopilot).
- < 1% de decisiones del agente revertidas por dispatcher.
- ROI medible: hora-dispatcher ahorrada por mes.

---

## Dependencias

- §A (preparación de data) **debe arrancar ya**.
- §B y §C requieren 12+ meses de data + decisión estratégica de invertir.
- Stack LLM disponible (Claude/OpenAI/Gemini) con tool use estable.

---

## Riesgos

- Empezar agentes antes de tener data = hallucinations costosos.
- Costo de tokens si volumen crece: modelar antes (Claude Haiku 4.5 hoy
  ~$1/M tokens, manejable).
- Compliance: decisión autónoma de agente que afecta a cliente final
  puede traer issues regulatorios (UE AI Act, EEUU executive orders).

---

## Acción inmediata (no esperar a 2027)

**Solo §A es accionable hoy** — mover su prioridad de P3 a **P1** dentro
de este PRD, ejecutar junto con [[PRD 17]] (hardening) para no perder los
próximos 12 meses de data.
