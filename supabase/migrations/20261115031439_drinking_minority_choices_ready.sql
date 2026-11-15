-- Let every phone distinguish the random starting pair from the host's confirmed pair.
-- Rooms already taking votes (including older clients) keep their current ballot.
do $migration$
declare
  definition text := pg_get_functiondef('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure);
  anchor text := $line$'choices',case when (p_kind='minority' and r.phase<>'waiting') or r.phase='done' then r.pair end,$line$;
  marker text := $line$'choicesReady',case when p_kind='minority' and r.phase='vote' then
    coalesce(r.game_state->>'question_round'=r.round::text,false) or cardinality(array_remove(r.votes,-1))>0 end,$line$;
begin
  if cardinality(string_to_array(definition,anchor))<>2 then
    raise exception 'unexpected minority ballot view';
  end if;
  execute replace(definition,anchor,anchor||chr(10)||marker);
end;
$migration$;
