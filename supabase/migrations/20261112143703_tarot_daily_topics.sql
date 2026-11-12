-- One paid reading per member, topic and Korean calendar day.
-- Reopening it returns the original cards and append-only selections for free.
create table ojjuda_tarot_internal.daily_readings (
  user_id uuid not null references auth.users(id) on delete cascade,
  reading_day date not null,
  topic text not null check (topic in ('overall','love','money','work')),
  request_id uuid not null unique,
  discarded integer[] not null default '{}' check (cardinality(discarded) between 0 and 2),
  open_order integer[] not null default '{}' check (cardinality(open_order) between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,reading_day,topic)
);
alter table ojjuda_tarot_internal.daily_readings enable row level security;
revoke all on table ojjuda_tarot_internal.daily_readings from public,anon,authenticated;

-- Wait for older ledger writes before backfilling and installing the guard.
-- This also covers buy_v1 calls already in flight during this migration.
lock table ojjuda_note_internal.spend_requests in share row exclusive mode;
insert into ojjuda_tarot_internal.daily_readings(user_id,reading_day,topic,request_id,created_at,updated_at)
select distinct on (s.user_id,(s.created_at at time zone 'Asia/Seoul')::date,s.result->>'topic')
  s.user_id,(s.created_at at time zone 'Asia/Seoul')::date,s.result->>'topic',s.request_id,s.created_at,s.created_at
from ojjuda_note_internal.spend_requests s
where s.kind='tarot_reading_v1' and s.coins=10 and s.result->>'ok'='true'
  and s.result->>'topic' in ('overall','love','money','work')
  and case when jsonb_typeof(s.result->'drawn')='array' then jsonb_array_length(s.result->'drawn')=5 else false end
order by s.user_id,(s.created_at at time zone 'Asia/Seoul')::date,s.result->>'topic',s.created_at desc,s.request_id desc;

create function ojjuda_tarot_internal.register_daily_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
  v_existing uuid;
begin
  if new.kind<>'tarot_reading_v1' then return new; end if;
  insert into ojjuda_tarot_internal.daily_readings(user_id,reading_day,topic,request_id,created_at,updated_at)
    values(new.user_id,(new.created_at at time zone 'Asia/Seoul')::date,new.result->>'topic',new.request_id,new.created_at,new.created_at)
    on conflict (user_id,reading_day,topic) do nothing;
  if not found then
    select request_id into v_existing from ojjuda_tarot_internal.daily_readings
      where user_id=new.user_id and reading_day=(new.created_at at time zone 'Asia/Seoul')::date and topic=new.result->>'topic';
    if v_existing is distinct from new.request_id then
      raise exception 'tarot_daily_limit' using errcode='23505';
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function ojjuda_tarot_internal.register_daily_v1() from public,anon,authenticated;
create trigger tarot_daily_receipt_guard
  after insert on ojjuda_note_internal.spend_requests
  for each row when (new.kind='tarot_reading_v1')
  execute function ojjuda_tarot_internal.register_daily_v1();

-- Owner-only formatter. Public wrappers never accept another member's ID.
create function ojjuda_tarot_internal.receipt_v1(
  p_request_id uuid,p_coins integer,p_replayed boolean,p_daily_replayed boolean
) returns jsonb language sql set search_path='' as $function$
  select s.result || jsonb_build_object(
    'ok',true,'request_id',s.request_id,'topic',s.result->>'topic','coins',p_coins,
    'reading_day',coalesce(d.reading_day,(s.created_at at time zone 'Asia/Seoul')::date),
    'reset_at',((coalesce(d.reading_day,(s.created_at at time zone 'Asia/Seoul')::date)+1)::timestamp at time zone 'Asia/Seoul'),
    'discarded',coalesce(to_jsonb(d.discarded),'[]'::jsonb),
    'open_order',coalesce(to_jsonb(d.open_order),'[]'::jsonb),
    'replayed',p_replayed,'daily_replayed',p_daily_replayed
  )
  from ojjuda_note_internal.spend_requests s
  left join ojjuda_tarot_internal.daily_readings d on d.request_id=s.request_id and d.user_id=s.user_id
  where s.request_id=p_request_id and s.kind='tarot_reading_v1';
