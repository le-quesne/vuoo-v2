# vuoo-v2

Plataforma SaaS de ruteo y logística de última milla. Stack: React 19 + TypeScript + Vite + Tailwind v4 + Supabase (Postgres/Auth/Realtime/RLS) + Mapbox GL. Optimización (Vroom + OSRM) en Railway. App móvil en `/mobile` (Expo/React Native).

## Reglas del proyecto

Antes de tocar código, lee las reglas en [`.claude/rules/`](./.claude/rules/):

- [`01-architecture.md`](./.claude/rules/01-architecture.md) — Clean Architecture y vertical slicing por feature.
- [`02-code-style.md`](./.claude/rules/02-code-style.md) — TypeScript, React, naming, imports.
- [`03-presentation.md`](./.claude/rules/03-presentation.md) — features, hooks, Tailwind, mapas.
- [`04-data-services.md`](./.claude/rules/04-data-services.md) — services, Supabase, Vroom/OSRM, realtime.

## gstack (recommended)

This project uses [gstack](https://github.com/garrytan/gstack) for AI-assisted workflows.
Install it for the best experience:

```bash
git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup --team
```

Skills like /qa, /ship, /review, /investigate, and /browse become available after install.
Use /browse for all web browsing. Use ~/.claude/skills/gstack/... for gstack file paths.
