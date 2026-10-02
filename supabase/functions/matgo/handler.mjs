import { verifyRound } from './verify.mjs';
import { verifyRound as verifyLegacyRound } from './verify-v1.mjs';
import { verifyRound as verifyV2Round } from './verify-v2.mjs';
const origins = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const publicErrors = new Set(['adult_required', 'member_identity_required', 'not_signed_in', 'banned', 'no_account', 'gold_not_empty', 'gold_empty', 'insufficient_zzu', 'paid_confirmation_required', 'round_mismatch']);
export function createHandler({ env, fetchImpl = fetch }) {
  const url = env('SUPABASE_URL'), service = env('SUPABASE_SERVICE_ROLE_KEY'), anon = env('SUPABASE_ANON_KEY');
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !origins.has(origin)) return reply({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    if (!url || !service || !anon) return reply({ error: 'unavailable' }, 503);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply({ error: 'not_signed_in' }, 401);
    let body;
    try {
      const reader = request.body?.getReader(); if (!reader) throw Error();
      const chunks = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 131072) { await reader.cancel(); throw Error(); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (!['status', 'start', 'refill', 'settle'].includes(body.action)) throw Error();
      if (body.action === 'settle' && (!uuid.test(body.round_id) || !Array.isArray(body.actions) || ![1, 2, 3].includes(body.rules_version ?? 1))) throw Error();
      if (body.action === 'refill' && (!uuid.test(body.request_id) || typeof body.paid !== 'boolean')) throw Error();
    } catch { return reply({ error: 'bad_request' }, 400); }
    const get = (path, options) => fetchImpl(url + path, { signal: AbortSignal.timeout(10000), ...options });
    try {
      const auth = await get('/auth/v1/user', { headers: { apikey: anon, authorization } });
      if (!auth.ok) return reply({ error: 'not_signed_in' }, 401);
      const user = await auth.json();
      if (!uuid.test(user.id) || user.is_anonymous) return reply({ error: 'not_signed_in' }, 401);
      const rpc = async (action, values = {}) => {
        const response = await get('/rest/v1/rpc/matgo_wallet_service', { method: 'POST',
          headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_actor: user.id, p_action: action, ...values }) });
        const data = await response.json();
        if (!response.ok) throw Error(publicErrors.has(data.message) ? data.message : 'unavailable');
        return data;
      };
      if (body.action === 'settle') {
        const snapshot = await rpc('round', { p_round: body.round_id });
        if (snapshot.settled) return reply(snapshot);
        let verified;
        try { verified = await (body.rules_version === 3 ? verifyRound : body.rules_version === 2 ? verifyV2Round : verifyLegacyRound)(snapshot.round, body.actions); }
        catch { return reply({ error: 'invalid_round' }, 409); }
        return reply(await rpc('settle', { p_round: body.round_id, p_gold: verified.gold, p_first: verified.first, p_carry: verified.carry }));
      }
      if (body.action === 'refill') return reply(await rpc('refill', { p_request: body.request_id, p_paid: body.paid }));
      return reply(await rpc(body.action));
    } catch (error) {
      const code = publicErrors.has(error.message) ? error.message : 'unavailable';
      return reply({ error: code }, code === 'unavailable' ? 503 : 409);
    }
  };
}
