-- Agrega campo status al plan para controlar visibilidad dispatcher→chofer.
-- draft    = en planificación, choferes no ven la ruta.
-- published = publicado, choferes ven la ruta y cambios generan notificaciones.
-- El estado in_progress se infiere de routes.status (no se almacena en plans).

alter table plans
  add column status text not null default 'draft'
  check (status in ('draft', 'published'));

-- Índice compuesto para la query mobile (org_id + date + status).
-- El índice existente idx_plans_org_date cubre org_id+date; agregar status
-- evita un heap fetch adicional cuando se filtra por los 3 campos.
create index if not exists idx_plans_org_date_status
  on plans (org_id, date, status);
