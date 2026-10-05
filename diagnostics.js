/* Recent, redacted error evidence. Memory only; sent only with a submitted bug report. */
(() => {
  'use strict';
  if (window.OjjudaDiagnostics) return;
  const WINDOW_MS = 300000, MAX_EVENTS = 40, MAX_BYTES = 16384;
  const scripts = new Set([
    '/world.html', '/note/', '/note/index.html', '/screw3d.js', '/photo-protection.js', '/diagnostics.js',
    '/note/preview.js', '/note/navigation.js', '/note/support.js', '/note/operations.js', '/note/admin.js',
    '/note/notifications.js', '/note/drafts.js', '/note/feed-swipe.js', '/note/map.js',
    '/note/notice-ticker.js', '/note/pull-refresh.js', '/admin/connections.js'
  ]);
  const operations = new Set([
    'list_app_notifications', 'app_notification_unread_count', 'mark_app_notifications_read',
    'get_note_state', 'list_cards', 'get_card', 'publish_card', 'publish_card_with_photo', 'archive_my_card',
    'replace_card_photo', 'set_card_style', 'list_event_map', 'list_my_events', 'get_my_event', 'publish_event',
    'publish_event_with_photo', 'update_my_event', 'report_card', 'report_event', 'block_card_author',
    'unblock_author', 'list_blocks', 'card_genders', 'card_photo_paths', 'get_event_photo_path', 'get_my_event_photo_path',
    'list_notifications', 'notification_unread_count', 'mark_notifications_read', 'list_retention_alerts',
    'mark_retention_alert_read', 'game_answer', 'game_cancel', 'game_invite', 'game_ranking', 'game_resign',
    'game_undo_request', 'game_undo_answer', 'quiz_current', 'record_visit', 'touch_last_seen', 'accept_friend'
  ]);
  const names = new Set(['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError', 'AggregateError', 'DOMException']);
  let events = [], identity = null, epoch = 0;
  const clients = new WeakSet();
  const bounded = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : min;
  const trim = now => { events = events.filter(event => now - event.at <= WINDOW_MS).slice(-MAX_EVENTS); };
  function safePath(value, api = false) {
    if (typeof value !== 'string' || value.length > 4096) return;
    const url = new URL(value, location.href);
    if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) return;
    if (!api) return url.origin === location.origin && scripts.has(url.pathname) ? url.pathname : undefined;
    const configured = window.OJJUDA_CONFIG?.supabaseUrl;
    if (typeof configured !== 'string' || url.origin !== new URL(configured).origin) return;
    const match = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
    return match && operations.has(match[1]) ? url.pathname : undefined;
  }
  function classify(error, fallback) {
    const name = names.has(error?.name) ? error.name : 'Error';
    // Match fixed categories only. Never keep the message, thrown value, or full stack.
    const message = typeof error?.message === 'string' ? error.message.slice(0, 2000) : '';
    let code = fallback;
    if (/cannot (?:read|set) (?:properties|property) of undefined/i.test(message)) code = 'UNDEFINED_PROPERTY';
    else if (/cannot (?:read|set) (?:properties|property) of null/i.test(message)) code = 'NULL_PROPERTY';
    else if (/is not a function/i.test(message)) code = 'NOT_A_FUNCTION';
    else if (/is not defined/i.test(message)) code = 'NOT_DEFINED';
    else if (/\b(?:timeout|timed out)\b/i.test(message)) code = 'TIMEOUT';
    return { name, code };
  }
  function position(filename, line, column, error) {
    let path = safePath(filename);
    if (!path && typeof error?.stack === 'string') {
      // Read only a known same-origin source location from a bounded stack; discard all frames and messages.
      for (const frame of error.stack.slice(0, 8192).split('\n').slice(1, 12)) {
        const match = /(https?:\/\/[^\s()]+):(\d+):(\d+)\)?$/.exec(frame.trim());
        if (!match) continue;
        path = safePath(match[1]);
        if (path) { line = Number(match[2]); column = Number(match[3]); break; }
      }
    }
    return path ? { path, line: bounded(line, 0, 1000000), column: bounded(column, 0, 1000000) } : {};
  }
  function record(event, capturedEpoch = epoch) {
    if (capturedEpoch !== epoch) return;
    const now = Date.now();
    trim(now); events.push({ ...event, at: now });
    if (events.length > MAX_EVENTS) events.shift();
  }
  function setIdentity(value) {
    // The identity is used only for a local equality check and is never serialized.
    const next = typeof value === 'string' ? value : null;
    if (next !== identity) { identity = next; epoch++; events = []; }
  }
  function bindAuth(client, getUserId) {
    try {
      if (!client?.auth?.onAuthStateChange || clients.has(client)) return;
      clients.add(client); setIdentity(getUserId?.());
      client.auth.onAuthStateChange((_event, session) => { setIdentity(session?.user?.id); });
    } catch { /* Diagnostic collection cannot affect sign-in or normal application use. */ }
  }
  function snapshot(source) {
    try {
      const now = Date.now(); trim(now);
      const result = {
        version: 1, window_ms: WINDOW_MS,
        events: events.map(({ at, ...event }) => ({ ...event, age_ms: bounded(now - at, 0, WINDOW_MS) })),
        context: { source: source === 'world' ? 'world' : 'note', online: navigator.onLine !== false,
          width: bounded(window.innerWidth, 1, 10000), height: bounded(window.innerHeight, 1, 10000) }
      };
      while (JSON.stringify(result).length > MAX_BYTES && result.events.length) result.events.shift();
      return result;
    } catch { return undefined; }
  }
  window.addEventListener('error', event => {
    try {
      if (event.target && event.target !== window) {
        // Never inspect images/uploads, text, form fields, or arbitrary resource paths.
        if (event.target.tagName !== 'SCRIPT') return;
        const path = safePath(event.target.src);
        if (path) record({ type: 'resource', name: 'Error', code: 'RESOURCE_FAILURE', path });
        return;
      }
      record({ type: 'error', ...classify(event.error, 'JS_ERROR'), ...position(event.filename, event.lineno, event.colno, event.error) });
    } catch { /* A malformed error must not create another error. */ }
  }, true);
  window.addEventListener('unhandledrejection', event => {
    try {
      if (event.reason?.name === 'AbortError') return;
      record({ type: 'rejection', ...classify(event.reason, 'PROMISE_REJECTION'), ...position(undefined, undefined, undefined, event.reason) });
    } catch { /* Do not alter default rejection behavior. */ }
  });
  if (typeof window.fetch === 'function') {
    const original = window.fetch;
    window.fetch = function (...args) {
      let path;
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input instanceof Request ? input.url : undefined;
        path = safePath(url, true) || safePath(url);
      } catch { /* Unknown requests still execute unchanged. */ }
      const capturedEpoch = epoch;
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (error) {
        if (path) { try { if (error?.name !== 'AbortError') record({ type: 'network', name: 'Error', code: 'NETWORK_FAILURE', path, status: 0 }, capturedEpoch); } catch {} }
        throw error;
      }
      if (!path) return result;
      return result.then(response => {
        try { if (response.status >= 400) record({ type: 'http', name: 'Error', code: 'HTTP_FAILURE', path, status: bounded(response.status, 0, 599) }, capturedEpoch); } catch {}
        return response;
      }, error => {
        try { if (error?.name !== 'AbortError') record({ type: 'network', name: 'Error', code: 'NETWORK_FAILURE', path, status: 0 }, capturedEpoch); } catch {}
        throw error;
      });
    };
  }
  window.OjjudaDiagnostics = Object.freeze({ snapshot, setIdentity, bindAuth });
})();
