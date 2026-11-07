-- Let moderators dismiss an automatically detected risk without hiding content.
-- A dismissal applies only to the reviewed text; editing the text reopens review.

create table if not exists ojjuda_note_internal.risk_passes (
  card_id uuid primary key references ojjuda_note.cards(id) on delete cascade,
  reviewed_body_hash text not null check (char_length(reviewed_body_hash) = 32),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default clock_timestamp(),
  reason text not null check (char_length(btrim(reason)) between 1 and 500)
);
alter table ojjuda_note_internal.risk_passes enable row level security;
revoke all on ojjuda_note_internal.risk_passes from public, anon, authenticated;

-- Keep all existing audit actions, and distinguish false-positive decisions.
alter table ojjuda_note_internal.moderation_actions
  drop constraint if exists moderation_actions_action_check;
alter table ojjuda_note_internal.moderation_actions
  add constraint moderation_actions_action_check check (action = any (array[
    'hide','restore','resolve_report','edit','restrict_user','release_user',
    'add_moderator','remove_moderator','update_settings','reply_inquiry',
    'archive_card','restore_archived_card','purge_card','risk_pass','risk_undo'
  ]));

create or replace function ojjuda_note.admin_risk_cards(
  p_query text default '', p_state text default 'all',
  p_limit integer default 30, p_offset integer default 0
)
returns table (
  id uuid, kind text, parent_id uuid, body text, tags text[],
  background_key text, author_id uuid, created_at timestamptz,
  edited_at timestamptz, hidden boolean, moderation_reason text,
  total_count bigint
)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not ojjuda_note_internal.is_note_moderator() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_query is null or char_length(p_query) > 200 or p_state is null
    or p_state not in ('all','visible','hidden') or p_limit is null
    or p_limit not between 1 and 100 or p_offset is null
    or p_offset not between 0 and 100000 then
    raise exception 'Invalid search or page' using errcode = '22023';
  end if;

  return query
  select c.id, c.kind, c.parent_id, c.body, c.tags, c.background_key,
    c.author_id, c.created_at, c.edited_at, coalesce(m.hidden, false),
    m.reason, count(*) over ()
  from ojjuda_note.cards c
  left join ojjuda_note_internal.card_moderation m on m.card_id = c.id
  where c.archived_at is null
    and c.body ~* public.risk_pattern()
    and not exists (
      select 1 from ojjuda_note_internal.risk_passes v
      where v.card_id = c.id and v.reviewed_body_hash = md5(c.body)
    )
    and (p_state = 'all' or coalesce(m.hidden, false) = (p_state = 'hidden'))
    and (btrim(p_query) = '' or position(lower(btrim(p_query)) in lower(c.body)) > 0
      or position(lower(btrim(p_query)) in lower(array_to_string(c.tags, ' '))) > 0
      or position(lower(btrim(p_query)) in c.id::text) > 0
      or position(lower(btrim(p_query)) in c.author_id::text) > 0)
  order by c.created_at desc, c.id desc limit p_limit offset p_offset;
end;
$$;

create or replace function ojjuda_note.admin_passed_risk_cards(
  p_query text default '', p_state text default 'all',
  p_limit integer default 30, p_offset integer default 0
)
returns table (
  id uuid, kind text, parent_id uuid, body text, tags text[],
  background_key text, author_id uuid, created_at timestamptz,
  edited_at timestamptz, hidden boolean, moderation_reason text,
  total_count bigint
)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not ojjuda_note_internal.is_note_moderator() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_query is null or char_length(p_query) > 200 or p_state is null
    or p_state not in ('all','visible','hidden') or p_limit is null
    or p_limit not between 1 and 100 or p_offset is null
    or p_offset not between 0 and 100000 then
    raise exception 'Invalid search or page' using errcode = '22023';
  end if;

  return query
  select c.id, c.kind, c.parent_id, c.body, c.tags, c.background_key,
    c.author_id, c.created_at, c.edited_at, coalesce(m.hidden, false),
    m.reason, count(*) over ()
  from ojjuda_note.cards c
  join ojjuda_note_internal.risk_passes v
    on v.card_id = c.id and v.reviewed_body_hash = md5(c.body)
  left join ojjuda_note_internal.card_moderation m on m.card_id = c.id
  where c.archived_at is null and c.body ~* public.risk_pattern()
    and (p_state = 'all' or coalesce(m.hidden, false) = (p_state = 'hidden'))
    and (btrim(p_query) = '' or position(lower(btrim(p_query)) in lower(c.body)) > 0
      or position(lower(btrim(p_query)) in lower(array_to_string(c.tags, ' '))) > 0
      or position(lower(btrim(p_query)) in c.id::text) > 0
      or position(lower(btrim(p_query)) in c.author_id::text) > 0)
  order by c.created_at desc, c.id desc limit p_limit offset p_offset;
