CREATE OR REPLACE FUNCTION ojjuda_arcade_internal.live_truth(g jsonb, action text, opts jsonb, seat integer, n integer, ms bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 phase text:=g->>'phase'; player int:=(g->>'turn')::int; deck jsonb:=g->'deck'; pool jsonb; questions jsonb;
 flavor text; side int; card int; k text; answer text; spent jsonb; folded text; extra jsonb;
 mode text:=coalesce(g->>'mode','mixed'); show_taste boolean:=coalesce((g->>'showFlavor')::boolean,false);
 personal jsonb:=coalesce(g->'personal','{}'::jsonb); merged jsonb;
begin
 if action='init' then return jsonb_build_object('phase','setup'); end if;
 if action='tick' then return g; end if;
 if action='view' then
  return jsonb_strip_nulls(jsonb_build_object('phase',phase,'turn',player,'question',g->'question','flavor',g->'flavor',
   'mode',case when phase in ('pick','answer') then mode end,
   'cardFlavors',case when phase='pick' and show_taste then
     case when mode in ('mild','spicy') then jsonb_build_array(mode,mode)
          when (g->>'spicySide')::int=0 then '["spicy","mild"]'::jsonb else '["mild","spicy"]'::jsonb end end,
   'added',case when personal<>'{}'::jsonb then jsonb_build_object('mild',coalesce(jsonb_array_length(personal->'mild'),0),
        'spicy',coalesce(jsonb_array_length(personal->'spicy'),0)) end));
 end if;
 if action='truth_add' then
  if phase not in ('setup','pick','answer') then raise exception 'unavailable'; end if;
  flavor:=opts->>'flavor';
  if flavor is null or flavor not in ('mild','spicy') then raise exception 'invalid_flavor'; end if;
  if jsonb_typeof(opts->'question') is distinct from 'string' or octet_length(opts->>'question')>3000 then raise exception 'invalid_question'; end if;
  answer:=btrim(regexp_replace(normalize(opts->>'question',NFC),'[[:space:][:cntrl:]]+',' ','g')); folded:=lower(answer);
  if length(answer) not between 1 and 240 then raise exception 'invalid_question'; end if;
  extra:=coalesce(personal->flavor,'[]');
  questions:=coalesce(deck->flavor,'[]');
  if exists(select 1 from jsonb_array_elements_text(case when phase='setup' then extra else questions end) q
     where lower(btrim(regexp_replace(normalize(q,NFC),'[[:space:][:cntrl:]]+',' ','g')))=folded) then return g; end if;
  if jsonb_array_length(extra)>=2048 or jsonb_array_length(questions)>=2048 then raise exception 'invalid_deck'; end if;
  g:=g||jsonb_build_object('personal',jsonb_set(personal,array[flavor],extra||jsonb_build_array(answer)));
  if phase='setup' then return g; end if;
  g:=jsonb_set(g,array['deck',flavor],questions||jsonb_build_array(answer));
  pool:=g->'remaining'->flavor;
  -- If no cycle started or the last one finished, the next draw already uses the expanded deck.
  if jsonb_array_length(pool)>0 then
   g:=jsonb_set(g,array['remaining',flavor],pool||jsonb_build_array(answer));
  end if;
  return g;
 end if;
 if action='truth_begin' then
  if seat<>0 then raise exception 'host_only'; end if;
  if phase<>'setup' then raise exception 'unavailable'; end if;
  mode:=coalesce(opts->>'mode','mixed');
  if mode not in ('mild','spicy','mixed') then raise exception 'invalid_mode'; end if;
  if opts ? 'showFlavor' and jsonb_typeof(opts->'showFlavor') is distinct from 'boolean' then raise exception 'invalid_visibility'; end if;
  show_taste:=coalesce((opts->>'showFlavor')::boolean,false);
  deck:=opts->'deck';
  if jsonb_typeof(deck) is distinct from 'object' then raise exception 'invalid_deck'; end if;
  merged:='{}';
  foreach k in array array['mild','spicy'] loop
   questions:=deck->k;
   if jsonb_typeof(questions) is distinct from 'array' then raise exception 'invalid_deck'; end if;
   if jsonb_array_length(questions)>2048 then raise exception 'invalid_deck'; end if;
   if exists(select 1 from jsonb_array_elements(questions) q where jsonb_typeof(q)<>'string'
     or length(trim(q#>>'{}')) not between 1 and 240)
    or (select count(distinct trim(q)) from jsonb_array_elements_text(questions) q)<>jsonb_array_length(questions)
    then raise exception 'invalid_deck'; end if;
   extra:=coalesce(personal->k,'[]');
   if jsonb_array_length(extra)>0 then
    -- Host submissions may already contain cards the same person added from their phone.
    -- Keep their original spelling; include each normalized question at most once.
    select coalesce(jsonb_agg(q order by pos),'[]') into questions from (
     select distinct on (lower(btrim(regexp_replace(normalize(q,NFC),'[[:space:][:cntrl:]]+',' ','g')))) q,pos
     from jsonb_array_elements_text(questions||extra) with ordinality v(q,pos)
     order by lower(btrim(regexp_replace(normalize(q,NFC),'[[:space:][:cntrl:]]+',' ','g'))),pos
    ) unique_cards;
   end if;
   if jsonb_array_length(questions)>2048 or ((mode='mixed' or mode=k) and jsonb_array_length(questions)=0) then raise exception 'invalid_deck'; end if;
   merged:=jsonb_set(merged,array[k],questions);
  end loop;
  return jsonb_build_object('phase','pick','turn',0,'deck',merged,'personal',personal,'mode',mode,'showFlavor',show_taste,
   'remaining','{}'::jsonb,'spicySide',floor(random()*2)::int);
 end if;
 if seat is distinct from player then raise exception 'not_your_turn'; end if;
 if action='truth_pick' then
  if phase<>'pick' then raise exception 'unavailable'; end if;
  if coalesce(opts->>'side','') not in ('0','1') then raise exception 'invalid_target'; end if;
  side:=(opts->>'side')::int;
  flavor:=case when mode in ('mild','spicy') then mode when side=(g->>'spicySide')::int then 'spicy' else 'mild' end;
  spent:=g->'remaining'; pool:=spent->flavor;
  if pool is null or jsonb_array_length(pool)=0 then pool:=g->'deck'->flavor; end if;
  card:=floor(random()*jsonb_array_length(pool))::int;
  answer:=pool->>card;
  return (g-'spicySide')||jsonb_build_object('phase','answer','question',answer,'flavor',flavor,
   'remaining',jsonb_set(spent,array[flavor],pool-card));
 elsif action in ('truth_answer','truth_pass') then
  if phase<>'answer' then raise exception 'unavailable'; end if;
  if player+1>=n then return jsonb_build_object('phase','done'); end if;
  return (g-'question'-'flavor')||jsonb_build_object('phase','pick','turn',player+1,'spicySide',floor(random()*2)::int);
 end if;
 raise exception 'invalid_action';
end;
$function$;
