# PRD 24 — Vuoo Backoffice (Company OS)

**Pri**: P0
**Repo**: `vuoo-backoffice` (nuevo, separado de `vuoo/app`)
**URL**: `backoffice.vuoo.cl`
**Reemplaza**:
- `_DEPRECATED_24_ARQUITECTURA_AI_NATIVE_PRODUCT.md` (reescribir el producto — descartado, prematuro)
- `_DEPRECATED_24_OPS_SALES_N8N.md` (n8n + Slack sin UI — descartado, se quería todo en un lugar)

**Referencia conceptual**: [`research/AI_NATIVE_AND_LOOPS_2026.md`](./research/AI_NATIVE_AND_LOOPS_2026.md)

---

## TL;DR

`backoffice.vuoo.cl` es el **operating system interno de vuoo**: un solo
web app donde el equipo gestiona sales, soporte, código, ops y finanzas,
con AI loops nativos en cada módulo. **No es un CRM forkeado** — es una
app construida sobre un schema propio diseñado para ser *queryable* por
agentes (Diana Hu: *"AI as the company's operating system"*).

**Stack lockeado**: Next.js 15 + React + shadcn + Supabase (schema
`backoffice.*` compartiendo proyecto con vuoo/app) + Claude API +
Resend + Gmail OAuth + Firecrawl. Chassis inicial:
`Razikus/supabase-nextjs-template`.

**Plan**: Módulo Sales en 4 semanas → Soporte mes 2 → resto progresivo
según dolor. < USD 100/mes infra, < USD 200/mes en tokens los primeros 3
meses.

---

## Por qué no forkear un CRM

Evaluación previa (ver historial conversacional): Twenty CRM, Atomic CRM,
NocoBase, Mautic, EspoCRM. **Descartados todos** porque:

1. **Todos asumen ser un CRM**, no un *company OS*. Su data model está
   atado a sales (companies, opportunities). Meter soporte / code / ops
   después es luchar contra el schema ajeno.
2. **El moat es el schema**. Si el modelo de datos es nuestro, podemos
   meter cualquier dominio cuando queramos sin pelear con nadie.
3. **Stack 100% TS/React/Supabase/shadcn** = cero curva, máximo reuse con
   `vuoo/app`. Twenty (NestJS+GraphQL+TypeORM) sumaría stack mental.
4. **AI-first desde día 1**: cada entidad nace con hooks de agente y
   eventos atómicos versionados. No retrofiteamos nada.

El costo: 2 semanas extras de plumbing al arranque vs Atomic CRM. Se
paga una vez y se amortiza eternamente.

---

## Visión: "queryable organization"

Un solo schema canónico en Supabase con entidades de toda la empresa:

```
backoffice.contacts        — personas (leads, clientes, equipo)
backoffice.accounts        — empresas (prospectos, clientes, churned, partners)
backoffice.deals           — pipeline de sales con stages
backoffice.threads         — cualquier conversación (sales/soporte/interno)
backoffice.messages        — mensajes de un thread (email, WhatsApp, Slack)
backoffice.activities      — eventos timeline (call, meeting, demo, etc)
backoffice.tasks           — todo lo pendiente (asignable a humano o agente)
backoffice.documents       — archivos + texto + embeddings (RAG)
backoffice.notes           — markdown libre asociado a cualquier entidad
backoffice.repos / prs / incidents  — engineering (módulo futuro)
backoffice.invoices / contracts     — finance (módulo futuro)
backoffice.agent_runs / agent_decisions / human_feedback  — capa AI cross-cutting
backoffice.metrics_daily   — snapshot diario de KPIs cross-módulo
```

Sobre este schema, vistas (apps) por dominio:

- `/sales` — kanban de deals + tabla contacts + dashboards pipeline
- `/support` — inbox unificado de threads, drafts AI, KB
- `/engineering` — PRs, deploys, drift PRD↔código, costos infra (mes 4+)
- `/ops` — health de cada cliente vuoo (cross-schema join con `public.organizations`), churn risk, alertas
- `/finance` — invoices, contratos, runway (mes 6+)
- `/agents` — qué hace cada agente, qué decidió, qué evaluó
- `/q` — chat NLQ que cruza todo (futuro)

