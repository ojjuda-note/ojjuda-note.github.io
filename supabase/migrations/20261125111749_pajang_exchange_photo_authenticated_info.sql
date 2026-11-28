CREATE OR REPLACE FUNCTION pajang_private.exchange_photo_access(path text, storage_owner text, action text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid := auth.uid();
  target uuid;
  photo_id uuid;
  me uuid;
begin
  if u is null or path is null or not pajang_private.exchange_photo_path_ok(path) then return false; end if;
  target:=split_part(path,'/',1)::uuid;
  photo_id:=split_part(split_part(path,'/',2),'.',1)::uuid;
  if action='read' and storage.allow_any_operation(array['object.delete','object.delete_many']) then action:='delete'; end if;
  if action='delete' then
    if storage_owner is distinct from u::text then return false; end if;
    if ojjuda_account_deletion.pending() then return true; end if;
  elsif action='read' then
    -- Storage can label a private GET as a metadata read before returning the JPEG.
    if not storage.allow_any_operation(array['object.get_authenticated','object.get_authenticated_info']) then return false; end if;
  elsif action<>'upload' then return false; end if;
  me:=pajang_private.exchange_actor();
  if me is null then return false; end if;
  if action='upload' then
    if me<>target or storage_owner is distinct from u::text then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(target::text,214));
  end if;
  if action='delete' then return me=target; end if;
  if me<>target and not coalesce(pajang_private.exchange_can_view(me,target,'photos'),false) then return false; end if;
  return exists(select from pajang_private.exchange_photo_slots s join pajang_private.people p on p.id=s.person
    where s.person=target and s.photo=photo_id and p.owner_id::text=storage_owner);
end; $function$
;
