-- Read-only access to all existing World/Park administrator history.
-- No old log API, log record, member, or content row is changed.
create schema if not exists ojjuda_admin_internal;
revoke all on schema ojjuda_admin_internal from public, anon;
grant usage on schema ojjuda_admin_internal to authenticated;

create index if not exists admin_log_history_idx on public.admin_log(created_at desc,id desc);
create index if not exists admin_log_action_history_idx on public.admin_log(action,created_at desc,id desc);
create index if not exists note_action_type_history_idx on ojjuda_note_internal.moderation_actions(action,created_at desc,action_id desc);

create or replace function ojjuda_admin_internal.activity_list(
 p_source text default 'world', p_action text default null,
 p_limit integer default 30, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or public.is_admin() is not true then
  raise exception 'admin_required' using errcode='42501';
 end if;
 if p_source is null or p_source not in ('world','park')
  or p_limit is null or p_limit not between 1 and 100
  or p_offset is null or p_offset < 0
  or (p_action is not null and (length(p_action) not between 1 and 100 or p_action<>btrim(p_action))) then
  raise exception 'invalid_activity_page' using errcode='22023';
 end if;
 with source_rows as not materialized (
  select l.id::text as id,l.id as world_id,null::uuid as park_id,l.created_at,l.admin_id,
   l.action,l.target_user,l.target,null::uuid as card_id,null::uuid as report_id,
   l.detail->>'reason' as reason,l.detail
  from public.admin_log l where p_source='world'
  union all
  select a.action_id::text,null::bigint,a.action_id,a.created_at,a.moderator_id,
   a.action,a.subject_user_id,null::text,a.card_id,a.report_id,a.reason,a.detail
  from ojjuda_note_internal.moderation_actions a where p_source='park'
 ), filtered as not materialized (
  select * from source_rows s where p_action is null or s.action=p_action
 ), page as (
  select * from filtered s order by s.created_at desc,s.world_id desc,s.park_id desc limit p_limit offset p_offset
 )
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'source',p_source,'created_at',p.created_at,'action',p.action,
   'admin_id',p.admin_id,'admin_nick',pa.nickname,'target_user',p.target_user,
   'target_nick',pt.nickname,'target',p.target,'card_id',p.card_id,'report_id',p.report_id,
   'reason',p.reason,'detail',p.detail
  ) order by p.created_at desc,p.world_id desc,p.park_id desc)
  from page p left join public.profiles pa on pa.id=p.admin_id left join public.profiles pt on pt.id=p.target_user),'[]'::jsonb),
  'total_count',(select count(*) from filtered),
  'actions',coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'count',a.n) order by a.action)
   from (select s.action,count(*) n from source_rows s group by s.action) a),'[]'::jsonb)
 ) into result;
 return result;
end;$$;
revoke all on function ojjuda_admin_internal.activity_list(text,text,integer,integer) from public,anon;
grant execute on function ojjuda_admin_internal.activity_list(text,text,integer,integer) to authenticated;

create or replace function public.admin_activity_list(
 p_source text default 'world', p_action text default null,
 p_limit integer default 30, p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path='' as $$
 select ojjuda_admin_internal.activity_list(p_source,p_action,p_limit,p_offset)
$$;
revoke all on function public.admin_activity_list(text,text,integer,integer) from public,anon;
grant execute on function public.admin_activity_list(text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