---

## Arquitectura

### A.1 Repo nuevo

Repo separado: `github.com/le-quesne/vuoo-backoffice` (privado). **No
monorepo con vuoo/app** — son apps independientes con ciclo de release
distinto. Comparten solo:
- La Supabase (distintos schemas).
- Algunos componentes shadcn (copia manual o package `@vuoo/ui` futuro).
- Tipos generados de Supabase (regenerar en cada repo).

### A.2 Layout del repo

```
vuoo-backoffice/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── callback/                  # OAuth callbacks (Google)
│   ├── (dashboard)/
│   │   ├── layout.tsx                 # sidebar + topbar global
│   │   ├── page.tsx                   # home: today's focus + alerts
│   │   ├── sales/
│   │   │   ├── contacts/
│   │   │   ├── accounts/
│   │   │   ├── deals/
│   │   │   └── pipeline/
│   │   ├── support/                   # mes 2
│   │   ├── ops/                       # mes 3
│   │   ├── engineering/               # mes 4
│   │   ├── agents/                    # cross-cutting
│   │   └── q/                         # NLQ chat
│   └── api/
│       ├── agents/
│       │   ├── lead-research/route.ts
│       │   ├── demo-prep/route.ts
│       │   ├── followup-draft/route.ts
│       │   └── ...
│       ├── webhooks/
│       │   ├── email/route.ts         # email reply tracking
│       │   ├── gmail/route.ts         # Gmail watch push
│       │   └── slack/route.ts         # futuro
│       └── integrations/
│           ├── firecrawl/route.ts
│           ├── resend/route.ts
│           └── gmail/route.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # browser
│   │   ├── server.ts                  # server components
│   │   ├── admin.ts                   # service role (server-only)
│   │   └── types.ts                   # generated
│   ├── agents/
│   │   ├── client.ts                  # Claude SDK wrapper con cost tracking
│   │   ├── tools/                     # functions disponibles a agentes
│   │   ├── prompts/                   # system prompts versionados (md)
│   │   └── runner.ts                  # ejecutor con guardrails (max iter/tokens/usd)
│   ├── enrichment/
│   │   └── firecrawl.ts               # wrapper API Firecrawl
│   ├── email/
│   │   ├── resend.ts                  # transaccional
│   │   ├── gmail-oauth.ts             # outreach personal
│   │   └── templates/                 # React Email
│   └── utils/
├── components/
│   ├── ui/                            # shadcn primitives (copiados de vuoo/app)
│   ├── data-table/                    # tabla reusable cross-módulo
│   ├── ai/
│   │   ├── DraftReviewModal.tsx       # diff visible antes de aplicar
│   │   ├── AgentSuggestionCard.tsx
│   │   └── CmdK.tsx                   # command bar global
│   └── modules/                       # componentes por módulo
│       └── sales/
├── supabase/
│   └── migrations/                    # SQL del schema backoffice.*
├── docs/
│   ├── PROMPTS_CHANGELOG.md           # cada cambio de prompt
│   └── AGENTS.md                      # qué hace cada agente
└── .env.example
```

### A.3 Supabase schema (mismo proyecto que vuoo/app)

