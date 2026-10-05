-- Permissive legacy album policies must not expose uncropped profile sources,
-- even if another member puts a known source path into an album row.
CREATE POLICY ojjuda_profile_source_private ON storage.objects
 AS RESTRICTIVE FOR SELECT TO authenticated
 USING (bucket_id<>'media' OR split_part(name,'/',2)<>'profile-source'
  OR split_part(name,'/',1)=(SELECT auth.uid())::text
  OR (SELECT public.is_admin()) IS TRUE);

NOTIFY pgrst,'reload schema';
