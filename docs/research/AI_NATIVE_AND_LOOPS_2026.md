# AI-Native Company & AI Loops — memo de investigación (Mayo 2026)

> Documento de referencia. Síntesis técnica de fuentes primarias 2025–2026.
> Acompaña al PRD ejecutable: [`24_ARQUITECTURA_AI_NATIVE.md`](../24_ARQUITECTURA_AI_NATIVE.md).

---

## Resumen ejecutivo

**AI-native** no es un buzzword. Es una decisión arquitectónica con tres caras:

1. **Producto** — la IA es el sustrato, no un feature. Si la sacás, el producto no funciona, no degrada (test CRV).
2. **Empresa** — workflows closed-loop y "queryable": cada acción genera artefactos consultables por una capa de inteligencia que aprende continuamente (Diana Hu, YC).
3. **Software** — el patrón fundamental es el **AI loop**: `input → razonamiento → acción → observación → reflexión → output`, anidado con eval loops y data flywheel para mejorar con el uso (Karpathy, Anthropic, Huyen).

El anti-patrón opuesto es el **"horseless carriage"** (Pete Koomen, YC GP): pegarle IA a software diseñado para humanos manuales. La mayoría de las "AI features" de 2024–2025 son horseless carriages.

Para una SaaS vertical como vuoo (logística última milla), la oportunidad **no** es agregar un chatbot al planner. Es rediseñar el operating system de la empresa logística — propia y la del cliente — para que dispatcher + chofer + cliente final + soporte estén orquestados por una capa de agentes con human-in-the-loop, con data flywheel desde día 1.

---

# Parte 1 — AI-Native Company

## 1.1 Definición canónica

**Diana Hu (YC partner), *The Playbook for Building an AI-Native Company* (2026):**
> "AI is not the new Excel. It is the new operating system."

> "AI as the company's operating system" — donde cada workflow, cada decisión, cada proceso fluye a través de una capa inteligente que aprende y mejora.

**CRV, *What is AI-Native? The Founder's Guide* (2026):**
> "An AI-native company is one where artificial intelligence isn't a feature or an enhancement, but the architectural foundation on which the entire product depends."

Distinciones operativas:

| Concepto | Definición | Ejemplo logística |
|----------|-----------|------------------|
| **AI-native** | IA es la fundación arquitectónica | Loop.com: DUX™ es el corazón del producto |
| **AI-enabled** | Software preexistente con módulos IA agregados | TMS legacy + módulo "AI suggestions" |
| **AI-wrapper** | Capa fina sobre foundation model sin valor propio | "Chat con Claude sobre tus rutas" |

## 1.2 Tests para validar

**Remove-the-AI Test (CRV):**
> "If you remove the AI, does the product cease to function? Not degrade, not lose a nice feature, but stop working entirely."

**Model Improvement Test (CRV):**
> "When the models get better, are you happy or sad? If improving foundation models automatically makes your product more valuable, you're building AI-native."

**Aplicado a vuoo hoy (Mayo 2026):** si removemos los modelos, queda planner + Vroom + mapa. Funciona. → **vuoo es AI-enabled, no AI-native**. Esto no es un juicio negativo; es el punto de partida para decidir cuáles workflows reconstruir AI-native.

## 1.3 Propiedades constitutivas (intersección de fuentes)

1. **IA como capa fundacional**, no feature.
2. **Producto agéntico**: ejecuta acciones, no solo aconseja.
3. **Feedback loops persistentes** ("data flywheel").
4. **Mejora con cada nueva generación de modelo** sin re-arquitectura.
5. **Usuario configura el agente** (system prompts, tools, guardrails), no solo lo consume (Koomen).
6. **Pricing por outcome**, no por seat (Sierra, Emergence Capital).
7. **Headcount concentrado en engineering + data + ops integrado**; ventas magras (Emergence, Cursor benchmark).

## 1.4 Closed-loop vs Open-loop (Diana Hu)

**Open-loop:**
> "Decisions get made, work gets done, but not systematically measured, and outcomes are interpreted manually by humans pushing status updates uphill."

