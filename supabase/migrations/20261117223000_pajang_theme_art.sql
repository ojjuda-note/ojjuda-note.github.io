-- Only the decorative site artwork is public. App code and member media use their own buckets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pajang-theme', 'pajang-theme', true, 1048576, array['image/webp'])
on conflict (id) do nothing;
