// A short, skippable ritual before the overall reading. No network or billing.
const DURATION = 3000;
const REDUCED_DURATION = 500;
const ART = { width: 1672, height: 941, x: 1395, y: 690, diameter: 275 };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export class TarotRevelation {
  constructor() {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'revelation-dialog';
    this.dialog.setAttribute('aria-label', '마녀가 수정구에서 당신의 이야기를 읽고 있어요');
    this.dialog.innerHTML = `
      <div class="revelation-world" aria-hidden="true">
        <img class="revelation-art" src="./assets/scene.webp" alt="" draggable="false">
        <div class="revelation-shade"></div>
        <div class="revelation-magic">
          <div class="revelation-halo"></div>
          <div class="revelation-rays"></div>
          <svg class="revelation-sigil revelation-sigil-outer" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="113"/><circle cx="120" cy="120" r="106" stroke-dasharray="1 8"/>
            <path d="M120 16 210 172H30ZM120 224 30 68h180Z"/>
            <path d="M120 3v13m0 208v13M3 120h13m208 0h13M37 37l9 9m148 148 9 9M37 203l9-9M194 46l9-9"/>
            <circle cx="120" cy="7" r="2"/><circle cx="233" cy="120" r="2"/><circle cx="120" cy="233" r="2"/><circle cx="7" cy="120" r="2"/>
          </svg>
          <svg class="revelation-sigil revelation-sigil-inner" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="89"/><circle cx="120" cy="120" r="94" stroke-dasharray="24 10 2 10"/>
            <path d="m120 18 7 16-7 16-7-16Zm0 172 7 16-7 16-7-16ZM18 120l16-7 16 7-16 7Zm172 0 16-7 16 7-16 7Z"/>
          </svg>
          <div class="revelation-sparks"></div>
          <div class="revelation-core"></div>
          <div class="revelation-shockwave"></div>
        </div>
      </div>
      <div class="revelation-bloom" aria-hidden="true"></div>
      <div class="revelation-letterbox" aria-hidden="true"></div>
      <div class="revelation-copy" role="status" aria-live="polite" aria-atomic="true">
        <span class="revelation-kicker">달의 마녀 · 루나</span>
        <p class="revelation-caption">마녀가 별빛에 귀를 기울여요</p>
        <span class="revelation-whisper">잠시, 당신의 이야기를 기다려 보세요.</span>
      </div>
      <button type="button" class="revelation-skip" autofocus>건너뛰기 <span aria-hidden="true">→</span></button>`;
    document.body.append(this.dialog);
    this.art = this.dialog.querySelector('.revelation-art');
    this.caption = this.dialog.querySelector('.revelation-caption');
    this.whisper = this.dialog.querySelector('.revelation-whisper');
    this.skip = this.dialog.querySelector('.revelation-skip');
    this.sparks = this.dialog.querySelector('.revelation-sparks');
    this._timers = new Set();
    this._promise = null;
    this._resolve = null;
    this._lastFocus = null;
    this._destroyed = false;
    // A bounded set of particles keeps the ritual light on a phone.
    for (let i = 0; i < 28; i++) {
      const spark = document.createElement('i');
      spark.style.setProperty('--spark-angle', `${i * 137.508}deg`);
      spark.style.setProperty('--spark-distance', String((130 + (i * 47) % 170) / 100));
      spark.style.setProperty('--spark-delay', `${100 + (i % 14) * 57}ms`);
      spark.style.setProperty('--spark-time', `${1300 + (i % 5) * 110}ms`);
      spark.style.setProperty('--spark-size', `${i % 4 === 0 ? 4 : 2}px`);
      this.sparks.append(spark);
    }
    this.skip.addEventListener('click', () => this._finish(true));
    this.dialog.addEventListener('cancel', event => {
      event.preventDefault();
      this._finish(true);
    });
    this.dialog.addEventListener('close', () => { if (!this.dialog.open) this._finish(false); });
    this._resize = () => { if (this._resolve) this._layout(); };
    this._pagehide = () => this.cancel();
    this._visibility = () => { if (document.hidden) this.cancel(); };
    window.addEventListener('resize', this._resize, { passive: true });
    window.addEventListener('pagehide', this._pagehide);
    document.addEventListener('visibilitychange', this._visibility);
  }

  _layout() {
    const bounds = this.dialog.getBoundingClientRect();
    const width = bounds.width || window.innerWidth;
    const height = bounds.height || window.innerHeight;
    const scale = Math.max(width / ART.width, height / ART.height);
    const artWidth = ART.width * scale;
    const artHeight = ART.height * scale;
    const portrait = width / height < 1.12;
    const desiredX = width * (portrait ? .51 : .82);
    const left = clamp(desiredX - ART.x * scale, width - artWidth, 0);
    const top = (height - artHeight) / 2;
    this.dialog.classList.toggle('is-portrait', portrait);
    Object.assign(this.art.style, { width: `${artWidth}px`, height: `${artHeight}px`, left: `${left}px`, top: `${top}px` });
    this.dialog.style.setProperty('--orb-x', `${left + ART.x * scale}px`);
    this.dialog.style.setProperty('--orb-y', `${top + ART.y * scale}px`);
    this.dialog.style.setProperty('--orb-size', `${ART.diameter * scale}px`);
  }

  _later(callback, delay) {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (this._resolve) callback();
    }, delay);
    this._timers.add(timer);
  }

  play({ reducedMotion = false, onCue = () => {} } = {}) {
    if (this._promise) return this._promise;
    if (this._destroyed) return Promise.resolve(false);
    const reduced = Boolean(reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const cue = name => { try { onCue(name); } catch { /* Sound must never block the reading. */ } };
    this._lastFocus = document.activeElement;
    this.caption.textContent = '마녀가 별빛에 귀를 기울여요';
    this.whisper.textContent = '잠시, 당신의 이야기를 기다려 보세요.';
    this.dialog.dataset.stage = 'gather';
    this.dialog.classList.toggle('is-reduced', reduced);
    this._promise = new Promise(resolve => { this._resolve = resolve; });
    const result = this._promise;
    try {
      this.dialog.showModal();
      this._layout();
      // Restart only once per play; subsequent animation is CSS, without a RAF loop.
      void this.dialog.offsetWidth;
      this.dialog.classList.add('is-running');
      this.skip.focus({ preventScroll: true });
    } catch {
      this._finish(false);
      return result;
    }
    if (!reduced) cue('gather');
    this._later(() => {
      this.dialog.dataset.stage = 'receive';
      this.caption.textContent = '당신의 이야기가 빛나기 시작해요';
      this.whisper.textContent = '수정구에 담긴 속삭임을 전해 드릴게요.';
    }, reduced ? 120 : 1450);
    if (!reduced) this._later(() => {
      this.dialog.dataset.stage = 'reveal';
      cue('reveal');
    }, 2350);
    this._later(() => this._finish(true), reduced ? REDUCED_DURATION : DURATION);
    return result;
  }

  _finish(completed) {
    if (!this._resolve) return;
    const resolve = this._resolve;
    this._resolve = null;
    this._promise = null;
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    this.dialog.classList.remove('is-running');
    if (this.dialog.open) this.dialog.close();
    const focus = this._lastFocus;
    this._lastFocus = null;
    if (!document.hidden && focus?.isConnected) {
      try { focus.focus({ preventScroll: true }); } catch { /* The caller may have replaced its screen. */ }
    }
    resolve(Boolean(completed));
  }

  cancel() { this._finish(false); }

  destroy() {
    this.cancel();
    this._destroyed = true;
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('pagehide', this._pagehide);
    document.removeEventListener('visibilitychange', this._visibility);
    this.dialog.remove();
  }
}
