-- Function definitions read from the connected database on 2026-11-11.
-- Test fixture only: contains schema code and no production member or score data.
-- Keep the pre-fix bounds to reproduce rejected long-game scores.

CREATE OR REPLACE FUNCTION ojjuda_game_internal.community_game_monthly_ranking(p_game text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_game text:=regexp_replace(p_game,'_(easy|normal|hard|online)$','');
  v_difficulty text:=case when p_game~'_(easy|normal|hard)$' then substring(p_game from '(easy|normal|hard)$') else 'online' end;
  v_limit integer;
  v_result json;
  v_start timestamptz := date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if v_game in ('carom4','carom3','pool8','chess','janggi') then
    with finished as (
      select id,p1,p2,result,updated_at from public.board_games
      where v_difficulty='online' and kind=v_game and status='done' and result in ('p1','p2','draw')
        and updated_at>=v_start and updated_at<=now()
    ), events as (
      select p1 as user_id,id as round_id,updated_at as finished_at,
        case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end as outcome from finished
      union all
      select p2,id,updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
        from finished where p2 is not null and p2<>p1
      union all
      select user_id,round_id,created_at,outcome from ojjuda_game_internal.practice_results where game=v_game and difficulty=v_difficulty
        and created_at>=v_start and created_at<=now()
    ), ordered as (
      select *,count(*) filter(where outcome<>'win') over (
        partition by user_id order by finished_at desc,round_id desc rows unbounded preceding
      ) as breaks from events
    ), streaks as (
      select user_id,count(*) filter(where outcome='win' and breaks=0) as streak,
        max(finished_at) as latest from ordered group by user_id
    )
    select coalesce(json_agg(json_build_object(
      'nick',r.nickname,'score',r.streak,'me',r.user_id=v_actor,'source','current_streak'
    ) order by r.streak desc,r.latest,r.user_id),'[]'::json) into v_result
    from (
      select s.*,p.nickname from streaks s join public.profiles p on p.id=s.user_id
      where s.streak>0 and not exists(select 1 from public.user_private moderation
        where moderation.user_id=s.user_id and moderation.banned_until>now())
      order by s.streak desc,s.latest,s.user_id limit 10
    ) r;
    return v_result;
  end if;
  if p_game='matgo' then
    select coalesce(json_agg(json_build_object(
      'nick',r.nickname,'score',r.gold,'me',r.user_id=v_actor,'source','current_gold'
    ) order by r.gold desc,r.user_id),'[]'::json) into v_result
    from (
      select w.user_id,p.nickname,w.gold
      from ojjuda_matgo_internal.wallets w join public.profiles p on p.id=w.user_id
      where w.updated_at>=v_start and w.updated_at<=now()
        and not exists (select 1 from public.user_private moderation
        where moderation.user_id=w.user_id and moderation.banned_until>now())
      order by w.gold desc,w.user_id limit 10
    ) r;
    return v_result;
  end if;
  if p_game='photo_ttang' then return ojjuda_photo_internal.game_monthly_ranking(); end if;
  v_limit := case p_game
    when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300
    when 'breakout' THEN 550000 when 'snake' then 300
    when 'screw' then 1000000 when 'screw_box' then 1000000 when 'screw_flat' then 1000000
    when 'ttang' then 1000 when 'spot' then 6 when 'carom4' then 1000 when 'carom3' then 1000
    when 'pool8' then 8 when 'janggi' then 1 when 'chess' then 1 end;
  if v_limit is null then return '[]'::json; end if;
  select coalesce(json_agg(json_build_object(
    'nick',r.nickname,'score',r.score,'me',r.user_id=v_actor,'source','member_record'
  ) order by r.score desc,r.achieved_at,r.user_id),'[]'::json) into v_result
  from (
    select best.user_id,p.nickname,best.score,best.achieved_at
    from (
      select distinct on (g.user_id) g.user_id,g.score,g.created_at as achieved_at
      from public.game_scores g
      where g.game=p_game and g.created_at>=v_start and g.created_at<=now()
        and g.score between 0 and v_limit
      order by g.user_id,g.score desc,g.created_at
    ) best join public.profiles p on p.id=best.user_id
    where not exists (select 1 from public.user_private moderation
      where moderation.user_id=best.user_id and moderation.banned_until>now())
    order by best.score desc,best.achieved_at,best.user_id limit 10
  ) r;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_game_internal.community_game_ranking(p_game text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_game text:=regexp_replace(p_game,'_(easy|normal|hard|online)$','');
  v_difficulty text:=case when p_game~'_(easy|normal|hard)$' then substring(p_game from '(easy|normal|hard)$') else 'online' end;
  v_limit integer;
  v_result json;
  v_start timestamptz := date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
begin
  if v_actor is null or not exists(select 1 from public.profiles where id=v_actor) then
    raise exception 'not_signed_in' using errcode='42501';
  end if;
  if v_game in ('carom4','carom3','pool8','chess','janggi') then
    with finished as (
      select id,p1,p2,result,updated_at from public.board_games
      where v_difficulty='online' and kind=v_game and status='done' and result in ('p1','p2','draw')
    ), events as (
      select p1 as user_id,id as round_id,updated_at as finished_at,
        case when result='p1' then 'win' when result='draw' then 'draw' else 'loss' end as outcome from finished
      union all
      select p2,id,updated_at,case when result='p2' then 'win' when result='draw' then 'draw' else 'loss' end
        from finished where p2 is not null and p2<>p1
      union all
      select user_id,round_id,created_at,outcome from ojjuda_game_internal.practice_results where game=v_game and difficulty=v_difficulty
    ), ordered as (
      select *,count(*) filter(where outcome<>'win') over (
        partition by user_id order by finished_at desc,round_id desc rows unbounded preceding
      ) as breaks from events
    ), streaks as (
      select user_id,count(*) filter(where outcome='win' and breaks=0) as streak,
        max(finished_at) as latest from ordered group by user_id
    )
    select coalesce(json_agg(json_build_object(
      'nick',r.nickname,'score',r.streak,'me',r.user_id=v_actor,'source','current_streak'
    ) order by r.streak desc,r.latest,r.user_id),'[]'::json) into v_result
    from (
      select s.*,p.nickname from streaks s join public.profiles p on p.id=s.user_id
      where s.streak>0 and not exists(select 1 from public.user_private moderation
        where moderation.user_id=s.user_id and moderation.banned_until>now())
      order by s.streak desc,s.latest,s.user_id limit 10
    ) r;
    return v_result;
  end if;
  if p_game='matgo' then
    select coalesce(json_agg(json_build_object(
      'nick',r.nickname,'score',r.gold,'me',r.user_id=v_actor,'source','current_gold'
    ) order by r.gold desc,r.user_id),'[]'::json) into v_result
    from (
      select w.user_id,p.nickname,w.gold
      from ojjuda_matgo_internal.wallets w join public.profiles p on p.id=w.user_id
      where not exists (select 1 from public.user_private moderation
        where moderation.user_id=w.user_id and moderation.banned_until>now())
      order by w.gold desc,w.user_id limit 10
    ) r;
    return v_result;
  end if;
  v_limit := case p_game
    when 'mole' then 200 when 'runner' then 50000 when 'stacker' then 300
    when 'breakout' THEN 550000 when 'snake' then 300
    when 'screw' then 1000000 when 'screw_box' then 1000000 when 'screw_flat' then 1000000
    WHEN 'ttang' THEN 1000 when 'spot' then 6 when 'carom4' then 1000 when 'carom3' then 1000
    when 'pool8' then 8 when 'janggi' then 1 when 'chess' then 1 end;
  if v_limit is null then return '[]'::json; end if;
  select coalesce(json_agg(json_build_object(
    'nick',r.nickname,'score',r.score,'me',r.user_id=v_actor,'source','member_record'
  ) order by r.score desc,r.achieved_at,r.user_id),'[]'::json) into v_result
  from (
    select best.user_id,p.nickname,best.score,best.achieved_at
    from (
      select distinct on (g.user_id) g.user_id,g.score,g.created_at as achieved_at
      from public.game_scores g
      where g.game=p_game and g.created_at>=v_start and g.created_at<v_start+interval '1 day'
        and g.score between 0 and v_limit
      order by g.user_id,g.score desc,g.created_at
    ) best join public.profiles p on p.id=best.user_id
    where not exists (select 1 from public.user_private moderation
      where moderation.user_id=best.user_id and moderation.banned_until>now())
    order by best.score desc,best.achieved_at,best.user_id limit 10
  ) r;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_game_internal.submit_score(p_game text, p_score integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_actor uuid:=auth.uid();v_limit integer;v_nick text;v_balance integer;v_best integer;
 v_now timestamptz;v_day_start timestamptz;v_day_end timestamptz;
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'not_signed_in' USING ERRCODE='42501';END IF;
 IF public.is_banned(v_actor) THEN RETURN json_build_object('ok',false,'reason','banned');END IF;
 v_limit:=CASE p_game
 WHEN 'sacheonseong_1' THEN 1999999999
 WHEN 'sacheonseong_2' THEN 1999999999
 WHEN 'sacheonseong_3' THEN 1999999999
 WHEN 'sacheonseong_4' THEN 1999999999
 WHEN 'sacheonseong_5' THEN 1999999999
 WHEN 'sacheonseong_6' THEN 1999999999
 WHEN 'sacheonseong_7' THEN 1999999999
 WHEN 'sacheonseong_8' THEN 1999999999
 WHEN 'sacheonseong_9' THEN 1999999999
 WHEN 'sacheonseong_10' THEN 1999999999
 WHEN 'sacheonseong_11' THEN 1999999999
 WHEN 'sacheonseong_12' THEN 1999999999
 WHEN 'sacheonseong_13' THEN 1999999999
 WHEN 'sacheonseong_14' THEN 1999999999
 WHEN 'sacheonseong_15' THEN 1999999999
  WHEN 'chacha_rush' THEN 9999999 WHEN 'mole' THEN 3999 WHEN 'runner' THEN 50000 WHEN 'stacker' THEN 300
  WHEN 'breakout' THEN 550000 WHEN 'snake' THEN 300
  WHEN 'screw' THEN 1000000 WHEN 'screw_box' THEN 1000000 WHEN 'screw_flat' THEN 1000000
  WHEN 'ttang' THEN 1000 WHEN 'tour' THEN 1000000 WHEN 'saetbyeol' THEN 60000 WHEN 'solitaire' THEN 299999999 WHEN 'mines' THEN 89999 WHEN 'spot' THEN 6 WHEN 'carom4' THEN 1000 WHEN 'carom3' THEN 1000
  WHEN 'pool8' THEN 8 WHEN 'janggi' THEN 1 WHEN 'chess' THEN 1 WHEN 'matgo' THEN 1000000
 END;

  IF p_game ~ '^sacheonseong_([1-9]|[1-9][0-9]|1[0-9]{2}|200)$' THEN
    v_limit := 1999999999;
  END IF;
  IF v_limit IS NULL OR p_score IS NULL OR p_score<0 OR p_score>v_limit THEN
  RETURN json_build_object('ok',false,'reason','invalid');
 END IF;
 -- Serialize this member/game pair, without locking or updating the wallet.
 PERFORM pg_advisory_xact_lock(hashtextextended('ojjuda-personal-score:'||v_actor::text||':'||p_game,0));
 SELECT p.nickname,u.coins INTO v_nick,v_balance
 FROM public.profiles p JOIN public.user_private u ON u.user_id=p.id WHERE p.id=v_actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'no_account' USING ERRCODE='42501';END IF;
 IF public.is_banned(v_actor) THEN RETURN json_build_object('ok',false,'reason','banned');END IF;
 v_now:=clock_timestamp();
 v_day_start:=date_trunc('day',v_now AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
 v_day_end:=(date_trunc('day',v_now AT TIME ZONE 'Asia/Seoul')+interval '1 day') AT TIME ZONE 'Asia/Seoul';
 IF EXISTS(SELECT 1 FROM public.game_scores g
  WHERE g.user_id=v_actor AND g.game=p_game AND g.created_at>v_now-interval '5 seconds') THEN
  RETURN json_build_object('ok',false,'reason','too_fast');
 END IF;
 INSERT INTO public.game_scores(user_id,nick,game,score,reward,verified,created_at)
 VALUES(v_actor,v_nick,p_game,p_score,0,false,v_now);
 SELECT max(g.score) INTO v_best FROM public.game_scores g
 WHERE g.user_id=v_actor AND g.game=p_game AND g.created_at>=v_day_start AND g.created_at<v_day_end;
 RETURN json_build_object('ok',true,'reward',0,'coins',v_balance,'best',v_best,'rank',null,'left',0,'verified',false);
END;$function$;

CREATE OR REPLACE FUNCTION ojjuda_guest_internal.score_limit(p_game text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE
 WHEN p_game in ('sacheonseong_1','sacheonseong_2','sacheonseong_3','sacheonseong_4','sacheonseong_5','sacheonseong_6','sacheonseong_7','sacheonseong_8','sacheonseong_9','sacheonseong_10','sacheonseong_11','sacheonseong_12','sacheonseong_13','sacheonseong_14','sacheonseong_15','sacheonseong_16','sacheonseong_17','sacheonseong_18','sacheonseong_19','sacheonseong_20','sacheonseong_21','sacheonseong_22','sacheonseong_23','sacheonseong_24','sacheonseong_25','sacheonseong_26','sacheonseong_27','sacheonseong_28','sacheonseong_29','sacheonseong_30','sacheonseong_31','sacheonseong_32','sacheonseong_33','sacheonseong_34','sacheonseong_35','sacheonseong_36','sacheonseong_37','sacheonseong_38','sacheonseong_39','sacheonseong_40','sacheonseong_41','sacheonseong_42','sacheonseong_43','sacheonseong_44','sacheonseong_45','sacheonseong_46','sacheonseong_47','sacheonseong_48','sacheonseong_49','sacheonseong_50','sacheonseong_51','sacheonseong_52','sacheonseong_53','sacheonseong_54','sacheonseong_55','sacheonseong_56','sacheonseong_57','sacheonseong_58','sacheonseong_59','sacheonseong_60','sacheonseong_61','sacheonseong_62','sacheonseong_63','sacheonseong_64','sacheonseong_65','sacheonseong_66','sacheonseong_67','sacheonseong_68','sacheonseong_69','sacheonseong_70','sacheonseong_71','sacheonseong_72','sacheonseong_73','sacheonseong_74','sacheonseong_75','sacheonseong_76','sacheonseong_77','sacheonseong_78','sacheonseong_79','sacheonseong_80','sacheonseong_81','sacheonseong_82','sacheonseong_83','sacheonseong_84','sacheonseong_85','sacheonseong_86','sacheonseong_87','sacheonseong_88','sacheonseong_89','sacheonseong_90','sacheonseong_91','sacheonseong_92','sacheonseong_93','sacheonseong_94','sacheonseong_95','sacheonseong_96','sacheonseong_97','sacheonseong_98','sacheonseong_99','sacheonseong_100','sacheonseong_101','sacheonseong_102','sacheonseong_103','sacheonseong_104','sacheonseong_105','sacheonseong_106','sacheonseong_107','sacheonseong_108','sacheonseong_109','sacheonseong_110','sacheonseong_111','sacheonseong_112','sacheonseong_113','sacheonseong_114','sacheonseong_115','sacheonseong_116','sacheonseong_117','sacheonseong_118','sacheonseong_119','sacheonseong_120','sacheonseong_121','sacheonseong_122','sacheonseong_123','sacheonseong_124','sacheonseong_125','sacheonseong_126','sacheonseong_127','sacheonseong_128','sacheonseong_129','sacheonseong_130','sacheonseong_131','sacheonseong_132','sacheonseong_133','sacheonseong_134','sacheonseong_135','sacheonseong_136','sacheonseong_137','sacheonseong_138','sacheonseong_139','sacheonseong_140','sacheonseong_141','sacheonseong_142','sacheonseong_143','sacheonseong_144','sacheonseong_145','sacheonseong_146','sacheonseong_147','sacheonseong_148','sacheonseong_149','sacheonseong_150','sacheonseong_151','sacheonseong_152','sacheonseong_153','sacheonseong_154','sacheonseong_155','sacheonseong_156','sacheonseong_157','sacheonseong_158','sacheonseong_159','sacheonseong_160','sacheonseong_161','sacheonseong_162','sacheonseong_163','sacheonseong_164','sacheonseong_165','sacheonseong_166','sacheonseong_167','sacheonseong_168','sacheonseong_169','sacheonseong_170','sacheonseong_171','sacheonseong_172','sacheonseong_173','sacheonseong_174','sacheonseong_175','sacheonseong_176','sacheonseong_177','sacheonseong_178','sacheonseong_179','sacheonseong_180','sacheonseong_181','sacheonseong_182','sacheonseong_183','sacheonseong_184','sacheonseong_185','sacheonseong_186','sacheonseong_187','sacheonseong_188','sacheonseong_189','sacheonseong_190','sacheonseong_191','sacheonseong_192','sacheonseong_193','sacheonseong_194','sacheonseong_195','sacheonseong_196','sacheonseong_197','sacheonseong_198','sacheonseong_199','sacheonseong_200') THEN 1999999999
 WHEN p_game='screw_box' THEN 1999999999
 WHEN p_game='chacha_rush' THEN 9999999 WHEN p_game='mole' THEN 3999 WHEN p_game='runner' THEN 50000 WHEN p_game='stacker' THEN 300
 WHEN p_game='breakout' THEN 550000 WHEN p_game='screw' THEN 1000000
 WHEN p_game='screw_flat' THEN 1000000 WHEN p_game='tour' THEN 1000000
 WHEN p_game='saetbyeol' THEN 60000 WHEN p_game = 'solitaire' THEN 299999999 WHEN p_game='mines' THEN 89999
 WHEN p_game='spot' THEN 6 WHEN p_game='ttang' THEN 1000 END;
$function$;
