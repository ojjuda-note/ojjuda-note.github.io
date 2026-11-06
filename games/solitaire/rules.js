(() => {
  'use strict';
  const BASE = 100000000;
  window.OjjudaSolitaireRules = Object.freeze({
    score(drawCount, seconds) {
      if (![1, 3].includes(drawCount) || !Number.isSafeInteger(seconds) || seconds < 1 || seconds >= BASE) return null;
      return (drawCount === 3 ? 2 : 1) * BASE + BASE - seconds;
    },
    record(score) {
      if (!Number.isSafeInteger(score)) return null;
      const difficulty = Math.floor(score / BASE) - 1, seconds = BASE - score % BASE;
      if (![0, 1].includes(difficulty) || seconds < 1 || seconds >= BASE) return null;
      return {difficulty, drawCount:difficulty === 1 ? 3 : 1, name:difficulty === 1 ? '보통' : '초보', seconds,
        time:seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`};
    }
  });
})();
