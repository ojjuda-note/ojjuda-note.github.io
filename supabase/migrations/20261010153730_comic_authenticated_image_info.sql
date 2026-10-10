-- Private image delivery also checks authenticated object metadata at the CDN.
-- Keep the same age/publication checks and continue denying signed URLs/listing.
alter policy comic_files_session_only on storage.objects
 using(bucket_id<>'creative-comics' or ((select ojjuda_comics_internal.can_read())
  and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated','object.delete','object.delete_many'])
  and ((select public.is_admin()) or exists(select 1 from public.creative_comic_pages p where p.path=name))));
