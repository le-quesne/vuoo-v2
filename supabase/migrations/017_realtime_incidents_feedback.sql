-- =============================================
-- Realtime para incidentes operacionales y feedback de cliente
-- =============================================
--
-- Sprint 2 del roadmap de realtime:
--   - operational_incidents: el chofer puede reportar desde la app un
--     problema (vehículo averiado, accidente, etc.) y el dispatcher lo
--     ve en la Torre sin refrescar. Hoy sólo el dispatcher los crea
--     desde IncidentModal (sin propagación).
--   - delivery_feedback: cuando el cliente responde con 1-5 estrellas
--     vía link público, la Torre dispara un toast (con prioridad alta
--     si rating <= 2).
--
-- Adicionalmente se agrega una policy a operational_incidents para
-- que el driver pueda insertar un incidente sobre su propio driver_id,
-- dado que drivers no están en organization_members y la policy actual
-- (`org_id in select user_org_ids()`) los excluye.

-- 1. Realtime
-- ---------------------------------------------
alter publication supabase_realtime add table operational_incidents;
alter publication supabase_realtime add table delivery_feedback;

alter table operational_incidents replica identity full;
alter table delivery_feedback replica identity full;

-- 2. Policy: driver puede crear incidentes propios
-- ---------------------------------------------
-- El check verifica que driver_id corresponda al driver autenticado
-- (drivers.user_id = auth.uid()) y que el org_id coincida con el org
-- del driver para evitar cross-org tampering.
create policy "Driver can insert own incidents"
  on operational_incidents for insert
  with check (
    driver_id in (select d.id from drivers d where d.user_id = auth.uid())
    and org_id in (select d.org_id from drivers d where d.user_id = auth.uid())
  );

-- 3. Policy: driver puede ver incidentes donde es el driver
-- ---------------------------------------------
-- Necesario para que el chofer vea en mobile su propio feed de incidentes
-- reportados (por él o por el dispatcher sobre él).
create policy "Driver can read own incidents"
  on operational_incidents for select
  using (
    driver_id in (select d.id from drivers d where d.user_id = auth.uid())
  );
