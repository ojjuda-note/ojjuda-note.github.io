// Video work is lazy: the feed loads neither codecs nor video bytes.
export const CARD_VIDEO_LIMITS = Object.freeze({
  maxDuration: 60, // Exclusive, including the audio track.
  maxInputBytes: 250 * 1024 * 1024,
  maxOutputBytes: 20 * 1024 * 1024,
  maxLongEdge: 1280,
  maxShortEdge: 720,
  maxFrameRate: 30,
  maxPosterLongEdge: 512,
  maxPosterBytes: 512 * 1024,
});

const VIDEO_BITRATE = 1_800_000;
const AUDIO_BITRATE = 96_000;
const COPY_BITRATE_LIMIT = 2_400_000;
const FRAME_RATE_TOLERANCE = 0.1; // Container time-base rounding, also checked on the server.
let mediaModulePromise;
let aacModulePromise;

export class CardVideoError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'CardVideoError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function aborted() {
  return new DOMException('영상 준비를 취소했어요.', 'AbortError');
}

function checkAbort(signal) {
  if (signal?.aborted) throw aborted();
}

function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(aborted());
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(aborted()); };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', onAbort);
      reject(error);
    });
    if (signal.aborted) onAbort();
  });
}

function fail(code, message, cause) {
  return new CardVideoError(code, message, cause);
}

function validateFile(file) {
  if (!file || typeof file.slice !== 'function' || typeof file.arrayBuffer !== 'function' || !file.size) {
    throw fail('invalid_file', '영상 파일을 다시 골라 주세요.');
  }
  if (file.size > CARD_VIDEO_LIMITS.maxInputBytes) {
    throw fail('input_too_large', '원본 영상은 250MB 이하로 골라 주세요.');
  }
}

function reporter(onProgress) {
  let previous = 0;
  let previousPhase = '';
  let lastTime = 0;
  return (phase, progress) => {
    const next = Math.max(previous, Math.min(1, Number(progress) || 0));
    const now = Date.now();
    if (phase === previousPhase && next < 1 && now - lastTime < 80) return;
    previous = next;
    previousPhase = phase;
    lastTime = now;
    try { onProgress?.({ phase, progress: next }); } catch { /* Display callbacks cannot break conversion. */ }
  };
}

async function loadMedia() {
  if (!mediaModulePromise) {
    mediaModulePromise = import('./vendor/mediabunny-1.66.2.mjs').catch(error => {
      mediaModulePromise = null;
      throw fail('load_failed', '영상 준비 도구를 불러오지 못했어요. 다시 시도해 주세요.', error);
    });
  }
  return mediaModulePromise;
}

async function loadAacEncoder() {
  if (!aacModulePromise) {
    aacModulePromise = import('./vendor/mediabunny-aac-encoder-1.66.2.mjs')
      .then(module => module.registerAacEncoder())
      .catch(error => {
        aacModulePromise = null;
        throw fail('audio_unsupported', '이 영상의 소리를 변환하지 못했어요. MP4 영상으로 다시 골라 주세요.', error);
      });
  }
  await aacModulePromise;
}

function withinDimensions(width, height) {
  return Number.isFinite(width) && Number.isFinite(height) && width >= 2 && height >= 2
    && Math.max(width, height) <= CARD_VIDEO_LIMITS.maxLongEdge
    && Math.min(width, height) <= CARD_VIDEO_LIMITS.maxShortEdge;
}

/** Fit without cropping or upscaling. Even pixels keep H.264 encoders interoperable. */
export function fitCardVideoDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    throw fail('invalid_video', '영상의 화면 크기를 읽지 못했어요. 다른 영상으로 골라 주세요.');
  }
  const scale = Math.min(1, CARD_VIDEO_LIMITS.maxLongEdge / Math.max(width, height),
    CARD_VIDEO_LIMITS.maxShortEdge / Math.min(width, height));
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2) };
}

