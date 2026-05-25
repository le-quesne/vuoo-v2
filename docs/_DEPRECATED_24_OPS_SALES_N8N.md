# PRD 24 — Operar vuoo AI-Native: Sales (Fase 1)

**Pri**: P0
**Alcance**: cómo opera el equipo vuoo internamente. **NO toca producto, NO toca código de vuoo.**
**Foco fase 1**: sales / pipeline.
**Costo objetivo**: < USD 200/mes en mes 1, < USD 500/mes en mes 3.
**Reemplaza**: borrador anterior archivado en `_DEPRECATED_24_ARQUITECTURA_AI_NATIVE_PRODUCT.md`
(que reescribía el producto — eso queda diferido hasta validar el músculo interno).

---

## TL;DR

Vuoo se opera AI-native antes de venderse AI-native. Empezamos por **sales**: 5
loops chicos que asisten al humano en research, demo prep, follow-ups, hygiene
y discovery-to-CRM. Stack mínimo: **Claude API + Slack + Notion + n8n** y un
repo nuevo `vuoo-ops` que vive aparte de `vuoo/app`. Sin Mastra, sin Langfuse,
sin schemas Postgres. Lo que aprendamos acá define el próximo dominio (soporte,
ops o código) y eventualmente informa el producto.

---

## Por qué sales primero

1. **Mayor leverage por dólar gastado en tokens**: una hora ahorrada en research
   o una buena follow-up equivale a USD 50–500 de pipeline.
2. **Bajo riesgo de "blow-up"**: todo es draft-then-human-send. Si sale mal lo
   editamos antes de mandar.
3. **Señales claras y rápidas**: prospecto responde o no, agenda demo o no.
   Loop de aprendizaje en días, no meses.
4. **No requiere consenso ni training**: lo usa el founder/sales lead, no todo
   el equipo. Iteración solitaria viable.

---

## Los 5 loops

Cada loop tiene: **what**, **trigger**, **HITL level**, **costo estimado**.

### Loop 1 — Lead research

- **What**: dado nombre de empresa, generar dossier: ICP fit, decision makers
  probables (LinkedIn search), stack logístico actual (¿Beetrack? ¿SimpliRoute?
  ¿in-house? ¿manual?), news recientes, 3 hipótesis de pain.
- **Trigger**: comando Slack `/lead <empresa>` o Notion button.
- **HITL**: 100% draft. Humano revisa y guarda en CRM.
- **Costo**: ~5k in + 2k out × Sonnet ≈ USD 0.10/lead × 50/mes ≈ **USD 5/mes**.
- **Tools que necesita el agente**: web search (Perplexity API o Anthropic web
  search), LinkedIn scrape (proxycurl o manual), news (Brave Search API).

### Loop 2 — Demo prep personalizada

- **What**: dado prospecto + transcript del discovery call (o notas), generar:
  (a) script de demo en 5 pasos adaptado a su workflow probable; (b) lista de
  3 "wow moments" a mostrar; (c) 5 objeciones probables y respuesta.
- **Trigger**: Slack `/demo-prep <prospecto>` o cron 24h antes de la demo
  agendada en calendario.
- **HITL**: 100% draft. Adrian lo edita antes de la demo.
- **Costo**: ~10k in + 5k out × Sonnet ≈ USD 0.25/demo × 20/mes ≈ **USD 5/mes**.

### Loop 3 — Follow-up drafting

- **What**: tres sub-loops:
  - **3a — Post-demo (24h después)**: resumen + propuesta de próximo paso,
    en tono de Adrian.
  - **3b — Re-engagement (silence > 7 días)**: contextualiza qué cambió en
    vuoo desde el último contacto + reason to reach out.
  - **3c — Objection handling**: dado objection text, draft de respuesta con
    evidencia (ej. caso Renner, métricas, comparativa Beetrack).
- **Trigger**: Slack `/fwup <prospecto> <tipo>` o cron diario que escanea
  pipeline y propone los que necesitan touch.
- **HITL**: 100% draft. **NUNCA auto-send**. Siempre Adrian aprieta enviar.
- **Costo**: ~3k in + 1k out × Sonnet ≈ USD 0.05/draft × 100/mes ≈ **USD 5/mes**.

### Loop 4 — Pipeline hygiene (cron semanal)

- **What**: cada lunes 8am, Slack post en `#sales`:
  - Deals que se movieron de stage (con razón inferida de notas).
  - Deals stalled > X días (con next-action sugerida por deal).
  - Forecast simple del mes (cuánto entra, cuánto baja).
  - Top 3 follow-ups urgentes con draft pre-armado.
- **Trigger**: cron (Vercel cron o n8n).
- **HITL**: read-only. El humano decide qué hacer con la info.
- **Costo**: ~20k in + 5k out × Sonnet, 4 veces/mes ≈ **USD 5/mes**.

