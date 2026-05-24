-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Auto-creación de org_notification_settings al crear una org.
-- Backfill para orgs existentes sin settings.
-- =============================================

create or replace function public.create_default_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into org_notification_settings (
    org_id,
    email_enabled, email_provider,
    notify_on_scheduled, notify_on_transit, notify_on_arriving,
    notify_on_delivered, notify_on_failed,
    send_survey, survey_delay_min,
    primary_color, arriving_stops_threshold
  )
  values (
    new.id,
    true, 'platform',
    true, true, true,
    true, true,
    true, 30,
    '#0F1629', 3
  )
  on conflict (org_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auto_create_notification_settings on organizations;

create trigger trg_auto_create_notification_settings
  after insert on organizations
  for each row
  execute function public.create_default_notification_settings();

-- Backfill: orgs existentes sin settings.
insert into org_notification_settings (
  org_id,
  email_enabled, email_provider,
  notify_on_scheduled, notify_on_transit, notify_on_arriving,
  notify_on_delivered, notify_on_failed,
  send_survey, survey_delay_min,
  primary_color, arriving_stops_threshold
)
select o.id,
       true, 'platform',
       true, true, true,
       true, true,
       true, 30,
       '#0F1629', 3
from organizations o
left join org_notification_settings ns on ns.org_id = o.id
where ns.id is null
on conflict (org_id) do nothing;
