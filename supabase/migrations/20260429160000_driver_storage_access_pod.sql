-- Permite a los choferes (tabla drivers, sin entrada en organization_members)
-- subir y leer las fotos/firmas de POD bajo el folder de su org. Antes solo
-- usuarios en organization_members tenian permiso, lo que dejaba a los
-- choferes con uploads bloqueados por RLS y filas plan_stops "completed"
-- apuntando a archivos inexistentes.

CREATE OR REPLACE FUNCTION public.driver_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT org_id FROM drivers WHERE user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.driver_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.driver_org_id() TO authenticated;

-- delivery-photos
DROP POLICY IF EXISTS "Org members can read delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Org or driver can read delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Org or driver can upload delivery photos" ON storage.objects;
DROP POLICY IF EXISTS "Org or driver can update delivery photos" ON storage.objects;

CREATE POLICY "Org or driver can read delivery photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'delivery-photos'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
);

CREATE POLICY "Org or driver can upload delivery photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'delivery-photos'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
);

CREATE POLICY "Org or driver can update delivery photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'delivery-photos'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
)
WITH CHECK (
  bucket_id = 'delivery-photos'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
);

-- signatures
DROP POLICY IF EXISTS "Org members can read signatures" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Org or driver can read signatures" ON storage.objects;
DROP POLICY IF EXISTS "Org or driver can upload signatures" ON storage.objects;
DROP POLICY IF EXISTS "Org or driver can update signatures" ON storage.objects;

CREATE POLICY "Org or driver can read signatures"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signatures'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
);

CREATE POLICY "Org or driver can upload signatures"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signatures'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
);

CREATE POLICY "Org or driver can update signatures"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'signatures'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
)
WITH CHECK (
  bucket_id = 'signatures'
  AND (
    public.is_super_admin()
    OR ((storage.foldername(name))[1])::uuid IN (SELECT public.user_org_ids())
    OR ((storage.foldername(name))[1])::uuid = public.driver_org_id()
  )
);
