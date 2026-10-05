-- Optional, privacy-bounded diagnostics accompany a confirmed bug report only.
-- Existing feedback ownership policies, grants and after-insert dispatch remain unchanged.
alter table public.feedback add column diagnostics jsonb;
comment on column public.feedback.diagnostics is
  'Fixed diagnostic codes from up to 40 errors in the previous five minutes; no raw messages, bodies, identifiers, URLs or credentials.';

create or replace function ojjuda_ops.sanitize_feedback_diagnostics(p_value jsonb, p_kind text)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $function$
declare
  item jsonb;
  safe jsonb;
  events jsonb := '[]'::jsonb;
  field text;
  context jsonb;
begin
  if p_kind is distinct from 'bug' or p_value is null
    or jsonb_typeof(p_value) is distinct from 'object'
    or octet_length(p_value::text) > 16384
    or p_value->'version' is distinct from '1'::jsonb
    or p_value->'window_ms' is distinct from '300000'::jsonb
    or jsonb_typeof(p_value->'events') is distinct from 'array'
    or jsonb_typeof(p_value->'context') is distinct from 'object'
  then return null; end if;
  context := p_value->'context';
  if coalesce(context->>'source', '') not in ('world', 'note')
    or jsonb_typeof(context->'online') is distinct from 'boolean'
    or jsonb_typeof(context->'width') is distinct from 'number'
    or jsonb_typeof(context->'height') is distinct from 'number'
    or not coalesce(context->>'width' ~ '^[1-9][0-9]{0,4}$', false)
    or not coalesce(context->>'height' ~ '^[1-9][0-9]{0,4}$', false)
  then return null; end if;
  if (context->>'width')::integer > 10000 or (context->>'height')::integer > 10000
  then return null; end if;

  for item in select value from jsonb_array_elements(p_value->'events') with ordinality e(value, ord)
    where ord <= 40 order by ord
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'type', '') not in ('error', 'rejection', 'http', 'network', 'resource')
      or jsonb_typeof(item->'age_ms') is distinct from 'number'
      or not coalesce(item->>'age_ms' ~ '^(0|[1-9][0-9]{0,5})$', false)
    then continue; end if;
    if (item->>'age_ms')::integer > 300000 then continue; end if;
    safe := jsonb_build_object('type', item->>'type', 'age_ms', (item->>'age_ms')::integer);
    if item->>'name' in ('Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError',
      'URIError', 'EvalError', 'AggregateError', 'DOMException')
    then safe := safe || jsonb_build_object('name', item->>'name'); end if;
    if item->>'code' in ('JS_ERROR', 'PROMISE_REJECTION', 'HTTP_FAILURE', 'NETWORK_FAILURE',
      'RESOURCE_FAILURE', 'UNDEFINED_PROPERTY', 'NULL_PROPERTY', 'NOT_A_FUNCTION', 'NOT_DEFINED', 'TIMEOUT')
    then safe := safe || jsonb_build_object('code', item->>'code'); end if;
    if item->>'path' in (
      '/world.html', '/note/', '/note/index.html', '/screw3d.js', '/photo-protection.js', '/diagnostics.js',
      '/note/preview.js', '/note/navigation.js', '/note/support.js', '/note/operations.js', '/note/admin.js',
      '/note/notifications.js', '/note/drafts.js', '/note/feed-swipe.js', '/note/map.js', '/note/notice-ticker.js',
      '/note/pull-refresh.js', '/admin/connections.js',
      '/rest/v1/rpc/get_note_state', '/rest/v1/rpc/list_cards', '/rest/v1/rpc/get_card',
      '/rest/v1/rpc/publish_card', '/rest/v1/rpc/publish_card_with_photo', '/rest/v1/rpc/archive_my_card',
      '/rest/v1/rpc/replace_card_photo', '/rest/v1/rpc/set_card_style', '/rest/v1/rpc/list_event_map',
      '/rest/v1/rpc/list_my_events', '/rest/v1/rpc/get_my_event', '/rest/v1/rpc/publish_event',
      '/rest/v1/rpc/publish_event_with_photo', '/rest/v1/rpc/update_my_event', '/rest/v1/rpc/report_card',
      '/rest/v1/rpc/report_event', '/rest/v1/rpc/block_card_author', '/rest/v1/rpc/unblock_author',
      '/rest/v1/rpc/list_blocks', '/rest/v1/rpc/card_genders', '/rest/v1/rpc/card_photo_paths',
      '/rest/v1/rpc/get_event_photo_path', '/rest/v1/rpc/get_my_event_photo_path',
      '/rest/v1/rpc/list_notifications', '/rest/v1/rpc/notification_unread_count',
      '/rest/v1/rpc/mark_notifications_read', '/rest/v1/rpc/list_retention_alerts',
      '/rest/v1/rpc/mark_retention_alert_read', '/rest/v1/rpc/game_answer', '/rest/v1/rpc/game_cancel',
      '/rest/v1/rpc/game_invite', '/rest/v1/rpc/game_ranking', '/rest/v1/rpc/game_resign',
      '/rest/v1/rpc/game_undo_request', '/rest/v1/rpc/game_undo_answer', '/rest/v1/rpc/quiz_current',
      '/rest/v1/rpc/record_visit', '/rest/v1/rpc/touch_last_seen', '/rest/v1/rpc/accept_friend'
    ) then safe := safe || jsonb_build_object('path', item->>'path'); end if;
    foreach field in array array['line', 'column', 'status'] loop
      if jsonb_typeof(item->field) = 'number'
        and coalesce(item->>field ~ '^(0|[1-9][0-9]{0,6})$', false)
      then
        if (item->>field)::integer <= (case when field = 'status' then 599 else 1000000 end)
        then safe := safe || jsonb_build_object(field, (item->>field)::integer); end if;
      end if;
    end loop;
    events := events || jsonb_build_array(safe);
  end loop;
  return jsonb_build_object('version', 1, 'window_ms', 300000, 'events', events,
    'context', jsonb_build_object('source', context->>'source', 'online', context->'online',
      'width', (context->>'width')::integer, 'height', (context->>'height')::integer));