```sql
create schema if not exists backoffice;

-- Acceso: solo superadmin (staff vuoo)
-- Function helper si no existe
create or replace function public.is_vuoo_staff() returns boolean
language sql security definer as $$
  select coalesce(
    (auth.jwt() ->> 'is_superadmin')::boolean
    or auth.email() like '%@vuoo.cl',
    false
  );
$$;

-- Permisos por defecto: revocar todo a anon/authenticated, solo staff
revoke usage on schema backoffice from anon, authenticated;
grant usage on schema backoffice to authenticated;
-- pero RLS sobre cada tabla filtrará por is_vuoo_staff()

-- ==========================================
-- Core entities (módulo 1: sales)
-- ==========================================

create table backoffice.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text unique,
  industry text,
  size_estimate text,             -- '1-10', '11-50', etc
  country text,
  current_solution text,          -- 'beetrack', 'simpliroute', 'in-house', etc
  fleet_size_estimate int,
  vuoo_org_id uuid references public.organizations(id),  -- si ya es cliente
  status text not null default 'lead' check (
    status in ('lead','prospect','qualified','customer','churned','partner','disqualified')
  ),
  source text,                    -- 'inbound','referral','outbound','linkedin'
  owner_id uuid references auth.users(id),
  enrichment jsonb,               -- dump del lead research del agente
  health_score numeric,           -- 0-100, calculado nightly cuando es customer
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table backoffice.contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references backoffice.accounts(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  linkedin_url text,
  title text,
  role text,                      -- 'decision_maker','champion','blocker','user'
  notes text,
  enrichment jsonb,
  created_at timestamptz default now(),
  unique (email, account_id)
);

create table backoffice.deals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references backoffice.accounts(id),
  name text not null,
  stage text not null default 'discovery' check (
    stage in ('discovery','demo_scheduled','demo_done','proposal','negotiation','won','lost')
  ),
  amount_usd_monthly numeric,
  probability int check (probability between 0 and 100),
  expected_close_date date,
  lost_reason text,
  owner_id uuid references auth.users(id),
  next_action text,                       -- short string what's the next move
  next_action_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table backoffice.threads (
  id uuid primary key default gen_random_uuid(),
  subject text,
  channel text not null check (channel in ('email','whatsapp','slack','call','linkedin','manual')),
  account_id uuid references backoffice.accounts(id),
  deal_id uuid references backoffice.deals(id),
  contact_id uuid references backoffice.contacts(id),
  status text default 'open' check (status in ('open','waiting','closed')),
  last_message_at timestamptz,
  created_at timestamptz default now()
);

create table backoffice.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references backoffice.threads(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  sender text,                            -- email o handle
  body_text text,
  body_html text,
  metadata jsonb,                         -- gmail message_id, etc
  ai_drafted boolean default false,       -- el body lo escribió un agente
  ai_run_id uuid,                         -- referencia al run que lo generó
  sent_at timestamptz default now()
);

create table backoffice.activities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'call','meeting','demo','email_sent','email_received','note',
    'stage_change','deal_created','deal_won','deal_lost','enrichment'
  )),
  account_id uuid references backoffice.accounts(id),
  deal_id uuid references backoffice.deals(id),
  contact_id uuid references backoffice.contacts(id),
  user_id uuid references auth.users(id),
  payload jsonb,                          -- detalles según type
  occurred_at timestamptz default now()
);

create table backoffice.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  account_id uuid references backoffice.accounts(id),
  deal_id uuid references backoffice.deals(id),
  assignee_id uuid references auth.users(id),     -- null = no asignado
  assigned_to_agent text,                          -- nombre del agente si automatizada
  due_at timestamptz,
  status text default 'open' check (status in ('open','done','snoozed','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table backoffice.notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('account','contact','deal','thread')),
  entity_id uuid not null,
  body_md text not null,
  author_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create table backoffice.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text,
  text_content text,
  embedding vector(1536),                 -- pgvector para RAG futuro
  account_id uuid references backoffice.accounts(id),
  metadata jsonb,
  created_at timestamptz default now()
);
create index on backoffice.documents using ivfflat (embedding vector_cosine_ops);

-- ==========================================
-- Agent layer (cross-cutting, módulo agents)
-- ==========================================

create table backoffice.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_name text not null,
  agent_version text not null,
  triggered_by uuid references auth.users(id),
  trigger_type text not null check (trigger_type in ('user','cron','event')),
  input jsonb,
  output jsonb,
  status text default 'running' check (status in ('running','completed','failed','killed','timeout')),
  total_tokens_in int default 0,
  total_tokens_out int default 0,
  total_cost_usd numeric default 0,
  latency_ms int,
  error text,
  started_at timestamptz default now(),
  ended_at timestamptz
);

create table backoffice.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references backoffice.agent_runs(id),
  decision_type text not null,            -- 'draft_email','suggest_next_step','enrich_account',etc
  entity_type text,                       -- 'account','deal','contact','thread'
  entity_id uuid,
  proposed jsonb not null,
  status text default 'proposed' check (status in ('proposed','applied','edited','rejected','ignored')),
  applied_at timestamptz,
  applied_by uuid references auth.users(id),
  edit_diff jsonb,
  rejection_reason text,
  created_at timestamptz default now()
);

create table backoffice.human_feedback (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references backoffice.agent_decisions(id),
  user_id uuid references auth.users(id),
  feedback_type text check (feedback_type in ('thumbs_up','thumbs_down','comment','edit','reject')),
  payload jsonb,
  created_at timestamptz default now()
);

create table backoffice.agent_config (
  agent_name text primary key,
  enabled boolean default true,
  shadow_mode boolean default false,
  max_iterations int default 6,
  max_tokens int default 50000,
  max_usd_per_run numeric default 0.30,
  prompt_version text,
  updated_at timestamptz default now()
);

-- ==========================================
-- RLS — solo staff vuoo
-- ==========================================
alter table backoffice.accounts enable row level security;
alter table backoffice.contacts enable row level security;
-- (repetir para cada tabla)

create policy "staff full access" on backoffice.accounts
  for all using (public.is_vuoo_staff()) with check (public.is_vuoo_staff());
-- (repetir policy para cada tabla)
```

