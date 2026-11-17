/* The first 4,000 keys are archived 1,000-point grid tiers. */
(() => {
  'use strict';
  const offset = 4000;
  const stride = 500000000;
  function rankingScore(size, points) {
    const grid = Number(size), earned = Number(points);
    if (!Number.isInteger(grid) || grid < 3 || grid > 6 ||
        !Number.isSafeInteger(earned) || earned < 0 || earned >= stride) {
      throw new RangeError('Invalid mole grid or points');
    }
    return earned === 0 ? 0 : offset + (grid - 3) * stride + earned;
  }
  function rankingRecord(value) {
    const key = Number(value);
    if (!Number.isSafeInteger(key) || key < 0 || key >= offset + 4 * stride) return null;
    const total = key < offset ? key : key - offset;
    const step = key < offset ? 1000 : stride;
    return {grid: 3 + Math.floor(total / step), points: total % step};
  }
  window.OjjudaMoleRanking = Object.freeze({rankingScore, rankingRecord});
})();
