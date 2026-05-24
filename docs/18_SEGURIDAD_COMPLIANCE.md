# PRD 18 — Seguridad & Compliance

**Pri**: P1 (§A hardening inmediato) / P2 (§B RLS nativo) / P2 (§C
certificaciones)
**Estado**: RLS básico activo. Múltiples gaps abiertos. Sin certificaciones.

---

## Contexto

La plataforma corre con RLS básica de Supabase y JWT, pero hay agujeros
identificados:

- `send-push` no valida que los `user_ids` del payload sean drivers de la
  org del caller (un user autenticado puede spamear choferes de otras orgs).
- RLS permite UPDATE a `plans` a cualquier miembro; un chofer podría
  publicar/despublicar planes.
- Mobile no filtra `plan.status='published'` → pantalla abierta sigue
  viendo datos despublicados.
- Visibilidad de planes depende del cliente filtre correctamente
  (Approach A) en lugar de RLS nativo (Approach B).
- Sin SOC 2 / ISO 27001 → techo de venta enterprise en USD 30–50k/año.
- PII (address, customer_name) se loggea sin masking en Railway.

---

## Objetivos

1. Cerrar gaps de autorización conocidos en Edge Functions y RLS.
2. Migrar visibilidad de planes a RLS nativo (no dependiente del cliente).
3. PII masking en logs y audit trails.
4. Iniciar proceso de certificación SOC 2 Type II e ISO 27001:2022.

---

## Scope IN

### §A — Hardening inmediato (P1)

**A.1 — Autorización en `send-push` Edge Function**
- Hoy verifica JWT pero no que los `user_ids` del payload pertenezcan a la
  org del caller.
- Agregar: query `select org_id from organization_members where user_id in (...)`
  y validar que todos sean de la org del JWT.
- 401 si no.
- **Source**: TODOS plan.status P2.

**A.2 — RLS publish/unpublish solo admin/owner**
- Política actual `"Members can update plans"` permite UPDATE a cualquier
  miembro autenticado.
- Modificar policy `UPDATE` en `plans` con `WITH CHECK (is_org_admin())`.
- Permitir UPDATE en campos no-críticos (notas) a otros roles vía
  political separada si hace falta.
- **Source**: TODOS plan.status P2.

**A.3 — Audit log inmutable**
- Tabla `audit_log(id, org_id, user_id, action, entity, entity_id, before jsonb, after jsonb, created_at)`.
- Trigger Postgres en tablas críticas (`plans`, `routes`, `stops`, `users`,
  `organization_members`, `org_api_tokens`, `org_connectors`).
- Append-only (revocar DELETE/UPDATE).
- Retention 7 años (compliance regulatorio common).

**A.4 — Filtrar PII en logs Railway**
- Hashear `address` con SHA-256 antes de loguear.
- Omitir `customer_name`, `phone`, `email` de `console.*` y warnings.
- Aplicar en `ordersImport.ts` primero, luego barrer resto de backend.
- **Source**: TODOS QA P2, /plan-ceo-review 2026-04-26 §3A.

**A.5 — Secrets rotation policy**
- Documentar proceso de rotación: Supabase service role, Mapbox, OSRM,
  Vroom Railway, Meta WhatsApp token, Resend API key.
- Schedule cuatrimestral.
- Tooling: doppler o GitHub Encrypted Secrets + checklist trimestral.

### §B — RLS nativo (P2)

**B.1 — Migración Approach A → Approach B (visibilidad de planes)**
- Hoy mobile filtra `plan.status='published'` en el cliente.
- Mover a RLS: policy `SELECT` en `routes` que filtra por
  `plan.published_at is not null`.
- Visibilidad garantizada en DB → bug en cliente no expone borradores.
- Aplicar mismo principio a `stops`, `route_events`.
- **Source**: TODOS plan.status P3.

**B.2 — Mobile filtra `plan.status` en route detail**
- `route/[id]/index.tsx` no filtra hoy. Un chofer con pantalla abierta
  al despublicarse sigue viendo datos.
- Decidir producto: ¿unpublish interrumpe operaciones in-flight?
- Si sí, agregar WebSocket que cierra pantalla; si no, filtro al fetch.
- **Source**: TODOS plan.status P3.

**B.3 — Auditoría completa de RLS**
- Cada tabla con dato sensible: documentar política, justificar `USING`
  y `WITH CHECK` por separado.
- Test suite RLS: spec con cuenta de cada rol intentando todas las
  operaciones; assertions de pass/fail.
- Run en CI antes de merge.

### §C — Compliance enterprise (P2)

**C.1 — SOC 2 Type II**
- Engagement con auditor (Vanta, Drata, Secureframe o auditor independiente).
- Período de observación: 6 meses mínimo Type II.
- Controles a documentar:
  - Access control (RBAC, MFA obligatorio admins).
  - Change management (PR review, CI gates).
  - Backup & DR (Supabase backups + restore tested).
  - Incident response runbook.
  - Vendor management (Supabase, Mapbox, Railway, etc.).
- Costo estimado: USD 15k–40k año 1 (tooling + auditor).

**C.2 — ISO 27001:2022**
- Drivin lo usa como wedge enterprise → benchmark directo.
- Implementar Annex A controls (114 controles).
- Engagement con consultora local.
- Costo estimado: USD 25k–60k año 1.

**C.3 — Páginas público-legales**
- `/legal/security`: trust page con badges (SOC 2, ISO 27001, GDPR).
- `/legal/privacy`: política de privacidad actualizada.
- `/legal/dpa`: data processing addendum descargable.
- `/legal/subprocessors`: lista de sub-procesadores (Supabase, Mapbox,
  Railway, Meta, Resend).

**C.4 — DSAR / GDPR rights**
- Endpoint `POST /v1/legal/dsar` para que un usuario solicite export o
  borrado de sus datos.
- Workflow: revisión legal 30 días, export ZIP + email.
- Aplica a clientes europeos (futuros) y bueno-para-tener LATAM.

**C.5 — MFA obligatorio para admins**
- Forzar TOTP/WebAuthn para roles `admin`/`owner`.
- Configurar en `auth.users.factors`.
- Onboarding wizard que obligue setup en primer login.

---

## Scope OUT

- HIPAA (US healthcare) → no aplica a LATAM v1.
- PCI-DSS → no procesamos tarjetas directamente.
- FedRAMP → fuera de mercado.

---

## Esquema técnico

### Tablas nuevas
```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

-- Append-only
revoke update, delete on audit_log from authenticated, service_role;
```

### Migrations RLS
- `supabase/migrations/NNN_rls_native_plan_visibility.sql`
- `supabase/migrations/NNN_audit_log_trigger.sql`

---

## Criterios de éxito

- 0 vulnerabilidades open de severity high en pentest externo (programado
  trimestral).
- Audit log capturando 100% de UPDATEs en tablas críticas.
- 100% de admins con MFA activo en 30 días post-deploy.
- SOC 2 Type II audit report en mano en 9–12 meses.
- ISO 27001 Stage 2 audit completada en 12–15 meses.

---

## Dependencias

- Decisión de presupuesto compliance (~USD 40–100k año 1).
- Decisión de tooling (Vanta vs Drata vs Secureframe).

---

## Riesgos

- Compliance es costoso, lento y requiere disciplina ongoing — no
  empezar antes de tener 5+ clientes pagando y visibilidad de revenue.
- RLS migration tiene riesgo de break si no se tests exhaustivamente — usar
  branch DB de Supabase + test suite RLS.
