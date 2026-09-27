-- Run ONLY after auto_daily_note_cards_v2_2026_09_28.sql and a dedicated
-- Supabase Auth user has been created through the
-- server-side Auth Admin API and its app_metadata set to
-- {"ojjuda_note_auto_card_bot": true}. Replace the UUID below with that user's id.
-- Do not create auth.users with direct SQL. The system user needs no sign-in.
DO $activate$
DECLARE
  v_bot uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_seoul timestamp := now() AT TIME ZONE 'Asia/Seoul';
  v_start date;
BEGIN
  IF v_bot='00000000-0000-0000-0000-000000000000'::uuid OR NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id=v_bot AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
  ) THEN RAISE EXCEPTION 'Replace UUID with the marked dedicated Auth bot id'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.auto_card_config WHERE singleton) THEN
    RAISE EXCEPTION 'Install auto_daily_note_cards_2026_09_28.sql first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ojjuda_note_internal' AND table_name='auto_card_copy'
      AND column_name='local_day'
  ) THEN RAISE EXCEPTION 'Install auto_daily_note_cards_v2_2026_09_28.sql first'; END IF;
  -- No welcome points or daily check-ins: this is a non-human member used only
  -- as the existing Note publish_card author FK.
  INSERT INTO public.profiles(id,nickname)
  VALUES(v_bot,'오쭈다자동카드') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.user_private(user_id)
  VALUES(v_bot) ON CONFLICT(user_id) DO NOTHING;
  UPDATE public.user_private SET coins=0 WHERE user_id=v_bot;
  v_start := v_seoul::date + CASE WHEN v_seoul::time < time '08:00' THEN 0 ELSE 1 END;
  UPDATE ojjuda_note_internal.auto_card_config
    SET author_id=v_bot,enabled=true,starts_on=v_start
    WHERE singleton;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='ojjuda_note_daily_auto_cards') THEN
    PERFORM cron.schedule(
      'ojjuda_note_daily_auto_cards',
      '* 23,0-12 * * *',
      'SELECT ojjuda_note_internal.run_auto_cards()'
    );
  END IF;
END;
$activate$;

-- Pause immediately if needed:
-- UPDATE ojjuda_note_internal.auto_card_config SET enabled=false WHERE singleton;
-- SELECT cron.unschedule('ojjuda_note_daily_auto_cards');
