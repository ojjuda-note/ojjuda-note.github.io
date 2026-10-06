-- Direct access stays denied even if a table grant is accidentally added later.
-- Only the validated private score RPC may write/read individual guest records.
create policy guest_scores_deny_direct on ojjuda_guest_internal.scores
  as restrictive for all to anon, authenticated using (false) with check (false);