### A.4 Auth

- **Solo staff vuoo** (emails `@vuoo.cl` o flag `is_superadmin`).
- Login con email magic link (Supabase Auth) + opcional Google OAuth.
- `RequireStaff` HOC en layout `(dashboard)`.
- Gmail OAuth **separado** del login: en `/settings/integrations/gmail`,
  cada usuario conecta su Gmail personal para enviar outreach desde su
  inbox real.

### A.5 Integración con `vuoo/app` (cross-schema)

Los AI loops de ops y customer success necesitan leer datos operativos
de vuoo (rutas, paradas, fallos por cliente). Como están en la **misma
Supabase**, son JOINs SQL nativos:

```sql
-- Ejemplo: health de account "Renner"
select
  a.name,
  o.id as vuoo_org_id,
  count(distinct s.id) filter (
    where s.completed_at >= now() - interval '7 days'
  ) as stops_7d,
  count(distinct s.id) filter (
    where s.status='failed' and s.completed_at >= now() - interval '7 days'
  ) as failed_7d
from backoffice.accounts a
join public.organizations o on o.id = a.vuoo_org_id
left join public.stops s on s.org_id = o.id
where a.name = 'Renner'
group by a.id, o.id;
```

Esto es exactamente el concepto de "queryable organization" de Diana Hu.

---

## Stack técnico (decisiones lockeadas)

| Capa | Tool | Razón |
|---|---|---|
| Framework | **Next.js 15 App Router** | Server components, streaming, sigue convención `vuoo/app` que es Vite/React pero el ecosistema es el mismo |
| Chassis inicial | **`Razikus/supabase-nextjs-template`** | Auth + RLS + layout + theme ya hechos, MIT, ahorra 1 semana |
| UI | **shadcn/ui** (copia de `vuoo/app`) | Consistencia visual, control total |
| Tabla | **TanStack Table v8** | La que usa shadcn data-table, sort/filter/pagination |
| DB | **Supabase Postgres** (mismo proyecto, schema `backoffice.*`) | Reusa infra, permite JOINs cross-schema |
| Vector / RAG | **pgvector** | Ya disponible, sin servicio extra |
| LLM | **Claude API** (Sonnet 4.6 default, Haiku 4.5 triage, Opus 4.7 escalación) | Mejor en ES, prompt caching |
| Email transaccional | **Resend + React Email** | Gratis hasta 3k/mes, mejor DX |
| Email outreach (a prospectos) | **Gmail OAuth** (google-auth-library) | Mejor deliverability, parece humano |
| Scraping / enrichment | **Firecrawl cloud** (~USD 19/mes Starter) | LLM-ready markdown, sin self-host al arranque |
| Hosting | **Vercel** (frontend) + Supabase + Firecrawl cloud | Cero ops |
| Observability LLM | **PostHog LLM events** (ya conectado) | Sin tool nuevo al arranque. Langfuse si crece la complejidad |
| Workflow / cron | **Vercel Cron Jobs** | Built-in, simple. Inngest cuando necesitemos durable execution |

