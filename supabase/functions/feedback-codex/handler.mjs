// The database submits one private nonce per saved opinion. There is no queue scan.
export const WORKER_REPOSITORY = 'ojjuda-note/ojjuda-codex-worker';
export const WORKER_REPOSITORY_ID = '1394775639';
export const WORKFLOW_REF = `${WORKER_REPOSITORY}/.github/workflows/codex-feedback.yml@refs/heads/main`;
export const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const MAX_BODY_BYTES = 100 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DIGITS = /^[1-9][0-9]{0,19}$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const validUuid = value => typeof value === 'string' && UUID.test(value);
const validId = value => (typeof value === 'string' || Number.isSafeInteger(value))
  && DIGITS.test(String(value)) && BigInt(value) <= 9223372036854775807n;

// Repository IDs are public, immutable identity, not a deploy-time credential.
// Keep the deployed trust pin fixed even if an obsolete environment value exists.
export const pinnedWorkerEnv = readEnv => name => name === 'FEEDBACK_WORKER_REPOSITORY_ID'
  ? WORKER_REPOSITORY_ID : readEnv(name);

async function readBody(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^[0-9]+$/.test(length) || Number(length) > MAX_BODY_BYTES)) throw new Error('invalid_body');
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new Error('invalid_body');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  let timer;
  const consume = async () => {
    let text = '', size = 0;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('invalid_body');
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_body');
    return body;
  };
  try {
    return await Promise.race([consume(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('invalid_body')), 5000);
    })]);
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
  }
}

// This is called ONLY after the injected JOSE verifier verifies the signature.
// The immutable repository ID prevents a renamed/recreated repository from inheriting trust.
export function authorizedClaims(claims, { audience, repositoryId, runId, nowSeconds }) {
  return !!claims && typeof claims === 'object'
    && claims.iss === OIDC_ISSUER && claims.aud === audience
    && typeof claims.sub === 'string' && claims.sub.length > 0
    && claims.repository === WORKER_REPOSITORY && claims.repository_id === repositoryId
    && claims.repository_visibility === 'private'
    && claims.workflow_ref === WORKFLOW_REF && claims.ref === 'refs/heads/main'
    && claims.event_name === 'workflow_dispatch' && claims.run_id === runId
    && claims.run_attempt === '1'
    && Number.isInteger(claims.exp) && claims.exp > nowSeconds
    && Number.isInteger(claims.nbf) && claims.nbf <= nowSeconds
    && Number.isInteger(claims.iat) && claims.iat <= nowSeconds
    && claims.exp > claims.iat && claims.exp - claims.iat <= 600;
}

function completionPayload(body, base) {
  if (!validUuid(body.lease_token) || !['needs_review', 'blocked'].includes(body.status)
    || !['low', 'normal', 'high'].includes(body.priority)
    || typeof body.summary !== 'string' || !body.summary.trim() || [...body.summary].length > 1200
    || typeof body.result !== 'string' || !body.result.trim() || [...body.result].length > 12000) return null;
  return { ...base, lease_token: body.lease_token, status: body.status, summary: body.summary,
    result: body.result, priority: body.priority,
    evidence_url: `https://github.com/${WORKER_REPOSITORY}/actions/runs/${base.run_id}` };
}

