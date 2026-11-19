-- Administrator moderation is separate from an author's publication setting.
-- Keep originals in place; removing an original also removes its moderation row.
create schema if not exists ojjuda_admin_internal;
revoke all on schema ojjuda_admin_internal from public, anon;
grant usage on schema ojjuda_admin_internal to authenticated;

create table ojjuda_admin_internal.pajang_answer_moderation (
  person uuid not null,
  day date not null,
  slot text not null,
  hidden_at timestamptz not null default clock_timestamp(),
  hidden_by uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 2 and 200),
  primary key (person, day, slot),
  foreign key (person, day, slot) references pajang_private.answers(person, day, slot) on delete cascade
);
create table ojjuda_admin_internal.pajang_message_moderation (
  message_id uuid primary key references pajang_private.messages(id) on delete cascade,
  hidden_at timestamptz not null default clock_timestamp(),
  hidden_by uuid references auth.users(id) on delete set null,
  reason text not null check (char_length(btrim(reason)) between 2 and 200)
);
alter table ojjuda_admin_internal.pajang_answer_moderation enable row level security;
alter table ojjuda_admin_internal.pajang_message_moderation enable row level security;
revoke all on ojjuda_admin_internal.pajang_answer_moderation,
  ojjuda_admin_internal.pajang_message_moderation from public, anon, authenticated, service_role;

-- Reuse the existing private, expiring audit log without copying answer/chat bodies.
alter table ojjuda_trash_internal.access_log
  add column action text not null default 'read' check (action in ('read', 'hide', 'restore')),
  add column reason text not null default '' check (char_length(reason) <= 200);

create view pajang_private.visible_answers with (security_invoker = true, security_barrier = true) as
  select a.* from pajang_private.answers a
  where not exists (select from ojjuda_admin_internal.pajang_answer_moderation h
    where (h.person, h.day, h.slot) = (a.person, a.day, a.slot));
create view pajang_private.visible_messages with (security_invoker = true, security_barrier = true) as
  select m.* from pajang_private.messages m
  where not exists (select from ojjuda_admin_internal.pajang_message_moderation h where h.message_id = m.id);
revoke all on pajang_private.visible_answers, pajang_private.visible_messages
  from public, anon, authenticated, service_role;

-- Preserve deployed publication-window fixes and all write/authorization logic.
-- Only the known content-reading FROM/JOIN references change, before pagination.
do $migration$
declare
  item record;
  definition text;
  patched text;
  answer_reads integer;
  message_reads integer;
begin
  for item in select * from (values
    ('public.pajang_member(text,jsonb)', 5, 2),
    ('public.pajang_answer_feed(jsonb)', 1, 0),
    ('public.pajang_discovery_feed(jsonb,text,text,text)', 2, 0),
    ('public.pajang_my_answers()', 1, 0)
  ) as expected(signature, answers, messages) loop
    if to_regprocedure(item.signature) is null then
      raise exception 'missing_pajang_function: %', item.signature;
    end if;
    definition := pg_get_functiondef(to_regprocedure(item.signature));
    select count(*) into answer_reads from regexp_matches(definition,
      '\m(from|join)\M[[:space:]]+pajang_private[.]answers\M', 'gi');
    select count(*) into message_reads from regexp_matches(definition,
      '\m(from|join)\M[[:space:]]+pajang_private[.]messages\M', 'gi');
    if answer_reads <> item.answers or message_reads <> item.messages then
      raise exception 'unexpected_pajang_read_paths: % (answers %, messages %)',
        item.signature, answer_reads, message_reads;
    end if;
    patched := regexp_replace(definition,
      '(\m(?:from|join)\M[[:space:]]+)pajang_private[.]answers\M',
      '\1pajang_private.visible_answers', 'gi');
    patched := regexp_replace(patched,
      '(\m(?:from|join)\M[[:space:]]+)pajang_private[.]messages\M',
      '\1pajang_private.visible_messages', 'gi');
    execute patched;
  end loop;
end;
$migration$;

create function ojjuda_admin_internal.pajang_require_admin() returns uuid
language plpgsql security invoker set search_path = '' as $function$
begin
  if auth.uid() is null or public.is_admin() is not true then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$function$;
revoke all on function ojjuda_admin_internal.pajang_require_admin()
  from public, anon, authenticated, service_role;

