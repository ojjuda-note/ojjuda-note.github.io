-- Add twenty male builtin photos with permanent keys 20-39. Existing keys, age checks, privacy, and monthly deduplication are preserved.
create or replace function ojjuda_photo_internal.record_game_clear(p_stage text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 month_key date:=date_trunc('month',now() at time zone 'Asia/Seoul')::date;
 total integer;
begin
 if actor is null or not ojjuda_photo_internal.member_allowed()
    or not exists(select 1 from public.profiles where id=actor) then
  raise exception 'not_allowed' using errcode='42501';
 end if;
 if public.is_banned(actor) then raise exception 'not_allowed' using errcode='42501'; end if;
 if p_stage ~ '^([0-9]|[1-3][0-9])$' then null;
 elsif p_stage ~ '^c[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and exists(select 1 from public.photo_stages s where s.id=substring(p_stage from 2)::uuid and s.status='approved'
  and (s.owner=actor or public.photo_is_admin() or s.visibility='public'
   or (s.visibility='friends' and public.photo_is_friend(s.owner,actor)))) then null;
 else raise exception 'invalid_stage' using errcode='22023'; end if;
 insert into ojjuda_photo_internal.game_clears(user_id,month_start,stage_key)
 values(actor,month_key,p_stage) on conflict do nothing;
 select count(*) into total from ojjuda_photo_internal.game_clears where user_id=actor and month_start=month_key;
 return jsonb_build_object('ok',true,'score',total);
end;
$$;
revoke all on function ojjuda_photo_internal.record_game_clear(text) from public,anon;
grant execute on function ojjuda_photo_internal.record_game_clear(text) to authenticated;
notify pgrst,'reload schema';
