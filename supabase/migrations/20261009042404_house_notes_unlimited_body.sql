-- Our-house Notes use house_posts. Park photo cards keep their 200-character rule.
ALTER TABLE public.house_posts DROP CONSTRAINT house_posts_body_check;
ALTER TABLE public.house_posts ADD CONSTRAINT house_posts_body_check
  CHECK (char_length(btrim(body)) >= 1);

-- Retain the existing ownership, folder, visibility and retry checks verbatim.
DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.house_save_post(text,text,uuid,text,boolean)'::regprocedure);
  IF position('char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected house_save_post validation; review before changing';
  END IF;
  EXECUTE replace(definition,'char_length(btrim(p_body)) NOT BETWEEN 1 AND 4000',
    'char_length(btrim(p_body)) < 1');
END;
$migration$;
NOTIFY pgrst, 'reload schema';
