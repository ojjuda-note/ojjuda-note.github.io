-- Note 위험 신호는 World와 같은 서버 정규식으로 감지합니다.
-- 관리자만 익명 카드·답글의 본문, 작성자 번호, 숨김 상태를 볼 수 있습니다.
create or replace function ojjuda_note.admin_risk_cards(
  p_query text default '',
  p_state text default 'all',
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  id uuid, kind text, parent_id uuid, body text, tags text[],
  background_key text, author_id uuid, created_at timestamptz,
  edited_at timestamptz, hidden boolean, moderation_reason text,
  total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not ojjuda_note_internal.is_note_moderator() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_query is null or char_length(p_query) > 200 or p_state is null
    or p_state not in ('all', 'visible', 'hidden') or p_limit is null
    or p_limit not between 1 and 100 or p_offset is null
    or p_offset not between 0 and 100000 then
    raise exception 'Invalid search or page' using errcode = '22023';
  end if;

  return query
  select c.id, c.kind, c.parent_id, c.body, c.tags, c.background_key,
    c.author_id, c.created_at, c.edited_at, coalesce(m.hidden, false),
    m.reason, count(*) over ()
  from ojjuda_note.cards as c
  left join ojjuda_note_internal.card_moderation as m on m.card_id = c.id
  where c.archived_at is null
    and c.body ~* public.risk_pattern()
    and (p_state = 'all' or coalesce(m.hidden, false) = (p_state = 'hidden'))
    and (btrim(p_query) = '' or position(lower(btrim(p_query)) in lower(c.body)) > 0
      or position(lower(btrim(p_query)) in lower(array_to_string(c.tags, ' '))) > 0
      or position(lower(btrim(p_query)) in c.id::text) > 0
      or position(lower(btrim(p_query)) in c.author_id::text) > 0)
  order by c.created_at desc, c.id desc limit p_limit offset p_offset;
end;
$function$;

revoke all on function ojjuda_note.admin_risk_cards(text, text, integer, integer) from public, anon;
grant execute on function ojjuda_note.admin_risk_cards(text, text, integer, integer) to authenticated;
