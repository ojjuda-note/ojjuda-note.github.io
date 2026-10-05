-- is_banned(uuid) is deliberately scoped to the signed-in member. Calling it
-- with another room host's ID makes list/join fail with helper_scope_denied.
-- Check host eligibility inside the existing authenticated, private room service;
-- keep the public helper scoped and return only the existing safe room cards.
-- No table grants, public RPC privileges, or member data are changed.
create or replace function ojjuda_arcade_internal.room_service(
  p_action text,p_room bigint default null,p_kind text default null,p_title text default null,p_options jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  actor uuid:=auth.uid();r ojjuda_arcade_internal.rooms%rowtype;
  title_value text;request_value uuid;layout_value text;adult boolean;raw jsonb;wallet jsonb;
  result jsonb;mine jsonb;seed_value text;new_match uuid;
begin
  if actor is null or not exists(select 1 from auth.users u join public.profiles p on p.id=u.id
      where u.id=actor and not coalesce(u.is_anonymous,false)) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if public.is_banned(actor) then raise exception 'banned' using errcode='42501';end if;
  if p_action is null or p_action not in ('list','create','join','cancel') then raise exception 'invalid_action';end if;
  if jsonb_typeof(p_options) is distinct from 'object' or length(p_options::text)>512 then raise exception 'invalid_options';end if;
  select exists(select 1 from ojjuda_account_internal.member_identity i where i.user_id=actor
    and ojjuda_account_internal.age_on(i.birth_date,(now() at time zone 'Asia/Seoul')::date)>=19) into adult;
  -- Only short local SQL work is serialized; no network or game replay holds this lock.
  perform pg_advisory_xact_lock(1095910212,1);
  perform ojjuda_arcade_internal.sync_rooms();

  if p_action='list' then
    update ojjuda_arcade_internal.rooms set expires_at=clock_timestamp()+interval '2 minutes'
      where host_id=actor and status='waiting';
    if adult then
      update ojjuda_matgo_internal.rooms m set seen_host=clock_timestamp()
      from ojjuda_arcade_internal.rooms a
      where a.host_id=actor and a.status='waiting' and a.kind='matgo' and a.match_id=m.id and m.status='waiting';
    end if;
    select coalesce(jsonb_agg(ojjuda_arcade_internal.room_card(q,actor) order by q.room_no desc),'[]'::jsonb) into result
    from (select a.* from ojjuda_arcade_internal.rooms a
      where a.status<>'closed' and (a.kind<>'matgo' or adult)
        and not exists(select 1 from public.user_private banned
          where banned.user_id=a.host_id and banned.banned_until>now())
        and not public.blocked_between(actor,a.host_id)
        and (a.guest_id is null or not public.blocked_between(actor,a.guest_id))
      order by a.room_no desc limit 100) q;
    select ojjuda_arcade_internal.room_card(a,actor) into mine from ojjuda_arcade_internal.rooms a
      where a.status<>'closed' and (a.host_id=actor or a.guest_id=actor) and (a.kind<>'matgo' or adult)
      order by a.room_no desc limit 1;
    return jsonb_build_object('ok',true,'rooms',result,'mine',mine,'can_matgo',adult);
  end if;

  if p_action='create' then
    if p_kind is null or p_kind not in ('chess','janggi','carom4','carom3','pool8','matgo') then raise exception 'bad_kind';end if;
    if p_kind='matgo' and not adult then raise exception 'adult_required' using errcode='42501';end if;
    title_value:=btrim(regexp_replace(coalesce(p_title,''),'[[:space:]]+',' ','g'));
    if char_length(title_value) not between 1 and 40 or title_value~'[[:cntrl:]]' then raise exception 'invalid_title';end if;
    begin request_value:=(p_options->>'request_id')::uuid;exception when invalid_text_representation then raise exception 'invalid_request';end;
    if request_value is null then raise exception 'invalid_request';end if;
    layout_value:=coalesce(p_options->>'layout','eheh');
    if layout_value not in ('eheh','hehe','ehhe','heeh') then raise exception 'bad_layout';end if;
    select * into r from ojjuda_arcade_internal.rooms where host_id=actor and request_id=request_value;
    if found then
      if r.kind<>p_kind or r.title<>title_value or r.host_layout<>layout_value then raise exception 'invalid_request';end if;
      if r.status='closed' then raise exception 'room_unavailable';end if;
      return jsonb_build_object('ok',true,'room',ojjuda_arcade_internal.room_card(r,actor));
    end if;
    if exists(select 1 from ojjuda_arcade_internal.rooms where status<>'closed' and (host_id=actor or guest_id=actor)) then raise exception 'room_in_progress';end if;
    if (select count(*) from ojjuda_arcade_internal.rooms where host_id=actor and created_at>clock_timestamp()-interval '1 minute')>=5 then raise exception 'room_rate_limit';end if;
    if p_kind='matgo' then
      wallet:=ojjuda_matgo_internal.wallet_service(actor,'status');
      if wallet->>'online_room' is not null then raise exception 'match_in_progress';end if;
      seed_value:=encode(extensions.gen_random_bytes(32),'hex');
      raw:=ojjuda_matgo_internal.online_service(actor,'create',p_seed=>seed_value);
      new_match:=(raw->'room'->>'id')::uuid;
    end if;
    insert into ojjuda_arcade_internal.rooms(kind,title,host_id,request_id,host_layout,match_id,match_code)
      values(p_kind,title_value,actor,request_value,layout_value,new_match,raw->'room'->>'code') returning * into r;
    return jsonb_build_object('ok',true,'room',ojjuda_arcade_internal.room_card(r,actor));
  end if;

  select * into r from ojjuda_arcade_internal.rooms where room_no=p_room for update;
  if not found or r.status='closed' then raise exception 'room_unavailable';end if;
  if p_kind is not null and p_kind<>r.kind then raise exception 'bad_kind';end if;
  if r.kind='matgo' and not adult then raise exception 'adult_required' using errcode='42501';end if;
  if p_action='cancel' then
    if r.host_id<>actor then raise exception 'not_room_owner' using errcode='42501';end if;
    if r.status<>'waiting' then raise exception 'room_already_started';end if;
    if r.kind='matgo' then perform ojjuda_matgo_internal.online_service(actor,'leave',r.match_id);end if;
    update ojjuda_arcade_internal.rooms set status='closed' where room_no=r.room_no returning * into r;
    return jsonb_build_object('ok',true,'room',ojjuda_arcade_internal.room_card(r,actor));
  end if;
  if exists(select 1 from public.user_private banned
      where banned.user_id=r.host_id and banned.banned_until>now())
     or public.blocked_between(actor,r.host_id)
     or (r.guest_id is not null and public.blocked_between(actor,r.guest_id)) then raise exception 'room_unavailable';end if;
  if actor=r.host_id or actor=r.guest_id then
    return jsonb_build_object('ok',true,'room',ojjuda_arcade_internal.room_card(r,actor));
  end if;
  if r.status<>'waiting' or r.guest_id is not null then raise exception 'room_full';end if;
  if exists(select 1 from ojjuda_arcade_internal.rooms where status<>'closed' and (host_id=actor or guest_id=actor)) then raise exception 'room_in_progress';end if;
  if r.kind='matgo' then
    wallet:=ojjuda_matgo_internal.wallet_service(actor,'status');
    if wallet->>'online_room' is not null then raise exception 'match_in_progress';end if;
    raw:=ojjuda_matgo_internal.online_service(actor,'join',p_code=>r.match_code,p_seed=>encode(extensions.gen_random_bytes(32),'hex'));
    if raw->'room'->>'id' is distinct from r.match_id::text then raise exception 'room_unavailable';end if;
    new_match:=r.match_id;
  else
    layout_value:=coalesce(p_options->>'layout','hehe');
    if layout_value not in ('eheh','hehe','ehhe','heeh') then raise exception 'bad_layout';end if;
    insert into public.board_games(kind,p1,p2,p1_nick,p2_nick,status,janggi_layout)
      values(r.kind,r.host_id,actor,
        coalesce((select nickname from public.profiles where id=r.host_id),'회원'),
        coalesce((select nickname from public.profiles where id=actor),'회원'),'playing',
        jsonb_build_object('c',r.host_layout,'h',layout_value)) returning id into new_match;
  end if;
  update ojjuda_arcade_internal.rooms set guest_id=actor,status='playing',match_id=new_match where room_no=r.room_no returning * into r;
  return jsonb_build_object('ok',true,'room',ojjuda_arcade_internal.room_card(r,actor));
end;
$$;

-- Joining Matgo also validates the host's wallet. Its existing server-only
-- function must use the same internal eligibility lookup when invoked by the
-- authenticated arcade service. Existing owner/service_role-only ACLs remain.
create or replace function ojjuda_matgo_internal.wallet_service_v1(
  p_actor uuid,p_action text,p_request uuid default null,p_paid boolean default false,
  p_round uuid default null,p_gold bigint default null,p_first smallint default null,p_carry integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w ojjuda_matgo_internal.wallets%rowtype; v_birth date;
  v_today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_coins integer; v_charge smallint := 0; v_duplicate boolean := false; v_settled boolean := false;
begin
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  select birth_date into v_birth from ojjuda_account_internal.member_identity where user_id=p_actor;
  if v_birth is null then raise exception 'member_identity_required' using errcode='42501'; end if;
  if ojjuda_account_internal.age_on(v_birth,v_today)<19 then raise exception 'adult_required' using errcode='42501'; end if;
  if exists(select 1 from public.user_private banned
    where banned.user_id=p_actor and banned.banned_until>now()) then
    raise exception 'banned' using errcode='42501';
  end if;
  select coins into v_coins from public.user_private where user_id=p_actor;
  if not found then raise exception 'no_account' using errcode='42501'; end if;
  if p_action not in ('status','start','round','settle','refill') then raise exception 'invalid_action'; end if;
  insert into ojjuda_matgo_internal.wallets(user_id) values(p_actor) on conflict do nothing;
  select * into strict w from ojjuda_matgo_internal.wallets where user_id=p_actor for update;
  if w.refill_day<>v_today then w.refill_day:=v_today;w.free_used:=0;end if;
  if p_action='refill' then
    if p_request is null then raise exception 'request_id_required'; end if;
    select charged into v_charge from ojjuda_matgo_internal.refills where user_id=p_actor and request_id=p_request;
    v_duplicate:=found;
    if not v_duplicate then
      if w.gold>0 then raise exception 'gold_not_empty'; end if;
      if w.free_used<2 then
        v_charge:=0;w.free_used:=w.free_used+1;
      else
        if p_paid is distinct from true then raise exception 'paid_confirmation_required'; end if;
        update public.user_private set coins=coins-5,updated_at=now() where user_id=p_actor and coins>=5 returning coins into v_coins;
        if not found then raise exception 'insufficient_zzu'; end if;
        v_charge:=5;
      end if;
      w.gold:=5000;w.round_id:=null;w.round_seed:=null;w.next_first:=0;w.next_carry:=1;
      insert into ojjuda_matgo_internal.refills(user_id,request_id,charged) values(p_actor,p_request,v_charge);
    end if;
  elsif p_action='start' then
    if w.gold<=0 then raise exception 'gold_empty'; end if;
    if w.round_id is null then
      w.round_id:=gen_random_uuid();w.round_seed:=floor(random()*4294967296)::bigint;
    end if;
  elsif p_action in ('round','settle') then
    if p_round is not null and w.last_round=p_round then v_settled:=true;
    elsif p_round is null or w.round_id is distinct from p_round then raise exception 'round_mismatch';
    elsif p_action='settle' then
      if p_gold is null or p_gold<0 or p_gold>9007199254740991 or p_first is null or p_first not in(0,1)
         or p_carry is null or p_carry<1 or p_carry>1024 then raise exception 'invalid_result'; end if;
      w.gold:=p_gold;w.next_first:=p_first;w.next_carry:=p_carry;
      w.last_round:=w.round_id;w.round_id:=null;w.round_seed:=null;v_settled:=true;
    end if;
  end if;
  update ojjuda_matgo_internal.wallets set gold=w.gold,refill_day=w.refill_day,free_used=w.free_used,
    next_first=w.next_first,next_carry=w.next_carry,round_id=w.round_id,round_seed=w.round_seed,last_round=w.last_round,updated_at=now()
    where user_id=p_actor;
  return jsonb_build_object('ok',true,'gold',w.gold,'free_left',2-w.free_used,'refill_day',w.refill_day,
    'coins',v_coins,'charged',coalesce(v_charge,0),'duplicate',v_duplicate,'settled',v_settled,
    'round',case when w.round_id is null then null else jsonb_build_object('id',w.round_id,'seed',w.round_seed,'gold',w.gold,'first',w.next_first,'carry',w.next_carry) end);
end;
$$;
