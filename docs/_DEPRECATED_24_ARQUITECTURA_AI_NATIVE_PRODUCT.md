# PRD 24 — Arquitectura AI-Native para vuoo

**Pri**: P0 (estratégico — define la siguiente fase del producto)
**Depende de**: ningún PRD bloquea, pero modifica la prioridad relativa de PRDs 17/23.
**Complementa**: [[PRD 23]] (Inteligencia Autónoma) — PRD 23 define *qué hacen* los agentes; PRD 24 define *cómo se construye la empresa* para que esos agentes existan.
**Lectura previa**: [`research/AI_NATIVE_AND_LOOPS_2026.md`](./research/AI_NATIVE_AND_LOOPS_2026.md)

---

## TL;DR

Vuoo hoy es **AI-enabled, no AI-native** (test Remove-the-AI: el producto funciona si quitás la IA). La oportunidad para los próximos 6–12 meses es construir la **capa de inteligencia** que orquesta el operating system de la empresa logística (propia + del cliente).

Decisión de arquitectura clave: **NO un repo separado con DB separada**. Sí un **dominio nuevo (`/intelligence`) dentro del monorepo, con schemas separados (`ai.*`, `evals.*`, `backoffice.*`) en la misma Supabase**. Razón: el data flywheel se rompe si los datos viven en otro lado.

Primeros 3 loops a producción (en este orden):
1. **Backoffice agent** — cross-org insights para el equipo interno de vuoo (low risk, alta señal).
2. **Dispatcher copilot** — propone optimizaciones, edits, escalaciones; humano aprueba.
3. **Torre de control agent** — triage de alertas + sugerencia de reasignación con HITL.

Stack: **Mastra (TS) + Inngest (durable) + Langfuse (observabilidad) + PostHog (señales producto)**, todo sobre Supabase y Railway que ya existen.

Costo objetivo primer trimestre: < USD 3k/mes en API tokens. Eval coverage > 80% antes de promover a "human-on-the-loop".

---

## Contexto

### Estado actual (Mayo 2026)

Aplicación de tests canónicos (ver memo de research §5):

| Test | Resultado |
|---|---|
| Remove-the-AI (CRV) | ❌ Producto funciona sin IA — AI-enabled |
| Model Improvement (CRV) | ❌ Mejor Claude no nos hace mejores automáticamente |
| Closed-loop (Diana Hu) | ⚠️ Parcial — event_log existe, no alimenta nada |
| Queryable organization (Hu) | ⚠️ Parcial — datos sí, decisiones humanas no |
| Horseless Carriage risk (Koomen) | ⚠️ Alto — si seguimos tactical sin repensar UX |

### Por qué ahora

1. **Mercado se mueve a vertical AI agents**: SimpliRoute ADA, Shipsy AgentFleet, Loop.com — competidores construyen en esta dirección. Llegar tarde con un chatbot bolted-on es horseless carriage garantizado.
2. **El operating system de vuoo (Supabase + Vroom + mobile + control) ya es sólido**: tenemos sobre qué construir, no hay que reescribir nada.
3. **Datos suficientes para empezar el flywheel**: meses de plans, stops, events, POD. No es greenfield.
4. **Costos de inference cayeron** ~10x en 18 meses; lo que era prohibitivo ahora es viable.

### Por qué NO un repo + DB separados

La idea original del founder fue: "nuevo repo con una nueva Supabase para tener un gran backoffice AI". **Recomendación: no hacerlo así.** Razones:

| Pro repo/DB nuevo | Contra |
|---|---|
| Clean room sin contaminar app actual | **Data flywheel roto**: los datos de ground truth viven en la Supabase actual; sincronizar es lag, doble carga y riesgo de divergencia |
| Separación de billing/scaling de IA | Joins entre operacional + agente se vuelven HTTP calls |
| Diferente RLS (interno vs externo) | RLS por schema lo resuelve sin duplicar DB |
| Iteración independiente | Misma deployabilidad (Vercel + Railway) ya da independencia |
| Más fácil de pivotear/deprecar | Riesgo real: terminás con "chatbot al costado" — el horseless carriage que queremos evitar |

**Decisión**: **monorepo con dominio `/intelligence` + schemas Postgres separados** en la misma Supabase. Ver §B para layout.

