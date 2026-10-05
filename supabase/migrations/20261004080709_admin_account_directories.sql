-- Administrator-only paginated directories. Contact/identity tables stay private.
-- Both the count and page are read from one snapshot; activity lookup runs only
-- for the selected page. Search uses literal substrings, including % and _.
create function ojjuda_account_internal.admin_list_member_accounts(
  p_query text default '', p_filter text default 'all',
  p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_filter text := coalesce(nullif(btrim(p_filter),''),'all');
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := least(greatest(coalesce(p_limit,20),1),50);
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

  with filtered as materialized (
    select u.id,p.nickname,u.email,u.created_at,p.created_at as profile_created_at,
      p.updated_at as profile_updated_at,v.coins,v.banned_until,
      coalesce(v.last_seen_at,u.last_sign_in_at) as last_seen,
      (v.last_seen_at is null) as seen_by_login,
      (a.user_id is not null) as is_admin
    from auth.users u
    left join public.profiles p on p.id=u.id
    left join public.user_private v on v.user_id=u.id
    left join public.app_admins a on a.user_id=u.id
    where (v_query='' or strpos(lower(coalesce(p.nickname,'')),v_query)>0
      or strpos(lower(coalesce(u.email,'')),v_query)>0)
      and (v_filter='all'
        or (v_filter='today' and u.created_at>=v_today and u.created_at<v_tomorrow)
        or (v_filter='banned' and v.banned_until>now())
        or (v_filter='admin' and a.user_id is not null))
  ), page as materialized (
    select * from filtered order by created_at desc nulls last,id
    offset v_offset limit v_limit
  ), items as (
    select p.id,p.nickname,p.email,p.coins,p.created_at,p.last_seen,p.seen_by_login,
      act.act_at as last_active,act.act_kind as last_active_kind,p.banned_until,p.is_admin
    from page p
    left join lateral (
      select z.act_kind,z.act_at from (
        select 'room'::text as act_kind,
          case when p.profile_updated_at>p.profile_created_at+interval '1 minute'
            then p.profile_updated_at end as act_at
        union all select 'diary', (select max(d.created_at) from public.diaries d
          where d.user_id=p.id and d.created_at>p.profile_created_at+interval '1 minute')
        union all select 'guestbook', (select max(g.created_at) from public.guestbook g where g.author_id=p.id)
        union all select 'intro', (select max(i.created_at) from public.intros i where i.author_id=p.id)
        union all select 'media', (select max(m.created_at) from public.media m where m.user_id=p.id)
        union all select 'comment', (select max(c.created_at) from public.media_comments c where c.author_id=p.id)
        union all select 'chat', (select max(pm.created_at) from public.place_messages pm where pm.author_id=p.id)
        union all select 'game', (select max(gs.created_at) from public.game_scores gs where gs.user_id=p.id)
        union all select 'house_post', (select max(h.created_at) from public.house_posts h
          where h.user_id=p.id and h.deleted_at is null)
      ) z where z.act_at is not null order by z.act_at desc,z.act_kind limit 1
    ) act on true
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc nulls last,i.id) from items i),'[]'::jsonb),
    'total',(select count(*) from filtered),'offset',v_offset,'limit',v_limit)
  into v_result;
  return v_result;
end;
$$;

create function ojjuda_account_internal.admin_list_withdrawn_accounts(
  p_query text default '', p_offset integer default 0, p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  v_query text := lower(btrim(coalesce(p_query,'')));
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_limit integer := least(greatest(coalesce(p_limit,20),1),50);
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  with retained as materialized (
    select w.user_id as id,w.nickname,w.email,w.account_created_at,w.withdrawn_at,w.expires_at,
      case when nullif(btrim(w.email),'') is null then null
        when strpos(w.email,'@')<=1 or split_part(w.email,'@',2)='' then '***'
        else left(split_part(w.email,'@',1),1)||'***@'||split_part(w.email,'@',2)
      end as email_masked
    from ojjuda_account_internal.withdrawn_member_accounts w
    where w.expires_at>now()
  ), filtered as materialized (
    select r.id,r.nickname,r.email_masked,r.account_created_at,r.withdrawn_at,r.expires_at
    from retained r
    where v_query='' or strpos(lower(coalesce(r.nickname,'')),v_query)>0
      or strpos(lower(coalesce(r.email,'')),v_query)>0
      or strpos(lower(coalesce(r.email_masked,'')),v_query)>0
  ), page as (
    select * from filtered order by withdrawn_at desc,id offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.withdrawn_at desc,p.id) from page p),'[]'::jsonb),
    'total',(select count(*) from filtered),'offset',v_offset,'limit',v_limit)
  into v_result;
  return v_result;
end;
$$;

create function public.admin_list_member_accounts(
  p_query text default '', p_filter text default 'all',
  p_offset integer default 0, p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.admin_list_member_accounts(p_query,p_filter,p_offset,p_limit);
$$;

create function public.admin_list_withdrawn_accounts(
  p_query text default '', p_offset integer default 0, p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path = pg_catalog as $$
  select ojjuda_account_internal.admin_list_withdrawn_accounts(p_query,p_offset,p_limit);
$$;

revoke all on function ojjuda_account_internal.admin_list_member_accounts(text,text,integer,integer),
  ojjuda_account_internal.admin_list_withdrawn_accounts(text,integer,integer),
  public.admin_list_member_accounts(text,text,integer,integer),
  public.admin_list_withdrawn_accounts(text,integer,integer) from public,anon,authenticated;
grant execute on function ojjuda_account_internal.admin_list_member_accounts(text,text,integer,integer),
  ojjuda_account_internal.admin_list_withdrawn_accounts(text,integer,integer),
  public.admin_list_member_accounts(text,text,integer,integer),
  public.admin_list_withdrawn_accounts(text,integer,integer) to authenticated;

notify pgrst, 'reload schema';
