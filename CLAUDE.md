# vuoo-v2

Plataforma SaaS de ruteo y logística de última milla. Stack: React 19 + TypeScript + Vite + Tailwind v4 + Supabase (Postgres/Auth/Realtime/RLS) + Mapbox GL. Optimización (Vroom + OSRM) en Railway. App móvil en `/mobile` (Expo/React Native).

## Estado del producto: pre-clientes

**Todavía no tenemos clientes en producción.** No hay datos reales que proteger, no hay usuarios que se rompan, no hay contratos de retrocompatibilidad. Esto cambia cómo debes trabajar:

- **Sé agresivo con los cambios.** Refactoriza módulos enteros, renombra cosas, mueve archivos, borra código muerto sin pedir permiso. Prefiere rehacerlo bien antes que parchar.
- **Sin shims de retrocompatibilidad.** No mantengas APIs viejas "por si acaso". Si cambias una signature, actualiza todos los call sites en el mismo PR.
- **Sin feature flags defensivos.** Si el código nuevo es mejor, reemplaza el viejo. No mantengas ambos caminos.
- **Migraciones de DB destructivas están bien.** Drop columns, rename tables, cambiar tipos — la base se puede resetear. No escribas migraciones reversibles ni backfills elaborados a menos que se pida explícitamente.
- **Romper la app local es aceptable** si el resultado es código más limpio. Avisa qué se rompió y cómo rearmarlo, no inventes capas de compatibilidad.
- **Tests viejos que estorben al refactor: bórralos** y escribe nuevos sobre la forma final. No retuerzas el código para mantener verde un test obsoleto.

Lo único que **sí** importa cuidar:
- No romper el flujo de desarrollo (tipos, build, lint deben pasar al terminar).
- No borrar trabajo no commiteado del usuario.
- Las reglas de `.claude/rules/` (arquitectura, estilo) — la agresividad es para mover masa de código, no para violar las convenciones.

Cuando dudes entre "refactor grande y limpio" vs. "parche quirúrgico", elige el refactor.

## Reglas del proyecto

Antes de tocar código, lee las reglas en [`.claude/rules/`](./.claude/rules/):

- [`01-architecture.md`](./.claude/rules/01-architecture.md) — Clean Architecture y vertical slicing por feature.
- [`02-code-style.md`](./.claude/rules/02-code-style.md) — TypeScript, React, naming, imports.
- [`03-presentation.md`](./.claude/rules/03-presentation.md) — features, hooks, Tailwind, mapas.
- [`04-data-services.md`](./.claude/rules/04-data-services.md) — services, Supabase, Vroom/OSRM, realtime.

## Utilidades reutilizables

- `src/presentation/components/MapErrorBoundary.tsx` — error boundary para mapas Mapbox GL. Envolver `<RouteMap>` y `<SimpleMap>` para evitar whitescreen en navegadores sin WebGL o cuando la inicialización falla. Ya aplicado en `ControlPage`, `PlanDetailPage`, `StopsPage`. La pública `TrackingPage` usa `mapboxgl.supported()` + try/catch inline en vez del boundary.
- `src/application/utils/errorMessages.ts` — `userMessage(raw)` traduce errores crudos de Supabase/red a copy en español (network, 401/403/jwt, duplicate key, RLS, schema-cache/404, timeout). Envolver `res.error` con esto antes de renderizarlo al usuario.

## Deuda técnica conocida

Los agujeros del código (bugs no resueltos, atajos, supuestos frágiles, validaciones faltantes) viven en [`docs/debt/`](./docs/debt/). Reglas:

1. **Antes de tocar un área**, revisa [`docs/debt/README.md`](./docs/debt/README.md) por entradas relacionadas.
2. **Al detectar un agujero nuevo que decides no arreglar ahora**, créalo en `docs/debt/NNNN-slug.md` (copia `_TEMPLATE.md`) y agrégalo a la tabla del README **antes de seguir con el cambio**. No es opcional.
3. **Al cerrar deuda** en un PR, mueve la entrada de `Abiertos` a `Resueltos` en el mismo PR.

## Package manager

**Siempre `pnpm`, nunca `npm` ni `yarn`.** Aplica a instalar deps, correr scripts y ejecutar binarios:

- `pnpm install` / `pnpm add <pkg>` / `pnpm remove <pkg>`
- `pnpm run <script>` (o `pnpm <script>` para scripts en `package.json`)
- `pnpm dlx <pkg>` en vez de `npx`

El lockfile es `pnpm-lock.yaml`. No commitear `package-lock.json` ni `yarn.lock` si aparecen — borrarlos.

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
