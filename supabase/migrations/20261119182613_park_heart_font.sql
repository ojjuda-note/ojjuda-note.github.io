-- Add the self-hosted Single Day heart font to the existing card style choices.
-- CREATE OR REPLACE preserves the internal function's existing execution grants.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.valid_card_style(p_style jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(p_style->>'shopSticker','none') in ('none','heart','clover','moon','coffee','flower','cheer')
    AND coalesce(p_style->>'shopFont','none') in ('none','book','letter','poster')
    AND coalesce(p_style->>'shopEffect','none') in ('none','foil')
    AND p_style IS NOT NULL AND jsonb_typeof(p_style) = 'object'
    AND octet_length(p_style::text) <= 512
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p_style) = 'object'
        THEN p_style ELSE '{}'::jsonb END) AS k(key)
      WHERE k.key NOT IN
        ('font', 'size', 'theme', 'effect', 'textColor', 'backgroundColor', 'boxColor', 'boxTransparency','shopSticker','shopFont','shopEffect')
    )
    AND coalesce(p_style->>'font', 'default') IN
      ('default', 'round', 'serif', 'handwriting', 'heart', 'calligraphy', 'mono')
    AND coalesce(p_style->>'size', 'normal') IN ('normal', 'large', 'small')
    AND coalesce(p_style->>'theme', 'plain') IN ('plain', 'rose', 'night')
    AND coalesce(p_style->>'effect', 'none') IN
      ('none', 'sparkle', 'frame',
       'rain', 'shimmer', 'rainbow', 'snow', 'starlight',
       'fireflies', 'petals', 'bubbles', 'aurora', 'confetti',
       'sunbeams', 'mist', 'ocean', 'heartbeat', 'orbit',
       'glitter', 'meteor', 'leaves', 'neon', 'dawn')
    AND coalesce(p_style->>'textColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND coalesce(p_style->>'backgroundColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND coalesce(p_style->>'boxColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND (p_style->>'boxTransparency' IS NULL OR (p_style->>'boxTransparency') ~ '^(100|[1-9]?[0-9])$');
$function$
