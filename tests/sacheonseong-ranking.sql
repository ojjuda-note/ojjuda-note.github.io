-- Run after the migration. Test rows exist only within this rolled-back transaction.
begin;
do $test$
declare
 t1 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 t2 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 t3 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 v_now timestamptz:=clock_timestamp();
 rows jsonb;
 stage integer;
begin
 for stage in 1..15 loop
  assert ojjuda_guest_internal.score_limit('sacheonseong_'||stage)=1999999999,'missing stage score limit';
 end loop;
 assert ojjuda_guest_internal.score_limit('sacheonseong_0') is null;
 assert ojjuda_guest_internal.score_limit('sacheonseong_16') is null;
 assert ojjuda_guest_internal.score_limit('mines')=89999,'existing game limit changed';
 insert into ojjuda_guest_internal.scores(day,game,guest_hash,score,achieved_at,last_submitted_at,last_request_id,last_score)
 select (v_now at time zone 'Asia/Seoul')::date,game,encode(sha256(convert_to(token,'UTF8')),'hex'),score,v_now-age,v_now,gen_random_uuid(),score
 from (values
  ('sacheonseong_1',t1,1999999900,interval '3 seconds'),
  ('sacheonseong_1',t2,1999999900,interval '2 seconds'),
  ('sacheonseong_1',t3,1999999800,interval '4 seconds'),
  ('sacheonseong_2',t1,1999999950,interval '1 second')
 ) fixture(game,token,score,age);
 rows:=ojjuda_guest_internal.ranking('sacheonseong_1','month',t1)::jsonb;
 assert jsonb_array_length(rows)=3,'unexpected fixture count';
 assert (rows->0->>'score')::integer=1999999900 and (rows->0->>'me')::boolean,'faster/earlier record not first';
 assert (rows->1->>'score')::integer=1999999900 and not (rows->1->>'me')::boolean,'tie ordering incorrect';
 assert (rows->2->>'score')::integer=1999999800,'slower record not last';
 rows:=public.community_game_monthly_ranking('sacheonseong_2')::jsonb;
 assert jsonb_array_length(rows)=1 and (rows->0->>'score')::integer=1999999950,'stage separation incorrect';
 assert ojjuda_guest_internal.ranking('sacheonseong_16','month',t1)::jsonb='[]'::jsonb;
 begin
  perform public.submit_score('sacheonseong_1',1999999900);
  raise exception 'Anonymous member submission was accepted';
 exception when insufficient_privilege then null;
 end;
end;
$test$;
rollback;
