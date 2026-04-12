-- =============================================
-- Vuoo V2 - Orders / Pedidos
-- =============================================

-- 1. Orders table
-- ---------------------------------------------

create table orders (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organizations(id) on delete cascade,

  -- Identification
  order_number             text not null,
  external_id              text,
  source                   text not null default 'manual',

  -- Customer
  customer_name            text not null,
  customer_phone           text,
  customer_email           text,

  -- Destination
  address                  text not null,
  lat                      double precision,
  lng                      double precision,
  delivery_instructions    text,

  -- Contents
  items                    jsonb not null default '[]'::jsonb,
  total_weight_kg          numeric not null default 0,
  total_volume_m3          numeric,
  total_price              numeric,
  currency                 text not null default 'CLP',

  -- Delivery
  service_duration_minutes integer not null default 15,
  time_window_start        time,
  time_window_end          time,
  priority                 text not null default 'normal',
  requires_signature       boolean not null default false,
  requires_photo           boolean not null default true,

  -- Scheduling
  requested_date           date,

  -- Lifecycle status
  status                   text not null default 'pending',

  -- Relationships
  stop_id                  uuid references stops(id) on delete set null,
  plan_stop_id             uuid references plan_stops(id) on delete set null,

  -- Internal
  internal_notes           text,
  tags                     text[] not null default '{}',

  -- Metadata
  created_by               uuid references auth.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint orders_order_number_unique unique (org_id, order_number),
  constraint orders_source_valid check (source in ('manual', 'csv', 'shopify', 'vtex', 'api', 'whatsapp')),
  constraint orders_status_valid check (status in ('pending', 'scheduled', 'in_transit', 'delivered', 'failed', 'cancelled', 'returned')),
  constraint orders_priority_valid check (priority in ('urgent', 'high', 'normal', 'low'))
);

-- 2. Indexes
-- ---------------------------------------------

create index idx_orders_org on orders(org_id);
create index idx_orders_status on orders(org_id, status);
create index idx_orders_date on orders(org_id, requested_date);
create index idx_orders_source on orders(org_id, source);
create index idx_orders_stop on orders(stop_id) where stop_id is not null;
create index idx_orders_plan_stop on orders(plan_stop_id) where plan_stop_id is not null;
create index idx_orders_external on orders(org_id, external_id) where external_id is not null;

-- 3. Row Level Security
-- ---------------------------------------------

alter table orders enable row level security;

create policy "Org members can view orders"
  on orders for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can insert orders"
  on orders for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can update orders"
  on orders for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can delete orders"
  on orders for delete
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- 4. Auto-generated order number per org
-- ---------------------------------------------

create or replace function public.generate_order_number(p_org_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  next_num integer;
begin
  select coalesce(max(
    nullif(regexp_replace(order_number, '[^0-9]', '', 'g'), '')::integer
  ), 0) + 1
  into next_num
  from orders
  where org_id = p_org_id;

  return 'ORD-' || lpad(next_num::text, 5, '0');
end;
$$;

-- 5. Keep updated_at fresh
-- ---------------------------------------------

create or replace function public.orders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function public.orders_set_updated_at();

-- 6. Sync order.status when plan_stop.status changes
-- ---------------------------------------------

create or replace function public.sync_order_status_from_plan_stop()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    update orders
       set status = case new.status
                      when 'completed'   then 'delivered'
                      when 'incomplete'  then 'failed'
                      when 'cancelled'   then 'cancelled'
                      when 'pending'     then 'scheduled'
                      else status
                    end
     where plan_stop_id = new.id
       and status <> case new.status
                        when 'completed'   then 'delivered'
                        when 'incomplete'  then 'failed'
                        when 'cancelled'   then 'cancelled'
                        when 'pending'     then 'scheduled'
                        else status
                      end;
  end if;
  return new;
end;
$$;

create trigger trg_sync_order_status
  after update of status on plan_stops
  for each row execute function public.sync_order_status_from_plan_stop();

-- 7. When a plan_stop is deleted, detach the order and send it back to pending
-- ---------------------------------------------

create or replace function public.detach_order_on_plan_stop_delete()
returns trigger
language plpgsql
as $$
begin
  update orders
     set plan_stop_id = null,
         status       = case when status in ('scheduled', 'in_transit') then 'pending' else status end
   where plan_stop_id = old.id;
  return old;
end;
$$;

create trigger trg_detach_order_on_plan_stop_delete
  before delete on plan_stops
  for each row execute function public.detach_order_on_plan_stop_delete();

-- 8. Realtime (for live inbox updates)
-- ---------------------------------------------

alter publication supabase_realtime add table orders;
