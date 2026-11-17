begin;
set local lock_timeout = '5s';

-- Raw legacy scores below 90,000 are still accepted. A zero remainder in a
-- legacy tier means "10,000 seconds or more": the exact duration was not saved.
-- One slot at the bottom of each new difficulty tier preserves that uncertainty.
create or replace function ojjuda_game_internal.mines_rank_score(value integer)
returns integer language sql immutable strict security invoker set search_path = '' as $$
  select case when value between 10000 and 89999 then
    90000 + (value / 10000 - 1) * 250000000 +
      case when value % 10000 = 0 then 0 else 250000000 - (10000 - value % 10000) end
    else value end;
$$;
revoke all on function ojjuda_game_internal.mines_rank_score(integer) from public;
grant execute on function ojjuda_game_internal.mines_rank_score(integer) to service_role;

create or replace function ojjuda_game_internal.store_mines_rank_score()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.score := ojjuda_game_internal.mines_rank_score(new.score);
  return new;
end;
$$;
revoke all on function ojjuda_game_internal.store_mines_rank_score() from public;

lock table public.game_scores, ojjuda_guest_internal.scores,
  ojjuda_ranking_internal.guest_peaks in share row exclusive mode;
do $migration$
declare
  target regprocedure;
  source text;
  old_rule constant text := '(''mines''[[:space:]]+then[[:space:]]+)89999\M';
  new_rule constant text := '''mines''[[:space:]]+then[[:space:]]+2000089999\M';
  ledger regclass;
begin
  foreach target in array array[
    'ojjuda_game_internal.submit_score(text,integer)'::regprocedure,
    'ojjuda_guest_internal.score_limit(text)'::regprocedure
  ] loop
    source := pg_get_functiondef(target);
    if source ~* new_rule then continue; end if;
    if (select count(*) from regexp_matches(source,old_rule,'gi')) <> 1 then
      raise exception 'Unexpected Minesweeper score rule in %', target;
    end if;
    execute regexp_replace(source,old_rule,'\1' || '2000089999','i');
  end loop;

  -- Normalize before ON CONFLICT compares the incoming score with the saved
  -- one. last_score, request IDs, achieved_at and archived snapshots stay intact.
  foreach ledger in array array['public.game_scores'::regclass,
    'ojjuda_guest_internal.scores'::regclass, 'ojjuda_ranking_internal.guest_peaks'::regclass]
  loop
    execute format('create or replace trigger normalize_mines_score before insert or update of score on %s
      for each row when (new.game = ''mines'' and new.score between 10000 and 89999)
      execute function ojjuda_game_internal.store_mines_rank_score()', ledger);
    execute format('update %s set score = ojjuda_game_internal.mines_rank_score(score)
      where game = ''mines'' and score between 10000 and 89999', ledger);
  end loop;
end;
$migration$;
commit;
