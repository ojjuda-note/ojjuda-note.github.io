(() => {
  'use strict';
  const validTime = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
  const names = ['바보','초보','기본','하급','중급','고급','천재','외계인'];
  const base = 90000, stride = 250000000;
  function score(difficulty, seconds) {
    if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty >= names.length ||
        !validTime(seconds) || seconds >= stride) return null;
    // Existing short-round receipts keep their original wire value.
    if (seconds < 10000) return (difficulty + 2) * 10000 - seconds;
    return base + (difficulty + 1) * stride - seconds;
  }
  function record(value) {
    if (!Number.isInteger(value)) return null;
    let difficulty, seconds;
    if (value >= 10000 && value < 90000) {
      difficulty = Math.floor(value / 10000) - 1;
      seconds = value % 10000 ? 10000 - value % 10000 : null;
    } else if (value >= base && value < base + names.length * stride) {
      const offset = value - base;
      difficulty = Math.floor(offset / stride);
      // The bottom slot preserves a legacy finish whose exact time was never stored.
      seconds = offset % stride ? stride - offset % stride : null;
    } else return null;
    const time = seconds === null ? '10,000초 이상' :
      seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`;
    return {difficulty, name:names[difficulty], seconds, time};
  }
  window.OjjudaMinesRules = Object.freeze({
    score, record,
    maxRankedSeconds:stride - 1,
    progress(raw) {
      const saved = {d:2, best:Array(8).fill(null), custom:{c:20,r:20,m:60}, cb:{}};
      if (!raw || typeof raw !== 'object') return saved;
      if (Number.isInteger(raw.d) && raw.d >= 0 && raw.d <= 8) saved.d = raw.d;
      if (Array.isArray(raw.best)) saved.best = saved.best.map((_, i) => validTime(raw.best[i]) ? raw.best[i] : null);
      const custom = raw.custom;
      if (custom && Number.isInteger(custom.c) && custom.c >= 2 && custom.c <= 100 &&
          Number.isInteger(custom.r) && custom.r >= 2 && custom.r <= 100 &&
          Number.isInteger(custom.m) && custom.m > 0 && custom.m < custom.c * custom.r) {
        saved.custom = {c:custom.c,r:custom.r,m:custom.m};
      }
      if (raw.cb && typeof raw.cb === 'object') {
        for (const [key, time] of Object.entries(raw.cb).slice(0, 500)) {
          if (/^\d{1,3}x\d{1,3}x\d{1,4}$/.test(key) && validTime(time)) saved.cb[key] = time;
        }
      }
      return saved;
    }
  });
})();
