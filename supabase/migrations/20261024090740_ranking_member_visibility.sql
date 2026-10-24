-- Member-scoped is_banned(uuid) cannot inspect another leaderboard participant.
-- Filter candidates inside the existing private definer, as the other ranking
-- branches already do. Keep the public privacy helper, role grants, block filter,
-- age checks, output fields, and score ordering unchanged.
begin;
set local lock_timeout = '5s';
do $patch$
declare
  definition text := pg_get_functiondef('ojjuda_guest_internal.criteria_ranking(text,text,text)'::regprocedure);
  old_check text := 'not public.is_banned(s.user_id)';
  new_check text := 'not exists(select 1 from public.user_private ban where ban.user_id=s.user_id and ban.banned_until>v_now)';
begin
  if (length(definition)-length(replace(definition,old_check,'')))/length(old_check) <> 2 then
    raise exception 'ranking visibility patch expected exactly two scoped ban checks';
  end if;
  execute replace(definition,old_check,new_check);
end;
$patch$;
notify pgrst,'reload schema';
commit;
