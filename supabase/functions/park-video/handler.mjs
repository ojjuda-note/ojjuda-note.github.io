import { LIMITS, VideoValidationError } from './validation.mjs';

const ORIGINS = new Set(['https://ojjuda.kr', 'https://www.ojjuda.kr', 'https://ojjuda-note.github.io']);
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const VIDEO_PATH = new RegExp('^(' + UUID + ')/(' + UUID + ')[.]mp4$');
const keys = value => { try { return Object.values(JSON.parse(value || '{}')).filter(v => typeof v === 'string'); } catch { return []; } };

async function bytesUpTo(response, max) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > max) throw new VideoValidationError('video_size');
  const reader = response.body?.getReader();
  if (!reader) throw new VideoValidationError('empty_upload');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new VideoValidationError('video_size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.byteLength; }
  return result;
}

export function createHandler({ env, validate, fetchImpl = fetch }) {
  const url = env('SUPABASE_URL')?.replace(/\/$/, '');
  const serviceKey = keys(env('SUPABASE_SECRET_KEYS'))[0] || env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = keys(env('SUPABASE_PUBLISHABLE_KEYS'))[0] || env('SUPABASE_ANON_KEY');
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Access-Control-Allow-Origin': ORIGINS.has(origin) ? origin : 'https://ojjuda.kr',
      'Access-Control-Allow-Headers': 'apikey,authorization,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Content-Type': 'application/json' };
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    const fail = (status, code, message) => respond({ ok: false, code, message }, status);
    if (origin && !ORIGINS.has(origin)) return fail(403, 'forbidden', '허용되지 않은 요청이에요.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return fail(405, 'invalid_request', '올바른 요청이 아니에요.');
    if (!url || !serviceKey || !anonKey) return fail(503, 'unavailable', '영상 확인을 잠시 후 다시 시도해 주세요.');
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!token) return fail(401, 'not_signed_in', '로그인 후 다시 올려 주세요.');
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await bytesUpTo(request, 1024))); }
    catch { return fail(400, 'invalid_request', '첨부 파일 정보를 확인해 주세요.'); }
    const match = typeof body?.video_path === 'string' && VIDEO_PATH.exec(body.video_path);
    if (!match || body?.poster_path !== body.video_path.replace(/[.]mp4$/, '.jpg'))
      return fail(400, 'invalid_request', '첨부 파일 정보를 확인해 주세요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const userHeaders = { apikey: anonKey, Authorization: `Bearer ${token}` };
    const rpc = async (name, args, service = false) => {
      const key = service ? serviceKey : anonKey;
      const result = await fetchImpl(`${url}/rest/v1/rpc/${name}`, { method: 'POST', signal: controller.signal,
        headers: { apikey: key, ...(!service || key.startsWith('eyJ') ? { Authorization: `Bearer ${service ? key : token}` } : {}),
          'Content-Type': 'application/json', 'Content-Profile': 'ojjuda_note', 'Accept-Profile': 'ojjuda_note' },
        body: JSON.stringify(args) });
      const data = await result.json();
      if (!result.ok) { const error = new Error('rpc_failed'); error.code = data?.code; error.status = result.status; throw error; }
      return data;
    };
    try {
      // Never trust an unverified JWT payload or a caller-provided member ID.
      const auth = await fetchImpl(`${url}/auth/v1/user`, { headers: userHeaders, signal: controller.signal });
      if (!auth.ok) return fail(401, 'not_signed_in', '로그인 후 다시 올려 주세요.');
      const user = await auth.json();
      if (user.id !== match[1]) return fail(403, 'forbidden', '본인이 올린 영상만 첨부할 수 있어요.');
      const prepared = await rpc('prepare_card_video_validation', { p_photo_path: body.poster_path, p_video_path: body.video_path });
      // Immutable object IDs let successful retries reuse the server receipt.
      if (prepared.verified) return respond(prepared.verified);
      const download = async (bucket, path, limit, expected) => {
        const response = await fetchImpl(`${url}/storage/v1/object/authenticated/${bucket}/${path}`, {
          headers: userHeaders, signal: controller.signal });
        if (!response.ok) { const error = new Error('upload_unavailable'); error.code = '40001'; throw error; }
        const bytes = await bytesUpTo(response, limit);
        if (bytes.length !== expected) { const error = new Error('upload_changed'); error.code = '40001'; throw error; }
        return bytes;
      };
      const [video, poster] = await Promise.all([
        download('note-card-videos', body.video_path, LIMITS.videoBytes, prepared.video_bytes),
        download('note-card-photos', body.poster_path, LIMITS.posterBytes, prepared.photo_bytes)
      ]);
      const verified = await validate(video, poster);
      const result = await rpc('register_verified_card_video', { p_user_id: user.id,
        p_photo_path: body.poster_path, p_video_path: body.video_path,
        p_photo_object_id: prepared.photo_object_id, p_video_object_id: prepared.video_object_id,
        p_duration: verified.duration, p_width: verified.width, p_height: verified.height,
        p_bytes: verified.bytes, p_sha256: verified.sha256 }, true);
      return respond(result);
    } catch (error) {
      if (error instanceof VideoValidationError || error?.code === '22023')
        return fail(400, 'invalid_video', '영상 형식을 확인하지 못했어요. 1분 미만 영상을 다시 선택해 주세요.');
      if (error?.code === '42501') return fail(403, 'forbidden', '지금은 영상을 올릴 수 없어요. 계정 상태를 확인해 주세요.');
      if (error?.code === '40001' || error?.code === '23505')
        return fail(409, 'upload_changed', '첨부 파일이 바뀌었어요. 영상을 다시 선택해 주세요.');
      return fail(503, 'unavailable', '영상 확인을 잠시 후 다시 시도해 주세요.');
    } finally { clearTimeout(timeout); controller.abort(); }
  };
}
