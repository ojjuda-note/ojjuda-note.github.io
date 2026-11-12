-- A tarot payment grants exactly 24 hours of access, independent of KST midnight.
-- Preserve every ledger receipt and its original price, creation time and choices.
-- Wait for earlier ledger writes before replacing their registration guard.
lock table ojjuda_note_internal.spend_requests in share row exclusive mode;

create index if not exists daily_readings_user_topic_created_idx
  on ojjuda_tarot_internal.daily_readings(user_id,topic,created_at desc,request_id desc);

-- All callers share one server timestamp so an expiry cannot appear as a card
-- payload inside today's active list. This helper is never directly callable.
create function ojjuda_tarot_internal.receipt_at_v1(
  p_request_id uuid,p_coins integer,p_replayed boolean,p_daily_replayed boolean,p_now timestamptz
) returns jsonb language sql set search_path='' as $function$
  select case when s.created_at+interval '24 hours'<=p_now then
    jsonb_build_object('ok',false,'reason','expired','request_id',s.request_id,
      'topic',s.result->>'topic','coins',p_coins,'reading_day',coalesce(d.reading_day,(s.created_at at time zone 'Asia/Seoul')::date),
      'reset_at',s.created_at+interval '24 hours','server_now',p_now)
  else s.result || jsonb_build_object(
    'ok',true,'request_id',s.request_id,'topic',s.result->>'topic','coins',p_coins,
    'created_at',s.created_at,'reading_day',coalesce(d.reading_day,(s.created_at at time zone 'Asia/Seoul')::date),
    'reset_at',s.created_at+interval '24 hours','server_now',p_now,
    'discarded',coalesce(to_jsonb(d.discarded),'[]'::jsonb),
    'open_order',coalesce(to_jsonb(d.open_order),'[]'::jsonb),
    'replayed',p_replayed,'daily_replayed',p_daily_replayed
  ) end
  from ojjuda_note_internal.spend_requests s
  left join ojjuda_tarot_internal.daily_readings d on d.request_id=s.request_id and d.user_id=s.user_id
  where s.request_id=p_request_id and s.kind='tarot_reading_v1';
$function$;
revoke all on function ojjuda_tarot_internal.receipt_at_v1(uuid,integer,boolean,boolean,timestamptz) from public,anon,authenticated;

create or replace function ojjuda_tarot_internal.receipt_v1(
  p_request_id uuid,p_coins integer,p_replayed boolean,p_daily_replayed boolean
) returns jsonb language sql set search_path='' as $function$
  select ojjuda_tarot_internal.receipt_at_v1(p_request_id,p_coins,p_replayed,p_daily_replayed,clock_timestamp());
$function$;
revoke all on function ojjuda_tarot_internal.receipt_v1(uuid,integer,boolean,boolean) from public,anon,authenticated;

-- A legacy buy already in flight must not create an overlapping payment after
-- midnight. Raising here rolls back both its ledger row and its wallet debit.
create or replace function ojjuda_tarot_internal.register_daily_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
  v_existing uuid;
begin
  if new.kind<>'tarot_reading_v1' then return new; end if;
  perform 1 from public.user_private where user_id=new.user_id for update;
  select d.request_id into v_existing
    from ojjuda_tarot_internal.daily_readings d
    join ojjuda_note_internal.spend_requests s on s.request_id=d.request_id and s.user_id=d.user_id
    where d.user_id=new.user_id and d.topic=new.result->>'topic' and d.request_id<>new.request_id
      and s.kind='tarot_reading_v1'
      and s.created_at<new.created_at+interval '24 hours'
      and s.created_at+interval '24 hours'>new.created_at
    order by s.created_at desc,d.request_id desc limit 1;
  if found then raise exception 'tarot_active_limit' using errcode='23505'; end if;
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

create or replace function ojjuda_tarot_internal.today_v1()
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_coins integer;
  v_readings jsonb;
  v_reset_at timestamptz;
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required','server_now',v_now);
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned','server_now',v_now); end if;
  select coins into v_coins from public.user_private where user_id=v_user;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable','server_now',v_now); end if;
  v_now:=clock_timestamp();
  -- Pre-migration adjacent-day receipts may overlap. Keep their history but
  -- offer one deterministic, newest active receipt per topic in the overview.
  with active as (
    select distinct on (d.topic) d.topic,d.request_id,s.created_at
    from ojjuda_tarot_internal.daily_readings d
    join ojjuda_note_internal.spend_requests s on s.request_id=d.request_id and s.user_id=d.user_id
    where d.user_id=v_user and s.kind='tarot_reading_v1'
      and s.created_at>v_now-interval '24 hours'
    order by d.topic,s.created_at desc,d.request_id desc
  )
  select coalesce(jsonb_agg(ojjuda_tarot_internal.receipt_at_v1(a.request_id,v_coins,true,true,v_now) order by a.topic),'[]'::jsonb),
    min(a.created_at+interval '24 hours') into v_readings,v_reset_at from active a;
  return jsonb_build_object('ok',true,'reading_day',(v_now at time zone 'Asia/Seoul')::date,
    'reset_at',coalesce(v_reset_at,v_now+interval '24 hours'),'server_now',v_now,
    'coins',v_coins,'readings',v_readings);
