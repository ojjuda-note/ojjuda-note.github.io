-- Preserve diagnostic routes for the unified notification APIs actually used by the app.
-- Keep the existing size, privacy, role and bug-only boundaries. No stored rows change.
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
      '/rest/v1/rpc/list_app_notifications', '/rest/v1/rpc/app_notification_unread_count',
      '/rest/v1/rpc/mark_app_notifications_read',
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
