-- Isolated fixture verification. Nothing in this transaction is persisted.
begin;
do $test$
declare
 t1 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 t2 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 t3 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 t4 text:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
 v_now timestamptz:=clock_timestamp();
 rows jsonb;
begin
 insert into ojjuda_guest_internal.scores(day,game,guest_hash,score,achieved_at,last_submitted_at,last_request_id,last_score)
 select (v_now at time zone 'Asia/Seoul')::date,game,
   encode(sha256(convert_to(token,'UTF8')),'hex'),score,v_now-age,v_now,gen_random_uuid(),score
 from (values
  ('sacheonseong_15',t1,1999999000,interval '4 seconds'),
  ('sacheonseong_14',t1,1999999999,interval '5 seconds'),
  ('sacheonseong_15',t2,1999999990,interval '3 seconds'),
  ('sacheonseong_15',t3,1999999990,interval '2 seconds'),
  ('sacheonseong_14',t4,1999999999,interval '1 second')
 ) fixture(game,token,score,age);
 rows:=public.guest_game_ranking('sacheonseong','month',t2)::jsonb;
 assert (rows->0->>'stage')::integer=15 and (rows->0->>'score')::integer=1999999990 and (rows->0->>'me')::boolean,'fastest time / earlier tie must win at the highest stage';
 assert (rows->1->>'stage')::integer=15 and (rows->1->>'score')::integer=1999999990 and not (rows->1->>'me')::boolean,'later tie must follow';
 assert (rows->2->>'stage')::integer=15 and (rows->2->>'score')::integer=1999999000,'higher stage must beat faster lower-stage time';
 assert (rows->3->>'stage')::integer=14 and (rows->3->>'score')::integer=1999999999,'lower stage must follow every higher-stage record';
 rows:=public.guest_game_ranking('sacheonseong','month',t1)::jsonb;
 assert (select count(*) from jsonb_array_elements(rows) r where (r->>'me')::boolean)=1,'one best record per player';
 assert (rows->2->>'me')::boolean,'highest stage retained for a multi-stage player';
 rows:=public.community_game_monthly_ranking('sacheonseong')::jsonb;
 assert (rows->0->>'stage')::integer=15 and (rows->0->>'score')::integer=1999999990,'board and game must share the same winner';
 rows:=public.guest_game_ranking('sacheonseong_14','month',t1)::jsonb;
 assert (rows->0->>'me')::boolean and not (rows->0 ? 'stage'),'legacy per-stage response stays compatible';
 assert ojjuda_guest_internal.score_limit('sacheonseong') is null,'unified ranking key must not accept score submissions';
 assert public.guest_game_ranking('sacheonseong','bad',t1)::jsonb='[]'::jsonb;
 assert ojjuda_guest_internal.score_limit('mines')=89999,'unrelated score limit unchanged';
end;
$test$;
rollback;
