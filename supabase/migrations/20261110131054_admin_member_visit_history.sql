-- A compact, account-owned navigation history. No URL query strings, IPs or
-- content from visited pages are stored. Only administrators can read it.
begin;

create table if not exists ojjuda_account_internal.member_navigation_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('page', 'game')),
  activity_key text not null,
  title text not null,
  created_at timestamptz not null default now()
);
create index if not exists member_navigation_history_user_recent_idx
  on ojjuda_account_internal.member_navigation_history (user_id, created_at desc, id desc);
alter table ojjuda_account_internal.member_navigation_history enable row level security;
revoke all on ojjuda_account_internal.member_navigation_history from public, anon, authenticated;
revoke all on sequence ojjuda_account_internal.member_navigation_history_id_seq from public, anon, authenticated;

create or replace function ojjuda_account_internal.record_member_navigation(
  p_kind text, p_key text, p_title text)
returns void language plpgsql volatile security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_previous record;
  v_at timestamptz := clock_timestamp();
begin
  if v_user is null then return; end if;
  if p_kind not in ('page','game') or p_key is null or p_key !~ '^[a-z0-9][a-z0-9_./:-]{0,119}$'
    or p_title is null or btrim(p_title) = '' or char_length(p_title) > 80 or p_title ~ '[[:cntrl:]]' then
    raise exception 'invalid_navigation_event' using errcode = '22023';
  end if;
  select h.kind,h.activity_key,h.created_at into v_previous
  from ojjuda_account_internal.member_navigation_history h
  where h.user_id = v_user order by h.created_at desc,h.id desc limit 1;
  -- A link click and its destination page load often report the same entry.
  if v_previous.kind = p_kind and v_previous.activity_key = p_key
    and v_previous.created_at > v_at - interval '8 seconds' then return; end if;
  insert into ojjuda_account_internal.member_navigation_history(user_id,kind,activity_key,title,created_at)
  values(v_user,p_kind,p_key,btrim(p_title),v_at);
end;
$$;

create or replace function public.record_member_navigation(
  p_kind text, p_key text, p_title text)
returns void language sql volatile security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.record_member_navigation(p_kind,p_key,p_title);
$$;