create function ojjuda_admin_internal.pajang_check_page(p_query text, p_status text, p_limit integer, p_offset integer)
returns void language plpgsql security invoker set search_path = '' as $function$
begin
  if p_query is null or char_length(p_query) > 100
    or p_status is null or p_status not in ('all', 'visible', 'hidden')
    or p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset not between 0 and 100000 then
    raise exception 'invalid_pajang_page' using errcode = '22023';
  end if;
end;
$function$;
revoke all on function ojjuda_admin_internal.pajang_check_page(text,text,integer,integer)
  from public, anon, authenticated, service_role;

create function ojjuda_admin_internal.pajang_answers(
  p_query text default '', p_status text default 'all', p_limit integer default 30, p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid := ojjuda_admin_internal.pajang_require_admin();
  needle text;
  result jsonb;
  ids text[];
begin
  perform ojjuda_admin_internal.pajang_check_page(p_query, p_status, p_limit, p_offset);
  needle := lower(btrim(p_query));
  with filtered as materialized (
    select a.person, a.day, a.slot, p.name, a.question_prompt as question, a.body, a.at, a.archived,
      coalesce((to_jsonb(a)->>'publication_window_days')::integer, 365) as publication_window_days,
      h.person is not null as hidden, h.hidden_at, coalesce(h.reason, '') as reason
    from pajang_private.answers a join pajang_private.people p on p.id = a.person
    left join ojjuda_admin_internal.pajang_answer_moderation h
      on (h.person, h.day, h.slot) = (a.person, a.day, a.slot)
    where (p_status = 'all' or (p_status = 'hidden') = (h.person is not null))
      and (needle = '' or strpos(lower(p.name || ' ' || coalesce(a.question_prompt, '') || ' ' || a.body), needle) > 0
        or a.person::text = needle)
  ), page as (
    select * from filtered order by at desc, person desc, day desc, slot desc limit p_limit offset p_offset
  )
  select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(p)
      order by p.at desc, p.person desc, p.day desc, p.slot desc) from page p), '[]'::jsonb),
    'total_count', (select count(*) from filtered)) into result;
  select array_agg('pajang:answer:' || (x->>'person') || ':' || (x->>'day') || ':' || (x->>'slot'))
    into ids from jsonb_array_elements(result->'items') x;
  if coalesce(cardinality(ids), 0) > 0 then
    insert into ojjuda_trash_internal.access_log(admin_id, item_ids) values (actor, ids);
  end if;
  return result;
end;
$function$;

create function ojjuda_admin_internal.pajang_chats(
  p_query text default '', p_status text default 'all', p_limit integer default 30, p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid := ojjuda_admin_internal.pajang_require_admin();
  needle text;
  result jsonb;
  ids text[];
begin
  perform ojjuda_admin_internal.pajang_check_page(p_query, p_status, p_limit, p_offset);
  needle := lower(btrim(p_query));
  with conversations as (
    select least(m.src, m.dst) as first_person, greatest(m.src, m.dst) as second_person,
      count(*) as message_count, count(h.message_id) as hidden_count, max(m.at) as last_at,
      bool_or(needle <> '' and strpos(lower(m.body), needle) > 0) as body_matches
    from pajang_private.messages m
    left join ojjuda_admin_internal.pajang_message_moderation h on h.message_id = m.id
    where m.src is not null and m.dst is not null
    group by least(m.src, m.dst), greatest(m.src, m.dst)
  ), filtered as materialized (
    select c.first_person, c.second_person, a.name as first_name, b.name as second_name,
      c.message_count, c.hidden_count, c.last_at
    from conversations c
    join pajang_private.people a on a.id = c.first_person
    join pajang_private.people b on b.id = c.second_person
    where (p_status = 'all' or (p_status = 'hidden' and c.hidden_count > 0)
      or (p_status = 'visible' and c.message_count > c.hidden_count))
      and (needle = '' or c.body_matches or strpos(lower(a.name || ' ' || b.name), needle) > 0
        or c.first_person::text = needle or c.second_person::text = needle)
  ), page as (
    select * from filtered order by last_at desc, first_person desc, second_person desc limit p_limit offset p_offset
  )
  select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(p)
      order by p.last_at desc, p.first_person desc, p.second_person desc) from page p), '[]'::jsonb),
    'total_count', (select count(*) from filtered)) into result;
  select array_agg('pajang:chat:' || (x->>'first_person') || ':' || (x->>'second_person'))
    into ids from jsonb_array_elements(result->'items') x;
  if coalesce(cardinality(ids), 0) > 0 then
    insert into ojjuda_trash_internal.access_log(admin_id, item_ids) values (actor, ids);
  end if;
  return result;
