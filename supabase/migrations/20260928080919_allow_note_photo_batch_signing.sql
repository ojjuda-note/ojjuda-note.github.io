-- The card feed signs visible attachment paths in a batch.
-- Keep the private bucket, authenticated role and existing visibility checks.
-- Storage treats object.sign and object.sign_many as different operations.

alter policy note_card_photo_sign_owner
on storage.objects
using (
  bucket_id = 'note-card-photos'
  and owner_id = (select auth.uid())::text
  and storage.allow_any_operation(
    array['object.sign', 'object.sign_many', 'object.get_authenticated']
  )
  and ojjuda_note_internal.card_photo_owner_visible_or_unlinked(name)
);

alter policy note_card_photo_sign_visible
on storage.objects
using (
  bucket_id = 'note-card-photos'
  and storage.allow_any_operation(array['object.sign', 'object.sign_many'])
  and ojjuda_note_internal.card_photo_signable(name)
);