/** Pure policy, shared with focused tests. Metadata must come from the parsed bytes. */
export function createCardVideoPlan(meta, originalBytes) {
  if (!Number.isFinite(meta.duration) || meta.duration <= 0) {
    throw fail('invalid_video', '영상 길이를 읽지 못했어요. 다른 영상으로 골라 주세요.');
  }
  if (meta.duration >= CARD_VIDEO_LIMITS.maxDuration) {
    throw fail('too_long', '영상은 1분 미만으로 올릴 수 있어요. 길이를 줄여 주세요.');
  }
  const size = fitCardVideoDimensions(meta.width, meta.height);
  const safeProfile = /^avc[13]\.(42|4d|64)[\da-f]{4}$/i.test(meta.codecString || '');
  const copyVideo = meta.videoCodec === 'avc' && safeProfile && !meta.hdr
    && withinDimensions(meta.width, meta.height)
    && withinDimensions(meta.codedWidth, meta.codedHeight)
    && meta.frameRate <= CARD_VIDEO_LIMITS.maxFrameRate + FRAME_RATE_TOLERANCE
    && meta.maxFrameRate <= CARD_VIDEO_LIMITS.maxFrameRate + FRAME_RATE_TOLERANCE
    && originalBytes <= CARD_VIDEO_LIMITS.maxOutputBytes - 128 * 1024
    && originalBytes * 8 / meta.duration <= COPY_BITRATE_LIMIT;
  // Keep compatible AAC packets even when video is resized: no needless audio loss,
  // decoder work, or fallback download on browsers without native AAC encoding.
  const copyAudio = !meta.hasAudio || (meta.audioCodec === 'aac'
    && meta.audioChannels >= 1 && meta.audioChannels <= 2
    && meta.audioSampleRate >= 8000 && meta.audioSampleRate <= 48000
    && meta.audioBitrate <= 320_000);
  const guessedRate = meta.bestGuessFrameRate > 0 ? meta.bestGuessFrameRate : meta.frameRate;
  return {
    ...size,
    frameRate: Math.min(CARD_VIDEO_LIMITS.maxFrameRate, Math.max(1, guessedRate || 30)),
    videoBitrate: Math.round(Math.max(450_000, VIDEO_BITRATE * size.width * size.height / (1280 * 720))),
    audioBitrate: AUDIO_BITRATE,
    audioChannels: Math.min(2, Math.max(1, meta.audioChannels || 2)),
    audioSampleRate: 48000,
    copyVideo,
    copyAudio,
    method: copyVideo && copyAudio ? 'remux' : 'transcode',
  };
}

async function inspect(input, signal) {
  checkAbort(signal);
  const video = await input.getPrimaryVideoTrack();
  if (!video) throw fail('no_video', '영상 화면이 없는 파일이에요. 다른 영상으로 골라 주세요.');
  const audio = await input.getPrimaryAudioTrack();
  const [width, height, codedWidth, codedHeight, videoCodec, codecString, hdr,
    videoStart, videoEnd, metrics] = await Promise.all([
    video.getDisplayWidth(), video.getDisplayHeight(), video.getCodedWidth(), video.getCodedHeight(),
    video.getCodec(), video.getCodecParameterString(), video.hasHighDynamicRange(),
    video.getFirstTimestampOrNull(), video.computeDurationOrNull(),
    video.computeFrameRateMetrics({ targetPacketCount: Infinity }),
  ]);
  checkAbort(signal);
  let audioInfo = {};
  if (audio) {
    const [audioCodec, audioChannels, audioSampleRate, audioStart, audioEnd, stats] = await Promise.all([
      audio.getCodec(), audio.getNumberOfChannels(), audio.getSampleRate(),
      audio.getFirstTimestampOrNull(), audio.computeDurationOrNull(), audio.computePacketStats(),
    ]);
    if (audioStart === null || audioEnd === null) {
      throw fail('invalid_audio', '영상의 소리를 읽지 못했어요. 다른 영상으로 골라 주세요.');
    }
    audioInfo = { audioCodec, audioChannels, audioSampleRate, audioStart, audioEnd,
      audioBitrate: stats.averageBitrate, audioPackets: stats.packetCount };
  }
  if (videoStart === null || videoEnd === null || !metrics.probedPacketCount) {
    throw fail('invalid_video', '재생할 수 없는 영상이에요. 다른 영상으로 골라 주세요.');
  }
  const start = Math.max(0, Math.min(videoStart, audioInfo.audioStart ?? Infinity));
  const duration = Math.max(videoEnd, audioInfo.audioEnd ?? 0) - start;
  checkAbort(signal);
  return {
    video, audio, meta: {
      width, height, codedWidth, codedHeight, videoCodec, codecString, hdr, duration,
      videoStart, videoEnd, start, videoPackets: metrics.probedPacketCount,
      frameRate: metrics.probedPacketCount / (videoEnd - videoStart),
      maxFrameRate: metrics.maxFrameRate || 0, bestGuessFrameRate: metrics.bestGuessFrameRate,
      hasAudio: Boolean(audio), ...audioInfo,
    },
  };
}

