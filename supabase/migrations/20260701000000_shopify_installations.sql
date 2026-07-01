-- Instalaciones OAuth de Shopify por tienda → org (multi-tenant).
-- El access_token es sensible: RLS deny-all (solo service_role del backend accede).
create table if not exists public.shopify_installations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  shop_domain text not null,
  access_token text not null,
  scopes text,
  status text not null default 'active' check (status in ('active','uninstalled')),
  installed_at timestamptz not null default now(),
  uninstalled_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (shop_domain)
);

create index if not exists idx_shopify_inst_org on public.shopify_installations(org_id);

alter table public.shopify_installations enable row level security;
-- Sin policies → deny total a anon/authenticated. Solo el backend (service_role,
-- que bypassa RLS) lee/escribe. La UI lista las instalaciones vía endpoint del backend.

comment on table public.shopify_installations is 'Instalaciones OAuth de tiendas Shopify mapeadas a una org de Vuoo. access_token = token offline de Admin API (sensible, service_role-only).';