end;
$function$;

create function ojjuda_admin_internal.pajang_chat_messages(
  p_first uuid, p_second uuid, p_limit integer default 50, p_offset integer default 0
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid := ojjuda_admin_internal.pajang_require_admin();
  first_id uuid := least(p_first, p_second);
  second_id uuid := greatest(p_first, p_second);
  first_name text;
  second_name text;
  result jsonb;
  ids text[];
begin
  perform ojjuda_admin_internal.pajang_check_page('', 'all', p_limit, p_offset);
  if p_first is null or p_second is null or p_first = p_second then
    raise exception 'invalid_pajang_thread' using errcode = '22023';
  end if;
  select name into first_name from pajang_private.people where id = first_id;
  select name into second_name from pajang_private.people where id = second_id;
  if first_name is null or second_name is null then
    raise exception 'pajang_thread_not_found' using errcode = 'P0002';
  end if;
  with filtered as materialized (
    select m.id, m.src, m.dst, m.body, m.at,
      h.message_id is not null as hidden, h.hidden_at, coalesce(h.reason, '') as reason
    from pajang_private.messages m
    left join ojjuda_admin_internal.pajang_message_moderation h on h.message_id = m.id
    where (m.src = first_id and m.dst = second_id) or (m.src = second_id and m.dst = first_id)
  ), page as (
    select * from filtered order by at desc, id desc limit p_limit offset p_offset
  )
  select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(p) order by p.at desc, p.id desc)
      from page p), '[]'::jsonb), 'total_count', (select count(*) from filtered),
    'first_person', first_id, 'second_person', second_id, 'first_name', first_name, 'second_name', second_name)
    into result;
  select array_agg('pajang:message:' || (x->>'id')) into ids from jsonb_array_elements(result->'items') x;
  if coalesce(cardinality(ids), 0) > 0 then
    insert into ojjuda_trash_internal.access_log(admin_id, item_ids) values (actor, ids);
  end if;
  return result;
end;
$function$;

