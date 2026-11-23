-- Read existing question suggestions from the shared inquiry store. Keep the
-- original inquiry, submission and reply APIs unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.admin_pajang_question_suggestions(
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nickname text,
  body text,
  status text,
  reply text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  suggestion_prefix CONSTANT text := E'[파장 · 오늘의 질문 제안]\n';
BEGIN
  IF auth.uid() IS NULL OR ojjuda_note_internal.is_note_moderator() IS NOT TRUE THEN
    RAISE EXCEPTION 'Note moderator required' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('all', 'open', 'resolved')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'Invalid page' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT i.id, i.user_id, coalesce(nullif(btrim(p.nickname), ''), '회원'),
         i.body, i.status, i.reply, i.created_at, i.updated_at
  FROM ojjuda_note_internal.inquiries AS i
  LEFT JOIN public.profiles AS p ON p.id = i.user_id
  WHERE left(i.body, char_length(suggestion_prefix)) = suggestion_prefix
    AND (p_status = 'all' OR i.status = p_status)
  ORDER BY i.created_at DESC, i.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION ojjuda_note.admin_pajang_question_suggestions(
  p_status text DEFAULT 'all',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  nickname text,
  body text,
  status text,
  reply text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT * FROM ojjuda_note_internal.admin_pajang_question_suggestions(p_status, p_limit, p_offset);
$function$;

-- Explicit grants also override permissive installation defaults.
REVOKE ALL ON FUNCTION
  ojjuda_note.admin_pajang_question_suggestions(text, integer, integer),
  ojjuda_note_internal.admin_pajang_question_suggestions(text, integer, integer)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  ojjuda_note.admin_pajang_question_suggestions(text, integer, integer),
  ojjuda_note_internal.admin_pajang_question_suggestions(text, integer, integer)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