**Closed-loop:**
- Cada acción genera datos estructurados.
- Agentes leen continuamente esos datos.
- El sistema se mejora automáticamente.
- Self-regulating: monitorea outputs, retroalimenta al sistema IA, refina procesos futuros (control theory aplicada).

**Vuoo hoy** es **mayormente open-loop** en el sentido Hu: las decisiones de dispatch se toman, se ejecutan, pero la mejora del sistema depende de que el equipo recoja feedback por WhatsApp y manualmente cambie prompts/reglas/SQL.

## 1.5 Queryable organization

**Diana Hu:** *"the organization has to be legible to AI"*.

Requisitos:
- Cada acción genera artefacto consultable (no decisiones verbales).
- Centralización de información en dashboards unificados.
- Eliminación de silos (minimizar emails/DMs no estructurados).
- Agentes embebidos en canales de comunicación.

**Para vuoo:** ya hay buena parte de ground truth en Supabase (plans, stops, routes, events). Falta:
- Decisiones del dispatcher (por qué reasignó X, por qué pinó Y).
- Feedback semántico estructurado (no campos de texto libre).
- Resultados de cada acción del agente (que aún no existe).

## 1.6 Métricas y productividad

Hu cita: *"one person with AI tools can equal 1000x Google engineers"* y *"If your API bill doesn't make you uncomfortable, you're not doing enough"*.

Más concreto, Garry Tan / Lightcone: las **Vertical AI Agents pueden ser 10x más grandes que SaaS** porque no venden software al operador del workflow — reemplazan al operador (o lo amplifican 10–1000x).

YC RFS Summer 2026 — *AI-Native Service Companies*:
> "AI-native companies that don't sell software—they sell the service."

**Implicación para vuoo:** el pricing y posicionamiento que ganan no son "USD X por vehículo/mes" (SaaS clásico) sino "USD X por entrega exitosa" o "USD X por ruta optimizada y dispatchada".

## 1.7 Anti-patrón: Horseless Carriage (Pete Koomen, YC GP)

> "Whenever a new technology is invented, the first tools built with it inevitably fail because they mimic the old way of doing things."

> "Generative AI models are not actually that useful for generating text."

> "Most AI apps should be agent builders, not agents."

> "Writing programs is hard. Writing system prompts is easy."

Tesis aplicable directamente a logística:

| Horseless carriage | AI-native |
|---|---|
| "Optimizar rutas con un clic" | Dispatcher escribe en lenguaje natural sus reglas; agente las aplica e iterativamente mejora |
| Chatbot al costado del planner | Agente con tools que actúa sobre el plan; humano supervisa, edita, escala |
| Razón de fallo en dropdown rígido | Chofer dice por voz qué pasó; agente categoriza y propone acción |
| Reports mensuales para revisión humana | Agente detecta desviaciones, propone fixes, ejecuta los reversibles |

## 1.8 Karpathy: Software 3.0 frame

- **Software 1.0**: código escrito por humanos.
- **Software 2.0**: pesos neuronales entrenados.
- **Software 3.0**: prompts como programas. Inglés es el nuevo lenguaje de programación.

> "Software 3.0 está comiendo 1.0/2.0."
> "Una enorme cantidad de software será reescrita."

Para vuoo, esto **no** significa "reescribir todo Vroom en prompts". Vroom es Software 1.0 robusto para optimización combinatoria — eso queda. Lo que cambia es **la capa que conecta humanos, datos y Vroom**: hoy son formularios, modales y SQL; mañana es lenguaje natural + tools.

**Autonomy slider (Karpathy):** producto debe permitir graduar autonomía — manual → suggest → execute con confirmación → execute autónomo con kill switch. Cursor lo hace (Tab → Cmd+K → Cmd+L → Agent mode); Perplexity también (search → research → deep research). Vuoo debe.

---

# Parte 2 — AI Loops (la primitiva técnica)

## 2.1 Definición y anatomía