function makeSdrProcessor(width, height) {
  // Canvas uses an SDR sRGB output; do not label unconverted HDR samples as H.264 SDR.
  const canvas = typeof OffscreenCanvas === 'function'
    ? new OffscreenCanvas(width, height) : globalThis.document?.createElement('canvas');
  if (!canvas) throw fail('browser_unsupported', '이 브라우저에서는 고화질 영상을 줄일 수 없어요. 최신 Chrome이나 Safari에서 다시 시도해 주세요.');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
  if (!context) throw fail('browser_unsupported', '이 브라우저에서는 영상을 준비할 수 없어요. 다른 브라우저에서 시도해 주세요.');
  return sample => {
    sample.draw(context, 0, 0, width, height);
    return canvas;
  };
}

/** Worker implementation. Exported separately so real MP4 remuxes can also run in Node tests. */
export async function prepareCardVideoData(file, { signal, onProgress } = {}) {
  validateFile(file);
  checkAbort(signal);
  const report = reporter(onProgress);
  report('loading', 0.01);
  const media = await abortable(loadMedia(), signal);
  checkAbort(signal);
  let input;
  let outputInput;
  let conversion;
  let target;
  let outputTooLarge = false;
  const cancel = () => {
    void conversion?.cancel().catch(() => {});
    input?.dispose();
    outputInput?.dispose();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    report('checking', 0.04);
    input = new media.Input({ source: new media.BlobSource(file, { maxCacheSize: 8 * 1024 * 1024 }),
      formats: [media.MP4, media.QTFF, media.WEBM] });
    const { video, audio, meta } = await inspect(input, signal);
    const plan = createCardVideoPlan(meta, file.size);
    const videoQuality = new media.Quality({ bitrate: plan.videoBitrate });
    const audioQuality = new media.Quality({ bitrate: plan.audioBitrate });
    if (!plan.copyVideo && (!(await video.canDecode()) || !(await media.canEncodeVideo('avc', {
      width: plan.width, height: plan.height, frameRate: plan.frameRate, quality: videoQuality,
    })))) {
      throw fail('browser_unsupported', '이 브라우저에서는 이 영상을 줄일 수 없어요. 최신 Chrome이나 Safari에서 다시 시도해 주세요.');
    }
    if (audio && !plan.copyAudio) {
      if (!(await audio.canDecode())) {
        throw fail('audio_unsupported', '이 영상의 소리를 읽을 수 없어요. MP4 영상으로 다시 골라 주세요.');
      }
      const audioConfig = { numberOfChannels: plan.audioChannels, sampleRate: plan.audioSampleRate, quality: audioQuality };
      if (!(await media.canEncodeAudio('aac', audioConfig))) await abortable(loadAacEncoder(), signal);
      if (!(await media.canEncodeAudio('aac', audioConfig))) {
        throw fail('audio_unsupported', '이 영상의 소리를 변환하지 못했어요. MP4 영상으로 다시 골라 주세요.');
      }
    }
    checkAbort(signal);
    target = new media.BufferTarget();
    // Reserve puts the index before media data without buffering a second full copy.
    // It also lets us stop an unexpectedly large output during encoding.
    target.on('write', ({ end }) => {
      if (end > CARD_VIDEO_LIMITS.maxOutputBytes) {
        outputTooLarge = true;
        void conversion?.cancel().catch(() => {});
      }
    });
    const output = new media.Output({ format: new media.Mp4OutputFormat({ fastStart: 'reserve' }), target });
    const videoOptions = plan.copyVideo
      ? { codec: 'avc', maximumPacketCount: meta.videoPackets + 8 }
      : {
        codec: 'avc', width: plan.width, height: plan.height, fit: 'contain',
        quality: videoQuality, frameRate: plan.frameRate, keyFrameInterval: 2,
        forceTranscode: true, allowTransformationMetadata: false,
        maximumPacketCount: Math.ceil(meta.duration * plan.frameRate) + 64,
        ...(meta.hdr ? { process: makeSdrProcessor(plan.width, plan.height) } : {}),
      };
    const audioOptions = plan.copyAudio
      ? { codec: 'aac', maximumPacketCount: (meta.audioPackets || 0) + 8 }
      : {
        codec: 'aac', quality: audioQuality, numberOfChannels: plan.audioChannels,
        sampleRate: plan.audioSampleRate, forceTranscode: true,
        maximumPacketCount: Math.ceil(meta.duration * plan.audioSampleRate / 1024) + 64,
      };
    conversion = await media.Conversion.init({
      input, output, tracks: 'primary', video: videoOptions, audio: audioOptions,
      tags: {}, showWarnings: false,
    });
    checkAbort(signal);
    if (!conversion.isValid || !conversion.utilizedTracks.includes(video)
      || (audio && !conversion.utilizedTracks.includes(audio))) {
      throw fail('browser_unsupported', '영상이나 소리를 변환할 수 없어요. 다른 MP4 영상을 골라 주세요.');
    }
    report('processing', 0.08);
    conversion.onProgress = progress => report('processing', 0.08 + progress * 0.82);
    await conversion.execute();
    checkAbort(signal);
    if (outputTooLarge || !target.buffer || target.buffer.byteLength > CARD_VIDEO_LIMITS.maxOutputBytes) {
      throw fail('output_too_large', '줄인 영상이 20MB를 넘어요. 조금 더 짧은 영상으로 골라 주세요.');
    }
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    outputInput = new media.Input({ source: new media.BlobSource(blob), formats: [media.MP4] });
    const result = await inspect(outputInput, signal);
    const checked = result.meta;
    if (!(checked.duration > 0 && checked.duration < CARD_VIDEO_LIMITS.maxDuration)
      || checked.videoEnd >= CARD_VIDEO_LIMITS.maxDuration || (checked.audioEnd ?? 0) >= CARD_VIDEO_LIMITS.maxDuration) {
      throw fail('too_long', '변환된 영상이 1분에 가까워요. 길이를 조금 줄여 주세요.');
    }
    if (!withinDimensions(checked.width, checked.height) || !withinDimensions(checked.codedWidth, checked.codedHeight)
      || checked.videoCodec !== 'avc' || checked.hasAudio !== meta.hasAudio
      || (checked.hasAudio && (checked.audioCodec !== 'aac' || checked.audioChannels > 2
        || checked.audioSampleRate > 48000))
      || checked.frameRate > CARD_VIDEO_LIMITS.maxFrameRate + FRAME_RATE_TOLERANCE
      || checked.videoStart < 0 || checked.videoStart > 0.1
      // AAC commonly retains one or more priming packets before time zero. They
      // are needed for correct decoding; they do not extend the playable clip.
      || (checked.hasAudio && (checked.audioStart < -0.1 || checked.audioStart > 0.1))) {
      throw fail('invalid_output', '영상을 안전하게 준비하지 못했어요. 다른 MP4 영상으로 다시 골라 주세요.', checked);
    }
    report('processing', 0.93);
    return { blob, duration: checked.duration, width: checked.width, height: checked.height,
      mimeType: 'video/mp4', method: plan.method, originalBytes: file.size, hasAudio: checked.hasAudio };
  } catch (error) {
    if (signal?.aborted) throw aborted();
    if (outputTooLarge) throw fail('output_too_large', '줄인 영상이 20MB를 넘어요. 조금 더 짧은 영상으로 골라 주세요.');
    if (error instanceof CardVideoError) throw error;
    throw fail('invalid_video', '이 영상을 준비하지 못했어요. 재생 가능한 MP4·MOV·WebM 파일로 다시 골라 주세요.', error);
  } finally {
    signal?.removeEventListener('abort', cancel);
    await conversion?.cancel().catch(() => {});
    input?.dispose();
    outputInput?.dispose();
  }
}