end;
$function$;
revoke all on function ojjuda_tarot_internal.today_v1() from public,anon;
grant execute on function ojjuda_tarot_internal.today_v1() to authenticated;

create or replace function ojjuda_tarot_internal.buy_v2(
  p_request_id uuid,p_topic text,p_expected_price integer,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_price integer := case when p_topic='overall' then 30 else 10 end;
  v_previous record;
  v_daily_id uuid;
  v_now timestamptz := clock_timestamp();
  v_day date;
  v_drawn text[];
  v_result jsonb;
  v_deck constant text[] := array['fool','magician','priestess','empress','emperor','hierophant','lovers','chariot','strength','hermit','wheel','justice','hanged_man','death','temperance','devil','tower','star','moon','sun','judgement','world','wands_ace','wands_two','wands_three','wands_four','wands_five','wands_six','wands_seven','wands_eight','wands_nine','wands_ten','wands_page','wands_knight','wands_queen','wands_king','cups_ace','cups_two','cups_three','cups_four','cups_five','cups_six','cups_seven','cups_eight','cups_nine','cups_ten','cups_page','cups_knight','cups_queen','cups_king','swords_ace','swords_two','swords_three','swords_four','swords_five','swords_six','swords_seven','swords_eight','swords_nine','swords_ten','swords_page','swords_knight','swords_queen','swords_king','pentacles_ace','pentacles_two','pentacles_three','pentacles_four','pentacles_five','pentacles_six','pentacles_seven','pentacles_eight','pentacles_nine','pentacles_ten','pentacles_page','pentacles_knight','pentacles_queen','pentacles_king'];
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required','server_now',v_now);
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned','server_now',v_now); end if;
  if p_request_id is null or p_topic is null or p_topic not in ('overall','love','money','work') or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid','server_now',v_now);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  -- All buy/save paths acquire wallet before the daily row.
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable','server_now',v_now); end if;
  v_now:=clock_timestamp();
  v_day:=(v_now at time zone 'Asia/Seoul')::date;
  select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.kind<>'tarot_reading_v1'
      or v_previous.result->>'topic' is distinct from p_topic then
      return jsonb_build_object('ok',false,'reason','request_conflict','server_now',v_now);
    end if;
    -- An expired UUID is never redirected or silently charged again.
    return ojjuda_tarot_internal.receipt_at_v1(p_request_id,v_coins,true,true,v_now);
  end if;
  -- Select the newest canonical active receipt, including a prior KST date.
  select d.request_id into v_daily_id from ojjuda_tarot_internal.daily_readings d
    join ojjuda_note_internal.spend_requests s on s.request_id=d.request_id and s.user_id=d.user_id
    where d.user_id=v_user and d.topic=p_topic and s.kind='tarot_reading_v1'
      and s.created_at>v_now-interval '24 hours'
    order by s.created_at desc,d.request_id desc limit 1;
  if found then
    return ojjuda_tarot_internal.receipt_at_v1(v_daily_id,v_coins,true,true,v_now);
  end if;
  if p_verify_only then
    return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins,'reading_day',v_day,
      'reset_at',v_now+interval '24 hours','server_now',v_now);
  end if;
  -- Compare the displayed quote only for a NEW purchase. Existing receipts stay free.
  if p_expected_price is distinct from v_price then
    return jsonb_build_object('ok',false,'reason','price_changed','coins',v_coins,'price',v_price,'server_now',v_now);
  end if;
  if v_coins<v_price then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',v_price,'server_now',v_now); end if;
  select array_agg(id order by position) into v_drawn from (
    select id,row_number() over () as position from (
      select id from unnest(v_deck) as id order by random() limit 5
    ) shuffled
  ) ordered_cards;
  v_now:=clock_timestamp();
  update public.user_private set coins=coins-v_price where user_id=v_user and coins>=v_price returning coins into v_coins;
  if not found then return jsonb_build_object('ok',false,'reason','coins','server_now',v_now); end if;
  v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'topic',p_topic,
    'drawn',to_jsonb(v_drawn),'price',v_price,'coins',v_coins,'deck_version',1,'replayed',false);
  -- The trigger additionally rejects any overlapping 24-hour payment.
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,v_user,'tarot_reading_v1',v_price,v_result,v_now);
  return ojjuda_tarot_internal.receipt_at_v1(p_request_id,v_coins,false,false,v_now);
