// Anonymous recovery entrypoint. Matching details authorize only an email request,
// never a password change: Supabase's single-use email link proves mailbox access.
const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const SITE_KEY = 'sb_publishable_iUpPUBr2HlJr9LhDRVtB0Q_toJUMazo'; // Public browser key, not a secret.
const accepted = { accepted: true };
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
  const mailKey = browserKeys[0];
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
    if (!url || !serverKey || !mailKey) return respond({ error: 'recovery_unavailable' }, 503);
    let body;
    try { body = await readBody(request); } catch { return respond({ error: 'invalid_recovery_details' }, 400); }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || typeof body.phone !== 'string' || body.phone.length > 30
      || typeof body.birth_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birth_date)
      || !['male', 'female'].includes(body.gender)) return respond({ error: 'invalid_recovery_details' }, 400);
    const started = Date.now();
    try {
      const secret = await cryptoImpl.subtle.importKey('raw', new TextEncoder().encode(serverKey),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const digest = async value => [...new Uint8Array(await cryptoImpl.subtle.sign('HMAC', secret,
        new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
      const checked = await fetchImpl(`${url}/rest/v1/rpc/check_member_recovery`, {
        method: 'POST', headers: apiHeaders(serverKey), signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ p_email: email, p_phone: body.phone, p_birth_date: body.birth_date, p_gender: body.gender,
          p_ip_hash: await digest(`ip:${ip}`), p_email_hash: await digest(`email:${email}`) })
      });
      if (!checked.ok) return respond({ error: 'recovery_unavailable' }, 503);
      const status = await checked.json();
      if (status === 'limited') return respond({ error: 'recovery_rate_limited' }, 429);
      if (status !== 'matched' && status !== 'unmatched') return respond({ error: 'recovery_unavailable' }, 503);
      if (status === 'matched') {
        const sent = await fetchImpl(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent('https://ojjuda.kr/?reset=1')}`, {
          method: 'POST', headers: apiHeaders(mailKey), signal: AbortSignal.timeout(10000), body: JSON.stringify({ email })
        });
        if (!sent.ok) return respond({ error: sent.status === 429 ? 'recovery_rate_limited' : 'recovery_mail_failed' }, sent.status === 429 ? 429 : 503);
      }
      // Do not disclose which identity field matched or whether an account exists.
      await delay(Math.max(0, 700 - (Date.now() - started)));
      return respond(accepted, 202);
    } catch { return respond({ error: 'recovery_unavailable' }, 503); }
  };
}