### Loop 5 — Discovery → CRM auto-fill

- **What**: dado transcript de discovery call (Granola/Fireflies/manual paste),
  extraer estructurado: company size, fleet size, vertical, current solution,
  pain top 3, decision criteria, timeline, budget signal, próximo paso.
  Insertar en Notion/HubSpot.
- **Trigger**: webhook desde Granola al terminar reunión, o `/discovery` paste.
- **HITL**: 100% review antes de commit a CRM. Diff visible.
- **Costo**: ~8k in + 2k out × Sonnet × 20 calls/mes ≈ **USD 4/mes**.

**Costo total estimado de los 5 loops**: ~USD 25–50/mes. Margen para iteración
y experimentos: budget cap USD 200/mes en mes 1.

---

## Stack técnico (lean)

| Capa | Tool | Por qué |
|---|---|---|
| Modelo | **Claude Sonnet 4.6 + Haiku 4.5** (Anthropic API) | Mejor para drafting en español, prompt caching genera ahorros |
| Orquestación | **n8n** (self-host en Railway, ~USD 10/mes) o **Make** | Flows visuales, conectores Slack/Notion/HubSpot built-in |
| Search / scraping | **Brave Search API** + **Perplexity API** | Baratos, calidad decente, sin Google scraping ban |
| CRM / system of record | **Notion DB** o **HubSpot Free** | Lo que ya uses; no comprar nuevo |
| Chat / triggers | **Slack** (canal `#ai-ops`, `#sales`) | Ya tienen Slack si están en YC ecosystem |
| Notas de reuniones | **Granola** o **Fireflies** | Para Loop 5; sino paste manual |
| Versionado prompts | **Git repo `vuoo-ops`** | Cada prompt en `.md` con CHANGELOG |
| Observabilidad mínima | **Notion table `loop_runs`** con run_id, input snippet, output snippet, feedback | Manual al principio, automatizable después |

**NO instalar todavía**: Mastra, LangGraph, Langfuse, Braintrust, Inngest,
Temporal. Cuando un loop merezca esa infra, lo movemos. **No antes**.

---

## Repo `vuoo-ops` (nuevo, chico)

```
vuoo-ops/
├── README.md                # cómo activar/desactivar cada loop
├── CHANGELOG.md             # qué cambió en prompts/flows
├── prompts/
│   ├── lead-research.md     # versioned: v1, v2, v3...
│   ├── demo-prep.md
│   ├── followup-postdemo.md
│   ├── followup-reengage.md
│   ├── followup-objection.md
│   ├── pipeline-hygiene.md
│   └── discovery-to-crm.md
├── flows/                   # n8n exports JSON
│   ├── lead-research.json
│   ├── demo-prep.json
│   └── ...
├── scripts/                 # tareas one-off (ej. backfill, eval manual)
│   └── run-eval.ts
├── evals/                   # datasets simples markdown/JSON
│   ├── lead-research.jsonl  # input + expected_output examples
│   └── ...
└── .env.example             # ANTHROPIC_API_KEY, BRAVE_API_KEY, SLACK_TOKEN...
```

Repo público o privado, separado de `vuoo/app`. Hostear en mismo GitHub org.

---

## Plan 30 días

**Semana 1 — Setup + Loop 1**
- [ ] Crear repo `vuoo-ops`.
- [ ] Anthropic API key dedicada (separar billing de cualquier otro uso).
- [ ] n8n self-host en Railway (1h setup) + conectar Slack + Notion.
- [ ] Brave Search API (gratis hasta 2k queries/mes).
- [ ] Loop 1 (lead research) — primer flow end-to-end. Slack `/lead <empresa>`
      devuelve dossier en 30s.
- [ ] Documentar prompt v1 + 5 ejemplos de input/output en `evals/`.

**Semana 2 — Loops 3 y 5**
- [ ] Loop 3a (post-demo follow-up): el más alto leverage. Empezar con 3
      ejemplos reales de demos pasadas → ver si el draft es 80% bueno.
- [ ] Loop 5 (discovery → CRM): si ya usás Granola, webhook directo. Sino,
      `/discovery` paste manual.
- [ ] Iterar prompts según output real. Versionar.

**Semana 3 — Loop 4 + Loop 2**
- [ ] Loop 4 (pipeline hygiene): cron lunes 8am.
- [ ] Loop 2 (demo prep): cron 24h antes de demo agendada.
- [ ] Primer "review meeting" de loops (30 min): qué funciona, qué edita
      consistentemente, qué descartar.

**Semana 4 — Loops 3b y 3c + retro**
- [ ] Loop 3b (re-engagement) y 3c (objection handling).
- [ ] Retro completa: aceptance rate por loop, edits comunes, costo real,
      próximo dominio (soporte / código / ops).

---