Lo que **sí** se separa:
- Worker process en Railway (proceso Node distinto del API).
- API keys de modelos (presupuesto y observabilidad aislados).
- Frontend `/backoffice/*` con auth distinta (superadmin / staff vuoo).

---

## Objetivos

1. **Pasar el test Remove-the-AI** en al menos 1 workflow crítico (dispatch o control) dentro de 6 meses.
2. **Pasar el test Closed-loop** en backoffice de vuoo dentro de 3 meses: cada decisión interna del equipo genera artefacto consultable + agente lo lee.
3. **Construir el data flywheel** desde día 1: trazas, evals, datasets, fine-tune path.
4. **HITL estricto** en producción cliente hasta tener evals con score > 0.85 sostenido por 30 días.
5. **Costo controlado**: < USD 3k/mes en tokens primer trimestre, escalable a < USD 15k/mes con 10x usuarios.

---

## Scope IN

### §A — Decisión de arquitectura

**A.1 — Layout del repo (incremental)**

```
src/
├── application/         # ya existe
├── presentation/        # ya existe
├── domain/              # ya existe
├── data/                # ya existe
├── intelligence/        # NUEVO — capa AI-native
│   ├── agents/
│   │   ├── backoffice/  # cross-org insights para staff vuoo
│   │   ├── dispatcher/  # copilot del planner
│   │   └── control/     # triage torre de control
│   ├── tools/           # funciones expuestas a los agentes
│   ├── prompts/         # system prompts versionados
│   ├── evals/           # datasets + scoring
│   ├── observability/   # client Langfuse + helpers
│   └── runtime/         # Mastra wiring + Inngest jobs
backend-railway/
├── src/                 # ya existe (REST + Vroom proxy)
└── intelligence-worker/ # NUEVO — proceso Node para agentes long-running
```

**A.2 — Layout de la Supabase**

Mismos proyecto Supabase, schemas Postgres separados:

```sql
-- schemas
create schema ai;          -- agent runs, traces, decisions
create schema evals;       -- datasets, scores, regressions
create schema backoffice;  -- staff-only tables (cross-org views)

-- RLS por schema
revoke usage on schema ai from anon, authenticated;
grant usage on schema ai to service_role;
-- backoffice solo para is_superadmin()
```

Tablas core (detalle en §F):
- `ai.agent_runs` — cada invocación de un agente
- `ai.agent_steps` — cada paso dentro de un run (tool calls, observations)
- `ai.agent_decisions` — output del agente: sugerencia / acción ejecutada
- `ai.human_feedback` — accept / reject / edit del usuario sobre la decisión
- `evals.datasets` — golden sets versionados
- `evals.scores` — resultados por run x eval
- `backoffice.org_health` — vista cross-org para staff

**A.3 — Frontends**

- `/` (app actual) — sin cambios estructurales por ahora.
- `/intelligence/*` — surfaces nuevos invocables desde la app actual (modal de copiloto, panel del agente de torre).
- `/backoffice/*` — UI nueva solo para staff vuoo. Hereda layout pero con auth `is_superadmin`.

**A.4 — Despliegue**

- Web (Vercel) — sin cambios. Build incluye `/intelligence/*` y `/backoffice/*`.
- Railway — agregar **un segundo servicio** (`intelligence-worker`) para procesos durable (Inngest worker) y separar billing/escala de los agentes vs el API core.

### §B — Stack técnico

**Decisiones lockeadas:**

| Capa | Tool | Razón |
|---|---|---|
| Framework de agentes | **Mastra** | TS-first, tipado, encaja con stack React/TS actual |
| Durable execution | **Inngest** | Event-driven, retries, menos ceremonia que Temporal |
| Observability LLM | **Langfuse** (self-host Railway) | OpenSource, OTEL-native, datos propios |
| Producto + LLM analytics | **PostHog LLM** | Ya está conectado al proyecto |
| Modelos | **Claude Opus/Sonnet/Haiku 4.x + GPT-4.x fallback** | Multi-provider para resiliencia y routing por costo |
| Evals | **Mastra evals + dataset propio en Supabase** | Bajo overhead, control total |
| Vector DB (RAG) | **pgvector en Supabase** | Ya está disponible, evita servicio extra |

