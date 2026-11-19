// Binary validation runs on the server; no browser-supplied duration, dimensions,
// codec name or MIME label is authoritative. Decoding is deliberately unnecessary.
export const LIMITS = Object.freeze({ videoBytes: 20 * 1024 * 1024, posterBytes: 512 * 1024,
  seconds: 60, longSide: 1280, shortSide: 720, fps: 30.1, posterSide: 640 });

export class VideoValidationError extends Error {
  constructor(reason = 'invalid_video') { super(reason); this.name = 'VideoValidationError'; }
}
const requireValid = (condition, reason) => { if (!condition) throw new VideoValidationError(reason); };
const asBytes = value => value instanceof Uint8Array ? value : new Uint8Array(value);
const u32 = (b, i) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(i);
const typeAt = (b, i) => String.fromCharCode(...b.subarray(i, i + 4));

// Reject oversized/fragmented/deep box structures before the general demuxer
// reads sample tables. Client output is a finite fast-start, nonfragmented MP4.
export function inspectMp4Structure(value) {
  const b = asBytes(value);
  requireValid(b.length > 32 && b.length <= LIMITS.videoBytes, 'video_size');
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);
  const widths = { stts: 8, ctts: 8, stsc: 12, stco: 4, co64: 8, stss: 4 };
  let boxes = 0, moov = -1, mdat = -1, tracks = 0, ftyp = false;
  function walk(start, end, depth) {
    requireValid(depth <= 8, 'mp4_depth');
    for (let i = start; i < end;) {
      requireValid(i + 8 <= end && ++boxes <= 512, 'mp4_boxes');
      const type = typeAt(b, i + 4);
      let size = u32(b, i), header = 8;
      if (size === 1) {
        requireValid(i + 16 <= end && u32(b, i + 8) === 0, 'mp4_size');
        size = u32(b, i + 12); header = 16;
      }
      requireValid(size >= header && i + size <= end, 'mp4_size');
      const data = i + header, length = size - header;
      requireValid(type !== 'moof' && type !== 'mvex' && type !== 'sinf', 'mp4_unsupported');
      if (!depth && type === 'ftyp') {
        requireValid(!ftyp && length >= 8 && length <= 128, 'mp4_brand'); ftyp = true;
      }
      if (!depth && type === 'moov') {
        requireValid(moov < 0 && size <= 1024 * 1024, 'mp4_header'); moov = i;
      }
      if (!depth && type === 'mdat') {
        requireValid(mdat < 0 && length > 0, 'mp4_data'); mdat = i;
      }
      if (type === 'trak') requireValid(++tracks <= 2, 'video_tracks');
      if (type === 'stsz') {
        requireValid(length >= 12, 'mp4_samples');
        const count = u32(b, data + 8), uniform = u32(b, data + 4);
        requireValid(count > 0 && count <= 8192 && (uniform > 0 || 12 + count * 4 <= length), 'mp4_samples');
      }
      if (type === 'stz2') throw new VideoValidationError('mp4_samples');
      if (widths[type]) {
        requireValid(length >= 8, 'mp4_samples');
        const count = u32(b, data + 4);
        requireValid(count <= 8192 && 8 + count * widths[type] <= length, 'mp4_samples');
      }
      if (type === 'stsd') requireValid(length >= 8 && u32(b, data + 4) === 1, 'video_descriptions');
      if (type === 'elst') {
        requireValid(length >= 8, 'mp4_edits');
        const count = u32(b, data + 4), width = b[data] === 1 ? 20 : 12;
        requireValid(b[data] <= 1 && count <= 2 && 8 + count * width <= length, 'mp4_edits');
      }
      if (containers.has(type)) walk(data, i + size, depth + 1);
      i += size;
    }
  }
  walk(0, b.length, 0);
  requireValid(ftyp && moov >= 0 && mdat > moov && tracks >= 1, 'mp4_fast_start');
}

export function inspectJpeg(value) {
  const b = asBytes(value);
  requireValid(b.length > 16 && b.length <= LIMITS.posterBytes && b[0] === 255 && b[1] === 216
    && b.at(-2) === 255 && b.at(-1) === 217, 'poster_type');
  let dimensions;
  for (let i = 2, markers = 0; i + 4 < b.length;) {
    requireValid(b[i++] === 255 && ++markers <= 128, 'poster_structure');
    while (b[i] === 255) i++;
    const marker = b[i++];
    if (marker === 218) { requireValid(!!dimensions, 'poster_dimensions'); return dimensions; }
    requireValid(marker !== 216 && marker !== 217 && marker !== 0, 'poster_structure');
    const length = b[i] * 256 + b[i + 1];
    requireValid(length >= 2 && i + length <= b.length, 'poster_structure');
    if (marker === 192 || marker === 194) {
      const height = b[i + 3] * 256 + b[i + 4], width = b[i + 5] * 256 + b[i + 6];
      requireValid(!dimensions && length >= 8 && b[i + 2] === 8 && [1, 3].includes(b[i + 7])
        && width > 0 && height > 0 && Math.max(width, height) <= LIMITS.posterSide, 'poster_dimensions');
      dimensions = { width, height };
    } else if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      throw new VideoValidationError('poster_encoding');
    }
    i += length;
  }
  throw new VideoValidationError('poster_structure');
}

