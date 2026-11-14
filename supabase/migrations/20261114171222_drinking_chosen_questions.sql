-- Keep random draws available. A named question is an explicit choice by the current player.
do $migration$
declare
  body text;
  needle text;
  addition text;
begin
  body:=pg_get_functiondef('ojjuda_arcade_internal.live_truth(jsonb,text,jsonb,integer,integer,bigint)'::regprocedure);
  needle:=$old$  if coalesce(opts->>'side','') not in ('0','1') then raise exception 'invalid_target'; end if;$old$;
  addition:=$new$  if opts ? 'question' then
   if opts->'turn' is distinct from g->'turn' then raise exception 'stale_turn'; end if;
   flavor:=opts->>'flavor';
   if flavor is null or flavor not in ('mild','spicy') or (mode<>'mixed' and mode<>flavor) then raise exception 'invalid_flavor'; end if;
   answer:=btrim(regexp_replace(opts->>'question','[[:space:][:cntrl:]]+',' ','g'));
   if jsonb_typeof(opts->'question') is distinct from 'string' or char_length(answer) not between 1 and 240 then raise exception 'invalid_question'; end if;
   return (g-'spicySide')||jsonb_build_object('phase','answer','question',answer,'flavor',flavor);
  end if;
$new$;
  if strpos(body,needle)=0 then raise exception 'truth_pick_source_changed';end if;
  execute replace(body,needle,addition||needle);

  body:=pg_get_functiondef('ojjuda_arcade_internal.party_vote_multiplayer(text,text,text,jsonb)'::regprocedure);
  needle:=$old$ elsif p_action in ('ready','start_vote','vote','again') then$old$;
  addition:=$new$ elsif p_action='minority_question' then
  if p_kind<>'minority' or r.phase<>'vote' then raise exception 'unavailable'; end if;
  if me<>0 then raise exception 'host_only'; end if;
  if (p_options->>'round')::int is distinct from r.round then raise exception 'stale_round'; end if;
  if exists(select 1 from unnest(r.votes) v where v>=0) then raise exception 'vote_started'; end if;
  if (p_options->>'revision')::int is distinct from r.revision then raise exception 'stale_round'; end if;
  if jsonb_typeof(p_options->'choices') is distinct from 'array' then raise exception 'invalid_choices'; end if;
  if jsonb_array_length(p_options->'choices')<>2 or exists(select 1 from jsonb_array_elements(p_options->'choices') v where jsonb_typeof(v)<>'string') then raise exception 'invalid_choices'; end if;
  r.pair:=array[btrim(regexp_replace(p_options->'choices'->>0,'[[:space:][:cntrl:]]+',' ','g')),btrim(regexp_replace(p_options->'choices'->>1,'[[:space:][:cntrl:]]+',' ','g'))];
  if char_length(r.pair[1]) not between 1 and 80 or char_length(r.pair[2]) not between 1 and 80 or lower(r.pair[1])=lower(r.pair[2]) then raise exception 'invalid_choices'; end if;
  r.game_state:=coalesce(r.game_state,'{}'::jsonb)||jsonb_build_object('question_round',r.round);
  changed:=true;
$new$;
  if strpos(body,needle)=0 then raise exception 'minority_vote_source_changed';end if;
  body:=replace(body,needle,addition||needle);
  needle:=$old$   target_slot:=(p_options->>'target')::int;$old$;
  addition:=$new$   if p_kind='minority' and (p_options ? 'choices' or r.game_state->>'question_round'=r.round::text) and p_options->'choices' is distinct from to_jsonb(r.pair) then raise exception 'choices_changed'; end if;
$new$;
  if strpos(body,needle)=0 then raise exception 'minority_ballot_source_changed';end if;
  execute replace(body,needle,addition||needle);
end;
$migration$;
