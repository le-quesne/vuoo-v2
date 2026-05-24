-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Toggle email_provider: 'platform' (Vuoo) vs 'custom' (propio)
--
-- Fase 1: solo 'platform' activo. La opción 'custom' existe en schema y UI
-- pero está marcada como "Próximamente" — requiere onboarding manual del
-- dominio del cliente en Resend antes de habilitarse.
-- =============================================

alter table org_notification_settings
  add column if not exists email_provider text not null default 'platform'
    check (email_provider in ('platform', 'custom'));

comment on column org_notification_settings.email_provider is
  'Modo de envío de email: platform = remitente notificaciones@vuoo.cl + RESEND_API_KEY de plataforma; custom = remitente propio + resend_api_key de la org.';

-- Backfill seguro: orgs existentes que tenían su propia resend_api_key
-- siguen siendo 'platform' por default (fase 1 solo habilita platform).
-- Cuando se habilite custom para una org, se cambia este campo a 'custom'
-- y se valida que tenga resend_api_key + email_from_address propios.