// A forged avc1 sample description can claim 720p while its H.264 SPS requests
// a much larger decode surface. Read the bounded SPS bitstream as well.
export function inspectSps(nal) {
  requireValid(nal.length >= 5 && nal.length <= 4096 && (nal[0] & 31) === 7, 'avc_sps');
  const data = [];
  for (let i = 1; i < nal.length; i++) {
    if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
    data.push(nal[i]);
  }
  let at = 0;
  function bits(n) {
    requireValid(n <= 32 && at + n <= data.length * 8, 'avc_sps');
    let value = 0;
    while (n--) value = value * 2 + ((data[at >> 3] >> (7 - (at++ & 7))) & 1);
    return value;
  }
  function ue() {
    let zeros = 0;
    while (!bits(1)) requireValid(++zeros <= 24, 'avc_sps');
    return 2 ** zeros - 1 + bits(zeros);
  }
  const se = () => { const v = ue(); return v % 2 ? (v + 1) / 2 : -v / 2; };
  const profile = bits(8); bits(8); bits(8); ue();
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135, 144].includes(profile)) {
    requireValid(ue() === 1 && ue() === 0 && ue() === 0, 'avc_chroma');
    bits(1);
    if (bits(1)) for (let i = 0; i < 8; i++) if (bits(1)) {
      let last = 8, next = 8;
      for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
        if (next) next = (last + se() + 256) % 256;
        last = next || last;
      }
    }
  }
  ue();
  const order = ue();
  requireValid(order <= 2, 'avc_sps');
  if (order === 0) ue();
  else if (order === 1) { bits(1); se(); se(); const count = ue(); requireValid(count <= 256, 'avc_sps'); for (let i = 0; i < count; i++) se(); }
  ue(); bits(1);
  const rawWidth = (ue() + 1) * 16, mapHeight = ue() + 1, progressive = bits(1);
  requireValid(progressive === 1, 'avc_interlaced');
  const rawHeight = mapHeight * 16;
  bits(1);
  let left = 0, right = 0, top = 0, bottom = 0;
  if (bits(1)) { left = ue(); right = ue(); top = ue(); bottom = ue(); }
  const width = rawWidth - 2 * (left + right), height = rawHeight - 2 * (top + bottom);
  requireValid(width > 0 && height > 0 && Math.max(rawWidth, rawHeight) <= 1280
    && Math.min(rawWidth, rawHeight) <= 736 && Math.max(width, height) <= 1280
    && Math.min(width, height) <= 720, 'video_dimensions');
  return { width, height };
}

function avcConfiguration(config, width, height) {
  const b = asBytes(config?.description || []);
  requireValid(b.length >= 8 && b.length <= 65536 && b[0] === 1, 'avc_config');
  const sizeBytes = (b[4] & 3) + 1, count = b[5] & 31;
  requireValid(count >= 1 && count <= 8 && sizeBytes !== 3, 'avc_config');
  let i = 6;
  for (let n = 0; n < count; n++) {
    requireValid(i + 2 <= b.length, 'avc_config');
    const length = b[i] * 256 + b[i + 1]; i += 2;
    requireValid(i + length <= b.length, 'avc_config');
    const dimensions = inspectSps(b.subarray(i, i + length));
    requireValid(dimensions.width === width && dimensions.height === height, 'avc_dimensions'); i += length;
  }
  requireValid(i < b.length, 'avc_config');
  const ppsCount = b[i++]; requireValid(ppsCount > 0 && ppsCount <= 16, 'avc_config');
  for (let n = 0; n < ppsCount; n++) {
    requireValid(i + 2 <= b.length, 'avc_config'); const length = b[i] * 256 + b[i + 1]; i += 2;
    requireValid(length > 0 && i + length <= b.length && (b[i] & 31) === 8, 'avc_config'); i += length;
  }
  return sizeBytes;
}

function inspectAvcPacket(b, sizeBytes, width, height) {
  let picture = false, key = false;
  for (let i = 0, count = 0; i < b.length;) {
    requireValid(i + sizeBytes <= b.length && ++count <= 256, 'avc_packet');
    let length = 0;
    for (let j = 0; j < sizeBytes; j++) length = length * 256 + b[i++];
    requireValid(length > 0 && i + length <= b.length && (b[i] & 128) === 0, 'avc_packet');
    const type = b[i] & 31;
    requireValid(type >= 1 && type <= 23, 'avc_packet');
    if (type === 7) { const s = inspectSps(b.subarray(i, i + length)); requireValid(s.width === width && s.height === height, 'avc_dimensions'); }
    if (type === 1 || type === 5) picture = true;
    if (type === 5) key = true;
    i += length;
  }
  requireValid(picture, 'avc_picture'); return key;
}

