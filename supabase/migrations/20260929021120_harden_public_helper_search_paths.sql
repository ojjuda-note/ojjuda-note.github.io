-- Applied through Supabase migration 20260929021120.
-- Keep existing behavior and grants while pinning helper name resolution.
ALTER FUNCTION public.quiz_norm(text) SET search_path = pg_catalog;
ALTER FUNCTION public.quiz_choseong(text) SET search_path = pg_catalog;
ALTER FUNCTION public.norm_text(text) SET search_path = pg_catalog;
ALTER FUNCTION public.check_banned_cols() SET search_path = pg_catalog;
ALTER FUNCTION public.risk_pattern() SET search_path = pg_catalog;
