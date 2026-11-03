-- One editable member score per restaurant. The certified directory remains a
-- versioned static file: bounded IDs and a per-member daily creation quota keep
-- its ratings independent of manual catalog synchronization. Recommended IDs
-- additionally reference a real, visible member recommendation.

create function ojjuda_restaurants_internal.rating_target_valid(p_kind text,p_id text)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(char_length(p_id) between 1 and 80 and octet_length(p_id)<=256
  and case p_kind
   when 'certified' then p_id ~ '^[a-z0-9가-힣]+(-[a-z0-9가-힣]+)*$'
   when 'recommended' then p_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   else false end,false);
$$;

create table ojjuda_restaurants_internal.ratings (
 target_kind text not null,
 target_id text not null,
 member_id uuid not null references auth.users(id) on delete cascade,
 recommendation_id uuid references ojjuda_restaurants_internal.recommendations(id) on delete cascade,
 score_half_units smallint not null check(score_half_units between 2 and 10),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 primary key(target_kind,target_id,member_id),
 check(ojjuda_restaurants_internal.rating_target_valid(target_kind,target_id)),
 check((target_kind='certified' and recommendation_id is null)
  or (target_kind='recommended' and recommendation_id is not null and target_id=recommendation_id::text))
);
create index restaurant_ratings_member_created on ojjuda_restaurants_internal.ratings(member_id,created_at);
create index restaurant_ratings_recommendation on ojjuda_restaurants_internal.ratings(recommendation_id)
 where recommendation_id is not null;
alter table ojjuda_restaurants_internal.ratings enable row level security;
revoke all on ojjuda_restaurants_internal.ratings from public,anon,authenticated;

-- The result contains one item per available, distinct ID in input order. Empty
-- scores are represented by average/my_rating=null and count=0, never zero stars.
-- Only the caller's individual rating is returned; other members remain private.
create function ojjuda_restaurants_internal.rating_summaries(p_kind text,p_ids text[])
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); result jsonb;
begin
 if p_kind is null or p_kind not in ('certified','recommended') or p_ids is null
  or cardinality(p_ids)>100
  or (cardinality(p_ids)>0 and (array_ndims(p_ids) is distinct from 1 or array_lower(p_ids,1) is distinct from 1))
  or exists(select 1 from unnest(p_ids) id where not ojjuda_restaurants_internal.rating_target_valid(p_kind,id)) then
  raise exception 'restaurant_rating_invalid_input' using errcode='22023';
 end if;
 with requested as (
  select id,min(position) as position from unnest(p_ids) with ordinality as ids(id,position) group by id
 ), eligible as materialized (
  select q.* from requested q
  where p_kind='certified' or exists(
   select 1 from ojjuda_restaurants_internal.recommendations post
   where post.id=case when p_kind='recommended' then q.id::uuid else null end
    and ojjuda_restaurants_internal.author_visible(post.owner_id))
 ), summary as (
  select r.target_id,round(avg(r.score_half_units)/2,2) as average,count(*)::integer as count,
   max(case when r.member_id=u then r.score_half_units::numeric/2 else null end) as my_rating
  from ojjuda_restaurants_internal.ratings r join eligible e on e.id=r.target_id
  where r.target_kind=p_kind and ojjuda_restaurants_internal.author_visible(r.member_id)
  group by r.target_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'average',s.average,
  'count',coalesce(s.count,0),'my_rating',s.my_rating) order by e.position),'[]'::jsonb)
 into result from eligible e left join summary s on s.target_id=e.id;
 return result;
end;
$$;

create function ojjuda_restaurants_internal.set_rating(p_kind text,p_id text,p_score numeric)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare u uuid := ojjuda_restaurants_internal.require_member(); recommendation uuid;
 previous ojjuda_restaurants_internal.ratings; existed boolean; today timestamptz;
begin
 -- Share the account-withdrawal lock, then recheck after acquiring it. The caller
 -- cannot choose another member ID or race their own daily target quota.
 perform pg_advisory_xact_lock(127247341,hashtext(u::text));
 perform ojjuda_restaurants_internal.require_member();
 if not ojjuda_restaurants_internal.rating_target_valid(p_kind,p_id)
  or p_score is null or not(p_score=any(array[1,1.5,2,2.5,3,3.5,4,4.5,5]::numeric[])) then
  raise exception 'restaurant_rating_invalid_input' using errcode='22023';
 end if;
 if p_kind='recommended' then
  recommendation := p_id::uuid;
  -- Match recommendation saves/deletes so a delayed vote cannot resurrect a
  -- removed post; its foreign key also cascades all ratings on deletion.
  perform pg_advisory_xact_lock(127247342,hashtext(p_id));
  if not exists(select 1 from ojjuda_restaurants_internal.recommendations r
   where r.id=recommendation and ojjuda_restaurants_internal.author_visible(r.owner_id)) then
   raise exception 'restaurant_rating_target_unavailable' using errcode='P0002';
  end if;
 end if;
 select * into previous from ojjuda_restaurants_internal.ratings
  where target_kind=p_kind and target_id=p_id and member_id=u;
 existed := found;
 if existed and previous.score_half_units=p_score*2 then
  return ojjuda_restaurants_internal.rating_summaries(p_kind,array[p_id])->0;
 end if;
 if not existed then
  today := date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  if (select count(*) from (
   select 1 from ojjuda_restaurants_internal.ratings where member_id=u and created_at>=today limit 500
  ) recent)>=500 then
   raise exception 'restaurant_rating_daily_limit' using errcode='54000';
  end if;
 end if;
 insert into ojjuda_restaurants_internal.ratings(target_kind,target_id,member_id,recommendation_id,score_half_units)
  values(p_kind,p_id,u,recommendation,(p_score*2)::smallint)
 on conflict(target_kind,target_id,member_id) do update
  set score_half_units=excluded.score_half_units,
   updated_at=greatest(clock_timestamp(),ojjuda_restaurants_internal.ratings.updated_at+interval '1 microsecond');
 return ojjuda_restaurants_internal.rating_summaries(p_kind,array[p_id])->0;
end;
$$;

create function public.get_restaurant_rating_summaries(p_kind text,p_ids text[])
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.rating_summaries(p_kind,p_ids);
$$;
create function public.set_restaurant_rating(p_kind text,p_id text,p_score numeric)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$
 select ojjuda_restaurants_internal.set_rating(p_kind,p_id,p_score);
$$;

revoke all on function ojjuda_restaurants_internal.rating_target_valid(text,text),
 ojjuda_restaurants_internal.rating_summaries(text,text[]),
 ojjuda_restaurants_internal.set_rating(text,text,numeric) from public,anon,authenticated;
grant execute on function ojjuda_restaurants_internal.rating_summaries(text,text[]),
 ojjuda_restaurants_internal.set_rating(text,text,numeric) to authenticated;
revoke all on function public.get_restaurant_rating_summaries(text,text[]),
 public.set_restaurant_rating(text,text,numeric) from public,anon,authenticated;
grant execute on function public.get_restaurant_rating_summaries(text,text[]),
 public.set_restaurant_rating(text,text,numeric) to authenticated;

notify pgrst,'reload schema';
