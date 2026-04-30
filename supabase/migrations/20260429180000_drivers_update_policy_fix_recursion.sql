-- La policy "Driver can update own row" tenia un subquery a drivers dentro
-- del WITH CHECK, lo que genera "infinite recursion detected in policy" al
-- evaluar la policy de SELECT en drivers (que tambien matchea con la org).
-- Usamos driver_org_id() (SECURITY DEFINER, definida en la migracion
-- 20260429160000_driver_storage_access_pod.sql) que bypassa RLS y rompe
-- la recursion.

DROP POLICY IF EXISTS "Driver can update own row" ON public.drivers;

CREATE POLICY "Driver can update own row"
ON public.drivers
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (org_id = public.driver_org_id() OR public.is_super_admin())
);