Un **AI loop** es un ciclo `input → razonamiento → acción → observación → reflexión → output`, con estado persistente entre iteraciones, terminado por un criterio de éxito o un guardrail (max iteraciones, max budget, max tiempo).

Es la primitiva universal de cualquier producto AI-native moderno. Karpathy: el gap entre demo y producto se cierra con loops rápidos de **generación-verificación**.

## 2.2 Taxonomía — no confundir

| Loop | Frecuencia | Quien cierra | Qué optimiza |
|---|---|---|---|
| **Agentic loop** | seg–horas | el agente (tool-use) | resolver una tarea |
| **Reflection loop** | dentro de una tarea | el LLM (auto-crítica) | calidad de respuesta |
| **Eval loop** | continuo | scoring system (LLM-judge + humanos) | detectar regresiones |
| **Data flywheel** | días–meses | producto + usuarios | mejorar el modelo con uso real |
| **RLHF / RLAIF** | semanas | trainers + reward model | alinear el modelo base |

Las cuatro primeras se anidan: agentic emite trazas → eval evalúa → flywheel alimenta dataset → mejora prompt/few-shot/fine-tune.

## 2.3 Los 5 patrones canónicos de Anthropic

Fuente: **Anthropic — *Building Effective Agents*** (Schluntz & Zhang, dic-2024).

Distinción base:
- **Workflows**: orquestación predefinida del control flow.
- **Agents**: el LLM dirige su propio control flow basado en feedback.

Principio guía:
> "Start with simple prompts, optimize them with comprehensive evaluation, and add multi-step agentic systems only when simpler solutions fall short."

**Patrones:**

1. **Prompt chaining** — secuencia de pasos LLM. *Vuoo:* extraer dirección → geocodificar → validar → asignar.
2. **Routing** — clasificar input, dirigir a workflow especializado. *Vuoo:* clasificar tipo de incidente (cliente ausente / vehículo roto / dirección errónea) → distinto playbook.
3. **Parallelization** — *sectioning* (subtareas independientes) + *voting* (múltiples intentos, agregar). *Vuoo:* validar 1000 direcciones en paralelo; o pedir 3 propuestas de re-ruteo y elegir la mejor.
4. **Orchestrator-workers** — LLM central descompone tareas dinámicamente y delega a workers. *Vuoo:* agente de torre de control descompone "atender 5 alertas" en sub-decisiones.
5. **Evaluator-optimizer** — un LLM genera, otro evalúa, loop iterativo. *Vuoo:* generar mensaje al cliente con propuesta de reagendamiento, otro LLM critica tono y precisión.

## 2.4 Patrones académicos canónicos

| Patrón | Origen | Cuándo aplica en vuoo | Cuándo NO aplica |
|---|---|---|---|
| **ReAct** (Reasoning + Acting) | Yao et al., ICLR 2023 | Agente de torre de control con tools (getRoutes, reassignStop, notifyDriver) | Tareas de clasificación simple (gasta tokens sin ganancia) |
| **Reflexion** | Shinn et al., NeurIPS 2023 | Optimización viola constraints → agente lee error de Vroom, reflexiona y reformula | Sin señal clara de éxito/fracaso |
| **Tree of Thoughts** | Yao et al., NeurIPS 2023 | Decidir entre reasignar a A, B, o consolidar mañana | Tareas lineales (explota costo) |
| **Plan-and-Execute** | Wang et al., 2023 | Armar reporte semanal del cliente | Espacio de acciones cambia con cada observación (usar ReAct) |
| **Evaluator-Optimizer** | Anthropic | Refinar copy de notificaciones al cliente final | Decisiones hard-constraint (las hace el optimizador) |
| **Multi-agent debate** | Liang et al., 2023 | **Casi nunca** en producto vertical | Casi siempre — ver anti-patrones §6 |

## 2.5 Data flywheel — mecánica completa