**Patrones obligatorios:**
- ReAct para agentes con tools.
- Routing por dificultad (Haiku 4.5 para triage, Sonnet para razonamiento, Opus solo para escalación).
- Prompt caching (Anthropic 50–90% descuento) en system prompts por-org.
- `maxIterations`, `maxTokens`, `maxUsd` hard limits en cada loop.
- Audit log inmutable (`ai.agent_steps` append-only).

### §C — Los 3 primeros loops a producción

Orden de prioridad pensado por: **bajo riesgo primero, alta señal primero**. No invertir el orden.

#### C.1 — Backoffice agent (staff vuoo)

**Por qué primero:** menos usuarios (~5), tolerancia a errores alta (somos nosotros), señales 10x por usuario (revisamos crítico), cero riesgo cliente.

**Capacidades v1:**
- "Dame el estado de salud de Renner esta semana" (NLQ sobre operaciones).
- "¿Qué clientes tuvieron > 10% de fallos hoy?"
- "Resumime las quejas recurrentes del último mes."
- "¿Quién está cerca de cancelar?" (heurística + agente).
- Genera resúmenes de incidentes pre-Monday-standup.

**Tools:**
- `queryOpsMetrics(org_id, period, metric)`
- `listIncidents(org_id, period, severity)`
- `getCustomerHealth(org_id)` — composite score
- `summarizeFeedback(org_id, period)`
- `escalateToSlack(channel, summary)` — output al canal de ops

**HITL:** todo es sugerencia, nada se ejecuta solo (es read-only).

**UI:** `/backoffice/copilot` — interfaz chat-first acá **sí** tiene sentido (es uso ad-hoc analítico, no operativo crítico).

#### C.2 — Dispatcher copilot

**Por qué segundo:** uso operativo, pero todas las decisiones son reversibles (mover una parada de A a B), y el dispatcher está mirando la pantalla — perfecta para HITL.

**Capacidades v1:**
- "Mové las 5 paradas de Las Condes a Ruta 03" (acción).
- "Optimizá considerando que la Ruta 02 no puede ir al sector Apoquindo entre 17–19" (reglas en lenguaje natural).
- "Sugerí qué pin marcar como problemático según el histórico."
- Sugerencias proactivas: "ETA Ruta 04 se va a romper, propongo reasignar paradas 7-9 a Ruta 05."

**Tools:**
- `getPlan(plan_id)`, `getRoute(route_id)`, `listStops(filters)`
- `proposeReassignment(stop_ids[], target_route_id)` — output sugerencia, NO ejecuta
- `applyReassignment(action_id)` — ejecuta una sugerencia previa (requiere click del user)
- `runVroomOptimization(plan_id, constraints)` — re-corre Vroom con restricciones nuevas
- `pinStopAsProblematic(stop_id, reason)` — reversible
- `requestEscalation(reason, context)` — al backoffice

**HITL:** sugerencias siempre visibles antes de ejecutar. Acción ejecuta = un click del dispatcher.

**UI:** **NO chatbot lateral**. Integrado en el plan detail: badge "💡 3 sugerencias" → dropdown con diff visual + "Aplicar / Editar / Rechazar". Comando-bar global (Cmd+K) para input en lenguaje natural.

#### C.3 — Torre de control agent

**Por qué tercero:** acciones tocan al cliente final (notificaciones), riesgo más alto, requiere los dos loops anteriores funcionando para tener evals calibrados.

**Capacidades v1:**
- Triage de alertas: categoriza, prioriza, sugiere primera acción.
- Auto-resolución de incidentes "low stakes" (chofer perdió GPS por 30s → no acción).
- Sugerencia de reasignación cuando vehículo se rompe.
- Borrador de mensaje al cliente final cuando ETA cambia > 30min (HITL aprueba antes de enviar).

**Tools:** superset de C.2 + `notifyCustomer(stop_id, draft)` (HITL), `recordIncidentDecision(...)`.

**HITL:** acciones que tocan cliente final = aprobar antes de enviar. Acciones internas (reasignar, marcar) = autónomo en *shadow mode* primero (loggea pero no ejecuta) por 30 días → luego con kill switch.

**UI:** integrado en `/control` actual. Panel "Sugerencias del agente" colapsable, badge en el header.

### §D — Data flywheel infrastructure

**D.1 — Captura de señales (desde día 1)**