function prepareInWorker(file, signal, report) {
  return new Promise((resolve, reject) => {
    let worker;
    let started = false;
    let done = false;
    let timer;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      if (error) reject(error); else resolve(result);
    };
    const onAbort = () => finish(aborted());
    try {
      worker = new Worker(new URL('./card-video-worker.js?v=20261120-video1', import.meta.url), { type: 'module' });
      timer = setTimeout(() => finish(fail('worker_unavailable', '영상 준비 도구를 시작하지 못했어요.')), 15_000);
      worker.onmessage = ({ data }) => {
        if (data?.type === 'started') { started = true; clearTimeout(timer); }
        else if (data?.type === 'progress') report(data.phase, data.progress);
        else if (data?.type === 'result') finish(null, data.result);
        else if (data?.type === 'error') finish(fail(data.code || 'invalid_video', data.message || '영상을 준비하지 못했어요.'));
      };
      worker.onerror = event => {
        event.preventDefault();
        finish(fail(started ? 'processing_failed' : 'worker_unavailable', '영상을 준비하지 못했어요. 다시 시도해 주세요.'));
      };
      worker.onmessageerror = () => finish(fail('processing_failed', '영상을 준비하지 못했어요. 다시 시도해 주세요.'));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      worker.postMessage({ file }); // Blob structured cloning shares immutable file bytes.
    } catch (error) {
      finish(fail('worker_unavailable', '영상 준비 도구를 시작하지 못했어요.', error));
    }
  });
}

