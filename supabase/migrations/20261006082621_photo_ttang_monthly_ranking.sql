-- One clear per member/photo/Korean calendar month. Assisted wins count too.
create table if not exists ojjuda_photo_internal.game_clears (
 user_id uuid not null references auth.users(id) on delete cascade,
 month_start date not null,
 stage_key text not null,
 cleared_at timestamptz not null default now(),
 primary key(user_id,month_start,stage_key)
);
alter table ojjuda_photo_internal.game_clears enable row level security;
revoke all on ojjuda_photo_internal.game_clears from public,anon,authenticated;
create index if not exists photo_game_clears_month on ojjuda_photo_internal.game_clears(month_start,user_id);

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
 if p_stage ~ '^([0-9]|1[0-9])$' then null;
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
create or replace function public.photo_game_clear(p_stage text)
returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_photo_internal.record_game_clear(p_stage);
$$;
revoke all on function public.photo_game_clear(text) from public,anon;
grant execute on function public.photo_game_clear(text) to authenticated;

create or replace function ojjuda_photo_internal.game_monthly_ranking()
returns json language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result json;
begin
 if actor is null or not ojjuda_photo_internal.member_allowed()
    or not exists(select 1 from public.profiles where id=actor) then
  raise exception 'not_allowed' using errcode='42501';
 end if;
 if public.is_banned(actor) then raise exception 'not_allowed' using errcode='42501'; end if;
 select coalesce(json_agg(json_build_object('nick',r.nickname,'score',r.score,'me',r.user_id=actor,'source','photo_clears')
  order by r.score desc,r.latest,r.user_id),'[]'::json) into result
 from (
  select c.user_id,p.nickname,count(*) as score,max(c.cleared_at) as latest
  from ojjuda_photo_internal.game_clears c join public.profiles p on p.id=c.user_id
  where c.month_start=date_trunc('month',now() at time zone 'Asia/Seoul')::date and c.cleared_at<=now()
   and not exists(select 1 from public.user_private u where u.user_id=c.user_id and u.banned_until>now())
  group by c.user_id,p.nickname order by score desc,latest,c.user_id limit 10
 ) r;
 return result;
end;
$$;
revoke all on function ojjuda_photo_internal.game_monthly_ranking() from public,anon;
grant execute on function ojjuda_photo_internal.game_monthly_ranking() to authenticated;

-- Preserve concurrent changes to other games and the current ranking limits.
do $$
declare definition text;
begin
 select pg_get_functiondef('ojjuda_game_internal.community_game_monthly_ranking(text)'::regprocedure) into definition;
 if position('ojjuda_photo_internal.game_monthly_ranking()' in definition)=0 then
  if position('  v_limit := case p_game' in definition)=0 then raise exception 'monthly ranking patch target missing'; end if;
  definition:=replace(definition,'  v_limit := case p_game',
   E'  if p_game=''photo_ttang'' then return ojjuda_photo_internal.game_monthly_ranking(); end if;\n  v_limit := case p_game');
  execute definition;
 end if;
end;
$$;
notify pgrst,'reload schema';
