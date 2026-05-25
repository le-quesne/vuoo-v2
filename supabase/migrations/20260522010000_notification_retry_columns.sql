-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Retry con backoff exponencial para notification_logs
-- =============================================

alter table notification_logs
  add column if not exists attempts int not null default 0;

alter table notification_logs
  add column if not exists next_retry_at timestamptz;

alter table notification_logs
  add column if not exists last_attempt_at timestamptz;

-- Índice parcial: solo cubre rows pendientes de retry.
-- Evita inflar el índice con los `sent` que son la mayoría.
create index if not exists idx_notification_logs_retry
  on notification_logs(next_retry_at)
  where status = 'failed' and attempts < 3;

-- Backfill: rows existentes con status='failed' arrancan en attempts=1
-- (ya hicimos un intento) y next_retry_at=null (no se reintentan automáticamente).
update notification_logs
  set attempts = 1
  where status = 'failed' and attempts = 0;
