// Auth and database bans are both required. No service key reaches the browser.
const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keysFromJson(value) {
  try { return Object.values(JSON.parse(value || '{}')).filter(key => typeof key === 'string'); }
  catch { return []; }
}
function jsonHeaders(key, token = null) {
  return { apikey: key, 'Content-Type': 'application/json',
    ...(token || key.startsWith('eyJ') ? { Authorization: `Bearer ${token || key}` } : {}) };
}
async function bodyUpTo(request, maxBytes = 1024) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('empty_body');
  let bytes = 0, content = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw new Error('body_too_large'); }
    content += decoder.decode(value, { stream: true });
  }
  return JSON.parse(content + decoder.decode());
}

export function createHandler({ env, fetchImpl = fetch }) {
  const url = env('SUPABASE_URL')?.replace(/\/$/, '');
  const serverKey = keysFromJson(env('SUPABASE_SECRET_KEYS'))[0] || env('SUPABASE_SERVICE_ROLE_KEY');
  const browserKey = keysFromJson(env('SUPABASE_PUBLISHABLE_KEYS'))[0] || env('SUPABASE_ANON_KEY');
  return async request => {
    const origin = request.headers.get('origin');
    const cors = {
      'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'apikey,authorization,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST,OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store'
    };
    const respond = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...cors, 'Content-Type': 'application/json' }
    });
    if (origin && !ORIGINS.has(origin)) return respond({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    if (!url || !serverKey || !browserKey) return respond({ error: 'ban_service_unavailable' }, 503);
    const match = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '');
    if (!match) return respond({ error: 'not_signed_in' }, 401);
    let body;
    try { body = await bodyUpTo(request); }
    catch { return respond({ error: 'invalid_request' }, 400); }
    const target = body?.target_user, days = body?.days;
    if (typeof target !== 'string' || !UUID.test(target) || ![-1,0,7,30].includes(days)) {
      return respond({ error: 'invalid_request' }, 400);
    }

    const call = (path, options) => fetchImpl(`${url}${path}`, {
      signal: AbortSignal.timeout(10000), ...options
    });
    try {
      const identity = await call('/auth/v1/user', {
        headers: jsonHeaders(browserKey, match[1])
      });
      if (!identity.ok) return respond({ error: 'not_signed_in' }, 401);
      const actor = await identity.json();
      if (!UUID.test(actor?.id || '') || actor.id === target || actor.is_anonymous) {
        return respond({ error: 'cannot_ban_self' }, 403);
      }
      const isAdmin = async id => {
        const response = await call(`/rest/v1/app_admins?select=user_id&user_id=eq.${id}&limit=1`, {
          headers: jsonHeaders(serverKey)
        });
        if (!response.ok) throw new Error('admin_lookup_failed');
        const rows = await response.json();
        return Array.isArray(rows) && rows.length > 0;
      };
      if (!await isAdmin(actor.id)) return respond({ error: 'not_admin' }, 403);
      if (await isAdmin(target)) return respond({ error: 'cannot_ban_admin' }, 403);

      // The RPC enforces the role again under the caller's JWT, updates user_private
      // and records the administrator action. It never accepts a caller-supplied admin ID.
      const database = await call('/rest/v1/rpc/admin_ban', {
        method: 'POST', headers: jsonHeaders(browserKey, match[1]),
        body: JSON.stringify({ target_user: target, days })
      });
      if (!database.ok) {
        const problem = await database.json().catch(() => ({}));
        const code = String(problem?.message || '');
        if (['not_admin', 'cannot_ban_self', 'cannot_ban_admin'].includes(code)) return respond({ error: code }, 403);
        if (['invalid_ban_period', 'account_not_found'].includes(code)) return respond({ error: code }, 400);
        return respond({ error: 'ban_database_failed' }, 503);
      }
      const bannedUntil = await database.json();

      // Supabase Auth's admin API prevents new login and refresh. The permanent
      // marker in user_private is infinity; Auth's documented maximum is 100 years.
      const duration = days === -1 ? '876000h' : days === 0 ? 'none' : `${days * 24}h`;
      const authBan = await call(`/auth/v1/admin/users/${target}`, {
        method: 'PUT', headers: jsonHeaders(serverKey),
        body: JSON.stringify({ ban_duration: duration })
      });
      if (!authBan.ok) return respond({ error: 'ban_auth_sync_failed', restriction_applied: true }, 503);
      return respond({ ok: true, permanent: days === -1, banned_until: bannedUntil });
    } catch {
      return respond({ error: 'ban_service_unavailable' }, 503);
    }
  };
}
