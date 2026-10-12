(() => {
  'use strict';
  const validTime = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
  window.OjjudaMinesRules = Object.freeze({
    score(difficulty, seconds) {
      if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 7 || !validTime(seconds)) return null;
      return (difficulty + 1) * 10000 + Math.max(0, 10000 - seconds);
    },
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
