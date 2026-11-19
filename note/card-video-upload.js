// Loaded only when a member publishes a prepared video attachment.
import { Upload } from './vendor/tus-js-client-4.3.1.mjs';

const VIDEO_BUCKET = 'note-card-videos';
const PHOTO_BUCKET = 'note-card-photos';
const abortError = () => new DOMException('첨부 전송을 취소했어요.', 'AbortError');

export function resumableEndpoint(supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co');
  }
  return `${url.origin}/storage/v1/upload/resumable`;
}

async function accessToken(client, userId, signal) {
  if (signal?.aborted) throw abortError();
  const { data, error } = await client.auth.getSession();
  if (error || data?.session?.user?.id !== userId || !data.session.access_token) {
    throw new Error('계정이 변경됐어요. 작성창을 다시 열어 주세요.');
  }
  if (signal?.aborted) throw abortError();
  return data.session.access_token;
}

async function uploadVideo({ client, supabaseUrl, userId, path, blob, signal, onProgress }) {
  const token = await accessToken(client, userId, signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const upload = new Upload(blob, {
      endpoint: resumableEndpoint(supabaseUrl),
      headers: { authorization: `Bearer ${token}` },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: { bucketName: VIDEO_BUCKET, objectName: path, contentType: 'video/mp4', cacheControl: '600' },
      fingerprint: async () => `ojjuda-park-video:${path}:${blob.size}`,
      onBeforeRequest: async request => {
        request.setHeader('authorization', `Bearer ${await accessToken(client, userId, signal)}`);
      },
      onProgress: (sent, total) => {
        if (!settled && !signal?.aborted) onProgress?.({ phase: 'uploading', progress: total ? sent / total : 0 });
      },
      onError: error => {
        // The same immutable request can already have finished after a lost response.
        // The validator checks its bytes and object identity before any card can link it.
        if (error?.originalResponse?.getStatus?.() === 409) finish();
        else if (signal?.aborted || error?.name === 'AbortError') finish(abortError());
        else finish(new Error('영상을 전송하지 못했어요. 연결을 확인하고 다시 등록해 주세요.', { cause: error }));
      },
      onSuccess: () => finish(),
    });
    const abort = () => {
      void upload.abort().catch(() => {});
      finish(abortError());
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    upload.findPreviousUploads().then(previous => {
      if (settled || signal?.aborted) return;
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(error => finish(new Error('영상 전송을 시작하지 못했어요. 다시 등록해 주세요.', { cause: error })));
  });
}

export async function uploadCardVideo({ client, supabaseUrl, userId, requestId, video, posterBlob, signal, onProgress }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId) || !uuid.test(requestId) || video?.blob?.type !== 'video/mp4'
    || video.blob.size <= 0 || video.blob.size > 20 * 1024 * 1024 || posterBlob?.type !== 'image/jpeg') {
    throw new Error('영상 정보를 다시 확인해 주세요.');
  }
  const photoPath = `${userId}/${requestId}.jpg`, videoPath = `${userId}/${requestId}.mp4`;
  await uploadVideo({ client, supabaseUrl, userId, path: videoPath, blob: video.blob, signal, onProgress });
  await accessToken(client, userId, signal);
  onProgress?.({ phase: 'checking', progress: 1 });
  const { error: posterError } = await client.storage.from(PHOTO_BUCKET).upload(photoPath, posterBlob,
    { contentType: 'image/jpeg', upsert: false, cacheControl: '600' });
  if (posterError && String(posterError.statusCode) !== '409' && !/already exists|duplicate/i.test(posterError.message || '')) {
    throw new Error('영상 미리보기를 올리지 못했어요. 다시 등록해 주세요.', { cause: posterError });
  }
  await accessToken(client, userId, signal);
  const { data, error } = await client.functions.invoke('park-video', { body: { poster_path: photoPath, video_path: videoPath } });
  await accessToken(client, userId, signal);
  if (error || !data?.ok || data.photo_path !== photoPath || data.video_path !== videoPath) {
    let detail = data;
    try { if (error?.context?.json) detail = await error.context.json(); } catch { /* Network failures can be retried. */ }
    throw new Error(detail?.message || '영상을 확인하지 못했어요. 잠시 뒤 다시 등록해 주세요.');
  }
  return photoPath;
}
