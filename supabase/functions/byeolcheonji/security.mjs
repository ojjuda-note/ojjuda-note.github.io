import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr']);
export class ApiError extends Error {
  constructor(status, code, message, retryAfter = 0) {
    super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.retryAfter = retryAfter;
  }
}

export function deviceHash(request, optional = false) {
  const token = request.headers.get('X-Device-Token');
  if (!token && optional) return null;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, 'base64url').toString('base64url') !== token) {
    throw new ApiError(401, 'device_required', '이 기기의 알림 등록을 확인하지 못했어요. 알림을 다시 켜 주세요.');
  }
  return createHash('sha256').update(token).digest('hex');
}

export async function verifyIdentity(request, { authUrl, key, fetcher = fetch }) {
  const authorization = request.headers.get('Authorization') || '';
  const match = /^Bearer ([A-Za-z0-9._~-]{1,8192})$/i.exec(authorization);
  const denied = () => new ApiError(401, 'member_required', '오쭈다 회원으로 로그인해 주세요.');
  if (!match) throw denied();
  let response, user;
  try {
    response = await fetcher(`${authUrl}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${match[1]}`, Accept: 'application/json' },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch { throw new ApiError(503, 'auth_unavailable', '회원 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'); }
  if (response.status === 401 || response.status === 403) throw denied();
  if (!response.ok) throw new ApiError(503, 'auth_unavailable', '회원 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
  try { user = await response.json(); } catch { throw denied(); }
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(user?.id || '') || user.is_anonymous !== false) throw denied();
  // Only inspect claims after Auth has verified this same token. Database checks the live session next.
  let claims;
  try { claims = JSON.parse(Buffer.from(match[1].split('.')[1], 'base64url').toString('utf8')); } catch { throw denied(); }
  if (claims.sub !== user.id || !uuid.test(claims.session_id || '')) throw denied();
  return { userId: user.id, sessionId: claims.session_id };
}

export function pushSubscription(input) {
  if (!input || typeof input.endpoint !== 'string' || input.endpoint.length > 2048) throw new ApiError(400, 'invalid_device', '기기의 알림 주소를 확인하지 못했어요.');
  let url;
  try { url = new URL(input.endpoint); } catch { throw new ApiError(400, 'invalid_device', '기기의 알림 주소를 확인하지 못했어요.'); }
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com'
    || host === 'updates.push.services.mozilla.com' || /^[a-z0-9-]+\.push\.services\.mozilla\.com$/.test(host)
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !url.pathname || url.pathname === '/') {
    throw new ApiError(400, 'invalid_device', 'Chrome·Safari·인터넷 브라우저의 알림을 이용해 주세요.');
  }
  const keys = input.keys;
  if (!keys || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth)) {
    throw new ApiError(400, 'invalid_device', '기기의 알림 키를 확인하지 못했어요.');
  }
  const publicKey = Buffer.from(keys.p256dh, 'base64url'), secret = Buffer.from(keys.auth, 'base64url');
  if (publicKey.length !== 65 || publicKey[0] !== 4 || secret.length !== 16
    || publicKey.toString('base64url') !== keys.p256dh || secret.toString('base64url') !== keys.auth) {
    throw new ApiError(400, 'invalid_device', '기기의 알림 키를 확인하지 못했어요.');
  }
  return { endpoint: url.href, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

export function checkSignature(request, signingKey, now = Date.now()) {
  const timestamp = request.headers.get('X-Byeol-Time') || '';
  const nonce = request.headers.get('X-Byeol-Nonce') || '';
  const supplied = request.headers.get('X-Byeol-Signature') || '';
  const probe = request.headers.get('X-Byeol-Probe') === '1';
  const age = now / 1000 - Number(timestamp);
  if (!signingKey || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(nonce)
    || !/^[a-f0-9]{64}$/.test(supplied) || age < -30 || age > 120) throw new ApiError(401, 'scheduler_required', 'Unauthorized');
  const expected = createHmac('sha256', signingKey).update(`${timestamp}:${nonce}:${probe ? 'probe' : 'scan'}`).digest();
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), expected)) throw new ApiError(401, 'scheduler_required', 'Unauthorized');
  return { nonce, probe };
}

export async function jsonBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'json_required', '요청 형식을 확인해 주세요.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'body_required', '알림 설정을 확인해 주세요.');
  const parts = []; let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new ApiError(413, 'body_too_large', '알림 설정이 너무 커요.'); }
    parts.push(chunk.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object_required');
    return body;
  } catch { throw new ApiError(400, 'invalid_json', '알림 설정을 확인해 주세요.'); }
}
