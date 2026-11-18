-- Old rows and unversioned clients retain the 30-day policy. There is no row backfill.
alter table pajang_private.answers
  add column publication_window_days smallint not null default 30,
  add constraint pajang_answer_publication_window_days_check
    check (publication_window_days in (30,365) and (publication_window_days = 30 or archived is true));

create function pajang_private.answer_is_visible(
  answer_day date, answer_slot text, shared_beyond_round boolean,
  current_day date, current_slot text, publication_window_days smallint
) returns boolean language sql immutable parallel safe
return answer_day between current_day - (case when publication_window_days = 365 then 365 else 30 end - 1) and current_day
  and (
    (answer_day = current_day and answer_slot = current_slot)
    or (shared_beyond_round and
        (answer_day < current_day or (answer_slot = 'am' and current_slot = 'pm')))
  );

-- A forgotten legacy caller must fail closed at its original window.
create or replace function pajang_private.answer_is_visible(
  answer_day date, answer_slot text, shared_beyond_round boolean,
  current_day date, current_slot text
) returns boolean language sql immutable parallel safe
return pajang_private.answer_is_visible(answer_day,answer_slot,shared_beyond_round,current_day,current_slot,30::smallint);

revoke all on function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
  from public,anon,authenticated;

-- Rewrite only the exact relevant fragments of the three current RPCs, preserving
-- security mode, ACLs, owner visibility, edit behavior, unrelated hotfixes and signatures.
-- Fail instead of silently deploying partial behavior if source has moved.
do $migration$
declare
  fn regprocedure;
  def text;
  needle text;
  replacement text;
begin
  foreach fn in array array[
    'public.pajang_answer_feed(jsonb)'::regprocedure,
    'public.pajang_discovery_feed(jsonb,text,text,text)'::regprocedure,
    'public.pajang_member(text,jsonb)'::regprocedure
  ] loop
    def:=pg_get_functiondef(fn);
    if fn='public.pajang_member(text,jsonb)'::regprocedure then
      needle:='pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,active_window.slot)';
      replacement:='pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,active_window.slot,a.publication_window_days)';
    else
      needle:='pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot)';
      replacement:='pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot,a.publication_window_days)';
    end if;
    if cardinality(string_to_array(def,needle))<>2 then raise exception 'Unexpected visibility call in %',fn; end if;
    def:=replace(def,needle,replacement);
    if fn='public.pajang_member(text,jsonb)'::regprocedure then
      needle:='insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)';
      if cardinality(string_to_array(def,needle))<>2 then raise exception 'Unexpected answer insert in %',fn; end if;
      def:=replace(def,needle,'insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)');
      needle:=$source$(p_data->'archive') is not distinct from 'true'::jsonb)
     on conflict(person,day,slot) do nothing;$source$;
      replacement:=$source$(p_data->'archive') is not distinct from 'true'::jsonb,
       case when (p_data->'archive') is not distinct from 'true'::jsonb
          and p_data->>'publicationPolicy'='year-v1' then 365 else 30 end)
     on conflict(person,day,slot) do nothing;$source$;
      if cardinality(string_to_array(def,needle))<>2 then raise exception 'Unexpected answer policy insert in %',fn; end if;
      def:=replace(def,needle,replacement);
    end if;
    execute def;
  end loop;
end $migration$;