export function createHandler({ env, verifyOidc, fetchImpl = fetch, now = () => Date.now(),
  warn = (...args) => console.warn(...args) }) {
  const url = env('SUPABASE_URL');
  const serverKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const configuredGithubToken = env('FEEDBACK_GITHUB_TOKEN');
  const githubToken = typeof configuredGithubToken === 'string' ? configuredGithubToken.trim() : configuredGithubToken;
  const githubTokenKind = /^github_pat_[A-Za-z0-9_]+$/.test(githubToken || '') ? 'fine_grained'
    : /^ghp_[A-Za-z0-9]+$/.test(githubToken || '') ? 'classic' : 'unrecognized';
  const repositoryId = env('FEEDBACK_WORKER_REPOSITORY_ID');
  const audience = `${url}/functions/v1/feedback-codex`;
  const configured = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url || '')
    && typeof serverKey === 'string' && serverKey.length > 0
    && typeof repositoryId === 'string' && DIGITS.test(repositoryId);
  const rpc = async (action, payload) => {
    const response = await fetchImpl(`${url}/rest/v1/rpc/feedback_codex_bridge`, {
      method: 'POST', headers: { apikey: serverKey, Authorization: `Bearer ${serverKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000), redirect: 'error',
      body: JSON.stringify({ p_action: action, p_payload: payload })
    });
    if (!response.ok) throw new Error('database_unavailable');
    return response.json();
  };

  return async request => {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    let body;
    try { body = await readBody(request); } catch { return json({ error: 'invalid_request' }, 400); }
    if (!['dispatch', 'claim', 'complete'].includes(body.action)
      || !validId(body.feedback_id) || !validUuid(body.dispatch_nonce)) return json({ error: 'invalid_request' }, 400);
    const base = { feedback_id: String(body.feedback_id), dispatch_nonce: body.dispatch_nonce.toLowerCase() };
    if (!configured) return json({ error: 'worker_unavailable' }, 503);

    if (body.action === 'dispatch') {
      try {
        const claimed = await rpc('dispatch_claim', base);
        // Both an unknown nonce and an already-dispatched event return the same small result.
        if (!claimed) return json({ accepted: true });
        if (String(claimed.feedback_id) !== base.feedback_id || claimed.dispatch_nonce !== base.dispatch_nonce)
          throw new Error('invalid_dispatch_claim');
        let runId = null, errorCode = 'worker_unconfigured';
        if (typeof githubToken === 'string' && githubToken.length > 0) {
          errorCode = 'github_unavailable';
          try {
            const response = await fetchImpl(`https://api.github.com/repos/${WORKER_REPOSITORY}/actions/workflows/codex-feedback.yml/dispatches`, {
              method: 'POST', headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10',
                'User-Agent': 'ojjuda-feedback-codex' },
              signal: AbortSignal.timeout(10000), redirect: 'error',
              body: JSON.stringify({ ref: 'main',
                inputs: { feedback_id: base.feedback_id, dispatch_nonce: base.dispatch_nonce } })
            });
            // Only fixed labels, HTTP status, and format class are safe for diagnostics.
            // A recognized format does not imply that the credential is valid.
            if (response.status >= 400) warn('feedback_codex_github_rejected', response.status, githubTokenKind);
            if (response.status === 200) {
              const details = await response.json();
              if (validId(details?.workflow_run_id)) {
                const candidate = String(details.workflow_run_id);
                if (details.html_url === `https://github.com/${WORKER_REPOSITORY}/actions/runs/${candidate}`
                  && details.run_url === `https://api.github.com/repos/${WORKER_REPOSITORY}/actions/runs/${candidate}`) runId = candidate;
              }
            } else if (response.status === 401 || response.status === 403) errorCode = 'github_unauthorized';
            else if (response.status === 429) errorCode = 'github_rate_limited';
            else if (response.status >= 400 && response.status < 500) errorCode = 'github_rejected';
          } catch { /* Do not log or return upstream response bodies, credentials, or feedback. */ }
        }
        const dispatchStatus = runId ? 'dispatched' : 'failed';
        const finished = await rpc('dispatch_finish', { ...base, status: dispatchStatus,
          ...(runId ? { run_id: runId } : { error_code: errorCode }) });
        if (!finished || String(finished.feedback_id) !== base.feedback_id || finished.dispatch_status !== dispatchStatus)
          throw new Error('dispatch_result_not_saved');
        return json({ accepted: true });
      } catch { return json({ error: 'worker_unavailable' }, 503); }
    }

    if (typeof body.run_id !== 'string' || !validId(body.run_id)) return json({ error: 'invalid_request' }, 400);
    base.run_id = body.run_id;
    const auth = request.headers.get('authorization') || '';
    if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(auth)
      || auth.length > 16000 || typeof verifyOidc !== 'function') return json({ error: 'unauthorized' }, 401);
    let claims;
    try { claims = await verifyOidc(auth.slice(7), audience); }
    catch { return json({ error: 'unauthorized' }, 401); }
    if (!authorizedClaims(claims, { audience, repositoryId, runId: body.run_id,
      nowSeconds: Math.floor(now() / 1000) })) return json({ error: 'unauthorized' }, 401);

    try {
      if (body.action === 'claim') {
        const result = await rpc('worker_claim', base);
        if (!result) return json({ error: 'job_unavailable' }, 409);
        if (String(result.feedback_id) !== base.feedback_id || result.run_id !== body.run_id
          || !validUuid(result.lease_token) || typeof result.body !== 'string'
          || !['bug', 'idea', 'other'].includes(result.kind)) throw new Error('invalid_job');
        return json({ ok: true, lease_token: result.lease_token, feedback: {
          id: result.feedback_id, kind: result.kind, body: result.body,
          screen: result.screen ?? null, app_version: result.app_version ?? null, user_agent: result.user_agent ?? null
        } });
      }
      const payload = completionPayload(body, base);
      if (!payload) return json({ error: 'invalid_request' }, 400);
      const result = await rpc('worker_finish', payload);
      if (!result) return json({ error: 'job_unavailable' }, 409);
      if (String(result.feedback_id) !== base.feedback_id || result.status !== body.status) throw new Error('invalid_result');
      return json({ ok: true });
    } catch { return json({ error: 'worker_unavailable' }, 503); }
  };
}