$function$;
revoke all on function ojjuda_tarot_internal.receipt_v1(uuid,integer,boolean,boolean) from public,anon,authenticated;

create or replace function ojjuda_tarot_internal.buy_v1(
  p_request_id uuid,p_topic text,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_previous record;
  v_daily_id uuid;
  v_now timestamptz;
  v_day date;
  v_drawn text[];
  v_result jsonb;
  v_deck constant text[] := array['fool','magician','priestess','empress','emperor','hierophant','lovers','chariot','strength','hermit','wheel','justice','hanged_man','death','temperance','devil','tower','star','moon','sun','judgement','world','wands_ace','wands_two','wands_three','wands_four','wands_five','wands_six','wands_seven','wands_eight','wands_nine','wands_ten','wands_page','wands_knight','wands_queen','wands_king','cups_ace','cups_two','cups_three','cups_four','cups_five','cups_six','cups_seven','cups_eight','cups_nine','cups_ten','cups_page','cups_knight','cups_queen','cups_king','swords_ace','swords_two','swords_three','swords_four','swords_five','swords_six','swords_seven','swords_eight','swords_nine','swords_ten','swords_page','swords_knight','swords_queen','swords_king','pentacles_ace','pentacles_two','pentacles_three','pentacles_four','pentacles_five','pentacles_six','pentacles_seven','pentacles_eight','pentacles_nine','pentacles_ten','pentacles_page','pentacles_knight','pentacles_queen','pentacles_king'];
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_request_id is null or p_topic is null or p_topic not in ('overall','love','money','work') or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  -- All buy/save paths acquire wallet before the daily row.
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  v_now:=clock_timestamp();
  v_day:=(v_now at time zone 'Asia/Seoul')::date;
  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.kind<>'tarot_reading_v1'
      or v_previous.result->>'topic' is distinct from p_topic then
      return jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    return ojjuda_tarot_internal.receipt_v1(p_request_id,v_coins,true,true);
  end if;
  select request_id into v_daily_id from ojjuda_tarot_internal.daily_readings
    where user_id=v_user and reading_day=v_day and topic=p_topic;
  if found then
    return ojjuda_tarot_internal.receipt_v1(v_daily_id,v_coins,true,true);
  end if;
  if p_verify_only then
    return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'reading_day',v_day,
      'reset_at',((v_day+1)::timestamp at time zone 'Asia/Seoul'));
  end if;
  if v_coins<10 then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',10); end if;
  select array_agg(id order by position) into v_drawn from (
    select id,row_number() over () as position from (
      select id from unnest(v_deck) as id order by random() limit 5
    ) shuffled
  ) ordered_cards;
  update public.user_private set coins=coins-10 where user_id=v_user and coins>=10 returning coins into v_coins;
  if not found then return jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'topic',p_topic,
    'drawn',to_jsonb(v_drawn),'price',10,'coins',v_coins,'deck_version',1,'replayed',false);
  -- The trigger atomically registers the unique user/day/topic receipt.
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'tarot_reading_v1',10,v_result,v_now);
  return ojjuda_tarot_internal.receipt_v1(p_request_id,v_coins,false,false);
end;
$function$;
revoke all on function ojjuda_tarot_internal.buy_v1(uuid,text,boolean) from public,anon;
grant execute on function ojjuda_tarot_internal.buy_v1(uuid,text,boolean) to authenticated;

