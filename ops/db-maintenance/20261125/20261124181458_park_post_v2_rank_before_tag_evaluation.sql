-- Verified with real-data read-only selection benchmark and isolated scheduler fixture.
-- Preserve exact selection order, bot authorization, schedule, font rotation, geography and posting payload.
SET LOCAL lock_timeout = '1s';
SET LOCAL statement_timeout = '10s';
DO $guard$ BEGIN
 IF md5(pg_get_functiondef('ojjuda_note_internal.run_park_post_v2()'::regprocedure)) <> '5edadeda5babe1435dda46b8da0486ae' THEN
  RAISE EXCEPTION 'Park scheduler source changed; re-review before applying';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION ojjuda_note_internal.run_park_post_v2()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 v_now timestamptz := pg_catalog.statement_timestamp();
 v_enabled boolean;
 v_author uuid;
 v_anchor timestamptz;
 v_slot bigint;
 v_due timestamptz;
 v_copy record;
 v_site record;
 v_recent_themes text[];
 v_request uuid := pg_catalog.gen_random_uuid();
 v_result jsonb;
 v_card uuid;
 v_old_claim text;
 v_fonts text[] := ARRAY['round','serif','handwriting','nanum-myeongjo','mono','calligraphy','heart','default'];
 v_colors text[] := ARRAY['white','blue','yellow','purple','green','black','red'];
 v_font text;
 v_color text;
 v_style jsonb;
 v_tags text[];
BEGIN
 -- Serialized even when the cron runner retries or multiple workers overlap.
 SELECT enabled,author_id,anchor_at INTO v_enabled,v_author,v_anchor
 FROM ojjuda_note_internal.park_post_v2_config
 WHERE singleton=true FOR UPDATE;
 IF NOT FOUND OR NOT v_enabled OR v_now < v_anchor THEN RETURN 0; END IF;
 v_slot := floor(extract(epoch FROM (v_now-v_anchor))/8100.0)::bigint;
 v_due := v_anchor + v_slot * interval '135 minutes';
 -- No backlog floods. One small retry window; then wait for the next 135-minute slot.
 IF v_now-v_due > interval '30 minutes' THEN RETURN 0; END IF;
 IF EXISTS(SELECT 1 FROM ojjuda_note_internal.park_post_v2_history h WHERE h.slot_index=v_slot) THEN RETURN 0; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM auth.users u WHERE u.id=v_author
   AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
 ) OR NOT EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.user_private up ON up.user_id=p.id WHERE p.id=v_author
 ) THEN RAISE EXCEPTION 'Active, dedicated park posting bot membership required'; END IF;
 SELECT array_agg(c.theme ORDER BY h.slot_index DESC)
 INTO v_recent_themes
 FROM (
   SELECT h.slot_index,h.content_id FROM ojjuda_note_internal.park_post_v2_history h
   ORDER BY h.slot_index DESC LIMIT 4
 ) h JOIN ojjuda_note_internal.park_post_v2_contents c ON c.id=h.content_id;
 FOR v_copy IN
 SELECT c.id,c.theme,c.body
 FROM ojjuda_note_internal.park_post_v2_contents c WHERE c.active
      AND c.posted_count = 0
      AND NOT EXISTS (
        SELECT 1 FROM ojjuda_note_internal.park_post_v2_history h WHERE h.content_id=c.id
      )
 ORDER BY c.posted_count ASC,
   CASE WHEN c.theme=ANY(coalesce(v_recent_themes,ARRAY[]::text[])) THEN 1 ELSE 0 END ASC,
   c.last_posted_at ASC NULLS FIRST,
   pg_catalog.md5(v_slot::text||':body:'||c.id::text) ASC
 LOOP
  v_tags := ojjuda_note_internal.park_card_context_tags(v_copy.body);
  EXIT WHEN cardinality(v_tags) > 0;
 END LOOP;
 IF coalesce(cardinality(v_tags),0)=0 THEN RETURN 0; END IF;
 SELECT loc.lat,loc.lon INTO v_site
 FROM ojjuda_note_internal.pick_park_random_location_v2() loc;
 IF NOT FOUND THEN RAISE EXCEPTION 'No card publishing site available'; END IF;
 v_font:=v_fonts[(v_slot % pg_catalog.array_length(v_fonts,1))::integer + 1];
 v_color:=v_colors[((v_slot+2) % pg_catalog.array_length(v_colors,1))::integer + 1];
 v_style:=pg_catalog.jsonb_build_object('font',v_font,'boxColor',v_color,
    'textColor',CASE WHEN v_color IN ('white','yellow','green') THEN 'black' ELSE 'white' END);
 v_old_claim:=pg_catalog.current_setting('request.jwt.claim.sub',true);
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',v_author::text,true);
 v_result:=ojjuda_note.publish_card(v_request,v_copy.body,
    v_tags,'anonymous',v_style,v_site.lat,v_site.lon,NULL::uuid);
 v_card:=(v_result->>'card_id')::uuid;
 IF v_card IS NULL OR v_result->>'ok' <> 'true' THEN RAISE EXCEPTION 'Park card publish did not return success'; END IF;
 UPDATE ojjuda_note_internal.card_gender SET gender='private' WHERE card_id=v_card;
 IF NOT FOUND THEN RAISE EXCEPTION 'Park card gender metadata was not created'; END IF;
 INSERT INTO ojjuda_note_internal.park_post_v2_history
  (slot_index,due_at,content_id,request_id,card_id,posted_at)
 VALUES (v_slot,v_due,v_copy.id,v_request,v_card,v_now);
 UPDATE ojjuda_note_internal.park_post_v2_contents
 SET posted_count=posted_count+1,last_posted_at=v_now WHERE id=v_copy.id;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
 RETURN 1;
EXCEPTION WHEN OTHERS THEN
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',coalesce(v_old_claim,''),true);
 RAISE;
END;
$function$
;
DO $guard$ BEGIN
 IF has_function_privilege('anon','ojjuda_note_internal.run_park_post_v2()','execute')
 OR has_function_privilege('authenticated','ojjuda_note_internal.run_park_post_v2()','execute')
 OR (SELECT prosecdef FROM pg_proc WHERE oid='ojjuda_note_internal.run_park_post_v2()'::regprocedure)
 THEN RAISE EXCEPTION 'Park scheduler permission regression'; END IF;
END $guard$;