-- A saved deck from an older client must not restore the retired question bank.
-- Only a new truth_begin chooses a catalog. In-progress decks and questions stay
-- in their room snapshot, and cards explicitly added to the room stay personal.
do $truth_catalog_epoch$
declare
 definition text:=pg_get_functiondef('ojjuda_arcade_internal.live_truth(jsonb,text,jsonb,integer,integer,bigint)'::regprocedure);
 previous constant text:=$previous$  deck:=opts->'deck';
  if jsonb_typeof(deck) is distinct from 'object' then raise exception 'invalid_deck'; end if;$previous$;
 replacement constant text:=$replacement$  if (opts->>'catalog_revision') is distinct from '20261114-drinking-rebuild1' then
   -- Old clients can have official questions and saved personal cards mixed in
   -- opts.deck. Ignore that copy and read the current server catalog instead.
   deck:='{}'::jsonb;
   foreach k in array array['mild','spicy'] loop
    -- Keep room submissions within the existing per-flavor 2048-card limit.
    select coalesce(jsonb_agg(current_cards.body order by current_cards.id),'[]'::jsonb)
     into questions from (
      select c.id,c.body from ojjuda_arcade_internal.drinking_truth_cards c
      where c.active and c.flavor=k
      order by random()
      limit greatest(0,2048-coalesce(jsonb_array_length(personal->k),0))
     ) current_cards;
    deck:=jsonb_set(deck,array[k],questions);
   end loop;
  else
   -- The current client uses the new personal-card storage generation.
   deck:=opts->'deck';
  end if;
  if jsonb_typeof(deck) is distinct from 'object' then raise exception 'invalid_deck'; end if;$replacement$;
begin
 if length(definition)-length(replace(definition,previous,''))<>length(previous) then
  raise exception 'truth_catalog_epoch_source_changed';
 end if;
 -- CREATE OR REPLACE preserves the existing function identity and privileges.
 execute replace(definition,previous,replacement);
end;
$truth_catalog_epoch$;

notify pgrst,'reload schema';
