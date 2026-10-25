-- PR #91 (ebb98b88, 2026-10-03 09:19 UTC) introduced flat puzzles and
-- separate score keys. Before that release, world.html imported screw3d and
-- recorded the box game as "screw". Recover only those unambiguous old rows.
-- Preserve IDs, owners, scores, rewards, verification and original timestamps.
update public.game_scores
set game = 'screw_box'
where game = 'screw'
  and created_at < timestamptz '2026-10-03 09:19:00+00';
