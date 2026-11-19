-- Prepare extra signal purchases without publishing or enabling an unconfirmed price.
-- Only a later, explicit configuration change may enable an offer.
create table pajang_private.signal_packs (
  id text primary key check (id in ('signal_1','signal_3','signal_5')),
  quantity integer not null check (quantity = case id
    when 'signal_1' then 1 when 'signal_3' then 3 when 'signal_5' then 5 end),
  price integer check (price between 1 and 1000000),
  enabled boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  check (not enabled or price is not null)
);
create table pajang_private.signal_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paid_remaining integer not null default 0 check (paid_remaining >= 0)
);
alter table pajang_private.signal_packs enable row level security;
alter table pajang_private.signal_balances enable row level security;
revoke all on pajang_private.signal_packs, pajang_private.signal_balances
  from public, anon, authenticated, service_role;
insert into pajang_private.signal_packs(id,quantity) values
  ('signal_1',1),('signal_3',3),('signal_5',5);

-- A previously displayed offer cannot authorize a newly configured price.
create function pajang_private.signal_offer_revision() returns trigger
language plpgsql security invoker set search_path='' as $function$
begin
  if new.id is distinct from old.id then raise exception 'signal_pack_id_is_immutable'; end if;
  new.revision := old.revision + case when (new.quantity,new.price,new.enabled)
    is distinct from (old.quantity,old.price,old.enabled) then 1 else 0 end;
  return new;
end;
$function$;
revoke all on function pajang_private.signal_offer_revision() from public, anon, authenticated, service_role;
create trigger signal_offer_revision before update on pajang_private.signal_packs
  for each row execute function pajang_private.signal_offer_revision();

create function pajang_private.signal_offers() returns jsonb
language sql stable security invoker set search_path='' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'quantity',p.quantity,
    'price',p.price,'revision',p.revision) order by p.quantity),'[]'::jsonb)
  from pajang_private.signal_packs p where p.enabled and p.price is not null;
$function$;
revoke all on function pajang_private.signal_offers() from public, anon, authenticated, service_role;

create function pajang_private.signal_quota(p_user uuid,p_day date) returns jsonb
language sql stable security invoker set search_path='' as $function$
  select jsonb_build_object('freeRemaining',q.free_left,'paidRemaining',q.paid_left,
    'remaining',q.free_left+q.paid_left,'purchasingEnabled',
      exists(select from pajang_private.signal_packs where enabled and price is not null))
  from (select greatest(0,3-(select count(*)::integer from pajang_private.signals s
      join pajang_private.people p on p.id=s.src where p.owner_id=p_user and s.day=p_day)) as free_left,
    coalesce((select b.paid_remaining from pajang_private.signal_balances b where b.user_id=p_user),0) as paid_left) q;
$function$;
revoke all on function pajang_private.signal_quota(uuid,date) from public, anon, authenticated, service_role;

create function pajang_private.require_signal_member() returns uuid
language plpgsql security invoker set search_path='' as $function$
declare
  u uuid := ojjuda_restaurants_internal.require_member();
begin
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception '회원 로그인이 필요해요.' using errcode='42501';
  end if;
  if exists(select from ojjuda_account_internal.member_identity i where i.user_id=u
    and extract(year from age((clock_timestamp() at time zone 'Asia/Seoul')::date,i.birth_date))<19) then
    raise exception '파장은 만 19세 이상 회원만 이용할 수 있어요.' using errcode='42501';
  end if;
  if not exists(select from pajang_private.people where owner_id=u) then
    raise exception '먼저 파장에 참여해 주세요.' using errcode='42501';
  end if;
  return u;
end;
$function$;
revoke all on function pajang_private.require_signal_member() from public, anon, authenticated, service_role;

create function public.pajang_signal_wallet() returns jsonb
language plpgsql security definer set search_path='' as $function$
declare
  u uuid := pajang_private.require_signal_member();
  balance integer;
begin
  select coins into balance from public.user_private where user_id=u;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  return pajang_private.signal_quota(u,(clock_timestamp() at time zone 'Asia/Seoul')::date)
    ||jsonb_build_object('ok',true,'coins',balance,'offers',pajang_private.signal_offers());
end;
$function$;
revoke all on function public.pajang_signal_wallet() from public, anon, authenticated, service_role;
grant execute on function public.pajang_signal_wallet() to authenticated;