function waitVideoEvent(video, eventName, signal, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const finish = error => {
      clearTimeout(timer);
      video.removeEventListener(eventName, onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(fail('poster_failed', '영상의 미리보기를 만들지 못했어요. 다른 영상으로 골라 주세요.'));
    const onAbort = () => finish(aborted());
    const timer = setTimeout(onError, timeout);
    video.addEventListener(eventName, onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function makePoster(blob, duration, signal) {
  checkAbort(signal);
  if (!globalThis.document) throw fail('poster_failed', '영상 미리보기를 만들 수 없어요. 브라우저에서 다시 시도해 주세요.');
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText = 'position:fixed;left:-10px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  try {
    const loaded = waitVideoEvent(video, 'loadeddata', signal);
    video.src = url;
    video.load();
    await loaded;
    checkAbort(signal);
    // A short seek avoids many black opening frames; no playback or sound is started.
    const time = Math.min(0.1, duration / 2);
    if (time > 0) {
      const sought = waitVideoEvent(video, 'seeked', signal);
      video.currentTime = time;
      await sought;
    }
    checkAbort(signal);
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw fail('poster_failed', '영상의 미리보기를 만들지 못했어요.');
    const scale = Math.min(1, CARD_VIDEO_LIMITS.maxPosterLongEdge / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw fail('poster_failed', '영상의 미리보기를 만들지 못했어요.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const poster = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    canvas.width = canvas.height = 1;
    checkAbort(signal);
    if (!poster || poster.type !== 'image/jpeg' || poster.size > CARD_VIDEO_LIMITS.maxPosterBytes) {
      throw fail('poster_failed', '영상의 미리보기를 만들지 못했어요.');
    }
    return poster;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {File|Blob} file
 * @param {{signal?: AbortSignal, onProgress?: (event: {phase: string, progress: number}) => void}} options
 * @returns {Promise<{blob: Blob, posterBlob: Blob, duration: number, width: number, height: number,
 * mimeType: string, method: 'remux'|'transcode', originalBytes: number, hasAudio: boolean}>}
 */
export async function prepareCardVideo(file, { signal, onProgress } = {}) {
  validateFile(file);
  checkAbort(signal);
  const report = reporter(onProgress);
  report('loading', 0);
  let result;
  if (typeof Worker === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      result = await prepareInWorker(file, signal, report);
    } catch (error) {
      // Only retry a worker that never started; do not repeat an expensive failed encode.
      if (error.code !== 'worker_unavailable' || signal?.aborted) throw error;
    }
  }
  if (!result) result = await prepareCardVideoData(file, { signal, onProgress: event => report(event.phase, event.progress) });
  checkAbort(signal);
  report('poster', 0.95);
  const posterBlob = await makePoster(result.blob, result.duration, signal);
  checkAbort(signal);
  report('done', 1);
  return { ...result, posterBlob };
}
