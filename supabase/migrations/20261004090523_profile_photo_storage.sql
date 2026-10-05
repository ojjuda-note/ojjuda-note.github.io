-- Profile photos reuse the private media bucket. Only the cropped derivative
-- receives member-wide read access; source images retain existing owner/admin RLS.
ALTER TABLE public.profiles
 ADD COLUMN profile_photo_path text,
 ADD COLUMN profile_photo_source_path text,
 ADD COLUMN profile_photo_crop jsonb;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_photo_metadata_check CHECK (
 (profile_photo_path IS NULL AND profile_photo_source_path IS NULL AND profile_photo_crop IS NULL)
 OR (profile_photo_path IS NOT NULL AND profile_photo_source_path IS NOT NULL AND profile_photo_crop IS NOT NULL
  AND profile_photo_path ~ ('^'||id::text||'/profile/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  AND profile_photo_source_path ~ ('^'||id::text||'/profile-source/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  AND jsonb_typeof(profile_photo_crop)='object'
  AND profile_photo_crop ?& ARRAY['v','zoom','cx','cy']
  AND profile_photo_crop-ARRAY['v','zoom','cx','cy']='{}'::jsonb
  AND profile_photo_crop->'v'='1'::jsonb
  AND jsonb_typeof(profile_photo_crop->'zoom')='number'
  AND jsonb_typeof(profile_photo_crop->'cx')='number'
  AND jsonb_typeof(profile_photo_crop->'cy')='number'
  AND (profile_photo_crop->>'zoom')::numeric BETWEEN 1 AND 4
  AND (profile_photo_crop->>'cx')::numeric BETWEEN 0 AND 1
  AND (profile_photo_crop->>'cy')::numeric BETWEEN 0 AND 1)
);

CREATE INDEX profiles_photo_path_idx ON public.profiles(profile_photo_path)
 WHERE profile_photo_path IS NOT NULL;

CREATE POLICY ojjuda_profile_photo_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='media' AND EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.profile_photo_path=objects.name
 ));

NOTIFY pgrst,'reload schema';