Cada acción del agente registra:
- Input completo (prompt, contexto, tools disponibles).
- Output completo (decisión, tools llamados, observations).
- Identidad (user, org, agent, version, model).
- Costo (tokens in/out, USD, latency).
- Outcome humano (accept / edit / reject / ignore / timeout).

Tabla `ai.human_feedback` capturada implícitamente:
- Click en "Aplicar" → `accepted`.
- Click en "Aplicar" tras editar → `edited` con diff.
- Click en "Rechazar" → `rejected` con motivo opcional.
- Sin click en 5 min → `ignored`.

**D.2 — Dataset curation (semanal)**

Pipeline:
1. Lunes 8am: cron extrae trazas de la semana → muestra 100 trazas estratificadas.
2. Ops lead revisa 50 (30min) → marca golden / bad / borderline.
3. Marcadas alimentan `evals.datasets`.
4. Mensual: candidate fine-tuning dataset si > 1000 ejemplos curados.

**D.3 — Eval suite (tres tiers)**

- **Tier 1 deterministic** (CI/CD gate):
  - JSON schema valid.
  - Tool name correcto.
  - No accede a datos fuera de org.
- **Tier 2 LLM-judge** (offline, weekly):
  - Tono apropiado en mensajes al cliente.
  - Justificación de decisión coherente con datos.
  - Judge = Sonnet, evaluado = Sonnet → cambiar judge a Opus para esta categoría.
- **Tier 3 humano** (semanal):
  - 50 trazas muestreadas + casos donde tier 1/2 disienten.
  - Calibra al judge.

**D.4 — Promotion gate**

Modelo / prompt / config nuevo solo se promueve si:
- Tier 1 score = 100% (no negociable).
- Tier 2 score > 0.85 sobre golden set.
- Tier 3 humano: score > 0.85 sobre 50 muestras.
- Costo estimado < 1.2x el actual.

### §E — Governance y guardrails

**E.1 — Hard limits por loop (no negociable):**
- `maxIterations = 8`
- `maxTokens = 60k` por run
- `maxUsd = 0.30` por run (escala a $1 para backoffice analytics)
- `maxWallTime = 60s` interactivo, `300s` async

**E.2 — Kill switches:**
- Variable env `INTELLIGENCE_AGENTS_ENABLED=false` apaga todo.
- Por agente: `ai.agent_config(agent_name, enabled, ...)`.
- Por org: opt-out individual.

**E.3 — Audit log inmutable:**
- `ai.agent_steps` append-only (revoke UPDATE/DELETE).
- Retention 2 años.
- Acceso a logs por superadmin + audit logs cruzados con `audit_log` de PRD 18.

**E.4 — HITL por categoría:**

| Acción | Modo |
|---|---|
| Read-only / analytics | Autónomo |
| Reasignar paradas internas | HITL (un click) |
| Marcar dirección problemática | Autónomo (reversible) |
| Notificar cliente final | HITL hasta evals > 0.9 |
| Cancelar entrega | **Nunca autónomo** |
| Cambiar precio / facturación | **Nunca autónomo** |
| Eliminar datos | **Nunca autónomo** |

**E.5 — Shadow mode obligatorio:**
- Cada agente nuevo arranca en shadow 30 días: ejecuta, loggea, NO actúa.
- Solo después de revisión humana de las decisiones se activa.

### §F — Schema técnico (SQL completo)

