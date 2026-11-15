-- Include active drinking invitations in the same paged inbox and unread count.
do $inbox$
declare
  visible text := pg_get_functiondef('ojjuda_note_internal.visible_app_notifications()'::regprocedure);
  listing text := pg_get_functiondef('ojjuda_note_internal.list_app_notifications(integer,timestamptz,text)'::regprocedure);
  read_join text := ') w LEFT JOIN ojjuda_note_internal.world_notification_reads';
  item_case text := 'WHEN p.kind=''group_invite'' THEN';
begin
  if cardinality(string_to_array(visible,read_join))<>2 or cardinality(string_to_array(listing,item_case))<>2 then
    raise exception 'unexpected notification inbox definition';
  end if;
  execute replace(visible,read_join,$rows$
    union all
    select 'world:drinking_invite:'||i.id::text,'drinking_invite','drinking_invite',i.id::text,i.created_at
    from public.arcade_friend_invites i
    where i.recipient_id=viewer and i.kind='drinking' and i.status='pending'
      and i.expires_at>now() and public.is_friend(viewer,i.sender_id)
      and ojjuda_arcade_internal.drinking_invitable_room(i.room_code,i.sender_id,viewer)
  $rows$||read_join);
  execute replace(listing,item_case,$details$
      when p.kind='drinking_invite' then (
        select jsonb_build_object('room_title',h.title,'sender_name',pr.nickname)
        from public.arcade_friend_invites i
        join ojjuda_arcade_internal.drinking_rooms h on h.code=i.room_code
        join public.profiles pr on pr.id=i.sender_id
        where i.id=p.target_id::uuid and i.recipient_id=auth.uid()
      )
      $details$||item_case);
end;
$inbox$;
