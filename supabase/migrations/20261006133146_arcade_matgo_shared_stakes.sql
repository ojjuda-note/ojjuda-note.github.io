-- Pass the member client capability through both public-room entry paths.
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
      raw:=ojjuda_matgo_internal.online_service(actor,'create',p_seed=>seed_value,p_next=>jsonb_build_object('stakes_version',p_options->'stakes_version'));
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
    raw:=ojjuda_matgo_internal.online_service(actor,'join',p_code=>r.match_code,p_seed=>encode(extensions.gen_random_bytes(32),'hex'),p_next=>jsonb_build_object('stakes_version',p_options->'stakes_version'));
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