```sql
-- ==========================================
-- Schema ai: agent execution & traces
-- ==========================================
create schema if not exists ai;

create table ai.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  agent_version text not null,
  user_id uuid references auth.users(id),
  org_id uuid references organizations(id),
  trigger_type text not null check (trigger_type in ('user','cron','event','agent')),
  trigger_payload jsonb,
  status text not null default 'running' check (status in ('running','completed','failed','killed','timeout')),
  total_tokens_in int default 0,
  total_tokens_out int default 0,
  total_cost_usd numeric default 0,
  started_at timestamptz default now(),
  ended_at timestamptz,
  error text
);
create index on ai.agent_runs (org_id, started_at desc);
create index on ai.agent_runs (agent_name, started_at desc);

create table ai.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai.agent_runs(id) on delete cascade,
  step_index int not null,
  step_type text not null check (step_type in ('reasoning','tool_call','tool_result','reflection','final_output')),
  model text,
  prompt jsonb,
  response jsonb,
  tool_name text,
  tool_args jsonb,
  tool_result jsonb,
  tokens_in int,
  tokens_out int,
  cost_usd numeric,
  latency_ms int,
  created_at timestamptz default now()
);
create index on ai.agent_steps (run_id, step_index);
-- Append only
revoke update, delete on ai.agent_steps from authenticated, service_role;

create table ai.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ai.agent_runs(id),
  decision_type text not null,
  payload jsonb not null,
  requires_approval boolean default true,
  status text not null default 'proposed' check (status in ('proposed','applied','edited','rejected','ignored','expired')),
  proposed_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  edit_diff jsonb,
  rejection_reason text
);
create index on ai.agent_decisions (status, proposed_at desc);

create table ai.human_feedback (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references ai.agent_decisions(id),
  run_id uuid references ai.agent_runs(id),
  user_id uuid references auth.users(id),
  feedback_type text not null check (feedback_type in ('thumbs_up','thumbs_down','comment','edit','reject_reason')),
  payload jsonb,
  created_at timestamptz default now()
);

create table ai.agent_config (
  agent_name text primary key,
  enabled boolean default true,
  shadow_mode boolean default true,
  max_iterations int default 8,
  max_tokens int default 60000,
  max_usd_per_run numeric default 0.30,
  model_routing jsonb,
  prompt_version text,
  updated_at timestamptz default now()
);

-- ==========================================
-- Schema evals: datasets, scoring, regressions
-- ==========================================
create schema if not exists evals;

create table evals.datasets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  agent_name text not null,
  version text not null,
  description text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  unique (name, version)
);

create table evals.dataset_items (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references evals.datasets(id) on delete cascade,
  input jsonb not null,
  expected_output jsonb,
  metadata jsonb,
  label text check (label in ('golden','bad','borderline'))
);

create table evals.runs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references evals.datasets(id),
  agent_name text not null,
  agent_version text not null,
  model text,
  triggered_by text check (triggered_by in ('ci','manual','cron')),
  started_at timestamptz default now(),
  ended_at timestamptz,
  summary jsonb -- {pass: n, fail: n, score_avg: 0.xx}
);

create table evals.scores (
  id uuid primary key default gen_random_uuid(),
  eval_run_id uuid not null references evals.runs(id) on delete cascade,
  dataset_item_id uuid not null references evals.dataset_items(id),
  tier int not null check (tier in (1,2,3)),
  scorer_name text not null,
  score numeric not null,
  passed boolean not null,
  rationale text,
  raw_output jsonb,
  created_at timestamptz default now()
);

-- ==========================================
-- Schema backoffice: cross-org staff views
-- ==========================================
create schema if not exists backoffice;

create materialized view backoffice.mv_org_health as
select
  o.id as org_id,
  o.name,
  count(distinct s.id) filter (where s.completed_at >= now() - interval '7 days') as stops_completed_7d,
  count(distinct s.id) filter (where s.status='failed' and s.completed_at >= now() - interval '7 days') as stops_failed_7d,
  count(distinct s.id) filter (where s.completed_at >= now() - interval '7 days' and s.completed_at <= s.eta + interval '15 min') as on_time_7d,
  avg(extract(epoch from (s.completed_at - s.eta)) / 60)
    filter (where s.completed_at >= now() - interval '7 days') as eta_delta_min_avg_7d,
  max(s.completed_at) as last_activity_at
from organizations o
left join stops s on s.org_id = o.id
group by o.id, o.name;

create index on backoffice.mv_org_health (org_id);

-- Refresh nightly via cron
```

RLS resumida (detalle en migración):
- `ai.*` accesible solo a `service_role` (los agentes corren backend) y read-only para el usuario dueño del run.
- `evals.*` accesible a `is_superadmin()`.
- `backoffice.*` solo `is_superadmin()`.

### §G — Observabilidad

**G.1 — Langfuse self-hosted en Railway**

Por qué self-host: tus traces son tu data flywheel. No quieres que vivan en infra ajena ni pagar por volumen.

Cost: ~USD 15–30/mes en Railway (Postgres + worker + web) — Langfuse v3 está optimizado.

