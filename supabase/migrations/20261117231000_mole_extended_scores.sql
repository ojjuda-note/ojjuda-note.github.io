begin;
set local lock_timeout = '5s';

-- Archived winners retain their original wire keys. Active member and guest
-- ledgers use one comparable key so max(), tie times and rank cutoffs agree.
create or replace function ojjuda_guest_internal.mole_rank_key(value integer)
returns integer language sql immutable strict security invoker set search_path = '' as $$
  select case when value between 1 and 3999
    then 4000 + (value / 1000) * 500000000 + (value % 1000)
    else value end;
$$;
revoke all on function ojjuda_guest_internal.mole_rank_key(integer) from public;
grant execute on function ojjuda_guest_internal.mole_rank_key(integer) to service_role;

-- Normalize at the storage boundary. An old browser can retry its original
-- request even after deployment. The guest's last_score is the wire payload
-- used for receipt matching and must keep its original value.
create or replace function ojjuda_guest_internal.store_mole_rank_key()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.score := ojjuda_guest_internal.mole_rank_key(new.score);
  return new;
end;
$$;
revoke all on function ojjuda_guest_internal.store_mole_rank_key() from public;

lock table public.game_scores, ojjuda_guest_internal.scores,
  ojjuda_ranking_internal.guest_peaks in share row exclusive mode;

do $migration$
declare
  target regprocedure;
  source text;
  old_rule text;
  new_rule constant text := '(''mole''[[:space:]]+then[[:space:]]+)2000003999\M';
  ledger regclass;
begin
  foreach target in array array[
    'ojjuda_game_internal.submit_score(text,integer)'::regprocedure,
    'ojjuda_guest_internal.score_limit(text)'::regprocedure,
    'ojjuda_game_internal.community_game_ranking(text)'::regprocedure,
    'ojjuda_game_internal.community_game_monthly_ranking(text)'::regprocedure
  ] loop
    source := pg_get_functiondef(target);
    if source ~* new_rule then continue; end if;
    old_rule := '(''mole''[[:space:]]+then[[:space:]]+)' ||
      case when target in ('ojjuda_game_internal.submit_score(text,integer)'::regprocedure,
                           'ojjuda_guest_internal.score_limit(text)'::regprocedure)
        then '3999' else '200' end || '\M';
    if (select count(*) from regexp_matches(source, old_rule, 'gi')) <> 1 then
      raise exception 'Unexpected mole score rule in %', target;
    end if;
    execute regexp_replace(source, old_rule, '\1' || '2000003999', 'i');
  end loop;

  foreach ledger in array array['public.game_scores'::regclass,
    'ojjuda_guest_internal.scores'::regclass, 'ojjuda_ranking_internal.guest_peaks'::regclass]
  loop
    execute format('create or replace trigger normalize_mole_rank_key before insert or update of score on %s
      for each row when (new.game = ''mole'' and new.score between 1 and 3999)
      execute function ojjuda_guest_internal.store_mole_rank_key()', ledger);
    execute format('update %s set score = ojjuda_guest_internal.mole_rank_key(score)
      where game = ''mole'' and score between 1 and 3999', ledger);
  end loop;
end;
$migration$;
commit;