**Chip Huyen** (*AI Engineering*, O'Reilly 2025):
> Un data flywheel es el ciclo `uso del producto → datos propietarios → mejor modelo/producto → más uso`. Es el moat real; los moats de modelo base "están sobre arena movediza" — la próxima generación los borra.

**Componentes:**

1. **Ingesta de interacciones** con consentimiento + trazabilidad (input, output, contexto, identidad, timestamp).
2. **Señales implícitas** (aceptación, edición, abandono, retry) + **explícitas** (👍/👎, corrección).
3. **Curación/etiquetado** semi-automatizado (LLM-judge sugiere, humano valida borderline).
4. **Datasets de evals** versionados (golden set + adversariales + producción muestreada).
5. **Mejora del producto**: re-prompting → few-shot dinámico → fine-tuning/LoRA → eventual RL.
6. **Despliegue gradual** (A/B, shadow, canary) con métricas atadas al ciclo.

**Cold start (sin datos):**
1. Hardcodear MVP con LLM frontier + prompts cuidados.
2. Instrumentar TODO desde día 1 (Langfuse/Braintrust/Helicone/PostHog).
3. Diseñar UX con **señales implícitas naturales** — la lección de Cursor: "Aceptar/Rechazar sugerencia" es señal gratuita y de altísima calidad. Copilot mide retención de código a 30s/2min/5min/10min.
4. Cerrar el loop semanal: revisar 50 trazas → escribir 5 evals nuevos → mejorar prompts.

**Señales más valiosas en vuoo:**
- ¿Dispatcher aceptó la ruta propuesta o la editó? (cuánto editó)
- ¿La ETA predicha coincidió con la real?
- ¿La reasignación sugerida por el agente de torre se aplicó?
- ¿El POD inferido por foto coincidió con la confirmación humana?
- ¿La razón de fallo categorizada por el agente fue aceptada por ops?

**Medición correcta:** NO uses DAU/MAU. Usá:
- **Acceptance rate** por feature.
- **Edit distance** (cuánto modificó el humano).
- **Time-to-action** (cuánto tarda en decidir).
- **Outcome metrics** (% entregas a tiempo, km/parada, costo/orden).

Sequoia (2025): *"data flywheels matter, but they must connect directly to measurable business outcomes."*

## 2.6 Benchmark — Loop.com / NVIDIA Data Flywheel Blueprint

**Loop.com** (AI-native logistics — freight audit + intelligence):
- DUX™ — modelo entrenado con millones de documentos logísticos.
- 99% touchless automation.
- Multi-model consensus (general-purpose + fine-tuned).
- Entity linking propietario (BOL → POD → invoice).
- Feedback continuo del cliente → mejora modelo.
- Posicionamiento: NO compite como TMS; se vende como "data + automation layer".

**NVIDIA Data Flywheel Blueprint** (open source, github):
1. **Data Collection & Logging** — prompts, outputs, correcciones, retrieval logs, feedback scores.
2. **Evaluation Infrastructure** — batch offline evals → online evals → promotion gate humano.
3. **Fine-tuning Small Models** — distilación de modelos grandes a 1B–8B para hot paths.
4. **Production Deployment** — promoción es decisión humana.
5. **Resultado típico:** 94–96% accuracy con 1B–8B params (vs 70B), **98% cost saving, 70x lower latency**.

## 2.7 Eval loops — tres tiers

Consenso de industria (Braintrust, Langfuse, Inspect):

1. **Tier 1 — Determinísticos**: regex, schema, JSON-valid, "¿llamó el tool correcto?". Baratos, rápidos, hard truth.
2. **Tier 2 — LLM-as-judge**: calidad subjetiva con rúbrica clara. Reglas:
   - Rúbrica explícita + ejemplos good/bad.
   - Chain-of-thought obligatorio.
   - **Judge ≠ modelo evaluado** (correlated errors).
3. **Tier 3 — Humano**: muestreo estratificado de producción + casos donde tier 1/2 disienten. Calibra al judge.

**Offline evals** corren en CI/CD → bloquean merge si baja score con significancia estadística.

**Online evals** corren async sobre 1–5% del tráfico → detectan drift y regresiones de prompts.

**LLM-as-judge funciona para:** preferencia relativa, conformidad a rúbrica, fallas evidentes.
**No funciona para:** juicio numérico fino, ranking de >5 ítems sin bias posicional, judge con datos similares al evaluado.

## 2.8 Human-in-the-loop vs Human-on-the-loop

- **HITL**: cada acción riesgosa requiere aprobación explícita → approval queue.
- **Human-on-the-loop**: agente actúa autónomamente, humano supervisa dashboard con kill-switch.

**Regla:**
- Acciones reversibles → autónomas.
- Acciones irreversibles o con impacto en cliente final → HITL hasta tener confianza estadística.

**Para vuoo:**
- Reordenar paradas internas = autónomo.
- Notificar al cliente final con cambio de ETA = HITL.
- Reasignar > 5 paradas entre choferes = HITL (impacta worklog).
- Marcar dirección como problemática = autónomo (acción reversible).
- Cancelar entrega = nunca autónomo.

---

# Parte 3 — Stack 2025–2026

## 3.1 Frameworks de agentes

| Framework | Fuerte en | Débil en | Veredicto vuoo |
|---|---|---|---|
| **Mastra** (TS) | TS-first, Vercel-native, tipado fuerte, 19k stars | Joven, comunidad menor | **Recomendado** — stack actual es React/TS/Supabase |
| **LangGraph** (Py/TS) | Graph-based, durable, HITL nativo (interrupts), serio | Verbose, curva de aprendizaje | Plan B si Mastra queda corto |
| **CrewAI** | Role-based, prototipo rápido | Error-handling, checkpointing débiles | Solo prototipos |
| **OpenAI Agents SDK** | Integrado al ecosistema OpenAI | Lock-in | Evitar |
| **Claude Agent SDK** | Anthropic-native | Joven | Considerar si te casás con Claude |

## 3.2 Orquestación durable (debajo del framework)

| Tool | Cuándo | Cuándo NO |
|---|---|---|
| **Inngest** | Event-driven, durable, menor ceremonia, bueno para empezar | Workflows multi-día críticos |
| **Trigger.dev** | TS-first, dev experience pulida | Similar a Inngest, elegir uno |
| **Temporal** | Multi-día, auditoría fuerte, fault tolerance enterprise | Curva alta, sobrekill para vuoo hoy |
| **LangGraph state** | Si ya usás LangGraph, su checkpointer sirve | Estado se pierde mid-node si crashea |

**Hybrid 2026 standard:** Temporal (macro) + LangGraph/Mastra (micro) para multi-hora con razonamiento.

**Para vuoo (recomendación):** **Mastra + Inngest + Langfuse**. Simple, TS-native, escalable, observabilidad de primera clase.

## 3.3 Observabilidad LLM

| Tool | Tipo | Bueno para vuoo |
|---|---|---|
| **Langfuse** | Open-source, OTEL-native, async | **Sí** — auto-hostable en Railway al lado del backend |
| **Braintrust** | Best-in-class evals + experimentos | Sí, pero pago — esperar PMF |
| **Helicone** | Proxy + observability barato | Solo si tenés muchos providers |
| **PostHog LLM** | Integrado al PostHog que ya tenés | Sí, para análisis producto + LLM en mismo lugar |
| **Inspect** (Anthropic) | Formal evals | Para evals serios pre-deploy |

## 3.4 Control de costos (token explosion)

**Hard limits obligatorios:**
- `maxIterations = 8` (configurable por loop).
- `maxTokens = 50k` total por run.
- `maxUsd = 0.30` por run, escalación a humano si lo toca.

**Compactación de contexto:** cada N pasos, resumir traza vieja con modelo más barato (Haiku 4.5).

**Routing por dificultad:**
- Haiku 4.5 / GPT-4.1-mini → clasificación + tools triviales.
- Sonnet 4.6 → razonamiento estándar.
- Opus 4.7 → solo casos escalados.

**Caching agresivo:**
- Anthropic prompt caching: 50–90% descuento en system prompts repetidos.
- OpenAI cached input.
- Para vuoo: sistema-prompt por org cacheado (no cambia) + contexto operacional fresco.

**Batch API:** para evals offline y reportes nocturnos.

---

# Parte 4 — Anti-patrones (críticos)

1. **Horseless Carriage** (Koomen) — UI vieja + LLM jammed. Si el usuario escribe instrucciones más largas que la tarea misma, es horseless. *En vuoo:* "Generá un mensaje para el chofer X" cuando el dispatcher puede escribirlo más rápido a mano.

2. **Thin Wrapper Trap** (CRV) — sin data propietaria, sin workflow propio, sin evals propios → muere cuando OpenAI ship la próxima versión. *En vuoo:* fácil de evitar — los datos operacionales son el moat.

3. **Chat-first como default** (Koomen, Karpathy) — chat es lo más fácil de construir y lo peor para la mayoría de workflows operativos. Logística no es chat — es mapa + lista + acciones. El agente debe ser invocable desde el contexto, no desde un sidebar.

4. **Multi-agent prematuro** (Cognition, *Don't Build Multi-Agents*, jun-2025) — contexto disperso, decisiones contradictorias, debugging imposible. Consenso 2026: **un agente con contexto completo que spawnea subagentes efímeros aislados**, no peer-to-peer. *Para vuoo:* empezá con un agente por feature antes de "comité".

5. **No medir → no mejorar** — sin evals no sabés si el cambio mejoró o empeoró. Sin tracing no sabés por qué falló. Sin señales implícitas no hay flywheel.

6. **LLM-as-judge mal calibrado** — mismo modelo como judge y como evaluado, rúbrica vaga, sin CoT, sin calibración humana → métricas que mienten.

7. **Autonomía sin reversibilidad** — dejar que el agente mande WhatsApp al cliente desde día 1. Empezar en *shadow* (genera el mensaje, lo escribe en DB, NO lo envía) → HITL → autónomo con kill switch.

8. **Optimizar el LLM en vez del producto** (Karpathy) — el gap demo-producto se cierra con UX de verificación rápida, no con un prompt más largo. En vuoo: el dispatcher debe poder aceptar/editar/rechazar una sugerencia en < 5 segundos.

9. **Loop infinito sin guardrail** — clásico "agent stuck fixing a bug, burns $300 in API credits". Siempre `maxSteps + maxBudget + maxWallTime + circuit breaker`.

10. **Delegación recursiva sin supervisor** — agentes que spawnean agentes que spawnean agentes. Siempre nodo raíz con contexto y autoridad.

---

# Parte 5 — Estado de vuoo (Mayo 2026) en el espectro AI-native

**Tests aplicados:**

| Test | Resultado vuoo |
|---|---|
| Remove-the-AI | ❌ El producto sigue funcionando sin IA → **AI-enabled, no AI-native** |
| Model Improvement | ❌ Mejor Claude no hace mejor a vuoo automáticamente |
| Closed-loop (Hu) | ⚠️ Parcial — el `event_log` existe pero no alimenta nada |
| Queryable (Hu) | ⚠️ Parcial — datos en Supabase sí, decisiones del dispatcher no |
| Horseless Carriage | ⚠️ Riesgo alto si se siguen tactical de PRDs 13–22 sin repensar UX |

**Conclusión:** vuoo tiene una base operacional sólida (planificador + Vroom + mobile + torre de control). La oportunidad AI-native **no es reemplazar todo eso**, es:

1. Construir la **capa de inteligencia** que orquesta esos componentes.
2. Convertir el `event_log` en un data flywheel real.
3. Empezar con 1–2 agentes en producción con HITL estricto, observabilidad y evals desde día 1.
4. Si funciona, mover el slider de autonomía y expandir.

**El siguiente paso ejecutable está en [PRD 24](../24_ARQUITECTURA_AI_NATIVE.md).**

---

# Fuentes

## AI-Native company

- [Pete Koomen — *AI Horseless Carriages*](https://koomen.dev/essays/horseless-carriages/) — esencial
- [CRV — *What Is AI-Native? The Founder's Guide* (2026)](https://www.crv.com/content/what-is-ai-native)
- [Diana Hu (YC) — *The Playbook for Building an AI Native Company*](https://www.ycombinator.com/library/OX-the-playbook-for-building-an-ai-native-company)
- [Diana Hu via StartupHub — *Closed-Loop Systems*](https://www.startuphub.ai/ai-news/artificial-intelligence/2026/build-ai-native-companies-with-closed-loop-systems)
- [Vocap — *Watch This: Diana Hu on Building an AI-Native Company*](https://www.vocap.vc/insights/watch-this-diana-hu-on-building-an-ai-native-company)
- [Garry Tan / Lightcone — *Vertical AI Agents 10x Bigger Than SaaS*](https://www.ycombinator.com/library/Lt-vertical-ai-agents-could-be-10x-bigger-than-saas)
- [Emergence Capital — *The AI-Native Services Playbook*](https://www.emcap.com/thoughts/the-ai-native-services-playbook)
- [YC Requests for Startups (Summer 2026)](https://www.ycombinator.com/rfs)
- [TechCrunch — *YC W25: 25% of startups have 95% AI-generated codebases*](https://techcrunch.com/2025/03/06/a-quarter-of-startups-in-ycs-current-cohort-have-codebases-that-are-almost-entirely-ai-generated/)

## Karpathy Software 3.0

- [Karpathy — *Software Is Changing (Again)* YC AI Startup School](https://www.ycombinator.com/library/MW-andrej-karpathy-software-is-changing-again)
- [Latent.Space — transcripción y análisis](https://www.latent.space/p/s3)

## Agentes y loops

- [Anthropic — *Building Effective Agents* (Schluntz & Zhang)](https://www.anthropic.com/research/building-effective-agents)
- [Simon Willison — notas sobre Building Effective Agents](https://simonwillison.net/2024/Dec/20/building-effective-agents/)
- [Chip Huyen — *AI Engineering* (O'Reilly 2025)](https://www.oreilly.com/library/view/ai-engineering/9781098166298/)
- [Cognition — *Don't Build Multi-Agents*](https://cognition.ai/blog/dont-build-multi-agents)
- [Hugging Face — *Reflection in AI agents* (ReAct + Reflexion + ToT)](https://huggingface.co/blog/Kseniase/reflection)

## Data flywheel

- [NVIDIA Data Flywheel Blueprint (GitHub)](https://github.com/NVIDIA-AI-Blueprints/data-flywheel)
- [NVIDIA Glossary — *Data Flywheel*](https://www.nvidia.com/en-us/glossary/data-flywheel/)
- [Sequoia — *Generative AI's Act Two*](https://sequoiacap.com/article/generative-ai-act-two/)
- [OpenAI Cookbook — *Building resilient prompts using an evaluation flywheel*](https://cookbook.openai.com/examples/evaluation/building_resilient_prompts_using_an_evaluation_flywheel)
- [Jason Liu — *Data Flywheel Go Brrr*](https://jxnl.co/writing/2024/03/28/data-flywheel/)

## Stack

- [LangGraph vs Temporal 2026](https://agentmarketcap.ai/blog/2026/04/08/langgraph-vs-temporal-long-running-agent-workflows-2026)
- [Speakeasy — *LangChain vs LangGraph vs CrewAI vs Mastra*](https://www.speakeasy.com/blog/ai-agent-framework-comparison)
- [Langfuse — open-source observability for LLM agents](https://langfuse.com/)
- [Braintrust — evals platform](https://www.braintrust.dev/)

## Logistics benchmarks

- [Loop.com — Logistics AI platform (DUX)](https://www.loop.com/technology/loop-ai)
- [Inbound Logistics — *Agentic AI in Last-Mile Delivery*](https://www.inboundlogistics.com/articles/how-agentic-ai-is-redefining-route-optimization-in-last-mile-delivery/)
- [Nash — built for the reality of logistics](https://www.nash.ai/)
