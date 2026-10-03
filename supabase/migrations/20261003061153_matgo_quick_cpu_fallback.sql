-- Match and timeout use the same lock: a joined opponent is never abandoned.
create function ojjuda_matgo_internal.quick_fallback(p_actor uuid,p_room uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r ojjuda_matgo_internal.rooms%rowtype;
begin
  perform pg_advisory_xact_lock(1280136271,1);
  perform ojjuda_matgo_internal.wallet_service_v1(p_actor,'status');
  select * into r from ojjuda_matgo_internal.rooms
    where id=p_room and host_id=p_actor and mode='quick' for update;
  if not found then raise exception 'room_not_found';end if;
  if r.status='waiting' and r.guest_id is null and r.created_at<=clock_timestamp()-interval '5 seconds' then
    update ojjuda_matgo_internal.rooms set status='cancelled',reason='solo',version=version+1 where id=r.id;
    update ojjuda_matgo_internal.wallets set online_room=null where user_id=p_actor and online_room=r.id;
  end if;
  return ojjuda_matgo_internal.online_service(p_actor,'read',p_room);
end;
$$;
revoke all on function ojjuda_matgo_internal.quick_fallback(uuid,uuid) from public,anon,authenticated;
grant execute on function ojjuda_matgo_internal.quick_fallback(uuid,uuid) to service_role;
create function public.matgo_online_fallback(p_actor uuid,p_room uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_matgo_internal.quick_fallback(p_actor,p_room);
$$;
revoke all on function public.matgo_online_fallback(uuid,uuid) from public,anon,authenticated;
grant execute on function public.matgo_online_fallback(uuid,uuid) to service_role;
notify pgrst,'reload schema';