**NO instalar al arranque**: Mastra, LangGraph, Inngest, Temporal,
Langfuse, Braintrust. Cuando un loop justifique la infra, se agrega.

---

## Módulo 1 — Sales (primer entregable)

### Surfaces UI

| Surface | Path | Componentes |
|---|---|---|
| Home | `/` | Today's focus: tasks vencidas, deals stalled, drafts pendientes, sugerencias del agente |
| Accounts | `/sales/accounts` | Tabla filtrable + drawer detalle |
| Account detail | `/sales/accounts/[id]` | Header + tabs (overview / contacts / deals / activities / notes / threads) |
| Contacts | `/sales/contacts` | Tabla |
| Pipeline | `/sales/pipeline` | Kanban de deals por stage, drag-drop |
| Deal detail | `/sales/deals/[id]` | Header + sidebar con contact + tabs |
| Inbox | `/sales/inbox` | Threads ordenadas por last_message_at |
| New lead | botón global / Cmd+K | Modal: input URL/dominio → agente investiga → preview → save |

### AI loops nativos del módulo 1

Cada loop = endpoint `/api/agents/<name>` + UI integrada.

**Loop 1 — Lead Research** (Cmd+K → "investigar acme.com")
- **Input**: URL/dominio de empresa
- **Tools**: `firecrawl.scrape(url)`, `firecrawl.search("acme.com news")`, opcional `linkedin.search` (manual al inicio)
- **Output**: `accounts` row con enrichment (industry, size, current_solution, fleet_size, pain_hypothesis[]), + 1-3 `contacts` rows si encuentra decision makers públicos
- **HITL**: preview antes de save. User edita/rechaza.
- **Costo**: ~USD 0.15/lead.

**Loop 2 — Demo Prep**
- **Trigger**: cron 24h antes de evento "demo" en deal, o botón manual en deal detail
- **Input**: deal_id (lee account enrichment + threads previos + notes)
- **Output**: documento con script 5 pasos + 3 wow moments + 5 objeciones esperadas
- **HITL**: documento se abre como nota editable en el deal
- **Costo**: ~USD 0.25/demo

**Loop 3 — Follow-up Drafter**
- **Trigger**: botón "Draft follow-up" en thread/deal, o sugerido automáticamente cuando `deal.last_activity > 7 days`
- **Input**: thread history + deal context + tipo (post-demo / re-engage / objection)
- **Output**: draft de email en voz del owner_id (system prompt incluye 5 ejemplos reales del usuario)
- **HITL**: `DraftReviewModal` con diff y "Send via Gmail" / "Edit" / "Reject"
- **Costo**: ~USD 0.05/draft

**Loop 4 — Pipeline Hygiene** (cron diario)
- **Trigger**: cron lunes-viernes 7am ART
- **Input**: snapshot de deals + activities + threads
- **Output**: notif en `/` con: deals que cambiaron de stage, top 3 deals stalled con next-action propuesta, forecast del mes
- **HITL**: read-only resumen; cada next-action sugerida tiene "Aplicar" que crea task
- **Costo**: ~USD 0.10/día

**Loop 5 — Discovery → CRM Auto-fill**
- **Trigger**: paste de transcript en `/sales/accounts/[id]/discovery` o webhook desde Granola/Fireflies
- **Input**: transcript markdown
- **Output**: structured updates a `account.enrichment`, nuevos `contacts`, deal updated (stage, amount, próximo paso), activities nuevas
- **HITL**: diff visual de qué se va a cambiar, user confirma
- **Costo**: ~USD 0.20/call

**Cost total esperado mes 1**: ~USD 80-120 con 50 leads + 20 demos + 100 drafts + dialy hygiene + 20 calls.

### Reglas duras (heredadas de iteración previa)