create function ojjuda_admin_internal.pajang_moderate(
  p_kind text, p_action text, p_person uuid default null, p_day date default null,
  p_slot text default null, p_message_id uuid default null, p_reason text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  actor uuid := ojjuda_admin_internal.pajang_require_admin();
  reason text := btrim(p_reason);
  item_id text;
  changed integer;
begin
  if p_kind is null or p_kind not in ('answer', 'message')
    or p_action is null or p_action not in ('hide', 'restore')
    or reason is null or char_length(reason) not between 2 and 200 then
    raise exception 'invalid_pajang_moderation' using errcode = '22023';
  end if;
  if p_kind = 'answer' then
    if p_person is null or p_day is null or not isfinite(p_day)
      or p_slot is null or p_slot not in ('am', 'pm') or p_message_id is not null then
      raise exception 'invalid_pajang_moderation_target' using errcode = '22023';
    end if;
    perform 1 from pajang_private.answers a
      where (a.person, a.day, a.slot) = (p_person, p_day, p_slot) for update;
    if not found then raise exception 'pajang_item_not_found' using errcode = 'P0002'; end if;
    if p_action = 'hide' then
      insert into ojjuda_admin_internal.pajang_answer_moderation(person, day, slot, hidden_by, reason)
        values (p_person, p_day, p_slot, actor, reason) on conflict do nothing;
    else
      delete from ojjuda_admin_internal.pajang_answer_moderation h
        where (h.person, h.day, h.slot) = (p_person, p_day, p_slot);
    end if;
    get diagnostics changed = row_count;
    item_id := 'pajang:answer:' || p_person || ':' || p_day || ':' || p_slot;
  else
    if p_message_id is null or p_person is not null or p_day is not null or p_slot is not null then
      raise exception 'invalid_pajang_moderation_target' using errcode = '22023';
    end if;
    perform 1 from pajang_private.messages m where m.id = p_message_id for update;
    if not found then raise exception 'pajang_item_not_found' using errcode = 'P0002'; end if;
    if p_action = 'hide' then
      insert into ojjuda_admin_internal.pajang_message_moderation(message_id, hidden_by, reason)
        values (p_message_id, actor, reason) on conflict do nothing;
    else
      delete from ojjuda_admin_internal.pajang_message_moderation h where h.message_id = p_message_id;
    end if;
    get diagnostics changed = row_count;
    item_id := 'pajang:message:' || p_message_id;
  end if;
  insert into ojjuda_trash_internal.access_log(admin_id, item_ids, action, reason)
    values (actor, array[item_id], p_action, reason);
  -- The existing common activity screen reads admin_log. Record state changes
  -- without copying content, and do not duplicate work history on request retries.
  if changed > 0 then
    insert into public.admin_log(admin_id, action, target, detail)
      values (actor, 'pajang_' || p_kind || '_' || p_action, item_id,
        jsonb_build_object('service', 'pajang', 'kind', p_kind, 'hidden', p_action = 'hide', 'reason', reason));
  end if;
  return jsonb_build_object('ok', true, 'kind', p_kind, 'hidden', p_action = 'hide');
end;
$function$;

create function public.admin_pajang_answers(
  p_query text default '', p_status text default 'all', p_limit integer default 30, p_offset integer default 0
) returns jsonb language sql security invoker set search_path = '' as $function$
  select ojjuda_admin_internal.pajang_answers(p_query, p_status, p_limit, p_offset);
$function$;
create function public.admin_pajang_chats(
  p_query text default '', p_status text default 'all', p_limit integer default 30, p_offset integer default 0
) returns jsonb language sql security invoker set search_path = '' as $function$
  select ojjuda_admin_internal.pajang_chats(p_query, p_status, p_limit, p_offset);
$function$;
create function public.admin_pajang_chat_messages(
  p_first uuid, p_second uuid, p_limit integer default 50, p_offset integer default 0
) returns jsonb language sql security invoker set search_path = '' as $function$
  select ojjuda_admin_internal.pajang_chat_messages(p_first, p_second, p_limit, p_offset);
$function$;
create function public.admin_pajang_moderate(
  p_kind text, p_action text, p_person uuid default null, p_day date default null,
  p_slot text default null, p_message_id uuid default null, p_reason text default ''
) returns jsonb language sql security invoker set search_path = '' as $function$
  select ojjuda_admin_internal.pajang_moderate(p_kind, p_action, p_person, p_day, p_slot, p_message_id, p_reason);
$function$;

revoke all on function ojjuda_admin_internal.pajang_answers(text,text,integer,integer),
  ojjuda_admin_internal.pajang_chats(text,text,integer,integer),
  ojjuda_admin_internal.pajang_chat_messages(uuid,uuid,integer,integer),
  ojjuda_admin_internal.pajang_moderate(text,text,uuid,date,text,uuid,text),
  public.admin_pajang_answers(text,text,integer,integer), public.admin_pajang_chats(text,text,integer,integer),
  public.admin_pajang_chat_messages(uuid,uuid,integer,integer),
  public.admin_pajang_moderate(text,text,uuid,date,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function ojjuda_admin_internal.pajang_answers(text,text,integer,integer),
  ojjuda_admin_internal.pajang_chats(text,text,integer,integer),
  ojjuda_admin_internal.pajang_chat_messages(uuid,uuid,integer,integer),
  ojjuda_admin_internal.pajang_moderate(text,text,uuid,date,text,uuid,text),
  public.admin_pajang_answers(text,text,integer,integer), public.admin_pajang_chats(text,text,integer,integer),
  public.admin_pajang_chat_messages(uuid,uuid,integer,integer),
  public.admin_pajang_moderate(text,text,uuid,date,text,uuid,text) to authenticated;

comment on function public.admin_pajang_moderate(text,text,uuid,date,text,uuid,text) is
  'Current administrators only. Hides/restores existing Pajang answers or messages without changing publication preferences or recreating deleted content. Requires a 2-200 character reason; uses the existing expiring private audit log.';
notify pgrst, 'reload schema';