**G.2 — Integración:**
- Cada call al LLM va por wrapper que envía OTEL trace a Langfuse.
- Cada `ai.agent_steps` insert dispara span asíncrono.
- UI Langfuse para debug de trazas individuales.
- Dataset sync: marcar traza en Langfuse → aparece en `evals.dataset_items`.

**G.3 — PostHog LLM**

Eventos producto:
- `agent_suggestion_shown` (agent, user_id, decision_type)
- `agent_suggestion_applied` (con edit_distance si edit)
- `agent_suggestion_rejected` (con motivo)
- Funnels: invocación → sugerencia → acción → outcome.

**G.4 — Alertas:**
- Cost spike: > USD 20/hora en agentes → Slack.
- Eval regression: tier 1 < 100% en CI → bloqueo de deploy.
- Acceptance rate de un agente < 50% por 24h → Slack a ops lead.

---

## Scope OUT

- **Multi-agent debate** (Cognition Labs: "Don't build multi-agents"). Un agente con contexto + sub-agentes efímeros, no peer-to-peer.
- **Fine-tuning own models en fase 1**. Prompts + few-shot + RAG dan 80% del valor. Fine-tune cuando tengamos > 5k ejemplos curados.
- **Chatbot al lado del planner** (horseless carriage). Surfaces integradas en el contexto.
- **Vector DB externo** (Pinecone, Weaviate). pgvector en Supabase es suficiente.
- **Reescritura de Vroom o el planner**. Vroom es Software 1.0 robusto; queda. Lo que se rediseña es la **capa que conecta** humanos, datos y Vroom.

---

## Plan 90 días

### Mes 1 — Fundación

**Semana 1–2:**
- [ ] Setup `src/intelligence/` skeleton + Mastra wiring.
- [ ] Setup Inngest en Railway (nuevo servicio `intelligence-worker`).
- [ ] Setup Langfuse self-host en Railway.
- [ ] Migraciones SQL para schemas `ai`, `evals`, `backoffice`.
- [ ] RLS + roles para acceso.
- [ ] Wrapper de LLM calls con OTEL + cost tracking + hard limits.

**Semana 3–4:**
- [ ] Backoffice agent v0.1 (read-only NLQ sobre 3 tools básicos).
- [ ] Shadow mode infra (loggea sin ejecutar).
- [ ] Primer eval suite tier 1 (deterministic) corriendo en CI.

### Mes 2 — Primer loop a producción

**Semana 5–6:**
- [ ] Backoffice agent v1.0 → producción para staff vuoo (5 usuarios).
- [ ] Captura señales (accept/reject) en `ai.human_feedback`.
- [ ] PostHog events del agente.

**Semana 7–8:**
- [ ] Dispatcher copilot v0.1 en shadow mode (genera sugerencias visibles solo al equipo vuoo, no a clientes).
- [ ] Tier 2 LLM-judge sobre 30 muestras semanales.
- [ ] Tier 3 humano: ops lead revisa 50 trazas/semana.

### Mes 3 — Expansión y calibración

**Semana 9–10:**
- [ ] Dispatcher copilot v1.0 a 1 cliente piloto (Renner).
- [ ] HITL estricto, kill switch testeado.
- [ ] Dataset curado > 200 ejemplos golden.

**Semana 11–12:**
- [ ] Torre de control agent v0.1 en shadow.
- [ ] Retro: ¿qué acceptance rate tenemos? ¿qué costo real? ¿qué decisiones nos sorprendieron?
- [ ] Roadmap mes 4–6: ampliar a más clientes o profundizar capacidades.

---

## Criterios de éxito (90 días)

| Métrica | Objetivo |
|---|---|
| Costo total tokens | < USD 3k/mes en mes 3 |
| Acceptance rate backoffice agent | > 70% |
| Acceptance rate dispatcher copilot (piloto) | > 60% en mes 3 |
| Tier 1 eval coverage (deterministic) | > 90% |
| Tier 2 LLM-judge avg score | > 0.80 |
| Dataset golden ejemplos curados | > 500 |
| Trazas instrumentadas | 100% (no negociable) |
| Hard limits hitting | < 1% de runs |
| Incidentes "agente actuó mal" en producción cliente | 0 críticos |

---

## Criterios de éxito (12 meses)

