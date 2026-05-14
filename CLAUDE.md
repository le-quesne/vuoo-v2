# vuoo-v2

Plataforma SaaS de ruteo y logística de última milla. Stack: React 19 + TypeScript + Vite + Tailwind v4 + Supabase (Postgres/Auth/Realtime/RLS) + Mapbox GL. Optimización (Vroom + OSRM) en Railway. App móvil en `/mobile` (Expo/React Native).

## Reglas del proyecto

Antes de tocar código, lee las reglas en [`.claude/rules/`](./.claude/rules/):

- [`01-architecture.md`](./.claude/rules/01-architecture.md) — Clean Architecture y vertical slicing por feature.
- [`02-code-style.md`](./.claude/rules/02-code-style.md) — TypeScript, React, naming, imports.
- [`03-presentation.md`](./.claude/rules/03-presentation.md) — features, hooks, Tailwind, mapas.
- [`04-data-services.md`](./.claude/rules/04-data-services.md) — services, Supabase, Vroom/OSRM, realtime.

## Utilidades reutilizables

- `src/presentation/components/MapErrorBoundary.tsx` — error boundary para mapas Mapbox GL. Envolver `<RouteMap>` y `<SimpleMap>` para evitar whitescreen en navegadores sin WebGL o cuando la inicialización falla. Ya aplicado en `ControlPage`, `PlanDetailPage`, `StopsPage`. La pública `TrackingPage` usa `mapboxgl.supported()` + try/catch inline en vez del boundary.
- `src/application/utils/errorMessages.ts` — `userMessage(raw)` traduce errores crudos de Supabase/red a copy en español (network, 401/403/jwt, duplicate key, RLS, schema-cache/404, timeout). Envolver `res.error` con esto antes de renderizarlo al usuario.

## Git workflow

Siempre trabajar con ramas de feature, nunca pushear directo a `main`:

1. Crear rama antes de tocar código: `git checkout -b feat/<nombre>` (o `fix/`, `chore/`).
2. Hacer commits en la rama.
3. Al shipper: abrir PR de la rama hacia `main` con `gh pr create --base main`.
4. No mergear directo a `main` desde la CLI — el PR se revisa/aprueba en GitHub.

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
