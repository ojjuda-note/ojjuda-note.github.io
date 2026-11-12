/* Moonlit Tarot — dependency-free atmospheric effects and gentle ritual audio. */

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rand = (min, max) => min + Math.random() * (max - min);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/** Coordinates accepted by burst/trail are viewport CSS pixels. */
export class TarotFX {
  constructor({ canvas, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d', { alpha: true }) || null;
    this.reducedMotion = Boolean(reducedMotion);
    this.mood = 'idle';
    this.particles = [];
    this.rings = [];
    this.stars = [];
    this.sprites = new Map();
    this.time = 0;
    this.intensity = 0.75;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.maxParticles = 450;
    this._raf = null;
    this._lastFrame = 0;
    this._trailWindowStart = -Infinity;
    this._trailPoints = [];
    this._destroyed = false;
    this._tick = this._tick.bind(this);
    this._onResize = this.resize.bind(this);
    this._onVisibility = () => {
      if (document.hidden) {
        if (this._raf !== null) cancelAnimationFrame(this._raf);
        this._raf = null;
        this._lastFrame = 0;
      } else {
        this._start();
      }
    };
    if (!this.ctx) return;
    Object.assign(this.canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });
    this.canvas.setAttribute('aria-hidden', 'true');
    window.addEventListener('resize', this._onResize, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility);
    this.resize();
    this._start();
  }