| Métrica | Objetivo |
|---|---|
| Workflows AI-native (pasan Remove-the-AI test) | ≥ 2 (probable: dispatcher + torre de control) |
| Acceptance rate sostenida | > 75% promedio |
| % decisiones autónomas (human-on-the-loop) | > 40% del total |
| Fine-tune candidato (≥ 5k golden examples) | ≥ 1 modelo destilado a producción |
| ARR atribuible a features AI | trazable, > 30% |

---

## Dependencias

- **PostHog ya conectado** (no nuevo costo).
- **Supabase** ya en uso (solo agregar schemas).
- **Anthropic API + OpenAI API** — alta + budget approval.
- **Railway** — segundo servicio (intelligence-worker) + Langfuse self-host.
- **Ops lead** disponible 3–5h/semana para review humano (calibración).

---

## Riesgos

1. **Costo se descontrola** — mitigación: hard limits estrictos, routing por dificultad, prompt caching, alertas Slack.
2. **Trampa horseless carriage** — mitigación: NO chat-first en surfaces operativos. Surfaces integradas al contexto + Cmd+K invocación.
3. **Loop infinito / runaway** — mitigación: maxSteps, maxBudget, maxWallTime + circuit breaker en cada agente.
4. **Falsa autonomía** — mitigación: shadow mode 30 días obligatorio, HITL estricto para acciones cliente-facing.
5. **Multi-agent prematuro** — mitigación: regla de proyecto, un agente por feature antes de spawn.
6. **Evals que mienten** (LLM-as-judge mal calibrado) — mitigación: judge ≠ evaluado, calibración humana semanal, rúbrica explícita.
7. **Cold start del flywheel** — mitigación: empezamos con datos reales del histórico (4 meses operacionales) + Renner piloto.

---

## Relación con otros PRDs

- **PRD 23 (Inteligencia Autónoma)** — PRD 23 define *qué hacen* los agentes en el dominio (Clara, Astra, retry agent). PRD 24 es la *infraestructura habilitante*. **Mantener ambos**: PRD 24 ejecuta primero, PRD 23 se convierte en su roadmap de capacidades.
- **PRD 17 (Hardening)** — PRD 24 §A.4 (data flywheel) absorbe PRD 23 §A (enriquecer `event_log`). Mover esa tarea de PRD 23 a PRD 24 §D.1.
- **PRD 18 (Seguridad)** — PRD 24 hereda audit log de PRD 18 §A.3. Cross-reference.
- **PRDs 13–22** — siguen siendo válidos como entregables de producto. PRD 24 cambia *cómo* se construyen los próximos: cada nuevo workflow debe preguntarse "¿es AI-native o horseless?" antes de empezar.

---

## Decisiones que esperan aprobación

Antes de arrancar el plan de 90 días:

1. ✅ **Confirmar**: monorepo + schemas separados (vs nuevo repo + DB separada). Recomendación: monorepo.
2. ⚠️ **Confirmar**: Mastra como framework de agentes (alternativa: LangGraph).
3. ⚠️ **Confirmar**: budget mensual cap inicial USD 3k.
4. ⚠️ **Confirmar**: ops lead asignado para review humano (3–5h/semana).
5. ⚠️ **Confirmar**: orden de los 3 primeros loops (backoffice → dispatcher → control).

---

## Apéndice: glosario rápido

- **AI-native** (CRV/Hu): IA es la fundación, no un feature. Sin IA, el producto deja de funcionar.
- **Closed-loop** (Hu): cada acción produce artefactos, agente los lee, sistema mejora.
- **Queryable**: la organización es legible para agentes; nada vive en cabezas o WhatsApp.
- **Data flywheel** (Huyen): uso → datos → mejor modelo/producto → más uso. El moat real.
- **Agentic loop**: `input → razonar → actuar → observar → reflexionar → output`.
- **HITL**: human-in-the-loop, humano aprueba cada acción.
- **Human-on-the-loop**: humano supervisa con kill-switch, agente actúa solo.
- **Shadow mode**: agente ejecuta, loggea, NO actúa. Para calibración.
- **Horseless carriage** (Koomen): UI vieja + LLM jammed in. Anti-patrón.
- **Tier 1/2/3 evals**: determinístico / LLM-judge / humano.
- **System-prompt-as-config** (Koomen): el system prompt lo edita el usuario, no el dev.
