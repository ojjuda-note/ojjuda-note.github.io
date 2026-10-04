-- Profiles use column-level UPDATE grants. Adding the photo columns does not
-- inherit the existing editable-profile grants; without these, saving a crop
-- fails with permission denied even for its owner. Keep all existing RLS,
-- metadata constraints and private-source Storage policies unchanged.
GRANT UPDATE(profile_photo_path,profile_photo_source_path,profile_photo_crop)
 ON public.profiles TO authenticated;

NOTIFY pgrst,'reload schema';
