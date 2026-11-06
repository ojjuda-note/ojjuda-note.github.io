-- Unified group review, reports and shared content safety rules.
-- Group records remain private: all admin reads go through an authenticated, gated RPC.

create index if not exists group_entries_admin_created_idx
  on ojjuda_groups_internal.entries (created_at desc, id desc);

create table if not exists ojjuda_groups_internal.reports (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references ojjuda_groups_internal.entries(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (entry_id, reporter_id)
);
alter table ojjuda_groups_internal.reports enable row level security;
revoke all on ojjuda_groups_internal.reports from public, anon, authenticated;
create index if not exists group_reports_entry_status_idx
  on ojjuda_groups_internal.reports (entry_id, status);

-- Reuse the administrator-managed forbidden-word rules for groups, entries and comments.
drop trigger if exists groups_banned_words on ojjuda_groups_internal.rooms;
create trigger groups_banned_words before insert or update on ojjuda_groups_internal.rooms
  for each row execute function public.check_banned_cols('name', 'description');
drop trigger if exists group_entries_banned_words on ojjuda_groups_internal.entries;
create trigger group_entries_banned_words before insert or update on ojjuda_groups_internal.entries
  for each row execute function public.check_banned_cols('title', 'body', 'location');
drop trigger if exists group_comments_banned_words on ojjuda_groups_internal.comments;
create trigger group_comments_banned_words before insert or update on ojjuda_groups_internal.comments
  for each row execute function public.check_banned_cols('body');

-- Admins can fetch only media referenced by a saved group entry.
-- Upload and deletion permission remain unchanged for group members.
create or replace function ojjuda_groups_internal.file_access(p text, op text)
returns boolean language plpgsql stable security definer set search_path to '' as $$
declare u uuid := auth.uid(); r uuid; own boolean; linked boolean;
begin
  if u is null or not ojjuda_groups_internal.path_valid(p) then return false; end if;
  r := split_part(p, '/', 2)::uuid;
  own := split_part(p, '/', 1) = u::text;
  select exists (
    select 1 from ojjuda_groups_internal.entries e
    where e.id = split_part(p, '/', 3)::uuid and e.room_id = r
      and e.media @> jsonb_build_array(jsonb_build_object('path', p))
  ) into linked;
  if op = 'delete' then
    return (own and (not linked or ojjuda_account_deletion.pending()))
      or (ojjuda_groups_internal.allowed() and exists (
        select 1 from ojjuda_groups_internal.rooms where id = r and owner_id = u and deleting
      ));
  end if;
  if op = 'read' and linked and ojjuda_groups_internal.allowed() and public.is_admin() then
    return true;
  end if;
  if not ojjuda_groups_internal.member(r) then return false; end if;
  if op = 'upload' then return own; end if;
  return linked;
end;
$$;

create or replace function public.group_report(p_entry_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare u uuid := auth.uid(); r uuid; clean_reason text := btrim(coalesce(p_reason, ''));
begin
  if not ojjuda_groups_internal.allowed() then
    raise exception '로그인 후 이용해 주세요.' using errcode = '42501';
  end if;
  if char_length(clean_reason) not between 1 and 300 then
    raise exception '신고 이유는 1~300자로 입력해 주세요.' using errcode = '22023';
  end if;
  select room_id into r from ojjuda_groups_internal.entries where id = p_entry_id;
  if r is null or not ojjuda_groups_internal.member(r) then
    raise exception '그룹원만 신고할 수 있어요.' using errcode = '42501';
  end if;
  insert into ojjuda_groups_internal.reports(entry_id, reporter_id, reason)
    values(p_entry_id, u, clean_reason)
    on conflict (entry_id, reporter_id) do update
      set reason = excluded.reason, status = 'open', created_at = clock_timestamp(),
          resolved_at = null, resolved_by = null;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.group_report(uuid, text) from public, anon;
grant execute on function public.group_report(uuid, text) to authenticated;

create or replace function public.group_admin_board(
  p_action text, p_payload jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  u uuid := auth.uid();
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  target_entry_id uuid;
  before_at timestamptz;
  before_id uuid;
  result_rows jsonb;
  filter_key text := coalesce(p_payload->>'filter', 'all');
  search_text text := btrim(coalesce(p_payload->>'query', ''));
begin
  if u is null or not public.is_admin() or not ojjuda_groups_internal.allowed() then
    raise exception '관리자만 이용할 수 있어요.' using errcode = '42501';
  end if;
  if p_action = 'feed' then
    if filter_key not in ('all', 'risk', 'reported', 'photo', 'video') or char_length(search_text) > 100 then
      raise exception '조회 조건을 확인해 주세요.' using errcode = '22023';
    end if;
    before_at := nullif(p->>'before', '')::timestamptz;
    before_id := nullif(p->>'before_id', '')::uuid;
    result_rows := coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc)
      from (
        select e.id, e.room_id, r.name room_name, e.author_id,
          coalesce(pr.nickname, '탈퇴한 회원') author_name,
          e.kind, e.title, e.body, e.location, e.starts_at, e.ends_at,
          e.all_day, e.media, e.created_at, e.updated_at,
          coalesce(s.comment_count, 0) comment_count,
          coalesce(s.report_count, 0) report_count, s.risk_detected
        from ojjuda_groups_internal.entries e
        join ojjuda_groups_internal.rooms r on r.id = e.room_id
        left join public.profiles pr on pr.id = e.author_id
        cross join lateral (
          select
            (select count(*) from ojjuda_groups_internal.comments c where c.entry_id = e.id) comment_count,
            (select count(*) from ojjuda_groups_internal.reports t
             where t.entry_id = e.id and t.status = 'open') report_count,
            (concat_ws(' ', e.title, e.body, e.location) ~* public.risk_pattern()
              or exists(select 1 from ojjuda_groups_internal.comments c
                        where c.entry_id = e.id and c.body ~* public.risk_pattern())) risk_detected
        ) s
        where (before_at is null or (e.created_at, e.id) < (before_at, before_id))
          and (search_text = '' or strpos(lower(concat_ws(' ', r.name, pr.nickname,
                e.title, e.body, e.location)), lower(search_text)) > 0)
          and (filter_key = 'all'
            or (filter_key = 'risk' and s.risk_detected)
            or (filter_key = 'reported' and s.report_count > 0)
            or (filter_key = 'photo' and exists (
              select 1 from jsonb_array_elements(e.media) f where f->>'mime' like 'image/%'))
            or (filter_key = 'video' and exists (
              select 1 from jsonb_array_elements(e.media) f where f->>'mime' like 'video/%')))
        order by e.created_at desc, e.id desc limit 31
      ) x), '[]'::jsonb);
    insert into public.admin_log(admin_id, action, target, detail)
      values (u, 'group_feed_view', 'groups',
        jsonb_build_object('filter', filter_key, 'result_count', jsonb_array_length(result_rows)));
    return result_rows;
  elsif p_action = 'comments' then
    target_entry_id := nullif(p->>'entry_id', '')::uuid;
    insert into public.admin_log(admin_id, action, target)
      values (u, 'group_comments_view', target_entry_id::text);
    return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id)
      from (select c.id, c.entry_id, c.author_id,
          coalesce(pr.nickname, '탈퇴한 회원') author_name,
          c.body, c.created_at, c.body ~* public.risk_pattern() risk_detected
        from ojjuda_groups_internal.comments c
        left join public.profiles pr on pr.id = c.author_id
        where c.entry_id = target_entry_id order by c.created_at, c.id limit 200) x), '[]'::jsonb);
  elsif p_action = 'reports' then
    target_entry_id := nullif(p->>'entry_id', '')::uuid;
    insert into public.admin_log(admin_id, action, target)
      values (u, 'group_reports_view', target_entry_id::text);
    return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (select t.id, t.entry_id, t.reason, t.status, t.created_at,
          coalesce(pr.nickname, '탈퇴한 회원') reporter_name
        from ojjuda_groups_internal.reports t
        left join public.profiles pr on pr.id = t.reporter_id
        where t.entry_id = target_entry_id order by t.created_at desc limit 100) x), '[]'::jsonb);
  elsif p_action = 'resolve' then
    target_entry_id := nullif(p->>'entry_id', '')::uuid;
    update ojjuda_groups_internal.reports
      set status = 'resolved', resolved_at = clock_timestamp(), resolved_by = u
      where entry_id = target_entry_id and status = 'open';
    insert into public.admin_log(admin_id, action, target)
      values (u, 'group_reports_resolve', target_entry_id::text);
    return jsonb_build_object('ok', true);
  end if;
  raise exception '알 수 없는 요청이에요.' using errcode = '22023';
end;
$$;
revoke all on function public.group_admin_board(text, jsonb) from public, anon;
grant execute on function public.group_admin_board(text, jsonb) to authenticated;
