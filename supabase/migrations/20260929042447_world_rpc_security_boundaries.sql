-- Restrict game writes, preserve real gift receipts, and serialize free-charge limits.
-- Existing account rows, posts, scores, and wallet balances are not modified.

CREATE OR REPLACE FUNCTION public.game_move(p_id uuid, p_ply integer, p_move jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_g public.board_games%rowtype;
  v_len integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into v_g from public.board_games g where g.id = p_id for update;
  if not found or v_g.status <> 'playing' then raise exception 'not_playing'; end if;
  if v_g.kind not in ('chess', 'janggi') then raise exception 'bad_kind'; end if;
  if v_g.undo_requested_by is not null then
    raise exception 'undo_pending';
  end if;
  v_len := pg_catalog.jsonb_array_length(v_g.moves);
  if p_ply is null or p_ply < 0 or v_len <> p_ply then raise exception 'out_of_sync'; end if;
  if auth.uid() is distinct from (case when v_len % 2 = 0 then v_g.p1 else v_g.p2 end) then
    raise exception 'not_your_turn';
  end if;
  if pg_catalog.jsonb_typeof(p_move) is distinct from 'object' or pg_catalog.length(p_move::text) > 200 then
    raise exception 'bad_move';
  end if;
  update public.board_games g
     set moves = v_g.moves || pg_catalog.jsonb_build_array(p_move),
         updated_at = greatest(pg_catalog.clock_timestamp(),
                         v_g.updated_at + interval '1 microsecond')
   where g.id = p_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.game_shot(p_id uuid, p_ply integer, p_move jsonb, p_next text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_g public.board_games%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into v_g from public.board_games g where g.id = p_id for update;
  if not found or v_g.status <> 'playing' then raise exception 'not_playing'; end if;
  if v_g.kind not in ('carom4', 'carom3', 'pool8') then raise exception 'bad_kind'; end if;
  if p_ply is null or p_ply < 0 or jsonb_array_length(v_g.moves) <> p_ply then raise exception 'out_of_sync'; end if;
  if auth.uid() is distinct from (case when v_g.turn = 'p1' then v_g.p1 else v_g.p2 end) then raise exception 'not_your_turn'; end if;
  if p_next is null or p_next not in ('p1', 'p2') then raise exception 'bad_next'; end if;
  if jsonb_typeof(p_move) is distinct from 'object' or length(p_move::text) > 2000 then raise exception 'bad_move'; end if;
  update public.board_games g set moves = g.moves || jsonb_build_array(p_move), turn = p_next, updated_at = now() where g.id = p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.game_finish(p_id uuid, p_result text, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_result is null or p_result not in ('p1', 'p2', 'draw') then raise exception 'bad_result'; end if;
  update public.board_games g set status = 'done', result = p_result, reason = left(coalesce(p_reason, ''), 20), updated_at = now()
   where g.id = p_id and g.status = 'playing' and auth.uid() in (g.p1, g.p2);
end $function$;

CREATE OR REPLACE FUNCTION public.beta_charge(pack text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  enabled boolean; lim int; used int; amt int; won int; c int;
  day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
begin
  if auth.uid() is null then return json_build_object('ok', false, 'reason', 'no_account'); end if;
  select (value)::text::boolean into enabled from app_config where key = 'beta_free_charge';
  if not coalesce(enabled, false) then return json_build_object('ok', false, 'reason', 'closed'); end if;
  case pack
    when 'p1000'  then amt := 10;  won := 1000;
    when 'p5000'  then amt := 55;  won := 5000;
    when 'p10000' then amt := 120; won := 10000;
    when 'p30000' then amt := 390; won := 30000;
    else return json_build_object('ok', false, 'reason', 'unknown');
  end case;
  select coalesce((value)::text::int, 5) into lim from app_config where key = 'beta_charge_daily_limit';
  lim := coalesce(lim, 5);
  -- Serialize the daily count and credit on the same wallet row.
  select up.coins into c from public.user_private up where up.user_id = auth.uid() for update;
  if c is null then return json_build_object('ok', false, 'reason', 'no_account'); end if;
  select count(*) into used from coin_charges where user_id = auth.uid() and created_at >= day_start;
  if used >= lim then return json_build_object('ok', false, 'reason', 'limit', 'limit', lim); end if;
  update user_private set coins = coins + amt where user_id = auth.uid() returning coins into c;
  if c is null then return json_build_object('ok', false, 'reason', 'no_account'); end if;
  insert into coin_charges (user_id, pack, coins, won, free) values (auth.uid(), pack, amt, won, true);
  return json_build_object('ok', true, 'coins', c, 'added', amt, 'left', lim - used - 1);
end $function$;

CREATE OR REPLACE FUNCTION public.guestbook_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int; v_old timestamptz; v_wait int; v_norm text;
begin
  -- Only gift_item may mark a server-written receipt; text alone is untrusted.
  if coalesce(current_setting('ojjuda.gift_receipt', true), '') = '1' then return new; end if;
  -- 10초에 1개
  select count(*), min(g.created_at) into v_n, v_old from public.guestbook g
   where g.author_id = auth.uid() and g.created_at > now() - interval '10 seconds';
  if v_n >= 1 then
    v_wait := greatest(1, ceil(extract(epoch from (v_old + interval '10 seconds' - now())))::int);
    raise exception 'gb_fast:%', v_wait using errcode = 'P0001';
  end if;
  -- 한 방에 10분 동안 3개까지
  select count(*), min(g.created_at) into v_n, v_old from public.guestbook g
   where g.author_id = auth.uid() and g.owner_id = new.owner_id and g.created_at > now() - interval '10 minutes';
  if v_n >= 3 then
    v_wait := greatest(1, ceil(extract(epoch from (v_old + interval '10 minutes' - now())) / 60)::int);
    raise exception 'gb_many:%', v_wait using errcode = 'P0001';
  end if;
  -- 1시간에 20개까지 (여러 방에 뿌리기 막기)
  select count(*), min(g.created_at) into v_n, v_old from public.guestbook g
   where g.author_id = auth.uid() and g.created_at > now() - interval '1 hour';
  if v_n >= 20 then
    v_wait := greatest(1, ceil(extract(epoch from (v_old + interval '1 hour' - now())) / 60)::int);
    raise exception 'gb_hour:%', v_wait using errcode = 'P0001';
  end if;
  -- 같은 글은 1시간에 2번까지 (복사해서 여러 방에 붙이기 막기)
  v_norm := lower(regexp_replace(new.body, '[[:space:][:punct:]]', '', 'g'));
  if v_norm <> '' then
    select count(*) into v_n from public.guestbook g
     where g.author_id = auth.uid() and g.created_at > now() - interval '1 hour'
       and lower(regexp_replace(g.body, '[[:space:][:punct:]]', '', 'g')) = v_norm;
    if v_n >= 2 then raise exception 'gb_dup' using errcode = 'P0001'; end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.gift_item(item_key text, to_user uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p int; n text; c int; their text[]; v_receipt_setting text;
begin
  if not public.is_friend(to_user, auth.uid()) or public.blocked_between(to_user, auth.uid()) then
    return json_build_object('ok', false, 'reason', 'not_friend');
  end if;
  select price, name into p, n from shop_items where key = item_key and active;
  if p is null then return json_build_object('ok', false, 'reason', 'unknown'); end if;
  select owned into their from user_private where user_id = to_user for update;
  if their is null then return json_build_object('ok', false, 'reason', 'no_account'); end if;
  if item_key = any(their) then return json_build_object('ok', false, 'reason', 'owned'); end if;
  select coins into c from user_private where user_id = auth.uid() for update;
  if c < p then return json_build_object('ok', false, 'reason', 'coins', 'coins', c, 'price', p); end if;
  update user_private set coins = coins - p where user_id = auth.uid() returning coins into c;
  update user_private set owned = array_append(owned, item_key) where user_id = to_user;
  v_receipt_setting := coalesce(current_setting('ojjuda.gift_receipt', true), '');
  perform set_config('ojjuda.gift_receipt', '1', true);
  insert into guestbook (owner_id, author_nick, body) values (to_user, '-', '🎁 ' || n || ' 선물을 보냈어요');
  perform set_config('ojjuda.gift_receipt', v_receipt_setting, true);
  return json_build_object('ok', true, 'coins', c);
end $function$;

revoke execute on function public.game_move(uuid,integer,jsonb), public.game_shot(uuid,integer,jsonb,text), public.game_finish(uuid,text,text) from public, anon;
grant execute on function public.game_move(uuid,integer,jsonb), public.game_shot(uuid,integer,jsonb,text), public.game_finish(uuid,text,text) to authenticated, service_role;

