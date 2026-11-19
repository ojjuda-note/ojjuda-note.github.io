// CC0 recorded paper/card and tabletop foley from the site's existing sample bank.
// Source: Kenney Casino Audio / Impact Sounds; ../drinking/audio/README.md.
// No oscillators, generated tones, music, speech services, or electronic cues.
const BANK_URL = new URL('../drinking/audio/table-foley-v1.wav?v=2', import.meta.url);
const CLIPS = Object.freeze({
  tap: [0, .09646, .35],
  deal: [.12646, .49904, .32],
  draw: [.12646, .49904, .38],
  play: [.65550, .23742, .58],
  flip: [.65550, .23742, .5],
  turn: [1.04242, .25004, .25],
  onecard: [3.51450, .17671, .42],
  win: [1.48375, .29342, .45],
  end: [.65550, .23742, .28],
});

export function createOnecardSound({ fetchAudio = (...args) => fetch(...args), contextFactory } = {}) {
  let context, master, buffer, fetching, decoding, enabled = true, disposed = false, generation = 0;
  let lastDeal = -Infinity;
  const active = new Set();
  try { enabled = localStorage.getItem('oj.onecard.sound') !== 'off'; } catch {}

  function bytes() {
    if (fetching) return fetching;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetching = fetchAudio(BANK_URL, { signal: controller.signal, credentials: 'same-origin' })
      .then(response => { if (!response.ok) throw new Error('foley unavailable'); return response.arrayBuffer(); })
      .catch(() => { fetching = null; return null; })
      .finally(() => clearTimeout(timeout));
    return fetching;
  }
  async function load() {
    if (buffer) return buffer;
    if (!context) return null;
    if (!decoding) decoding = bytes().then(data => data && context.decodeAudioData(data.slice(0)))
      .then(value => { buffer = value; return value; }).catch(() => null).finally(() => { decoding = null; });
    return decoding;
  }
  async function unlock() {
    if (!enabled || disposed) return false;
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!contextFactory && !Audio) return false;
        context = contextFactory ? contextFactory() : new Audio();
        master = context.createGain(); master.gain.value = .7; master.connect(context.destination);
      }
      const resume = context.state === 'running' ? Promise.resolve() : context.resume();
      await Promise.all([resume, load()]);
      return context.state === 'running' && !!buffer;
    } catch { return false; }
  }
  function stop() {
    generation++;
    for (const source of [...active]) { try { source.stop(); } catch {} }
    active.clear();
  }
  function play(kind, { pan = 0, volume = 1 } = {}) {
    const clip = CLIPS[kind];
    if (!enabled || disposed || !clip || !buffer || context?.state !== 'running' || globalThis.document?.hidden) return false;
    const now = context.currentTime;
    // Several cards can be in flight together; bound sound layering, not motion.
    if (kind === 'deal' && now - lastDeal < .065) return false;
    if (kind === 'deal') lastDeal = now;
    try {
      while (active.size >= 10) {
        const oldest = active.values().next().value; active.delete(oldest); try { oldest.stop(); } catch {}
      }
      const [offset, duration, level] = clip;
      const source = context.createBufferSource(), gain = context.createGain();
      const panner = context.createStereoPanner?.();
      source.buffer = buffer;
      gain.gain.value = Math.max(0, Math.min(1, volume)) * level;
      source.connect(gain);
      if (panner) { panner.pan.value = Math.max(-.65, Math.min(.65, pan)); gain.connect(panner); panner.connect(master); }
      else gain.connect(master);
      active.add(source);
      source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect(); panner?.disconnect(); };
      source.start(now, offset, duration);
      return true;
    } catch { return false; }
  }
  function setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem('oj.onecard.sound', enabled ? 'on' : 'off'); } catch {}
    if (!enabled) stop(); else void unlock();
    return enabled;
  }
  function visibility() { if (document.hidden) stop(); }
  function dispose() {
    if (disposed) return;
    disposed = true; stop();
    globalThis.document?.removeEventListener('visibilitychange', visibility);
    try { context?.close()?.catch(() => {}); } catch {}
  }
  globalThis.document?.addEventListener('visibilitychange', visibility);
  if (enabled) void bytes();
  return Object.freeze({ unlock, play, setEnabled, stop, dispose, get enabled() { return enabled; } });
}
