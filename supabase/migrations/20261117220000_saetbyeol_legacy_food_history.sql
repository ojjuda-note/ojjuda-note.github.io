begin;

create function public.saetbyeol_legacy_food_eligible(p_guest_token text default null)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  -- The GitHub Pages 1.9.0 deploy job (run 44065051375) finished at this instant.
  cutoff constant timestamptz := '2026-11-17 10:29:54+00';
  actor uuid := auth.uid();
  token_hash text;
begin
  if actor is not null then
    return exists (
      select 1 from public.game_scores s
      where s.user_id = actor and s.game = 'saetbyeol'
        and s.created_at < cutoff and s.score between 50000 and 57680
    );
  end if;

  if p_guest_token is null or octet_length(p_guest_token) <> 64
      or p_guest_token !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  token_hash := encode(sha256(convert_to(p_guest_token, 'UTF8')), 'hex');

  -- Daily best and latest submission each have their own timestamp.
  return exists (
    select 1 from ojjuda_guest_internal.scores s
    where s.game = 'saetbyeol' and s.guest_hash = token_hash
      and s.day <= (cutoff at time zone 'Asia/Seoul')::date
      and ((s.achieved_at < cutoff and s.score between 50000 and 57680)
        or (s.last_submitted_at < cutoff and s.last_score between 50000 and 57680))
  ) or exists (
    select 1 from ojjuda_ranking_internal.guest_peaks p
    where p.game = 'saetbyeol' and p.guest_hash = token_hash
      and p.month_start <= (cutoff at time zone 'Asia/Seoul')::date
      and p.achieved_at < cutoff and p.score between 50000 and 57680
  );
end;
$$;

revoke all on function public.saetbyeol_legacy_food_eligible(text) from public, anon, authenticated, service_role;
grant execute on function public.saetbyeol_legacy_food_eligible(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
