-- Client-side games can report arbitrary scores. Keep ranking available but pause
-- wallet rewards until score verification can happen on the server.
-- Existing reward history and current balances are unchanged.
CREATE OR REPLACE FUNCTION public.submit_score(p_game text, p_score integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  mx int; step int; last timestamptz; got int; rw int; nk text; c int; best int; rk int;
  day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if public.is_banned(auth.uid()) then return json_build_object('ok', false, 'reason', 'banned'); end if;
  mx := case p_game when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300 when 'breakout' then 20000 when 'snake' then 300 when 'screw' then 1000000 end;
  step := case p_game when 'mole' then 15 when 'runner' then 150 when 'stacker' then 8 when 'breakout' then 150 when 'snake' then 8 when 'screw' then 30 end;
  if mx is null then return json_build_object('ok', false, 'reason', 'unknown'); end if;
  if p_score < 0 or p_score > mx then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  select max(created_at) into last from game_scores where user_id = auth.uid();
  if last is not null and last > now() - interval '5 seconds' then return json_build_object('ok', false, 'reason', 'too_fast'); end if;
  select coalesce(sum(reward), 0) into got from game_scores where user_id = auth.uid() and created_at >= day_start;
  -- Client-reported scores cannot authorize wallet credit.
  rw := 0;
  select nickname into nk from profiles where id = auth.uid();
  insert into game_scores (user_id, nick, game, score, reward) values (auth.uid(), nk, p_game, p_score, rw);
  if rw > 0 then update user_private set coins = coins + rw where user_id = auth.uid() returning coins into c;
  else select coins into c from user_private where user_id = auth.uid(); end if;
  select max(score) into best from game_scores where user_id = auth.uid() and game = p_game and created_at >= day_start;
  select count(*) + 1 into rk from (select max(score) s from game_scores where game = p_game and created_at >= day_start group by user_id) t where t.s > best;
  return json_build_object('ok', true, 'reward', rw, 'coins', c, 'best', best, 'rank', rk, 'left', 0);
end $function$;