## Métricas (simples, manuales en Notion al principio)

| Métrica | Cómo se mide | Target mes 1 |
|---|---|---|
| Loops activos | Conteo en README | 5 |
| Acceptance rate por loop | "¿Lo usé / lo descarté?" en Notion table | > 60% |
| Edit rate | "¿Lo mandé tal cual o lo edité mucho?" — 3 buckets | "tal cual" > 30% |
| Tiempo ahorrado estimado | Estimación honesta por loop por semana | > 5h/semana total |
| Costo total tokens | Anthropic console | < USD 200/mes |
| Pipeline impactado | # de follow-ups mandados vs sin asistente | trazable cualitativo |

---

## Reglas (no negociables)

1. **Cero auto-send a prospectos.** Todo loop genera *drafts*. El humano
   aprieta enviar. Para mes 6 podríamos relajarlo en casos específicos
   con evals robustos, no antes.
2. **Voz humana, no LinkedIn-AI-genérico.** System prompt con 5 ejemplos
   reales del voseo / tono de Adrian + lista de palabras-veto ("aprovechar
   sinergias", "leverage", "rockstar"...).
3. **Honestidad sobre el output**. Si el agente no sabe, debe decir "no tengo
   info suficiente" en lugar de inventar. Hallucinations en sales rompen
   confianza con el prospecto.
4. **Versionar todo prompt**. Cambio a un prompt = commit con razón. No
   "edité el prompt en n8n y no me acuerdo".
5. **Retro mensual obligatoria**. Si un loop no se usa en 30 días → archivar.
   No coleccionamos loops zombies.

---

## Anti-patrones específicos sales

- **AI SDR que mande cold outbound autónomo**: ruina reputación de dominio +
  ilegal en algunos países (LGPD, GDPR). Cold lo mando yo.
- **"Personalización a escala" con first_name + custom_intro**: prospectos
  detectan el patrón AI en 2 segundos. Peor que mail genérico honesto.
- **Auto-call con voz sintética**: cero.
- **Agente que escribe en LinkedIn por vos**: bannean cuentas. No.
- **Olvidarse de medir**: peor que no hacerlo. Sin Notion-tracking de
  acceptance/edit, no sabés qué loop sirve.

---

## Qué viene después (mes 2+)

Decisión post-retro mes 1, según qué duela más:

| Dominio | Loops candidatos |
|---|---|
| **Soporte / CS** | Triage WhatsApp/email cliente, draft respuesta, KB auto-update, churn risk weekly |
| **Código** | PR descriptions automáticas, drift detection PRD↔código, bug triage desde logs, dependency PR review |
| **Ops cross-org** | Backoffice agent NLQ (lo que era el PRD 24 viejo, pero ahora sí justificado por aprendizajes de fase 1) |

**Regla**: un dominio a la vez, 30 días de calibración antes de abrir el
siguiente. No abrir el producto AI-native hasta tener 3+ dominios internos
funcionando con buen acceptance rate sostenido.

---

## Dependencias

- Anthropic API key + budget aprobado USD 200/mes inicial.
- Railway: 1 servicio nuevo n8n self-host (~USD 10/mes).
- Brave Search API (free tier suficiente).
- Slack (ya disponible).
- Notion o HubSpot (lo que ya usen).
- 3–4h/semana de Adrian (o sales lead) para iterar prompts y revisar drafts.

---

## Riesgos

1. **Loops zombies**: se construyen y nadie los usa. Mitigación: retro
   mensual + métrica de uso. Archivar lo no usado.
2. **Costos descontrolados**: alguien deja un cron loopeando. Mitigación:
   budget alert Anthropic + maxTokens hard limit en cada call.
3. **Mal hábito de auto-send**: tentación de "ya está bien, mandalo solo".
   Mitigación: regla 1 inflexible 6 meses mínimo.
4. **Stack que se pudre**: n8n self-host requiere updates. Mitigación: si
   pesa, migrar a Make.com (USD 10/mes managed).
5. **Spec creep al producto**: tentación de "ya que tengo el agente, lo
   meto al producto". Mitigación: PRD 24 viejo está archivado; reactivarlo
   solo con go-ahead explícito + 3+ dominios internos validados.

---

## Sources / referencias rápidas

- Diana Hu (YC) — *AI as the company's operating system*: tesis aplicada aquí
  internamente, no al producto. Memo completo:
  [`research/AI_NATIVE_AND_LOOPS_2026.md`](./research/AI_NATIVE_AND_LOOPS_2026.md).
- Pete Koomen — *AI Horseless Carriages*: aplicado a sales = nada de "mejor
  CRM con AI bolted", mejor *operar sin CRM clásico, con loops de drafts*.
- *Don't Build Multi-Agents* (Cognition): aplicado aquí = un loop por tarea,
  no orchestrators tempranos.