end;
$$;

create or replace function ojjuda_note.admin_risk_passed_ids(p_card_ids uuid[])
returns uuid[] language plpgsql stable security definer set search_path to '' as $$
begin
  if not ojjuda_note_internal.is_note_moderator() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_card_ids is null or cardinality(p_card_ids) > 100 then
    raise exception 'Invalid card list' using errcode = '22023';
  end if;
  return coalesce((
    select array_agg(c.id) from ojjuda_note.cards c
    join ojjuda_note_internal.risk_passes v on v.card_id = c.id
      and v.reviewed_body_hash = md5(c.body)
    where c.id = any(p_card_ids) and c.archived_at is null
  ), array[]::uuid[]);
end;
$$;

create or replace function ojjuda_note.admin_review_risk_card(
  p_card_id uuid, p_pass boolean, p_reason text
)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  moderator uuid := auth.uid();
  current_card ojjuda_note.cards;
  review_reason text := btrim(coalesce(p_reason, ''));
begin
  if moderator is null or not ojjuda_note_internal.is_note_moderator() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_card_id is null or p_pass is null
    or char_length(review_reason) not between 1 and 500 then
    raise exception 'Invalid risk review' using errcode = '22023';
  end if;
  select * into current_card from ojjuda_note.cards
    where id = p_card_id and archived_at is null for update;
  if not found then
    raise exception 'Card not found' using errcode = '22023';
  end if;
  if p_pass then
    if current_card.body !~* public.risk_pattern() then
      raise exception 'No risk phrase to review' using errcode = '22023';
    end if;
    insert into ojjuda_note_internal.risk_passes (
      card_id, reviewed_body_hash, reviewed_by, reviewed_at, reason
    ) values (
      p_card_id, md5(current_card.body), moderator, clock_timestamp(), review_reason
    ) on conflict (card_id) do update
      set reviewed_body_hash = excluded.reviewed_body_hash,
          reviewed_by = excluded.reviewed_by,
          reviewed_at = excluded.reviewed_at, reason = excluded.reason;
  else
    delete from ojjuda_note_internal.risk_passes where card_id = p_card_id;
  end if;
  insert into ojjuda_note_internal.moderation_actions (
    card_id, moderator_id, action, reason, detail
  ) values (
    p_card_id, moderator, case when p_pass then 'risk_pass' else 'risk_undo' end,
    review_reason, jsonb_build_object('reviewed_body_hash', md5(current_card.body))
  );
  return jsonb_build_object('ok', true, 'passed', p_pass);
end;
$$;

revoke all on function ojjuda_note.admin_passed_risk_cards(text,text,integer,integer)
  from public, anon;
revoke all on function ojjuda_note.admin_risk_passed_ids(uuid[])
  from public, anon;
revoke all on function ojjuda_note.admin_review_risk_card(uuid,boolean,text)
  from public, anon;
grant execute on function ojjuda_note.admin_passed_risk_cards(text,text,integer,integer)
  to authenticated;
grant execute on function ojjuda_note.admin_risk_passed_ids(uuid[])
  to authenticated;
grant execute on function ojjuda_note.admin_review_risk_card(uuid,boolean,text)
  to authenticated;