end;
$function$;
revoke all on function ojjuda_tarot_internal.buy_v2(uuid,text,integer,boolean) from public,anon;
grant execute on function ojjuda_tarot_internal.buy_v2(uuid,text,integer,boolean) to authenticated;


create or replace function ojjuda_tarot_internal.save_v1(
  p_request_id uuid,p_discarded integer[],p_open_order integer[]
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_now timestamptz := clock_timestamp();
  v_created_at timestamptz;
  v_daily ojjuda_tarot_internal.daily_readings%rowtype;
  v_discarded integer[];
  v_open_order integer[];
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required','server_now',v_now);
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned','server_now',v_now); end if;
  if p_request_id is null or p_discarded is null or p_open_order is null then
    return jsonb_build_object('ok',false,'reason','invalid','server_now',v_now);
  end if;
  if coalesce(array_ndims(p_discarded),1)<>1 or coalesce(array_ndims(p_open_order),1)<>1
    or coalesce(array_lower(p_discarded,1),1)<>1 or coalesce(array_lower(p_open_order,1),1)<>1
    or cardinality(p_discarded)>2 or cardinality(p_open_order)>3 then
    return jsonb_build_object('ok',false,'reason','invalid','server_now',v_now);
  end if;
  if exists(select 1 from unnest(p_discarded||p_open_order) as i where i is null or i<0 or i>4)
    or (select count(distinct i) from unnest(p_discarded) as i)<>cardinality(p_discarded)
    or (select count(distinct i) from unnest(p_open_order) as i)<>cardinality(p_open_order)
    or p_discarded && p_open_order or (cardinality(p_open_order)>0 and cardinality(p_discarded)<>2) then
    return jsonb_build_object('ok',false,'reason','invalid','server_now',v_now);
  end if;
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable','server_now',v_now); end if;
  v_now:=clock_timestamp();
  select created_at into v_created_at from ojjuda_note_internal.spend_requests
    where request_id=p_request_id and user_id=v_user and kind='tarot_reading_v1';
  if not found then return jsonb_build_object('ok',false,'reason','not_found','server_now',v_now); end if;
  if v_created_at+interval '24 hours'<=v_now then
    return ojjuda_tarot_internal.receipt_at_v1(p_request_id,v_coins,true,true,v_now);
  end if;
  select * into v_daily from ojjuda_tarot_internal.daily_readings where request_id=p_request_id and user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found','server_now',v_now); end if;
  -- A lock wait must not allow a save that crossed the receipt's expiry.
  v_now:=clock_timestamp();
  if v_created_at+interval '24 hours'<=v_now then
    return ojjuda_tarot_internal.receipt_at_v1(p_request_id,v_coins,true,true,v_now);
  end if;
  -- Every accepted choice is permanent; a delayed shorter prefix cannot erase it.
  if p_discarded[1:least(cardinality(p_discarded),cardinality(v_daily.discarded))]
      is distinct from v_daily.discarded[1:least(cardinality(p_discarded),cardinality(v_daily.discarded))]
    or p_open_order[1:least(cardinality(p_open_order),cardinality(v_daily.open_order))]
      is distinct from v_daily.open_order[1:least(cardinality(p_open_order),cardinality(v_daily.open_order))] then
    return jsonb_build_object('ok',false,'reason','progress_conflict','server_now',v_now,
      'receipt',ojjuda_tarot_internal.receipt_at_v1(p_request_id,v_coins,true,true,v_now));
  end if;
  v_discarded:=case when cardinality(p_discarded)>cardinality(v_daily.discarded) then p_discarded else v_daily.discarded end;
  v_open_order:=case when cardinality(p_open_order)>cardinality(v_daily.open_order) then p_open_order else v_daily.open_order end;
  if v_discarded is distinct from v_daily.discarded or v_open_order is distinct from v_daily.open_order then
    update ojjuda_tarot_internal.daily_readings set discarded=v_discarded,open_order=v_open_order,updated_at=v_now
      where request_id=p_request_id and user_id=v_user;
  end if;
  return ojjuda_tarot_internal.receipt_at_v1(p_request_id,v_coins,true,true,v_now);
end;
$function$;
revoke all on function ojjuda_tarot_internal.save_v1(uuid,integer[],integer[]) from public,anon;
grant execute on function ojjuda_tarot_internal.save_v1(uuid,integer[],integer[]) to authenticated;