1. **Cero auto-send** a prospectos. Todo agente genera *drafts*. Humano aprieta enviar.
2. **Voz del owner**, no LinkedIn-AI-genérico. System prompt con 5 ejemplos reales del voseo + palabras-veto ("aprovechar sinergias", "leverage", "rockstar").
3. **Honestidad**: si el agente no sabe, debe decir "no tengo info suficiente". Hallucinations en sales rompen confianza.
4. **Versionar prompts**: cada cambio commit en `docs/PROMPTS_CHANGELOG.md` con motivación.
5. **Hard limits** en cada agente run: `maxIterations=6`, `maxTokens=50k`, `maxUsd=0.30`. Si toca, escala a humano.
6. **Audit log inmutable**: `agent_steps` revoke UPDATE/DELETE.
7. **Retro mensual obligatoria**: loops con acceptance < 50% por 30 días → desactivar.

---

## Roadmap de módulos

| Mes | Módulo | Loops principales | Criterio para activar |
|---|---|---|---|
| 1 | **Sales** | 5 loops descriptos arriba | — |
| 2 | **Support / CS** | Inbox triage WhatsApp+email, draft de respuesta, KB auto-update, churn risk weekly | Sales con > 60% acceptance |
| 3 | **Ops cross-org** | Health score por cliente vuoo (JOIN cross-schema), NLQ chat (`/q`), alertas anomalías | Soporte funcionando |
| 4 | **Engineering** | PR descriptions, drift detector PRD↔código, weekly retro automático | Cuando el equipo eng quiera dogfood |
| 5+ | **Finance / People / Knowledge** | Invoice processing, contract review, runway forecast | Cuando duela |

Cada módulo nuevo = 2–3 semanas de trabajo porque el chassis (auth,
layout, table, drawer pattern, agent runner) ya existe.

---

## Plan 30 días

### Semana 1 — Setup + chassis

- [ ] Crear repo `vuoo-backoffice` (GitHub privado, mismo org)
- [ ] Clonar `Razikus/supabase-nextjs-template` como base
- [ ] Deploy inicial a Vercel + DNS `backoffice.vuoo.cl`
- [ ] Migraciones SQL: schema `backoffice` + helpers RLS + 8 tablas core
- [ ] Copiar componentes shadcn críticos desde `vuoo/app` (Button, Input, Dialog, DropdownMenu, DataTable, Drawer, Tabs, Card, Badge, Skeleton)
- [ ] Auth: login email + `RequireStaff` guard
- [ ] Layout dashboard: sidebar + topbar + Cmd+K palette (skeleton)
- [ ] `.env` con todas las keys: ANTHROPIC, RESEND, FIRECRAWL, GMAIL_OAUTH_CLIENT_*

### Semana 2 — Sales módulo (CRUD + lectura)

- [ ] `/sales/accounts` lista + create + detail drawer
- [ ] `/sales/contacts` lista + create
- [ ] `/sales/deals` lista + create + drag-drop stage en `/sales/pipeline`
- [ ] Activities timeline component
- [ ] Notes (markdown) component
- [ ] Tasks (lista en home + por entidad)

### Semana 3 — Primeros AI loops

- [ ] `lib/agents/runner.ts` con guardrails (iter/tokens/usd)
- [ ] Loop 1 (Lead Research) end-to-end: Cmd+K → Firecrawl → Claude → preview → save
- [ ] Loop 3 (Follow-up Drafter): integración Gmail OAuth + Resend
- [ ] `DraftReviewModal` con diff
- [ ] `agent_runs`, `agent_decisions`, `human_feedback` capturando todo
- [ ] PostHog events básicos

### Semana 4 — Cierre módulo 1 + hygiene + retro

- [ ] Loop 4 (Pipeline Hygiene) — Vercel cron diario
- [ ] Loop 5 (Discovery → CRM) — endpoint paste + diff
- [ ] Loop 2 (Demo Prep) — cron 24h antes
- [ ] Home dashboard con today's focus
- [ ] Retro mes 1: acceptance rate, edits comunes, costo real, decidir módulo 2

---

## Métricas (capturadas desde día 1)

| Métrica | Source | Target mes 1 |
|---|---|---|
| Agentes activos | `agent_config` | 5 |
| Runs/día | `agent_runs` | > 20 |
| Acceptance rate global | `agent_decisions.status` | > 60% |
| Edit rate | `agent_decisions.edit_diff` | "tal cual" > 30% |
| Tiempo ahorrado estimado | encuesta retro | > 5h/semana |
| Costo tokens total | sum `agent_runs.total_cost_usd` | < USD 200/mes |
| Drafts enviados / drafts generados | `messages.ai_drafted` vs `agent_decisions` | > 50% |
| Hard limits hit | `agent_runs.status='timeout'` | < 1% |

