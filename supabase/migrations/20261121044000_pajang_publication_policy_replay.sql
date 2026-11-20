-- D02 / AUD-20261121-D02-02: make the already-operated 30/365 day
-- Pajang answer publication contract reproducible from main migrations.
-- Additive and idempotent. Never rewrite existing answers, signals, or wallets.
set local lock_timeout = '4s';

alter table pajang_private.answers
  add column if not exists publication_window_days smallint not null default 30;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='pajang_private.answers'::regclass
      and conname='pajang_answer_publication_window_days_check'
  ) then
    alter table pajang_private.answers
      add constraint pajang_answer_publication_window_days_check
      check (publication_window_days in (30,365)
             and (publication_window_days=30 or archived is true));
  elsif not exists (
    select 1 from pg_constraint
    where conrelid='pajang_private.answers'::regclass
      and conname='pajang_answer_publication_window_days_check'
      and pg_get_constraintdef(oid) like '%publication_window_days%'
  ) then
    raise exception 'unexpected_pajang_publication_constraint';
  end if;
end;
$constraint$;

-- Keep the original seven visible-answer fields in place and append the
-- publication policy as an eighth field. Moderation still hides its own rows.
create or replace view pajang_private.visible_answers as
select a.person,a.day,a.body,a.at,a.slot,a.question_prompt,a.archived,
       a.publication_window_days
from pajang_private.answers a
where not exists (
  select 1 from ojjuda_admin_internal.pajang_answer_moderation h
  where h.person=a.person and h.day=a.day and h.slot=a.slot
);

-- The old five-argument function stays for compatibility. New read paths
-- supply their stored, server-selected publication window explicitly.
do $visibility$
begin
  if to_regprocedure('pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)') is null then
    execute $function$
      create function pajang_private.answer_is_visible(
        answer_day date,answer_slot text,shared_beyond_round boolean,
        current_day date,current_slot text,publication_window_days smallint
      ) returns boolean language sql immutable parallel safe
      return answer_day between current_day -
        (case when publication_window_days=365 then 364 else 29 end)
        and current_day
        and (
          (answer_day=current_day and answer_slot=current_slot)
          or (shared_beyond_round and
              (answer_day<current_day or (answer_slot='am' and current_slot='pm')))
        )
    $function$;
  end if;
end;
$visibility$;
revoke all on function
  pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
from public,anon,authenticated;

-- Patch the current function bodies rather than substituting an older copy;
-- unrelated account, moderation, signal, purchase and history rules survive.
-- On production, where the policy is already present, this is a no-op.
do $function_sync$
declare
  f record;
  definition text;
  changed text;
  old_call text;
  new_call text;
  old_insert text :=
    'insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)';
  new_insert text :=
    'insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived,publication_window_days)';
  old_tail text :=
    '(p_data->''archive'') is not distinct from ''true''::jsonb)' ||
    E'\n     on conflict(person,day,slot) do nothing';
  new_tail text :=
    '(p_data->''archive'') is not distinct from ''true''::jsonb,' ||
    E'\n       case when (p_data->''archive'') is not distinct from ''true''::jsonb' ||
    E'\n          and p_data->>''publicationPolicy''=''year-v1'' then 365 else 30 end)' ||
    E'\n     on conflict(person,day,slot) do nothing';
begin
  for f in
    select * from (values
      ('public.pajang_member(text,jsonb)', 'active_window.slot'),
      ('public.pajang_answer_feed(jsonb)', 'current_slot'),
      ('public.pajang_discovery_feed(jsonb,text,text,text)', 'current_slot'),
      ('pajang_private.read_public_profile_preferences(uuid)', 'current_slot')
    ) as targets(routine,slot_expr)
  loop
    if to_regprocedure(f.routine) is null then
      raise exception 'missing_pajang_publication_dependency: %',f.routine;
    end if;
    definition:=pg_get_functiondef(to_regprocedure(f.routine));
    changed:=definition;
    old_call:='pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,'||f.slot_expr||')';
    new_call:='pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,'||f.slot_expr||',a.publication_window_days)';
    if position(old_call in changed)>0 then
      if position(new_call in changed)>0 then
        raise exception 'ambiguous_pajang_visibility_call: %',f.routine;
      end if;
      changed:=replace(changed,old_call,new_call);
    elsif position(new_call in changed)=0 then
      raise exception 'unexpected_pajang_visibility_call: %',f.routine;
    end if;

    if f.routine='public.pajang_member(text,jsonb)' then
      if position(old_insert in changed)>0 then
        changed:=replace(changed,old_insert,new_insert);
      elsif position(new_insert in changed)=0 then
        raise exception 'unexpected_pajang_answer_insert';
      end if;
      if position(old_tail in changed)>0 then
        changed:=replace(changed,old_tail,new_tail);
      elsif position(new_tail in changed)=0 then
        raise exception 'unexpected_pajang_answer_values';
      end if;
    end if;
    if changed is distinct from definition then
      execute changed;
    end if;
  end loop;
end;
$function_sync$;

-- Replayed schema contract:
-- 30-day answers cannot leak into public feeds after day 30.
-- Only explicitly archived new answers with publicationPolicy=year-v1 get 365.
-- Editing an answer never resets the original publication period.
notify pgrst,'reload schema';
