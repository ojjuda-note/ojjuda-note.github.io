-- Expand only Whack-a-Mole score bounds to accommodate encoded grid tiers.
-- 3x3 retains its original scores; 4x4, 5x5 and 6x6 use +1000, +2000, +3000.
-- Keep all existing validation, throttling and SECURITY DEFINER settings intact.
DO $mole_grid_rank$
DECLARE
  guest_definition text;
  member_definition text;
BEGIN
  SELECT pg_get_functiondef('ojjuda_guest_internal.score_limit(text)'::regprocedure)
    INTO guest_definition;
  IF guest_definition IS NULL OR
     strpos(guest_definition, 'WHEN p_game=''mole'' THEN 200') = 0 THEN
    RAISE EXCEPTION 'Expected guest mole score limit was not found';
  END IF;
  EXECUTE replace(guest_definition,
    'WHEN p_game=''mole'' THEN 200',
    'WHEN p_game=''mole'' THEN 3999');

  SELECT pg_get_functiondef('ojjuda_game_internal.submit_score(text,integer)'::regprocedure)
    INTO member_definition;
  IF member_definition IS NULL OR
     strpos(member_definition, 'WHEN ''mole'' THEN 200') = 0 THEN
    RAISE EXCEPTION 'Expected member mole score limit was not found';
  END IF;
  EXECUTE replace(member_definition,
    'WHEN ''mole'' THEN 200',
    'WHEN ''mole'' THEN 3999');
END
$mole_grid_rank$;