---

## Budget

| Item | Costo mes 1 | Costo mes 3 |
|---|---|---|
| Vercel (Hobby al arranque, Pro si necesario) | USD 0 | USD 20 |
| Supabase (ya pagado por vuoo/app, schema extra cero costo) | USD 0 | USD 0 |
| Firecrawl Starter | USD 19 | USD 19 |
| Resend Free | USD 0 | USD 0 (hasta 3k emails) |
| Gmail OAuth | USD 0 | USD 0 |
| Anthropic API | ~USD 100 | ~USD 250 |
| Dominio `backoffice.vuoo.cl` | USD 0 (subdominio existente) | USD 0 |
| PostHog (ya pagado) | USD 0 | USD 0 |
| **Total** | **~USD 120/mes** | **~USD 290/mes** |

Budget cap explicito en Anthropic console: USD 300/mes mes 1, USD 500/mes
mes 3. Alerta a 80%.

---

## Riesgos

1. **Plumbing las primeras 2 semanas sin features visibles** — mitigación: usar `Razikus/supabase-nextjs-template` para no perder tiempo en auth/layout/theme.
2. **Acumular módulos antes de validar el primero** — mitigación: regla "un módulo, 30 días, retro, decidir el siguiente". No empezar dos en paralelo.
3. **Costos descontrolados** — mitigación: hard limits por agente, budget alerts Anthropic.
4. **Drift visual con vuoo/app** — mitigación: usar mismo shadcn + mismo theme. Considerar futuro `@vuoo/ui` package cuando duela.
5. **Loops zombies** — mitigación: retro mensual + métrica `agent_config.enabled = false` para los que no se usan.
6. **Schema premature** — mitigación: empezar con 8 tablas core, agregar campos jsonb (`enrichment`, `metadata`) para flexibilidad. Schema rigid solo cuando un campo se consulte mucho.
7. **Mezclar el código con vuoo/app por error** — mitigación: repo separado, deploy separado, Supabase mismo pero schema separado. Cero imports cross-repo (solo tipos generados).
8. **Tentación de meter clientes externos al backoffice** — mitigación: `is_vuoo_staff()` enforcement RLS + auth check. **Solo staff vuoo entra acá.** Si un cliente quiere ver algo, va a `vuoo/app`.

---

## Decisiones lockeadas (no re-debatir)

- ✅ Build from scratch, NO forkear CRM existente
- ✅ Repo nuevo `vuoo-backoffice`, separado de `vuoo/app`
- ✅ Misma Supabase, schema `backoffice.*`
- ✅ Next.js 15 + shadcn + Supabase + Claude
- ✅ Chassis: `Razikus/supabase-nextjs-template`
- ✅ Email: Resend (transaccional) + Gmail OAuth (outreach)
- ✅ Scraping: Firecrawl cloud
- ✅ Módulo 1 = Sales
- ✅ Solo staff vuoo (`is_vuoo_staff()`)
- ✅ Cero auto-send, todo draft + HITL

---

## Apéndice: comandos de arranque

```bash
# 1. Crear repo
gh repo create le-quesne/vuoo-backoffice --private --clone

# 2. Bootstrap desde template
cd vuoo-backoffice
npx degit Razikus/supabase-nextjs-template .

# 3. Setup env
cp .env.example .env.local
# completar: SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY,
#            RESEND_API_KEY, FIRECRAWL_API_KEY, GOOGLE_CLIENT_ID/SECRET

# 4. Migración inicial
# crear supabase/migrations/0001_backoffice_schema.sql con todo lo de §A.3
supabase db push   # o aplicar via Studio si preferís

# 5. Generate types
supabase gen types typescript --project-id <id> --schema backoffice > lib/supabase/types.ts

# 6. Dev
pnpm install
pnpm dev

# 7. Deploy
vercel --prod
# DNS: CNAME backoffice.vuoo.cl → cname.vercel-dns.com
```
