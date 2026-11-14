-- Store reviewed answer words privately while every playable prompt stays two initials.
-- Compatibility initials remain valid for existing rows, old clients and admin edits.
create or replace function ojjuda_arcade_internal.drinking_initial_key(p_body text)
returns text language sql immutable strict security invoker set search_path='' as $initial_key$
 select case
  when pg_catalog.char_length(p_body)=2
   and p_body ~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$' then p_body
  when pg_catalog.char_length(p_body)=2
   and pg_catalog.ascii(pg_catalog.substr(p_body,1,1)) between 44032 and 55203
   and pg_catalog.ascii(pg_catalog.substr(p_body,2,1)) between 44032 and 55203 then
    pg_catalog.substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',
     (pg_catalog.ascii(pg_catalog.substr(p_body,1,1))-44032)/588+1,1)
    ||pg_catalog.substr('ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',
     (pg_catalog.ascii(pg_catalog.substr(p_body,2,1))-44032)/588+1,1)
  else null
 end;
$initial_key$;
revoke all on function ojjuda_arcade_internal.drinking_initial_key(text) from public,anon,authenticated;

-- Identify the exact previous initial-only check; leave all other checks intact.
do $initial_constraint$
declare
 prior_check constant text:=$check$CHECK (((kind <> 'initial'::text) OR (body ~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$'::text)))$check$;
 check_name text;
 matches integer;
begin
 select count(*),min(conname) into matches,check_name from pg_catalog.pg_constraint
 where conrelid='ojjuda_arcade_internal.drinking_content_items'::regclass
  and contype='c' and pg_catalog.pg_get_constraintdef(oid)=prior_check;
 if matches<>1 then raise exception 'initial_word_constraint_source_changed'; end if;
 execute pg_catalog.format('alter table ojjuda_arcade_internal.drinking_content_items drop constraint %I',check_name);
 execute pg_catalog.format('alter table ojjuda_arcade_internal.drinking_content_items add constraint %I check (kind<>''initial'' or ojjuda_arcade_internal.drinking_initial_key(body) is not null)',check_name);
end;
$initial_constraint$;

-- Guard both small edits against drift. The original member/admin checks, raw
-- admin list, revision races and the other games' 68% party preference stay intact.
do $initial_catalog$
declare
 definition text:=pg_catalog.pg_get_functiondef('ojjuda_arcade_internal.drinking_content(text,jsonb)'::regprocedure);
 prior_pool constant text:=$old_pool$   else
    if favor_party then
     select exists(select 1 from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and party_pick) into favor_party;
    end if;
    select coalesce(jsonb_agg(case when second is null then to_jsonb(body) else jsonb_build_array(body,second) end order by id),'[]'::jsonb)
     into lines from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);$old_pool$;
 next_pool constant text:=$new_pool$   elsif requested='initial' then
    -- Group first: words sharing an initial key neither leak nor weight the draw.
    with keys as (
     select ojjuda_arcade_internal.drinking_initial_key(body) as initial_key,
      min(id) as first_id,bool_or(party_pick) as party_pick
     from ojjuda_arcade_internal.drinking_content_items where active and kind='initial'
     group by ojjuda_arcade_internal.drinking_initial_key(body)
    )
    select coalesce(jsonb_agg(initial_key order by first_id),'[]'::jsonb) into lines
    from keys where initial_key is not null
     and (not coalesce(favor_party,false) or party_pick
      or not exists(select 1 from keys where initial_key is not null and party_pick));
   else
    if favor_party then
     select exists(select 1 from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and party_pick) into favor_party;
    end if;
    select coalesce(jsonb_agg(case when second is null then to_jsonb(body) else jsonb_build_array(body,second) end order by id),'[]'::jsonb)
     into lines from ojjuda_arcade_internal.drinking_content_items where active and kind=requested and (not coalesce(favor_party,false) or party_pick);$new_pool$;
 prior_validation constant text:=$old_validation$or (requested='initial' and wording !~ '^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$')$old_validation$;
 next_validation constant text:=$new_validation$or (requested='initial' and ojjuda_arcade_internal.drinking_initial_key(wording) is null)$new_validation$;
begin
 if length(definition)-length(replace(definition,prior_pool,''))<>length(prior_pool)
  or length(definition)-length(replace(definition,prior_validation,''))<>length(prior_validation) then
  raise exception 'initial_word_catalog_source_changed';
 end if;
 -- CREATE OR REPLACE preserves the function identity, owner and existing grants.
 execute replace(replace(definition,prior_pool,next_pool),prior_validation,next_validation);
end;
$initial_catalog$;

-- Only the initial path changes. Keep every other game's draw byte-for-byte,
-- including the party preference added after the original managed-draw migration.
do $initial_draw$
declare
 definition text:=pg_catalog.pg_get_functiondef('ojjuda_arcade_internal.drinking_draw_prompt(text,text[])'::regprocedure);
 prior_draw constant text:=$old_draw$declare
 result text[];
 favor_party boolean:=random()<0.68;
begin
 select case when c.second is null then array[c.body] else array[c.body,c.second] end
 into result
 from ojjuda_arcade_internal.drinking_content_items c
 where c.kind=p_kind and c.active
 order by case when c.body is distinct from p_previous[1] then 0
               when c.second is distinct from p_previous[2] then 1 else 2 end,
          case when favor_party and c.party_pick then 0 else 1 end, random()
 limit 1;
 if not found then raise exception 'invalid_game'; end if;
 return result;
end;$old_draw$;
 next_draw constant text:=$new_draw$declare
 result text[];
 favor_party boolean:=random()<0.68;
begin
 if p_kind='initial' then
  with keys as (
   select ojjuda_arcade_internal.drinking_initial_key(c.body) as initial_key,
    bool_or(c.party_pick) as party_pick
   from ojjuda_arcade_internal.drinking_content_items c
   where c.kind='initial' and c.active
   group by ojjuda_arcade_internal.drinking_initial_key(c.body)
  )
  select array[k.initial_key] into result from keys k
  where k.initial_key is not null
   and (k.initial_key is distinct from ojjuda_arcade_internal.drinking_initial_key(p_previous[1])
    or not exists(select 1 from keys other where other.initial_key is not null
     and other.initial_key is distinct from ojjuda_arcade_internal.drinking_initial_key(p_previous[1])))
  order by case when favor_party and k.party_pick then 0 else 1 end,random()
  limit 1;
  -- A sole remaining key may repeat, matching the existing last-prompt fallback.
  if not found then raise exception 'invalid_game'; end if;
  return result;
 end if;
 select case when c.second is null then array[c.body] else array[c.body,c.second] end
 into result
 from ojjuda_arcade_internal.drinking_content_items c
 where c.kind=p_kind and c.active
 order by case when c.body is distinct from p_previous[1] then 0
               when c.second is distinct from p_previous[2] then 1 else 2 end,
          case when favor_party and c.party_pick then 0 else 1 end, random()
 limit 1;
 if not found then raise exception 'invalid_game'; end if;
 return result;
end;$new_draw$;
begin
 if length(definition)-length(replace(definition,prior_draw,''))<>length(prior_draw) then
  raise exception 'initial_word_draw_source_changed';
 end if;
 execute replace(definition,prior_draw,next_draw);
end;
$initial_draw$;