create function ojjuda_tarot_internal.today_v1()
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_coins integer;
  v_readings jsonb;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  select coins into v_coins from public.user_private where user_id=v_user;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  select coalesce(jsonb_agg(ojjuda_tarot_internal.receipt_v1(d.request_id,v_coins,true,true) order by d.topic),'[]'::jsonb)
    into v_readings from ojjuda_tarot_internal.daily_readings d where d.user_id=v_user and d.reading_day=v_day;
  return jsonb_build_object('ok',true,'reading_day',v_day,'reset_at',((v_day+1)::timestamp at time zone 'Asia/Seoul'),
    'coins',v_coins,'readings',v_readings);
end;
$function$;
revoke all on function ojjuda_tarot_internal.today_v1() from public,anon;
grant execute on function ojjuda_tarot_internal.today_v1() to authenticated;

create function ojjuda_tarot_internal.save_v1(
  p_request_id uuid,p_discarded integer[],p_open_order integer[]
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_daily ojjuda_tarot_internal.daily_readings%rowtype;
  v_discarded integer[];
  v_open_order integer[];
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_request_id is null or p_discarded is null or p_open_order is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if coalesce(array_ndims(p_discarded),1)<>1 or coalesce(array_ndims(p_open_order),1)<>1
    or coalesce(array_lower(p_discarded,1),1)<>1 or coalesce(array_lower(p_open_order,1),1)<>1
    or cardinality(p_discarded)>2 or cardinality(p_open_order)>3 then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if exists(select 1 from unnest(p_discarded||p_open_order) as i where i is null or i<0 or i>4)
    or (select count(distinct i) from unnest(p_discarded) as i)<>cardinality(p_discarded)
    or (select count(distinct i) from unnest(p_open_order) as i)<>cardinality(p_open_order)
    or p_discarded && p_open_order or (cardinality(p_open_order)>0 and cardinality(p_discarded)<>2) then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  select * into v_daily from ojjuda_tarot_internal.daily_readings where request_id=p_request_id and user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  -- Every accepted choice is permanent; a delayed shorter prefix cannot erase it.
  if p_discarded[1:least(cardinality(p_discarded),cardinality(v_daily.discarded))]
      is distinct from v_daily.discarded[1:least(cardinality(p_discarded),cardinality(v_daily.discarded))]
    or p_open_order[1:least(cardinality(p_open_order),cardinality(v_daily.open_order))]
      is distinct from v_daily.open_order[1:least(cardinality(p_open_order),cardinality(v_daily.open_order))] then
    return jsonb_build_object('ok',false,'reason','progress_conflict',
      'receipt',ojjuda_tarot_internal.receipt_v1(p_request_id,v_coins,true,true));
  end if;
  v_discarded:=case when cardinality(p_discarded)>cardinality(v_daily.discarded) then p_discarded else v_daily.discarded end;
  v_open_order:=case when cardinality(p_open_order)>cardinality(v_daily.open_order) then p_open_order else v_daily.open_order end;
  if v_discarded is distinct from v_daily.discarded or v_open_order is distinct from v_daily.open_order then
    update ojjuda_tarot_internal.daily_readings set discarded=v_discarded,open_order=v_open_order,updated_at=clock_timestamp()
      where request_id=p_request_id and user_id=v_user;
  end if;
  return ojjuda_tarot_internal.receipt_v1(p_request_id,v_coins,true,true);
end;
$function$;
revoke all on function ojjuda_tarot_internal.save_v1(uuid,integer[],integer[]) from public,anon;
grant execute on function ojjuda_tarot_internal.save_v1(uuid,integer[],integer[]) to authenticated;

create function public.tarot_reading_today_v1()
returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_tarot_internal.today_v1();
$function$;
revoke all on function public.tarot_reading_today_v1() from public,anon;
grant execute on function public.tarot_reading_today_v1() to authenticated;

create function public.tarot_reading_save_v1(p_request_id uuid,p_discarded integer[],p_open_order integer[])
returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_tarot_internal.save_v1(p_request_id,p_discarded,p_open_order);
$function$;
revoke all on function public.tarot_reading_save_v1(uuid,integer[],integer[]) from public,anon;
grant execute on function public.tarot_reading_save_v1(uuid,integer[],integer[]) to authenticated;