end
$function$;
revoke all on function ojjuda_ops.sanitize_feedback_diagnostics(jsonb, text)
  from public, anon, authenticated, service_role;

-- Definer is needed only to call the private pure normalizer. This trigger has
-- no reads or writes beyond NEW and cannot bypass the feedback insert RLS check.
create or replace function ojjuda_ops.normalize_feedback_diagnostics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.diagnostics := ojjuda_ops.sanitize_feedback_diagnostics(new.diagnostics, new.kind);
  return new;
end
$function$;
revoke all on function ojjuda_ops.normalize_feedback_diagnostics()
  from public, anon, authenticated, service_role;
create trigger feedback_normalize_diagnostics
  before insert or update of diagnostics, kind on public.feedback
  for each row execute function ojjuda_ops.normalize_feedback_diagnostics();
-- Only the already bound private worker receives the safe diagnostic object.
create or replace function ojjuda_ops.claim_feedback_ai(p_feedback_id bigint)
returns json
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  claimed json;
begin
  if p_feedback_id is null then
    raise exception 'feedback_id_required' using errcode = '22023';
  end if;
  -- An explicit ID also permits a manual request for an older opinion. No queue scan.
  insert into public.feedback_ai_jobs(feedback_id)
    select f.id from public.feedback f where f.id = p_feedback_id
    on conflict (feedback_id) do nothing;

  -- A crashed third attempt becomes an explicit hold, never an infinite retry.
  update public.feedback_ai_jobs
  set status = 'blocked', lease_token = null, retry_after = null,
    summary = '자동 처리 시도 한도에 도달했습니다.',
    result = '세 번째 처리의 실행 시간이 초과되었습니다. 관리자가 원인을 확인한 뒤 재개해야 합니다.',
    updated_at = clock_timestamp()
  where feedback_id = p_feedback_id and status = 'running' and attempts >= 3
    and claimed_at <= clock_timestamp() - interval '2 hours';

  with candidate as (
    select j.feedback_id
    from public.feedback_ai_jobs j
    where j.feedback_id = p_feedback_id and j.attempts < 3 and (
      j.status = 'queued'
      or (j.status = 'running' and j.claimed_at <= clock_timestamp() - interval '2 hours')
      or (j.status = 'blocked' and j.retry_after is not null and j.retry_after <= clock_timestamp())
    )
    for update of j skip locked limit 1
  ), claimed_job as (
    update public.feedback_ai_jobs j
    set status = 'running', attempts = j.attempts + 1,
      lease_token = gen_random_uuid(), claimed_at = clock_timestamp(),
      retry_after = null, updated_at = clock_timestamp()
    from candidate c where j.feedback_id = c.feedback_id
    returning j.feedback_id, j.lease_token, j.attempts
  )
  select json_build_object(
    'feedback_id', j.feedback_id, 'lease_token', j.lease_token,
    'kind', f.kind, 'body', f.body, 'screen', f.screen,
    'app_version', f.app_version, 'user_agent', f.user_agent,
    'attempts', j.attempts, 'diagnostics', f.diagnostics
  ) into claimed
  from claimed_job j join public.feedback f on f.id = j.feedback_id;
  return claimed;
end
$function$;
revoke all on function ojjuda_ops.claim_feedback_ai(bigint) from public, anon, authenticated, service_role;