export function inspectTransform(matrix) {
  requireValid(Array.isArray(matrix) && matrix.length === 9 && matrix.every(Number.isFinite), 'video_transform');
  const near = (a, b) => Math.abs(a - b) <= 0.0001;
  // MP4/Mediabunny stores [a,b,u,c,d,v,x,y,w]: u/v are perspective,
  // x/y are translation (row-vector affine convention).
  const [a, b, p, c, d, q, tx, ty, w] = matrix;
  requireValid([a, b, c, d].every(x => near(x, 0) || near(Math.abs(x), 1))
    && near(a * a + b * b, 1) && near(c * c + d * d, 1) && near(a * c + b * d, 0)
    && Math.abs(p) < 1e-8 && Math.abs(q) < 1e-8 && Math.abs(w - 1) < 1e-8
    && Math.abs(tx) <= LIMITS.longSide && Math.abs(ty) <= LIMITS.longSide, 'video_transform');
}

export function inspectPosterAspect(poster, width, height) {
  // Tiny/panoramic images round their short side to whole pixels. Comparing
  // ratios magnifies that harmless rounding; compare the expected pixels.
  const scale = Math.max(poster.width, poster.height) / Math.max(width, height);
  requireValid(Math.abs(poster.width - width * scale) <= 1
    && Math.abs(poster.height - height * scale) <= 1, 'poster_aspect');
}

export function createVideoValidator({ Input, BufferSource, MP4, EncodedPacketSink }) {
  return async function validate(videoBytes, posterBytes) {
    const b = asBytes(videoBytes), poster = inspectJpeg(posterBytes);
    inspectMp4Structure(b);
    const input = new Input({ source: new BufferSource(b), formats: [MP4] });
    try {
      const tracks = await input.getTracks(), videos = await input.getVideoTracks(), audios = await input.getAudioTracks();
      requireValid(videos.length === 1 && audios.length <= 1 && tracks.length === videos.length + audios.length, 'video_tracks');
      const video = videos[0];
      requireValid(await video.getCodec() === 'avc', 'video_codec');
      const [width, height, codedWidth, codedHeight, rotation, config, matrix] = await Promise.all([
        video.getDisplayWidth(), video.getDisplayHeight(), video.getCodedWidth(), video.getCodedHeight(),
        video.getRotation(), video.getDecoderConfig(), video.getTransformationMatrix()
      ]);
      // getRotation() intentionally rounds to a quarter turn. Inspect the raw
      // transform too, so hidden scale/shear/perspective cannot bypass bounds.
      inspectTransform(matrix);
      for (const pair of [[width, height], [codedWidth, codedHeight]]) requireValid(pair.every(Number.isInteger)
        && Math.min(...pair) > 0 && Math.max(...pair) <= LIMITS.longSide && Math.min(...pair) <= LIMITS.shortSide, 'video_dimensions');
      requireValid([0, 90, 180, 270].includes(((rotation % 360) + 360) % 360), 'video_rotation');
      const sizeBytes = avcConfiguration(config, codedWidth, codedHeight);
      inspectPosterAspect(poster, width, height);
      let end = 0, videoEnd = 0;
      for (const track of tracks) {
        const isVideo = track === video;
        if (!isVideo) {
          requireValid(await track.getCodec() === 'aac', 'audio_codec');
          const c = await track.getDecoderConfig();
          requireValid(c && /^mp4a[.]40[.](2|5|29)$/.test(c.codec)
            && c.sampleRate >= 8000 && c.sampleRate <= 48000 && c.numberOfChannels >= 1 && c.numberOfChannels <= 2, 'audio_config');
        }
        let count = 0, first = Infinity, last = 0, bytes = 0;
        const sink = new EncodedPacketSink(track);
        for await (const packet of sink.packets()) {
          requireValid(++count <= (isVideo ? 1802 : 6000) && Number.isFinite(packet.timestamp)
            && Number.isFinite(packet.duration) && packet.timestamp >= (isVideo ? -0.00001 : -0.1) && packet.duration > 0
            && packet.byteLength > 0, 'video_timeline');
          first = Math.min(first, packet.timestamp); last = Math.max(last, packet.timestamp + packet.duration);
          bytes += packet.byteLength;
          requireValid(last < LIMITS.seconds && bytes <= b.length, 'video_duration');
          if (isVideo) {
            const key = inspectAvcPacket(packet.data, sizeBytes, codedWidth, codedHeight);
            if (count === 1) requireValid(key, 'video_first_frame');
          }
        }
        requireValid(count > 0 && first <= 0.1 && last > first, 'video_timeline');
        if (isVideo) { requireValid(count / (last - first) <= LIMITS.fps, 'video_framerate'); videoEnd = last; }
        end = Math.max(end, last);
      }
      requireValid(end - videoEnd <= 0.15, 'audio_duration');
      const digest = await crypto.subtle.digest('SHA-256', b);
      const sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
      return { duration: end, width, height, bytes: b.length, sha256 };
    } catch (error) {
      if (error instanceof VideoValidationError) throw error;
      const wrapped = new VideoValidationError('video_parse'); wrapped.cause = error; throw wrapped;
    } finally { input.dispose(); }
  };
}