  resize() {
    if (!this.ctx || this._destroyed) return;
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.width < 700 ? 1.5 : 1.75);
    this.maxParticles = this.width < 700 ? 290 : 530;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const count = clamp(Math.floor((this.width * this.height) / 13000), 36, 100);
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: rand(0.35, 1.35),
      phase: rand(0, TAU),
      speed: rand(0.12, 0.46),
      drift: rand(1.5, 5),
      glow: Math.random() < 0.19,
      gold: Math.random() < 0.29,
    }));
    this._start();
  }

  setMood(mode) {
    this.mood = mode || 'idle';
    this._start();
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
    this.particles.length = 0;
    this.rings.length = 0;
    this._lastFrame = 0;
    this._start();
  }

  _start() {
    if (!this.ctx || this._destroyed || document.hidden || this._raf !== null) return;
    this._raf = requestAnimationFrame(this._tick);
  }

  _sprite(color) {
    if (this.sprites.has(color)) return this.sprites.get(color);
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const context = sprite.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.08, color);
    gradient.addColorStop(0.25, color);
    gradient.addColorStop(1, 'transparent');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    // Keep the cache bounded even if a caller supplies many different colors.
    if (this.sprites.size > 24) this.sprites.delete(this.sprites.keys().next().value);
    this.sprites.set(color, sprite);
    return sprite;
  }

  _addParticle(particle) {
    if (this.particles.length >= this.maxParticles) this.particles.shift();
    this.particles.push(particle);
  }

  burst(x, y, { color = '#d9b67a', power = 1, kind = 'reveal' } = {}) {
    if (!this.ctx || this._destroyed || !Number.isFinite(x) || !Number.isFinite(y)) return;
    power = clamp(Number(power) || 1, 0.2, 2.3);
    const mobileScale = this.width < 700 ? 0.72 : 1;
    const isReveal = kind === 'reveal';
    const isDiscard = kind === 'discard';
    const isLand = kind === 'land';
    const budget = this.reducedMotion ? 7 : Math.floor((isReveal ? 145 : isDiscard ? 78 : isLand ? 36 : 16) * power * mobileScale);
    const sprite = this._sprite(color);
    const secondColor = isDiscard ? '#be82ff' : '#fff1c4';
    const secondSprite = this._sprite(secondColor);

    for (let i = 0; i < budget; i++) {
      const angle = rand(0, TAU);
      const speed = this.reducedMotion ? rand(3, 12) : rand(isReveal ? 60 : 20, isReveal ? 390 : 190) * power;
      const life = this.reducedMotion ? rand(0.25, 0.45) : rand(0.55, isReveal ? 2.2 : 1.35);
      const isRay = !this.reducedMotion && i % 5 === 0;
      this._addParticle({
        x: x + rand(-5, 5), y: y + rand(-5, 5),
        px: x, py: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * (isLand ? 0.45 : 1) - (isDiscard ? 50 : 0),
        life, maxLife: life,
        radius: rand(1.1, isRay ? 3.5 : 2.8) * power,
        drag: isRay ? 1.3 : 2,
        gravity: isDiscard ? -45 : isLand ? 45 : 19,
        type: isRay ? 'ray' : 'spark',
        color: i % 3 ? color : secondColor,
        sprite: i % 3 ? sprite : secondSprite,
        spin: rand(-3, 3),
        phase: rand(0, TAU),
      });
    }

    if (!this.reducedMotion && (isReveal || isDiscard)) {
      // Broad, translucent blooms make the sparks read as a magical release.
      for (let i = 0; i < (isReveal ? 9 : 5); i++) {
        const angle = rand(0, TAU);
        const life = rand(0.8, 1.7);
        this._addParticle({
          x: x + rand(-22, 22), y: y + rand(-22, 22), px: x, py: y,
          vx: Math.cos(angle) * rand(25, 80), vy: Math.sin(angle) * rand(20, 65) - 25,
          life, maxLife: life,
          radius: rand(45, 95) * power, drag: 0.6, gravity: -8,
          type: 'cloud', color, sprite,
          phase: rand(0, TAU), spin: 0,
        });
      }
    }

    if (!this.reducedMotion && kind !== 'spark') {
      const base = isReveal ? 145 : isDiscard ? 85 : 65;
      this.rings.push({
        x, y, age: 0,
        duration: isReveal ? 1.6 : 0.85,
        maxRadius: Math.min(base * power, this.width * 0.42),
        color,
        type: isReveal ? 'seal' : 'ring',
        rotation: rand(0, TAU),
        power,
      });
      if (isReveal) {
        this.rings.push({
          x, y, age: -0.05,
          duration: 1.1,
          maxRadius: Math.max(this.width, this.height) * 0.72,
          color, type: 'shockwave', rotation: 0, power,
        });
        this.rings.push({
          x, y, age: -0.15,
          duration: 1.9,
          maxRadius: Math.min(220 * power, this.width * 0.49),
          color: '#f3d497', type: 'orbit', rotation: rand(0, TAU), power,
        });
      }
      if (this.rings.length > 14) this.rings.splice(0, this.rings.length - 14);
    }
    this._start();
  }

  trail(x, y, color = '#d9b67a') {
    if (!this.ctx || this._destroyed || this.reducedMotion || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = performance.now();
    // Five moving cards share this instance. Throttle a spatial batch rather
    // than every call, so the first card cannot consume all emission slots.
    if (now - this._trailWindowStart >= 30) {
      this._trailWindowStart = now;
      this._trailPoints.length = 0;
    }
    if (this._trailPoints.length >= 5) return;
    if (this._trailPoints.some(point => (point.x - x) ** 2 + (point.y - y) ** 2 < 144)) return;
    this._trailPoints.push({ x, y });
    const sprite = this._sprite(color);
    for (let i = 0; i < 3; i++) {
      const life = rand(0.3, 0.7);
      this._addParticle({
        x: x + rand(-8, 8), y: y + rand(-8, 8), px: x, py: y,
        vx: rand(-14, 14), vy: rand(-12, 26),
        life, maxLife: life, radius: rand(0.9, 2.6),
        drag: 1.8, gravity: -9, type: 'spark',
        color, sprite, phase: rand(0, TAU), spin: rand(-2, 2),
      });
    }
    this._start();
  }

  _drawAtmosphere(ctx) {
    const t = this.reducedMotion ? 0 : this.time;
    ctx.globalCompositeOperation = 'lighter';
    for (const star of this.stars) {
      const twinkle = 0.35 + (Math.sin(t * star.speed + star.phase) + 1) * 0.22;
      const x = star.x * this.width + Math.sin(t * 0.07 + star.phase) * star.drift;
      const y = ((star.y * this.height - t * star.drift * 0.35) % this.height + this.height) % this.height;
      ctx.globalAlpha = twinkle * this.intensity;
      ctx.fillStyle = star.gold ? '#e6c38c' : '#c7b3ed';
      ctx.beginPath();
      ctx.arc(x, y, star.radius, 0, TAU);
      ctx.fill();
      if (star.glow) {
        const size = star.radius * 11;
        ctx.globalAlpha *= 0.38;
        ctx.drawImage(this._sprite(star.gold ? '#d9b67a' : '#a886e9'), x - size / 2, y - size / 2, size, size);
        if (twinkle > 0.65) {
          ctx.globalAlpha *= 0.55;
          ctx.fillRect(x - 4, y - 0.4, 8, 0.8);
          ctx.fillRect(x - 0.4, y - 4, 0.8, 8);
        }
      }
    }
  }

  _drawParticles(ctx, dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Swap-removal avoids repeated array shifts while many sparks expire.
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      p.px = p.x; p.py = p.y;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const progress = 1 - p.life / p.maxLife;
      const opacity = Math.pow(1 - progress, 1.4);
      if (p.type === 'cloud') {
        const size = p.radius * (1.2 + progress * 2.5);
        ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.085;
        ctx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
      } else if (p.type === 'ray') {
        const speed = Math.hypot(p.vx, p.vy) || 1;
        const length = Math.min(60, speed * 0.14) * (1 - progress * 0.5);
        const endX = p.x - (p.vx / speed) * length;
        const endY = p.y - (p.vy / speed) * length;
        ctx.globalAlpha = opacity * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.6, p.radius * (1 - progress));
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(endX, endY); ctx.stroke();
        ctx.globalAlpha = opacity * 0.6;
        const size = p.radius * 9;
        ctx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
      } else {
        const flicker = 0.7 + 0.3 * Math.sin(this.time * 14 + p.phase);
        const size = p.radius * (5 + (1 - progress) * 3);
        ctx.globalAlpha = opacity * 0.65 * flicker;
        ctx.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size);
        ctx.globalAlpha = opacity * flicker;
        ctx.fillStyle = '#fff1d9';
        const core = Math.max(0.45, p.radius * (1 - progress) * 0.45);
        ctx.beginPath(); ctx.arc(p.x, p.y, core, 0, TAU); ctx.fill();
      }
    }
  }

  _drawRings(ctx, dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.age += dt;
      if (ring.age < 0) continue;
      const progress = ring.age / ring.duration;
      if (progress >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      const radius = ring.maxRadius * easeOut(progress);
      const fade = Math.pow(1 - progress, 1.7);
      ctx.save();
      ctx.translate(ring.x, ring.y);
      ctx.rotate(ring.rotation + progress * (ring.type === 'orbit' ? -0.6 : 0.3));
      ctx.strokeStyle = ring.color;
      ctx.fillStyle = ring.color;
      if (ring.type === 'shockwave') {
        ctx.globalAlpha = fade * 0.3;
        ctx.lineWidth = 1.5 + 6 * (1 - progress);
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade * 0.08;
        ctx.lineWidth = 16 * (1 - progress);
        ctx.beginPath(); ctx.arc(0, 0, radius * 0.99, 0, TAU); ctx.stroke();
      } else if (ring.type === 'seal') {
        ctx.globalAlpha = fade * 0.75;
        ctx.lineWidth = 1.15;
        for (const factor of [0.78, 0.89, 1]) {
          ctx.beginPath(); ctx.arc(0, 0, radius * factor, 0, TAU); ctx.stroke();
        }
        // Two intersecting triangles and tiny abstract runes form a summoning seal.
        for (let triangle = 0; triangle < 2; triangle++) {
          ctx.beginPath();
          for (let point = 0; point <= 3; point++) {
            const a = (point / 3) * TAU + triangle * Math.PI + Math.PI / 6;
            const px = Math.cos(a) * radius * 0.76;
            const py = Math.sin(a) * radius * 0.76;
            if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        for (let rune = 0; rune < 18; rune++) {
          ctx.save();
          ctx.rotate((rune / 18) * TAU);
          ctx.translate(0, -radius * 0.94);
          const size = Math.max(2.5, radius * 0.033);
          ctx.beginPath();
          ctx.moveTo(0, -size); ctx.lineTo(0, size);
          ctx.moveTo(-size * 0.6, -size * 0.4); ctx.lineTo(size * 0.6, size * 0.4);
          if (rune % 3 === 0) {
            ctx.moveTo(-size * 0.6, size * 0.4); ctx.lineTo(size * 0.6, -size * 0.4);
          }
          ctx.stroke(); ctx.restore();
        }
      } else if (ring.type === 'orbit') {
        ctx.globalAlpha = fade * 0.55;
        ctx.lineWidth = 0.7;
        for (let arc = 0; arc < 3; arc++) {
          const a = (arc / 3) * TAU;
          ctx.beginPath(); ctx.arc(0, 0, radius, a, a + Math.PI * 0.43); ctx.stroke();
          const ox = Math.cos(a) * radius, oy = Math.sin(a) * radius;
          ctx.save(); ctx.translate(ox, oy); ctx.rotate(Math.PI / 4);
          ctx.fillRect(-2, -2, 4, 4); ctx.restore();
        }
      } else {
        ctx.globalAlpha = fade * 0.6;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * 0.32, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade * 0.25;
        ctx.beginPath(); ctx.ellipse(0, 0, radius * 0.7, radius * 0.21, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  }

  _tick(timestamp) {
    this._raf = null;
    if (!this.ctx || this._destroyed || document.hidden) return;
    const dt = this._lastFrame ? clamp((timestamp - this._lastFrame) / 1000, 0.001, 0.04) : 1 / 60;
    this._lastFrame = timestamp;
    if (!this.reducedMotion) this.time += dt;
    const target = { idle: 0.7, dealing: 1.15, discard: 1.05, reveal: 1.35, reading: 0.8 }[this.mood] ?? 0.8;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 2);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this._drawAtmosphere(ctx);
    this._drawRings(ctx, dt);
    this._drawParticles(ctx, dt);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!this.reducedMotion || this.particles.length || this.rings.length) this._start();
    else this._lastFrame = 0;
  }

  destroy() {
    this._destroyed = true;
    if (this._raf !== null) cancelAnimationFrame(this._raf);
    this._raf = null;
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.particles.length = 0;
    this.rings.length = 0;
    this._trailPoints.length = 0;
    this.sprites.clear();
    this.ctx?.clearRect(0, 0, this.width, this.height);
  }
}

/** Audio is never created or played before enable() is called by the UI. */
export class TarotAudio {
  constructor() {
    this.context = null;
    this.enabled = false;
    this.muted = false;
    this.master = null;
    this._voices = new Set();
    this._droneNodes = [];
    this._noiseBuffer = null;
    this._lastPlayed = Object.create(null);
    this._destroyed = false;
    this._enablePromise = null;
  }

  async enable() {
    if (this._destroyed) return false;
    if (this._enablePromise) return this._enablePromise;
    this._enablePromise = this._enable();
    try {
      return await this._enablePromise;
    } finally {
      this._enablePromise = null;
    }
  }

  async _enable() {
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      if (!this.context) {
        this.context = new AudioContextClass({ latencyHint: 'interactive' });
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.24;
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -19;
        compressor.knee.value = 22;
        compressor.ratio.value = 6;
        compressor.attack.value = 0.012;
        compressor.release.value = 0.25;
        this.master.connect(compressor);
        compressor.connect(this.context.destination);
        this._compressor = compressor;
        this._noiseBuffer = this._makeNoise();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.enabled = this.context.state === 'running';
      if (this.enabled && !this._droneNodes.length) this._startDrone();
      return this.enabled;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context?.state !== 'closed') {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, now, 0.08);
    }
    return this.muted;
  }

  _makeNoise() {
    const length = Math.ceil(this.context.sampleRate * 2.5);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      // Slightly colored noise avoids the harshness of a white-noise burst.
      previous = (previous + Math.random() * 0.2 - 0.1) / 1.02;
      channel[i] = previous * 3;
    }
    return buffer;
  }

  _track(source, nodes) {
    if (this._voices.size >= 54) {
      const oldest = this._voices.values().next().value;
      try { oldest.stop(); } catch { /* An ended voice can race its cleanup. */ }
    }
    this._voices.add(source);
    source.onended = () => {
      this._voices.delete(source);
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* Already disconnected. */ }
      }
    };
  }

  _tone(frequency, at, duration, { level = 0.08, type = 'sine', endFrequency, attack = 0.025 } = {}) {
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + Math.min(attack, duration * 0.3));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(this.master);
    this._track(oscillator, [oscillator, envelope]);
    oscillator.start(at); oscillator.stop(at + duration + 0.025);
  }

  _noise(at, duration, { level = 0.1, from = 260, to = 1800, reverse = false } = {}) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this._noiseBuffer;
    filter.type = 'bandpass'; filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(from, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + duration);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(level, at + duration * (reverse ? 0.72 : 0.13));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(this.master);
    this._track(source, [source, filter, envelope]);
    source.start(at); source.stop(at + duration + 0.025);
  }

  _chime(frequency, at, duration = 1.5, level = 0.065) {
    this._tone(frequency, at, duration, { level });
    this._tone(frequency * 2.005, at, duration * 0.55, { level: level * 0.22, attack: 0.008 });
    this._tone(frequency * 3.99, at, duration * 0.32, { level: level * 0.08, attack: 0.006 });
  }

  _startDrone() {
    const ctx = this.context;
    const ambient = ctx.createGain();
    ambient.gain.setValueAtTime(0, ctx.currentTime);
    ambient.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 2.5);
    ambient.connect(this.master);
    this._droneNodes.push(ambient);
    for (const [frequency, detune] of [[110, -5], [164.81, 4], [220, 2]]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency; oscillator.detune.value = detune;
      oscillator.connect(ambient); oscillator.start();
      this._droneNodes.push(oscillator);
    }
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain); lfoGain.connect(ambient.gain); lfo.start();
    this._droneNodes.push(lfo, lfoGain);
  }

  play(name) {
    if (!this.enabled || this.muted || !this.context || this.context.state !== 'running' || this._destroyed) return false;
    const now = this.context.currentTime;
    const gap = name === 'hover' ? 0.11 : name === 'deal' ? 0.055 : 0.08;
    if (now - (this._lastPlayed[name] ?? -Infinity) < gap) return false;
    this._lastPlayed[name] = now;
    const t = now + 0.005;
    switch (name) {
      case 'summon':
        this._noise(t, 1.6, { level: 0.14, from: 180, to: 1500, reverse: true });
        [220, 329.63, 440, 659.25].forEach((f, i) => this._chime(f, t + i * 0.17, 1.8, 0.055));
        this._tone(82.41, t, 1.7, { level: 0.13, endFrequency: 110, attack: 0.5 });
        break;
      case 'deal':
        this._noise(t, 0.26, { level: 0.075, from: 700, to: 1900 });
        this._chime(440 + Math.random() * 220, t + 0.025, 0.45, 0.035);
        break;
      case 'discard':
        this._noise(t, 0.75, { level: 0.12, from: 1800, to: 150 });
        this._tone(330, t, 0.65, { level: 0.065, endFrequency: 82.41 });
        this._chime(880, t + 0.06, 0.65, 0.035);
        break;
      case 'reveal':
        this._noise(t, 1.2, { level: 0.17, from: 180, to: 2600 });
        this._tone(55, t, 1.4, { level: 0.16, endFrequency: 82.41, attack: 0.035 });
        [329.63, 440, 659.25, 880].forEach((f, i) => this._chime(f, t + 0.075 + i * 0.075, 1.8, 0.075));
        this._chime(1318.5, t + 0.36, 1.6, 0.04);
        break;
      case 'complete':
        [220, 329.63, 440, 554.37, 659.25, 880].forEach((f, i) => this._chime(f, t + i * 0.1, 2.3, 0.06));
        this._noise(t, 1.4, { level: 0.08, from: 250, to: 1800, reverse: true });
        break;
      case 'hover':
        this._chime(659.25, t, 0.25, 0.018);
        break;
      default:
        return false;
    }
    return true;
  }

  async destroy() {
    this._destroyed = true;
    this.enabled = false;
    for (const voice of this._voices) {
      try { voice.stop(); } catch { /* Voice may already have ended. */ }
    }
    this._voices.clear();
    for (const node of this._droneNodes) {
      try { node.stop?.(); node.disconnect(); } catch { /* Already stopped. */ }
    }
    this._droneNodes.length = 0;
    try { this.master?.disconnect(); this._compressor?.disconnect(); } catch { /* Already disconnected. */ }
    try { await this.context?.close(); } catch { /* Closing an unavailable context is harmless. */ }
    this.context = null;
  }
}
