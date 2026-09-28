-- Enable daily curated Note cards for the dedicated Auth user created in the
-- Supabase Dashboard on 2026-09-28. Its app metadata was marked by the project
-- owner before this migration. Keep the user ID stable for future restores.
DO $activate$
DECLARE
  v_bot uuid := '2c2a8b2d-0270-42d4-89a5-4e71e653cb23'::uuid;
  v_seoul timestamp := now() AT TIME ZONE 'Asia/Seoul';
  v_start date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id=v_bot AND u.raw_app_meta_data->>'ojjuda_note_auto_card_bot'='true'
  ) THEN RAISE EXCEPTION 'Marked dedicated Auth bot account is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ojjuda_note_internal.auto_card_config WHERE singleton) THEN
    RAISE EXCEPTION 'Install auto_daily_note_cards_2026_09_28.sql first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='ojjuda_note_internal' AND table_name='auto_card_copy'
      AND column_name='local_day'
  ) THEN RAISE EXCEPTION 'Install auto_daily_note_cards_v2_2026_09_28.sql first'; END IF;
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
