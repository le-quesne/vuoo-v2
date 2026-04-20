-- =============================================
-- Flujo pedido → ruta — Fase B.4 (PRD 12)
-- =============================================
--
-- Tokens de API por organización para el endpoint público
-- `POST /api/v1/orders` (Railway vuoo-rutas). Desbloquea integraciones
-- Shopify/VTEX/Zapier/WhatsApp sin necesidad de OAuth completo.
--
-- Modelo:
--   - Guardamos sha256 del token (`token_hash`), no el token en claro.
--     El backend en Railway compara contra el hash, nunca descifra.
--   - `token_prefix` = primeros 8 chars visibles (solo para UI
--     diferenciando tokens: "vk_ABC12345…").
--   - Sólo **admins** del org pueden ver/crear/revocar. Dispatchers y
--     drivers no tienen acceso a esta tabla.
--   - `revoked_at` soft-delete; el backend filtra por
--     `revoked_at is null`.

create table org_api_tokens (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  token_hash     text not null,
  token_prefix   text not null,
  scopes         text[] not null default '{}',
  last_used_at   timestamptz,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  constraint org_api_tokens_org_hash_unique unique (org_id, token_hash)
);

create index idx_org_api_tokens_org_active
  on org_api_tokens(org_id) where revoked_at is null;

-- Helper: ¿el usuario actual es admin/owner del org?
-- Se reusa en las 4 policies para mantener la regla en un solo lugar.
create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members om
     where om.org_id = p_org_id
       and om.user_id = auth.uid()
       and om.role in ('owner', 'admin')
  );
$$;

alter table org_api_tokens enable row level security;

create policy "Org admins can view api tokens"
  on org_api_tokens for select
  using (public.is_super_admin() or public.is_org_admin(org_id));

create policy "Org admins can insert api tokens"
  on org_api_tokens for insert
  with check (public.is_super_admin() or public.is_org_admin(org_id));

-- Revocar es un UPDATE (setea revoked_at).
create policy "Org admins can update api tokens"
  on org_api_tokens for update
  using (public.is_super_admin() or public.is_org_admin(org_id))
  with check (public.is_super_admin() or public.is_org_admin(org_id));

create policy "Org admins can delete api tokens"
  on org_api_tokens for delete
  using (public.is_super_admin() or public.is_org_admin(org_id));

comment on table org_api_tokens is
  'Tokens de API por org para endpoint público POST /api/v1/orders. token_hash = sha256(token). Solo admins del org pueden gestionar.';

comment on column org_api_tokens.token_hash is
  'sha256 hex del token en claro. El token original sólo se muestra una vez al crearlo.';

comment on column org_api_tokens.token_prefix is
  'Primeros 8 chars visibles del token (para UI diferenciadora, ej. "vk_ABC12345...").';

comment on column org_api_tokens.scopes is
  'Ej: ["orders:write"], ["shopify_webhook"]. El backend setea orders.source según el scope.';
