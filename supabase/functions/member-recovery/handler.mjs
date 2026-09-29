// Temporary recovery policy explicitly requested until phone verification is added.
// All four private identity fields must match before a 5-minute, single-use grant is issued.
const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const SITE_KEY = 'sb_publishable_iUpPUBr2HlJr9LhDRVtB0Q_toJUMazo'; // Public browser key, not a secret.
const apiHeaders = key => ({ apikey: key, 'Content-Type': 'application/json',
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) });
function keySet(value) {
  try { return Object.values(JSON.parse(value || '{}')).filter(key => typeof key === 'string'); }
  catch { return []; }
}
async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  let text = '', size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new Error('invalid_body'); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
export function createHandler({ env, fetchImpl = fetch, cryptoImpl = crypto, delay = ms => new Promise(r => setTimeout(r, ms)) }) {
  const url = env('SUPABASE_URL');
  const serverKey = keySet(env('SUPABASE_SECRET_KEYS'))[0] || env('SUPABASE_SERVICE_ROLE_KEY');
  const browserKeys = [...keySet(env('SUPABASE_PUBLISHABLE_KEYS')), env('SUPABASE_ANON_KEY'), SITE_KEY].filter(Boolean);
  return async request => {
    const origin = request.headers.get('Origin');
    const cors = { 'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'apikey,authorization,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST,OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store' };
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status,
      headers: { ...cors, 'Content-Type': 'application/json' } });
    if (origin && !ORIGINS.has(origin)) return respond({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
    // Custom API-key validation is required because the caller has forgotten their password.
    if (!browserKeys.includes(request.headers.get('apikey'))) return respond({ error: 'invalid_api_key' }, 401);
    if (!url || !serverKey) return respond({ error: 'recovery_unavailable' }, 503);
    let body;
    try { body = await readBody(request); } catch { return respond({ error: 'invalid_recovery_details' }, 400); }
    const hex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const hash = async text => hex(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    const rpc = async (name, args) => {
      const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: apiHeaders(serverKey), signal: AbortSignal.timeout(10000), body: JSON.stringify(args)
      });
      if (!response.ok) throw new Error('database_unavailable');
      return response.json();
    };
    if (body?.action === 'reset') {
      if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return respond({ error: 'recovery_expired' }, 410);
      if (typeof body.password !== 'string' || body.password.length < 6 || new TextEncoder().encode(body.password).length > 72)
        return respond({ error: 'invalid_recovery_password' }, 400);
      if (body.password !== body.password_confirmation) return respond({ error: 'recovery_password_mismatch' }, 400);
      let claimed = false;
      try {
        const userId = await rpc('consume_member_password_recovery', { p_token_hash: await hash(body.token) });
        if (!userId) return respond({ error: 'recovery_expired' }, 410);
        if (typeof userId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(userId)) throw new Error('invalid_grant');
        claimed = true;
        // Only the server-derived user ID is used. Never accept a target ID from the browser.
        // Auth's admin password update also revokes the user's refresh sessions.
        const updated = await fetchImpl(`${url}/auth/v1/admin/users/${userId}`, {
          method: 'PUT', headers: apiHeaders(serverKey), signal: AbortSignal.timeout(10000),
          body: JSON.stringify({ password: body.password })
        });
        if (!updated.ok) return respond({ error: 'recovery_restart_required' }, 503);
        return respond({ reset: true });
      } catch { return respond({ error: claimed ? 'recovery_restart_required' : 'recovery_unavailable' }, 503); }
    }
    if (body?.action !== 'check') return respond({ error: 'invalid_recovery_details' }, 400);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || typeof body.phone !== 'string' || body.phone.length > 30
      || typeof body.birth_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)
      || !['male', 'female'].includes(body.gender)) return respond({ error: 'invalid_recovery_details' }, 400);
    const started = Date.now();
    try {
      const secret = await cryptoImpl.subtle.importKey('raw', new TextEncoder().encode(serverKey),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const digest = async value => hex(await cryptoImpl.subtle.sign('HMAC', secret, new TextEncoder().encode(value)));
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
      const token = hex(cryptoImpl.getRandomValues(new Uint8Array(32)));
      const result = await rpc('begin_member_password_recovery', {
        p_email: email, p_phone: body.phone, p_birth_date: body.birth_date, p_gender: body.gender,
        p_ip_hash: await digest(`ip:${ip}`), p_email_hash: await digest(`email:${email}`), p_token_hash: await hash(token)
      });
      if (result?.status === 'limited') return respond({ error: 'recovery_rate_limited' }, 429);
      if (!['matched', 'unmatched'].includes(result?.status)) return respond({ error: 'recovery_unavailable' }, 503);
      await delay(Math.max(0, 700 - (Date.now() - started)));
      // No field-by-field hints, user ID, auth session or profile data leave the server.
      return respond(result.status === 'matched' ? { verified: true, reset_token: token, expires_in: 300 } : { verified: false });
    } catch { return respond({ error: 'recovery_unavailable' }, 503); }
  };
}