create or replace function ojjuda_account_internal.admin_member_navigation_history(
  p_user_id uuid, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,20),1),50);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_user_id is null or v_offset > 100000 then
    raise exception 'invalid_navigation_page' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(to_jsonb(entry) order by entry.created_at desc,entry.id desc)
      from (
        select h.id,h.kind,h.title,h.created_at
        from ojjuda_account_internal.member_navigation_history h
        where h.user_id=p_user_id
        order by h.created_at desc,h.id desc offset v_offset limit v_limit
      ) entry
    ),'[]'::jsonb),
    'total',(select count(*) from ojjuda_account_internal.member_navigation_history h where h.user_id=p_user_id),
    'offset',v_offset,'limit',v_limit)
  into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_member_navigation_history(
  p_user_id uuid, p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.admin_member_navigation_history(p_user_id,p_limit,p_offset);
$$;

-- Keep the existing directory filters, daily visit counts, sorting, ban logic,
-- and legacy authored-content activity; add the latest page/game title.
create or replace function ojjuda_account_internal.admin_list_member_accounts(
  p_query text default '', p_filter text default 'all',
  p_offset integer default 0, p_limit integer default 20,
  p_sort text default 'created_at')
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_filter text := coalesce(nullif(btrim(p_filter),''),'all');
  v_sort text := coalesce(nullif(btrim(p_sort),''),'created_at');
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := least(greatest(coalesce(p_limit,20),1),50);
  v_now timestamptz := now();
  v_today timestamptz := date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_tomorrow timestamptz := (date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul';
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if v_filter not in ('all','today','banned','admin') then
    raise exception 'invalid_account_filter' using errcode = '22023';
  end if;
  if v_sort not in ('last_seen','created_at','visit_count') then
    raise exception 'invalid_account_sort' using errcode = '22023';
  end if;

  with filtered as materialized (
    select u.id,p.nickname,u.email,u.created_at,p.created_at as profile_created_at,
      p.updated_at as profile_updated_at,v.coins,v.banned_until,
      greatest(v.last_seen_at,u.last_sign_in_at) as last_seen,
      visits.visit_count,
      (v.last_seen_at is null or u.last_sign_in_at>v.last_seen_at) as seen_by_login,
      (a.user_id is not null) as is_admin
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join public.user_private v on v.user_id=u.id
    left join public.app_admins a on a.user_id=u.id
    left join lateral (
      select count(*) as visit_count from ojjuda_rewards_internal.activity_days d where d.user_id=u.id
    ) visits on true
    where (v_query='' or strpos(lower(coalesce(p.nickname,'')),v_query)>0
      or strpos(lower(coalesce(u.email,'')),v_query)>0)
      and (
        (v_filter='banned' and v.banned_until>v_now)
        or (v_filter<>'banned' and (v.banned_until is null or v.banned_until<=v_now)
          and (v_filter='all'
            or (v_filter='today' and u.created_at>=v_today and u.created_at<v_tomorrow)
            or (v_filter='admin' and a.user_id is not null)))
      )
  ), page as materialized (
    select * from filtered order by case when v_sort='visit_count' then visit_count end desc nulls last,
      case when v_sort in ('last_seen','visit_count') then last_seen end desc nulls last,
      created_at desc nulls last,id
    offset v_offset limit v_limit
  ), items as (
    select p.id,p.nickname,p.email,p.coins,p.created_at,p.last_seen,p.seen_by_login,p.visit_count,
      act.act_at as last_active,act.act_kind as last_active_kind,
      act.act_title as last_active_title,p.banned_until,p.is_admin
    from page p
    left join lateral (
      select z.act_kind,z.act_at,z.act_title from (
        select 'room'::text as act_kind,
          case when p.profile_updated_at>p.profile_created_at+interval '1 minute'
            then p.profile_updated_at end as act_at, null::text as act_title
        union all select 'diary', (select max(d.created_at) from public.diaries d
          where d.user_id=p.id and d.created_at>p.profile_created_at+interval '1 minute'), null
        union all select 'guestbook', (select max(g.created_at) from public.guestbook g where g.author_id=p.id), null
        union all select 'intro', (select max(i.created_at) from public.intros i where i.author_id=p.id), null
        union all select 'media', (select max(m.created_at) from public.media m where m.user_id=p.id), null
        union all select 'comment', (select max(c.created_at) from public.media_comments c where c.author_id=p.id), null
        union all select 'chat', (select max(pm.created_at) from public.place_messages pm where pm.author_id=p.id), null
        union all select 'game', gs.created_at, gs.game from (
          select s.created_at,s.game from public.game_scores s
          where s.user_id=p.id order by s.created_at desc,s.id desc limit 1
        ) gs
        union all select 'house_post', (select max(h.created_at) from public.house_posts h
          where h.user_id=p.id and h.deleted_at is null), null
        union all select nav.kind,nav.created_at,nav.title from (
          select h.kind,h.created_at,h.title
          from ojjuda_account_internal.member_navigation_history h where h.user_id=p.id
          order by h.created_at desc,h.id desc limit 1
        ) nav
      ) z where z.act_at is not null order by z.act_at desc,z.act_kind limit 1
    ) act on true
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by case when v_sort='visit_count' then i.visit_count end desc nulls last,
      case when v_sort in ('last_seen','visit_count') then i.last_seen end desc nulls last,
      i.created_at desc nulls last,i.id) from items i),'[]'::jsonb),
    'total',(select count(*) from filtered),'offset',v_offset,'limit',v_limit)
  into v_result;
  return v_result;
end;
$$;

revoke all on function ojjuda_account_internal.record_member_navigation(text,text,text),
  public.record_member_navigation(text,text,text),
  ojjuda_account_internal.admin_member_navigation_history(uuid,integer,integer),
  public.admin_member_navigation_history(uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function ojjuda_account_internal.record_member_navigation(text,text,text),
  public.record_member_navigation(text,text,text),
  ojjuda_account_internal.admin_member_navigation_history(uuid,integer,integer),
  public.admin_member_navigation_history(uuid,integer,integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