create function public.pajang_signal_purchase(
  p_pack text,p_request_id uuid,p_expected_user uuid,p_expected_price integer,
  p_expected_revision integer,p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  u uuid := pajang_private.require_signal_member();
  balance integer;
  previous ojjuda_note_internal.spend_requests;
  offer pajang_private.signal_packs;
  today date;
  purchased_at timestamptz;
  quota jsonb;
  result jsonb;
begin
  if p_expected_user is distinct from u then
    return jsonb_build_object('ok',false,'reason','account_changed');
  end if;
  if p_pack is null or p_pack not in ('signal_1','signal_3','signal_5') or p_request_id is null
    or p_expected_price is null or p_expected_price not between 1 and 1000000
    or p_expected_revision is null or p_expected_revision<1 or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  if p_verify_only then
    -- Receipt recovery performs no writes and works in a read-only transaction.
    select coins into balance from public.user_private where user_id=u;
  else
    -- Follow the shared payment order: global request UUID, then the wallet.
    -- The existing Pajang member lock additionally serializes purchase/send/delete.
    perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
    perform pg_advisory_xact_lock(hashtextextended(u::text,125));
    perform pajang_private.require_signal_member();
    select coins into balance from public.user_private where user_id=u for update;
  end if;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  purchased_at := clock_timestamp();
  today := (purchased_at at time zone 'Asia/Seoul')::date;
  quota := pajang_private.signal_quota(u,today)
    ||jsonb_build_object('coins',balance,'offers',pajang_private.signal_offers());
  select * into previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if previous.user_id is distinct from u or previous.kind is distinct from 'pajang_signal_pack_v1'
      or previous.result->>'pack' is distinct from p_pack
      or previous.result->>'price' is distinct from p_expected_price::text
      or previous.result->>'revision' is distinct from p_expected_revision::text
      or previous.result->'ok' is distinct from 'true'::jsonb then
      return jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    -- Replays retain the original receipt but always return the current balances.
    return previous.result||quota||jsonb_build_object('charged',0,'replayed',true);
  end if;
  if p_verify_only then return quota||jsonb_build_object('ok',false,'reason','not_found'); end if;
  -- Lock the quoted offer until the receipt and both balances commit together.
  select * into offer from pajang_private.signal_packs where id=p_pack for share;
  if not found or not offer.enabled or offer.price is null then
    return quota||jsonb_build_object('ok',false,'reason','purchase_unavailable');
  end if;
  if offer.price<>p_expected_price or offer.revision<>p_expected_revision then
    return quota||jsonb_build_object('ok',false,'reason','price_changed',
      'offers',pajang_private.signal_offers());
  end if;
  if (quota->>'freeRemaining')::integer>0 then
    return quota||jsonb_build_object('ok',false,'reason','free_remaining');
  end if;
  if balance<offer.price then
    return quota||jsonb_build_object('ok',false,'reason','coins','price',offer.price);
  end if;
  update public.user_private set coins=coins-offer.price
    where user_id=u and coins>=offer.price returning coins into balance;
  if not found then return quota||jsonb_build_object('ok',false,'reason','coins'); end if;
  insert into pajang_private.signal_balances(user_id,paid_remaining) values(u,offer.quantity)
    on conflict(user_id) do update set paid_remaining=signal_balances.paid_remaining+excluded.paid_remaining;
  result := pajang_private.signal_quota(u,today)||jsonb_build_object(
    'ok',true,'requestId',p_request_id,'pack',offer.id,'quantity',offer.quantity,
    'price',offer.price,'revision',offer.revision,'charged',offer.price,'replayed',false,
    'coins',balance,'offers',pajang_private.signal_offers());
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at)
    values(p_request_id,u,'pajang_signal_pack_v1',offer.price,result,purchased_at);
  -- Any later insert/constraint failure rolls back the debit and signal credit.
  return result;
end;
$function$;
revoke all on function public.pajang_signal_purchase(text,uuid,uuid,integer,integer,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.pajang_signal_purchase(text,uuid,uuid,integer,integer,boolean) to authenticated;

-- Patch only the quota and final state response. Preserve live visibility,
-- mutual-signal, age, answer-window, moderation and pair-blocking rules.
do $migration$
declare
  definition text := pg_get_functiondef('public.pajang_member(text,jsonb)'::regprocedure);
  old_limit text := $old$       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;$old$;
  new_limit text := $new$       if (select count(*) from pajang_private.signals where src=mine.id and day=today)>=3 then
         update pajang_private.signal_balances set paid_remaining=paid_remaining-1
           where user_id=u and paid_remaining>0;
         if not found then raise exception '오늘 보낼 신호를 모두 사용했어요.';end if;
       end if;$new$;
  old_return text := E' return result;\nend;';
  new_return text := E' return result||pajang_private.signal_quota(u,today);\nend;';
begin
  if position(old_limit in definition)=0 or position(old_return in definition)=0 then
    raise exception 'unexpected_pajang_signal_quota_definition';
  end if;
  if length(definition)-length(replace(definition,old_limit,''))<>length(old_limit)
    or length(definition)-length(replace(definition,old_return,''))<>length(old_return) then
    raise exception 'ambiguous_pajang_signal_quota_definition';
  end if;
  execute replace(replace(definition,old_limit,new_limit),old_return,new_return);
end;
$migration$;
