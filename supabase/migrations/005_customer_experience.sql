-- =============================================
-- Vuoo V2 - Customer Experience & Notifications
-- =============================================

-- 1. Add customer fields to stops
-- ---------------------------------------------

alter table stops add column customer_name text;
alter table stops add column customer_phone text;
alter table stops add column customer_email text;
alter table stops add column delivery_instructions text;

-- 2. Add tracking token and notification prefs to plan_stops
-- ---------------------------------------------

alter table plan_stops add column tracking_token uuid default gen_random_uuid();
create unique index idx_plan_stops_tracking_token on plan_stops(tracking_token);

alter table plan_stops add column notification_preferences jsonb
  default '{"whatsapp": true, "sms": false, "email": true}';

-- 3. Notification logs
-- ---------------------------------------------

create table notification_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plan_stop_id    uuid not null references plan_stops(id) on delete cascade,
  channel         text not null,
  event_type      text not null,
  recipient       text not null,
  template_id     text,
  status          text not null default 'pending',
  error_message   text,
  external_id     text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_notification_logs_plan_stop on notification_logs(plan_stop_id);
create index idx_notification_logs_org on notification_logs(org_id, created_at desc);

-- 4. Delivery feedback (customer ratings)
-- ---------------------------------------------

create table delivery_feedback (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  plan_stop_id    uuid not null references plan_stops(id) on delete cascade,
  driver_id       uuid references drivers(id) on delete set null,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  submitted_at    timestamptz not null default now()
);

create index idx_delivery_feedback_org on delivery_feedback(org_id, submitted_at desc);
create index idx_delivery_feedback_driver on delivery_feedback(driver_id);

-- 5. Org notification settings
-- ---------------------------------------------

create table org_notification_settings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade unique,

  -- Channel toggles
  whatsapp_enabled    boolean default false,
  sms_enabled         boolean default false,
  email_enabled       boolean default true,

  -- WhatsApp Cloud API credentials
  whatsapp_phone_id   text,
  whatsapp_token      text,
  whatsapp_verified   boolean default false,

  -- Twilio (SMS) credentials
  twilio_account_sid  text,
  twilio_auth_token   text,
  twilio_phone_number text,

  -- Resend (Email) credentials
  resend_api_key      text,
  email_from_address  text,
  email_from_name     text,

  -- Event triggers
  notify_on_scheduled boolean default true,
  notify_on_transit   boolean default true,
  notify_on_arriving  boolean default true,
  notify_on_delivered boolean default true,
  notify_on_failed    boolean default true,

  -- Survey
  send_survey         boolean default true,
  survey_delay_min    integer default 30,

  -- Branding
  logo_url            text,
  primary_color       text default '#6366f1',

  -- Proximity
  arriving_stops_threshold integer default 3,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 6. Row Level Security
-- ---------------------------------------------

-- 6a. notification_logs
alter table notification_logs enable row level security;

create policy "Org members can view notification logs"
  on notification_logs for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "System can insert notification logs"
  on notification_logs for insert
  with check (true);

-- 6b. delivery_feedback
alter table delivery_feedback enable row level security;

create policy "Org members can view delivery feedback"
  on delivery_feedback for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Public can submit delivery feedback"
  on delivery_feedback for insert
  with check (true);

-- 6c. org_notification_settings
alter table org_notification_settings enable row level security;

create policy "Org admins can manage notification settings"
  on org_notification_settings for all
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- 7. Realtime: plan_stops (for live tracking page)
-- ---------------------------------------------

alter publication supabase_realtime add table plan_stops;
